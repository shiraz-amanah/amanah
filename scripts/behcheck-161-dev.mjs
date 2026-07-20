// Migration 161 dev apply + probes: get_staff_bank_masked. DEV ONLY (hard ref guard).
// Single pg connection (DEV_DATABASE_URL, superuser) — applies the migration,
// reads pg_proc metadata, and runs behavioural probes inside a BEGIN...ROLLBACK
// txn with role simulation (SET ROLE + injected request.jwt.claims). Each
// expected-raise call is wrapped in a SAVEPOINT so the txn can continue.
// NB: 161 depends on the 159 mask_bank_* helpers (already live on dev+prod).
import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }

const db = new pg.Client({ connectionString: DBURL });
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated' });

async function expectRaise(sql, params, needle, label) {
  await db.query('savepoint sp');
  try {
    await db.query(sql, params);
    bad(`${label}: expected raise "${needle}" but call SUCCEEDED`);
    await db.query('rollback to savepoint sp');
  } catch (e) {
    await db.query('rollback to savepoint sp');
    e.message.includes(needle) ? ok(`${label}: ${e.message}`) : bad(`${label}: wrong error → ${e.message}`);
  }
}

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() as db, current_user as usr')).rows[0]);

  console.log('\n=== APPLY migration 161 ===');
  await db.query(readFileSync('migrations/161_get_staff_bank_masked.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: get_staff_bank_masked prosecdef=true, owner=postgres, grants ===');
  const rpc = await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
            has_function_privilege('anon','public.get_staff_bank_masked(uuid)','EXECUTE') as anon,
            has_function_privilege('authenticated','public.get_staff_bank_masked(uuid)','EXECUTE') as authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_staff_bank_masked'`);
  console.log(JSON.stringify(rpc.rows[0]));
  (rpc.rows[0]?.prosecdef === true && rpc.rows[0]?.owner === 'postgres' && rpc.rows[0]?.anon === false && rpc.rows[0]?.authd === true)
    ? ok('security_definer=true, owner=postgres, anon denied, authenticated granted')
    : bad(`rpc meta: ${JSON.stringify(rpc.rows[0])}`);

  console.log('\n=== P2: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  const s1 = await db.query(
    `select ms.id staff_id, ms.mosque_id, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id = ms.mosque_id
      where mo.user_id is not null order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`,
    [s1.rows[0]?.owner]);
  if (!s1.rows.length || !owner2q.rows.length) { bad('need a staff row + two distinct owners on dev'); throw new Error('fixtures'); }
  const F = s1.rows[0];
  const owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ staff_id: F.staff_id, mosque_id: F.mosque_id, owner1: F.owner, owner2 }));

  const RPC = 'select public.get_staff_bank_masked($1) as r';

  await db.query('begin');
  try {
    // (a) owner + bank set → { saved:true, masked values }
    await db.query(
      `insert into public.mosque_staff_employment (staff_id, mosque_id, bank_account_name, bank_sort_code, bank_account_number)
       values ($1,$2,'Alice Smith','123456','12345678')
       on conflict (staff_id) do update set
         bank_account_name='Alice Smith', bank_sort_code='123456', bank_account_number='12345678'`,
      [F.staff_id, F.mosque_id]);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    const set = await db.query(RPC, [F.staff_id]);
    console.log('  owner + bank set:', JSON.stringify(set.rows[0].r));
    const rs = set.rows[0].r;
    (rs.saved === true && rs.account_name === 'A••••' && rs.sort_code === '••-••-••' && rs.account_number === '••••5678')
      ? ok('owner + bank set → { saved:true, A••••, ••-••-••, ••••5678 }')
      : bad(`bank-set result wrong: ${JSON.stringify(rs)}`);
    await db.query('reset role');

    // (b) owner + NO bank set → { saved:false, nulls }
    await db.query('delete from public.mosque_staff_employment where staff_id=$1', [F.staff_id]);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    const unset = await db.query(RPC, [F.staff_id]);
    console.log('  owner + no bank:', JSON.stringify(unset.rows[0].r));
    const ru = unset.rows[0].r;
    (ru.saved === false && ru.account_name === null && ru.sort_code === null && ru.account_number === null)
      ? ok('owner + no bank → { saved:false, nulls }')
      : bad(`no-bank result wrong: ${JSON.stringify(ru)}`);

    // (c) non-owner authenticated → not_authorised 42501
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner2)]);
    await expectRaise(RPC, [F.staff_id], 'not_authorised', 'non-owner call');
    await db.query('reset role');

    // (d) anon → blocked
    await db.query('set role anon');
    await expectRaise(RPC, [F.staff_id], 'permission denied', 'anon call');
    await db.query('reset role');
  } finally {
    await db.query('rollback');
    console.log('  (P2 rolled back — nothing persisted)');
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 3 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  try { await db.query('rollback'); } catch {}
  process.exit(2);
} finally {
  await db.end();
}

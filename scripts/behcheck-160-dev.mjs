// Migration 160 dev apply + probes: dismiss_bank_change. DEV ONLY (hard ref guard).
// Single pg connection (DEV_DATABASE_URL, superuser) — applies the migration,
// reads pg_proc metadata, and runs behavioural probes inside a BEGIN...ROLLBACK
// txn with role simulation (SET ROLE + injected request.jwt.claims). Each
// expected-raise call is wrapped in a SAVEPOINT so the txn can continue.
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

  console.log('\n=== APPLY migration 160 ===');
  await db.query(readFileSync('migrations/160_dismiss_bank_change.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: dismiss_bank_change prosecdef=true, owner=postgres, grants ===');
  const rpc = await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
            has_function_privilege('anon','public.dismiss_bank_change(uuid)','EXECUTE') as anon,
            has_function_privilege('authenticated','public.dismiss_bank_change(uuid)','EXECUTE') as authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='dismiss_bank_change'`);
  console.log(JSON.stringify(rpc.rows[0]));
  (rpc.rows[0]?.prosecdef === true && rpc.rows[0]?.owner === 'postgres' && rpc.rows[0]?.anon === false && rpc.rows[0]?.authd === true)
    ? ok('security_definer=true, owner=postgres, anon denied, authenticated granted')
    : bad(`rpc meta: ${JSON.stringify(rpc.rows[0])}`);

  console.log('\n=== P2: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  // Fixtures: a mosque(owner1) + a distinct second owner.
  const m1 = await db.query(
    `select id mosque_id, user_id owner from public.mosques where user_id is not null order by id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`,
    [m1.rows[0]?.owner]);
  if (!m1.rows.length || !owner2q.rows.length) { bad('need a mosque + two distinct owners on dev'); throw new Error('fixtures'); }
  const F = m1.rows[0];
  const owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ mosque_id: F.mosque_id, owner1: F.owner, owner2 }));

  await db.query('begin');
  try {
    // Seed a bank_changes row for owner1's mosque (service_role INSERT — bypasses RLS).
    await db.query('set role service_role');
    const seed = await db.query(
      `insert into public.mosque_staff_bank_changes
         (mosque_id, staff_id, actor_id, new_account_name, new_sort_code, new_account_number, notified, dismissed)
       values ($1, null, $2, 'Z••••', '••-••-••', '••••7766', false, false)
       returning id`, [F.mosque_id, F.owner]);
    const changeId = seed.rows[0].id;
    await db.query('reset role');
    console.log('  seeded change row:', changeId);

    const RPC = 'select public.dismiss_bank_change($1) as r';

    // (a) anon → blocked (no EXECUTE)
    await db.query('set role anon');
    await expectRaise(RPC, [changeId], 'permission denied', 'anon call');
    await db.query('reset role');

    // (b) non-owner authenticated → not_authorised 42501
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner2)]);
    await expectRaise(RPC, [changeId], 'not_authorised', 'non-owner call');

    // (c) owner, bad id → change_not_found
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    await expectRaise(RPC, ['00000000-0000-0000-0000-000000000000'], 'change_not_found', 'owner bad id');

    // (d) owner, valid → dismissed=true, dismissed_at set, dismissed_by=owner
    const r = await db.query(RPC, [changeId]);
    console.log('  dismiss return:', JSON.stringify(r.rows[0]));
    await db.query('reset role');
    const row = await db.query(
      `select dismissed, dismissed_at, dismissed_by from public.mosque_staff_bank_changes where id=$1`, [changeId]);
    console.log('  row after dismiss:', JSON.stringify(row.rows[0]));
    (r.rows[0].r === true && row.rows[0].dismissed === true && row.rows[0].dismissed_at != null && row.rows[0].dismissed_by === F.owner)
      ? ok('owner dismiss: dismissed=true, dismissed_at set, dismissed_by=owner uid, returns true')
      : bad(`dismiss wrong: ${JSON.stringify(row.rows[0])} / returned ${r.rows[0].r}`);
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

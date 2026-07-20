// Migration 166 dev apply + probes: get_staff_ni (RPC only, no DDL). DEV ONLY.
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
    bad(`${label}: expected raise "${needle}" but SUCCEEDED`);
    await db.query('rollback to savepoint sp');
  } catch (e) {
    await db.query('rollback to savepoint sp');
    e.message.includes(needle) ? ok(`${label}: ${e.message}`) : bad(`${label}: wrong error → ${e.message}`);
  }
}

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 166 ===');
  await db.query(readFileSync('migrations/166_get_staff_ni.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: the four columns already exist on mosque_staff_employment (no ALTER) ===');
  const cols = await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='mosque_staff_employment'
        and column_name in ('address','emergency_contact_name','emergency_contact_phone','ni_number')
      order by column_name`);
  console.log(JSON.stringify(cols.rows));
  (cols.rows.length === 4 && cols.rows.every((r) => r.data_type === 'text' && r.is_nullable === 'YES'))
    ? ok('all four present on mosque_staff_employment, nullable text') : bad(`cols: ${JSON.stringify(cols.rows)}`);

  console.log('\n=== P2: get_staff_ni metadata ===');
  const sig = 'public.get_staff_ni(uuid)';
  const m = (await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) owner,
            has_function_privilege('anon','${sig}','EXECUTE') anon,
            has_function_privilege('authenticated','${sig}','EXECUTE') authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_staff_ni'`)).rows[0];
  console.log(JSON.stringify(m));
  (m?.prosecdef === true && m?.owner === 'postgres' && m?.anon === false && m?.authd === true)
    ? ok('prosecdef=true, owner=postgres, anon denied, authenticated granted') : bad(`meta: ${JSON.stringify(m)}`);

  console.log('\n=== P3: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  const s1 = await db.query(
    `select ms.id staff_id, ms.mosque_id, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id=ms.mosque_id
      where mo.user_id is not null order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`, [s1.rows[0]?.owner]);
  if (!s1.rows.length || !owner2q.rows.length) { bad('need a staff row + two owners'); throw new Error('fixtures'); }
  const F = s1.rows[0], owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ staff: F.staff_id, owner1: F.owner, owner2 }));
  const auditN = async () => (await db.query(
    `select count(*)::int n from public.mosque_staff_audit_log where staff_id=$1 and action='ni_number_viewed'`, [F.staff_id])).rows[0].n;

  await db.query('begin');
  try {
    // set a known NI on the employment row
    await db.query(`insert into public.mosque_staff_employment (staff_id, mosque_id, ni_number)
                    values ($1,$2,'AB123456C')
                    on conflict (staff_id) do update set ni_number='AB123456C'`, [F.staff_id, F.mosque_id]);
    const before = await auditN();

    // owner → { ni_number } + one ni_number_viewed row
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const r = await db.query('select public.get_staff_ni($1) as r', [F.staff_id]);
    await db.query('reset role');
    const after = await auditN();
    console.log('  get_staff_ni →', JSON.stringify(r.rows[0].r), '| ni_number_viewed +', after - before);
    (r.rows[0].r.ni_number === 'AB123456C' && after === before + 1)
      ? ok('owner → { ni_number:"AB123456C" } + one ni_number_viewed row')
      : bad(`owner wrong: ${JSON.stringify(r.rows[0].r)} viewed+${after - before}`);

    // non-owner → not_authorised
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise('select public.get_staff_ni($1)', [F.staff_id], 'not_authorised', 'non-owner');
    await db.query('reset role');

    // anon → blocked
    await db.query('set role anon');
    await expectRaise('select public.get_staff_ni($1)', [F.staff_id], 'permission denied', 'anon');
    await db.query('reset role');
  } finally {
    await db.query('rollback');
    console.log('  (rolled back — nothing persisted)');
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

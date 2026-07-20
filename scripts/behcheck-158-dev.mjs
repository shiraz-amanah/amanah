// Migration 158 dev apply + probes: mosque_staff_bank_changes. DEV ONLY (hard ref guard).
// Single pg connection (DEV_DATABASE_URL, superuser) — applies DDL, reads metadata,
// and runs the behavioural probe inside a BEGIN...ROLLBACK txn with role simulation
// (SET ROLE + injected request.jwt.claims), so nothing persists.
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
const TBL = 'public.mosque_staff_bank_changes';

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() as db, current_user as usr')).rows[0]);

  console.log('\n=== APPLY migration 158 ===');
  await db.query(readFileSync('migrations/158_mosque_staff_bank_changes.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: information_schema.columns (all 16 cols, type, nullable) ===');
  const cols = await db.query(
    `select column_name, data_type, is_nullable, column_default
       from information_schema.columns
      where table_schema='public' and table_name='mosque_staff_bank_changes'
      order by ordinal_position`);
  console.log(JSON.stringify(cols.rows, null, 1));
  cols.rows.length === 16 ? ok(`16 columns present`) : bad(`expected 16 columns, got ${cols.rows.length}`);

  console.log('\n=== P2: pg_policies (exactly one SELECT, no insert/update/delete) ===');
  const pol = await db.query(
    `select policyname, cmd, roles, qual
       from pg_policies where schemaname='public' and tablename='mosque_staff_bank_changes'`);
  console.log(JSON.stringify(pol.rows, null, 1));
  (pol.rows.length === 1 && pol.rows[0].cmd === 'SELECT')
    ? ok('exactly one SELECT policy, no write policies') : bad(`policies: ${JSON.stringify(pol.rows.map(r=>r.cmd))}`);

  console.log('\n=== P3: has_table_privilege(anon, ..., INSERT) = false ===');
  const priv = await db.query(
    `select has_table_privilege('anon','${TBL}','INSERT') as anon_insert,
            has_table_privilege('anon','${TBL}','SELECT') as anon_select`);
  console.log(JSON.stringify(priv.rows[0]));
  (priv.rows[0].anon_insert === false && priv.rows[0].anon_select === false)
    ? ok('anon has neither INSERT nor SELECT (revoke all live)') : bad(`anon privs: ${JSON.stringify(priv.rows[0])}`);

  console.log('\n=== P4: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  // two existing dev mosques with distinct owners
  const ms = await db.query(
    `select id, user_id from public.mosques where user_id is not null
      group by id, user_id order by id limit 2`);
  if (ms.rows.length < 2 || ms.rows[0].user_id === ms.rows[1].user_id) {
    bad('need two mosques with distinct owners on dev — cannot run P4'); throw new Error('P4 fixtures');
  }
  const [m1, m2] = ms.rows;
  const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated' });

  await db.query('begin');
  try {
    // (a) service_role INSERT lands
    await db.query('set role service_role');
    await db.query(
      `insert into ${TBL} (mosque_id, staff_id, actor_id, new_account_name, new_sort_code, new_account_number)
       values ($1, null, $2, 'T••••', '••-••-••', '••••1234')`, [m1.id, m1.user_id]);
    ok('service_role INSERT lands');
    await db.query('reset role');

    // (b) owner1 reads own-mosque row
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(m1.user_id)]);
    const r1 = await db.query(`select count(*)::int n from ${TBL} where mosque_id = $1`, [m1.id]);
    r1.rows[0].n >= 1 ? ok(`owner1 reads own-mosque rows (n=${r1.rows[0].n})`) : bad(`owner1 saw ${r1.rows[0].n}`);

    // (c) cross-mosque owner2 reads 0 of the m1 row
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(m2.user_id)]);
    const r2 = await db.query(`select count(*)::int n from ${TBL} where mosque_id = $1`, [m1.id]);
    r2.rows[0].n === 0 ? ok('cross-mosque owner2 reads 0 (RLS isolates)') : bad(`owner2 saw ${r2.rows[0].n}`);
    await db.query('reset role');

    // (d) anon blocked
    await db.query('set role anon');
    try {
      await db.query(`select count(*) from ${TBL}`);
      bad('anon SELECT was NOT blocked');
    } catch (e) { ok(`anon SELECT blocked: ${e.message}`); }
    // NB: the anon permission-denied aborts the txn — no further commands until
    // the rollback below (which also resets the simulated role).
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

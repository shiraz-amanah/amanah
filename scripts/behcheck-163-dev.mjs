// Migration 163 dev apply + probes: get_staff_salary jsonb + get_staff_employment
// new keys + contract_terms_changed_at + dismiss_contract_flag. DEV ONLY (ref guard).
// Metadata probes + behavioural inside BEGIN...ROLLBACK with role simulation.
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

  console.log('\n=== APPLY migration 163 ===');
  await db.query(readFileSync('migrations/163_employment_edit_reads_and_contract_flag.sql', 'utf8'));
  console.log('applied OK');

  const meta = async (sig, name) => (await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) owner, pg_get_function_result(p.oid) ret,
            has_function_privilege('anon','${sig}','EXECUTE') anon,
            has_function_privilege('authenticated','${sig}','EXECUTE') authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='${name}'`)).rows[0];

  // ── P1: get_staff_salary ──
  console.log('\n=== P1: get_staff_salary (jsonb, audited) ===');
  const m1 = await meta('public.get_staff_salary(uuid)', 'get_staff_salary');
  console.log(JSON.stringify(m1));
  (m1?.ret === 'jsonb' && m1?.prosecdef === true && m1?.authd === true && m1?.anon === false)
    ? ok('return jsonb (not integer), prosecdef=true, anon denied, authenticated granted')
    : bad(`get_staff_salary meta: ${JSON.stringify(m1)}`);

  // ── P3 metadata (column) — checked here before behavioural ──
  console.log('\n=== P3: mosque_staff.contract_terms_changed_at column ===');
  const col = await db.query(
    `select data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='mosque_staff' and column_name='contract_terms_changed_at'`);
  console.log(JSON.stringify(col.rows));
  (col.rows.length === 1 && col.rows[0].data_type === 'timestamp with time zone' && col.rows[0].is_nullable === 'YES')
    ? ok('contract_terms_changed_at present, nullable timestamptz') : bad(`column: ${JSON.stringify(col.rows)}`);

  // ── P2 metadata ──
  console.log('\n=== P2: get_staff_employment (return keys) ===');
  const m2 = await meta('public.get_staff_employment(uuid)', 'get_staff_employment');
  (m2?.prosecdef === true && m2?.authd === true && m2?.anon === false) ? ok('prosecdef=true, anon denied, authenticated granted') : bad(`meta: ${JSON.stringify(m2)}`);

  // ── P4 metadata ──
  console.log('\n=== P4: dismiss_contract_flag metadata ===');
  const m4 = await meta('public.dismiss_contract_flag(uuid)', 'dismiss_contract_flag');
  console.log(JSON.stringify(m4));
  (m4?.prosecdef === true && m4?.owner === 'postgres' && m4?.anon === false && m4?.authd === true)
    ? ok('prosecdef=true, owner=postgres, anon denied, authenticated granted') : bad(`meta: ${JSON.stringify(m4)}`);

  // ── Behavioural ──
  console.log('\n=== Behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  const s1 = await db.query(
    `select ms.id staff_id, ms.mosque_id, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id=ms.mosque_id
      where mo.user_id is not null order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`, [s1.rows[0]?.owner]);
  if (!s1.rows.length || !owner2q.rows.length) { bad('need staff + two owners'); throw new Error('fixtures'); }
  const F = s1.rows[0], owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ staff: F.staff_id, owner1: F.owner, owner2 }));
  const auditN = async (action) => (await db.query(
    `select count(*)::int n from public.mosque_staff_audit_log where staff_id=$1 and action=$2`, [F.staff_id, action])).rows[0].n;

  await db.query('begin');
  try {
    // P1 behavioural: set pay, owner reads both + one salary_viewed row
    await db.query(`insert into public.mosque_staff_employment (staff_id, mosque_id, salary_pence, hourly_rate_pence)
                    values ($1,$2,55000,1500)
                    on conflict (staff_id) do update set salary_pence=55000, hourly_rate_pence=1500`,
                   [F.staff_id, F.mosque_id]);
    const beforeView = await auditN('salary_viewed');
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const sal = await db.query('select public.get_staff_salary($1) r', [F.staff_id]);
    await db.query('reset role');
    const afterView = await auditN('salary_viewed');
    console.log('  get_staff_salary →', JSON.stringify(sal.rows[0].r), '| salary_viewed +', afterView - beforeView);
    (sal.rows[0].r.salary_pence === 55000 && sal.rows[0].r.hourly_rate_pence === 1500 && afterView === beforeView + 1)
      ? ok('P1: owner → {salary_pence:55000, hourly_rate_pence:1500} + one salary_viewed row')
      : bad(`P1 wrong: ${JSON.stringify(sal.rows[0].r)} viewed+${afterView - beforeView}`);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise('select public.get_staff_salary($1)', [F.staff_id], 'not_authorised', 'P1 non-owner');

    // P2 behavioural: owner gets the 4 new keys; non-owner blocked
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const emp = await db.query('select public.get_staff_employment($1) r', [F.staff_id]);
    await db.query('reset role');
    const keys = emp.rows[0].r;
    const has4 = ['place_of_work','notice_period_employer_weeks','notice_period_employee_weeks','contract_terms_changed_at'].every(k => k in keys);
    console.log('  get_staff_employment keys:', JSON.stringify(Object.keys(keys)));
    has4 ? ok('P2: returns all 4 new keys') : bad(`P2 missing keys: ${JSON.stringify(Object.keys(keys))}`);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise('select public.get_staff_employment($1)', [F.staff_id], 'not_mosque_owner', 'P2 non-owner');
    await db.query('reset role');

    // P4 behavioural: owner dismiss → col null + one contract_flag_dismissed row
    await db.query('update public.mosque_staff set contract_terms_changed_at = now() where id=$1', [F.staff_id]);
    const beforeDis = await auditN('contract_flag_dismissed');
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const dis = await db.query('select public.dismiss_contract_flag($1) r', [F.staff_id]);
    await db.query('reset role');
    const afterDis = await auditN('contract_flag_dismissed');
    const flag = (await db.query('select contract_terms_changed_at from public.mosque_staff where id=$1', [F.staff_id])).rows[0].contract_terms_changed_at;
    console.log('  dismiss →', dis.rows[0].r, '| flag now:', flag, '| dismissed row +', afterDis - beforeDis);
    (dis.rows[0].r === true && flag === null && afterDis === beforeDis + 1)
      ? ok('P4: owner → contract_terms_changed_at null + one contract_flag_dismissed row')
      : bad(`P4 wrong: r=${dis.rows[0].r} flag=${flag} dismissed+${afterDis - beforeDis}`);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise('select public.dismiss_contract_flag($1)', [F.staff_id], 'not_authorised', 'P4 non-owner');
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

// Migration 159 dev apply + probes: masking helpers + update_staff_bank_details
// + approve_onboarding_session first-set block. DEV ONLY (hard ref guard).
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

// Run an RPC expected to RAISE; catch, assert the message, roll back to savepoint
// so the outer txn survives. Assumes role/claims already set before the call.
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

  console.log('\n=== APPLY migration 159 ===');
  await db.query(readFileSync('migrations/159_staff_bank_details_writer.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: masking helpers exist + EXECUTE revoked from public/anon/authenticated ===');
  const helpers = await db.query(
    `select p.proname,
            has_function_privilege('public',       p.oid, 'EXECUTE') as pub,
            has_function_privilege('anon',          p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authd,
            p.provolatile
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='public' and p.proname in ('mask_bank_name','mask_bank_sort','mask_bank_acct')
      order by p.proname`);
  console.log(JSON.stringify(helpers.rows, null, 1));
  const allRevoked = helpers.rows.length === 3 && helpers.rows.every(r => !r.pub && !r.anon && !r.authd && r.provolatile === 'i');
  allRevoked ? ok('3 helpers, immutable, EXECUTE revoked from public/anon/authenticated')
             : bad(`helpers: ${JSON.stringify(helpers.rows.map(r=>r.proname))}`);
  // functional spot-check of the mask shapes (as superuser)
  const shapes = await db.query(
    `select public.mask_bank_name('Alice Smith') n,
            public.mask_bank_sort('12-34-56')    s,
            public.mask_bank_acct('12345678')    a,
            public.mask_bank_name(null)          nn,
            public.mask_bank_acct(null)          na`);
  console.log(JSON.stringify(shapes.rows[0]));
  (shapes.rows[0].n === 'A••••' && shapes.rows[0].s === '••-••-••' && shapes.rows[0].a === '••••5678'
    && shapes.rows[0].nn === null && shapes.rows[0].na === null)
    ? ok('mask shapes correct (A••••, ••-••-••, ••••5678; null→null)')
    : bad(`mask shapes wrong: ${JSON.stringify(shapes.rows[0])}`);

  console.log('\n=== P2: update_staff_bank_details prosecdef=true, owner=postgres ===');
  const rpc = await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) as owner,
            has_function_privilege('anon','public.update_staff_bank_details(uuid,text,text,text)','EXECUTE') as anon,
            has_function_privilege('authenticated','public.update_staff_bank_details(uuid,text,text,text)','EXECUTE') as authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='update_staff_bank_details'`);
  console.log(JSON.stringify(rpc.rows[0]));
  (rpc.rows[0]?.prosecdef === true && rpc.rows[0]?.owner === 'postgres' && rpc.rows[0]?.anon === false && rpc.rows[0]?.authd === true)
    ? ok('security_definer=true, owner=postgres, anon denied, authenticated granted')
    : bad(`rpc meta: ${JSON.stringify(rpc.rows[0])}`);

  console.log('\n=== P3/P4: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  // Fixtures: a staff row + its mosque(owner1); a distinct second owner.
  const s1 = await db.query(
    `select ms.id staff_id, ms.mosque_id, ms.email, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id = ms.mosque_id
      where mo.user_id is not null order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`,
    [s1.rows[0]?.owner]);
  if (!s1.rows.length || !owner2q.rows.length) { bad('need a staff row + two distinct owners on dev'); throw new Error('fixtures'); }
  const F = s1.rows[0];
  const owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ staff_id: F.staff_id, mosque_id: F.mosque_id, owner1: F.owner, owner2, staff_email: F.email }));

  await db.query('begin');
  try {
    const RPC = 'select public.update_staff_bank_details($1,$2,$3,$4) as r';

    // ensure a clean first-set state for this staff
    await db.query('delete from public.mosque_staff_employment where staff_id = $1', [F.staff_id]);

    // (a) anon → blocked (no EXECUTE)
    await db.query('set role anon');
    await expectRaise(RPC, [F.staff_id, 'Zed Khan', '112233', '99887766'], 'permission denied', 'anon call');
    await db.query('reset role');

    // (b) non-owner authenticated → not_authorised 42501
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner2)]);
    await expectRaise(RPC, [F.staff_id, 'Zed Khan', '112233', '99887766'], 'not_authorised', 'non-owner call');

    // switch to owner1 for the remaining calls
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);

    // (c) owner, bad sort code (5 digits) → sort_code_invalid
    await expectRaise(RPC, [F.staff_id, 'Zed Khan', '11223', '99887766'], 'sort_code_invalid', 'owner bad sort');

    // (d) owner, bad account number (7 digits) → account_number_invalid
    await expectRaise(RPC, [F.staff_id, 'Zed Khan', '112233', '9988776'], 'account_number_invalid', 'owner bad acct');

    // (e) owner, valid, NO prior employment row → first-set
    const r1 = await db.query(RPC, [F.staff_id, ' Alice  Smith ', '12-34-56', '1234 5678']);
    const out1 = r1.rows[0].r;
    console.log('  first-set return:', JSON.stringify(out1));
    const change1 = out1?.change_id;
    await db.query('reset role');   // read back as superuser (bypass RLS)

    const emp1 = await db.query(
      `select bank_account_name, bank_sort_code, bank_account_number
         from public.mosque_staff_employment where staff_id=$1`, [F.staff_id]);
    console.log('  employment after first-set (plaintext, normalised):', JSON.stringify(emp1.rows[0]));
    (emp1.rows[0]?.bank_sort_code === '123456' && emp1.rows[0]?.bank_account_number === '12345678' && emp1.rows[0]?.bank_account_name === 'Alice  Smith')
      ? ok('first-set: employment upserted with NORMALISED digits + trimmed name')
      : bad(`employment: ${JSON.stringify(emp1.rows[0])}`);

    const ac1 = await db.query(`select * from public.mosque_staff_bank_changes where id=$1`, [change1]);
    const row1 = ac1.rows[0];
    console.log('  audit row (first-set):', JSON.stringify({
      old_name: row1?.old_account_name, old_sort: row1?.old_sort_code, old_acct: row1?.old_account_number,
      new_name: row1?.new_account_name, new_sort: row1?.new_sort_code, new_acct: row1?.new_account_number,
      notified: row1?.notified, actor: row1?.actor_id, mosque: row1?.mosque_id }));
    (row1 && row1.old_account_name === null && row1.old_sort_code === null && row1.old_account_number === null
      && row1.new_account_name === 'A••••' && row1.new_sort_code === '••-••-••' && row1.new_account_number === '••••5678'
      && row1.notified === false && row1.actor_id === F.owner && row1.mosque_id === F.mosque_id)
      ? ok('first-set: audit row old_*=NULL, new_* masked, notified=false, actor=owner')
      : bad(`audit row1 wrong: ${JSON.stringify(row1)}`);
    (out1?.success === true && !!change1 && out1?.staff_has_email === (F.email != null && F.email.trim() !== ''))
      ? ok(`return: success=true, change_id set, staff_has_email=${out1?.staff_has_email} (matches staff email presence)`)
      : bad(`return1 wrong: ${JSON.stringify(out1)} vs email=${F.email}`);

    // (f) owner, valid, EXISTING employment row → change, old_* masked from prior
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    const r2 = await db.query(RPC, [F.staff_id, 'Bob Jones', '654321', '87654321']);
    const out2 = r2.rows[0].r;
    console.log('  change return:', JSON.stringify(out2));
    await db.query('reset role');

    const emp2 = await db.query(
      `select bank_sort_code, bank_account_number from public.mosque_staff_employment where staff_id=$1`, [F.staff_id]);
    (emp2.rows[0]?.bank_sort_code === '654321' && emp2.rows[0]?.bank_account_number === '87654321')
      ? ok('change: employment updated to new normalised digits')
      : bad(`employment2: ${JSON.stringify(emp2.rows[0])}`);

    const ac2 = await db.query(`select * from public.mosque_staff_bank_changes where id=$1`, [out2?.change_id]);
    const row2 = ac2.rows[0];
    console.log('  audit row (change):', JSON.stringify({
      old_name: row2?.old_account_name, old_sort: row2?.old_sort_code, old_acct: row2?.old_account_number,
      new_name: row2?.new_account_name, new_sort: row2?.new_sort_code, new_acct: row2?.new_account_number,
      notified: row2?.notified }));
    (row2 && row2.old_account_name === 'A••••' && row2.old_sort_code === '••-••-••' && row2.old_account_number === '••••5678'
      && row2.new_account_name === 'B••••' && row2.new_sort_code === '••-••-••' && row2.new_account_number === '••••4321'
      && row2.notified === false)
      ? ok('change: audit row old_* masked from PRIOR values, new_* masked, notified=false')
      : bad(`audit row2 wrong: ${JSON.stringify(row2)}`);
  } finally {
    await db.query('rollback');
    console.log('  (P3 rolled back — nothing persisted)');
  }

  // ── P4: approve_onboarding_session first-set block ──
  console.log('\n=== P4: approve_onboarding_session first-set bank_changes ===');
  await db.query('begin');
  try {
    // WITH bank data → exactly one bank_changes row (old_* NULL, notified=false)
    const withBank = {
      bank_account_name: 'Zed Khan', bank_sort_code: '11-22-33', bank_account_number: '99887766',
    };
    const sess1 = await db.query(
      `insert into public.mosque_staff_onboarding_sessions
         (mosque_id, staff_id, employee_name, employee_email, path, status, bank_details, personal_details, employment_details)
       values ($1,$2,'Zed Khan','zed-behcheck159@example.com','remote','submitted',$3::jsonb,'{}','{}')
       returning id`, [F.mosque_id, F.staff_id, JSON.stringify(withBank)]);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    await db.query('select public.approve_onboarding_session($1)', [sess1.rows[0].id]);
    await db.query('reset role');
    const bc1 = await db.query(
      `select old_account_name, old_sort_code, old_account_number,
              new_account_name, new_sort_code, new_account_number, notified
         from public.mosque_staff_bank_changes where staff_id=$1`, [F.staff_id]);
    console.log('  bank_changes after approve WITH bank:', JSON.stringify(bc1.rows, null, 1));
    (bc1.rows.length === 1
      && bc1.rows[0].old_account_name === null && bc1.rows[0].old_sort_code === null && bc1.rows[0].old_account_number === null
      && bc1.rows[0].new_account_name === 'Z••••' && bc1.rows[0].new_sort_code === '••-••-••' && bc1.rows[0].new_account_number === '••••7766'
      && bc1.rows[0].notified === false)
      ? ok('approve WITH bank: exactly one first-set row (old_* NULL, new_* masked, notified=false)')
      : bad(`approve-with-bank rows: ${JSON.stringify(bc1.rows)}`);
  } finally {
    await db.query('rollback');
  }

  await db.query('begin');
  try {
    // WITHOUT bank data → zero bank_changes rows
    const sess2 = await db.query(
      `insert into public.mosque_staff_onboarding_sessions
         (mosque_id, staff_id, employee_name, employee_email, path, status, bank_details, personal_details, employment_details)
       values ($1,$2,'No Bank','nobank-behcheck159@example.com','remote','submitted','{}'::jsonb,'{}','{}')
       returning id`, [F.mosque_id, F.staff_id]);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(F.owner)]);
    await db.query('select public.approve_onboarding_session($1)', [sess2.rows[0].id]);
    await db.query('reset role');
    const bc2 = await db.query(
      `select count(*)::int n from public.mosque_staff_bank_changes where staff_id=$1`, [F.staff_id]);
    console.log('  bank_changes after approve WITHOUT bank:', JSON.stringify(bc2.rows[0]));
    bc2.rows[0].n === 0
      ? ok('approve WITHOUT bank: zero bank_changes rows')
      : bad(`approve-without-bank inserted ${bc2.rows[0].n} rows`);
  } finally {
    await db.query('rollback');
    console.log('  (P4 rolled back — nothing persisted)');
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

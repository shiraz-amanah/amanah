// Migration 169 dev behaviour probes: approve_onboarding_session must persist
// pay (salary_pence / hourly_rate_pence) and must never blank an existing value.
// DEV ONLY. Seed rows are created/read inside a transaction that is ROLLED BACK.
//
// P1 function body shape.
// P2 salaried approve  — pay lands in the pence columns, salary_rate untouched.
// P3 zero-hours approve — hourly_rate_pence lands.
// P4 employment_type -> contract_type key fallback (both spellings).
// P5 NON-DESTRUCTION — a pre-set employment row survives an approve whose
//    session carries empty/absent values for those same fields. This is the
//    regression that the OLD on-conflict (bare `excluded.*`) would have failed.
// P6 blank pay arrives as NULL, never 0.
import pg from 'pg';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }

const db = new pg.Client({ connectionString: DBURL });
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated' });

let owner, mosque;

// Create a staff row + a submitted session carrying `empDetails`, approve it as
// the owner, and return the resulting mosque_staff_employment row.
async function approveWith(tag, empDetails, preset = null) {
  const staff = (await db.query(
    `insert into mosque_staff (mosque_id, name, role, status, invite_status, email)
     values ($1, $2, 'Teacher', 'pending_invite', 'not_invited', $3)
     returning id`, [mosque, `P169 ${tag}`, `p169-${tag}@probe.test`])).rows[0].id;

  if (preset) {
    const cols = Object.keys(preset);
    await db.query(
      `insert into mosque_staff_employment (staff_id, mosque_id, ${cols.join(', ')})
       values ($1, $2, ${cols.map((_, i) => `$${i + 3}`).join(', ')})`,
      [staff, mosque, ...cols.map((c) => preset[c])]);
  }

  const session = (await db.query(
    `insert into mosque_staff_onboarding_sessions
       (mosque_id, staff_id, employee_name, employee_email, path, status, employment_details, personal_details)
     values ($1, $2, $3, $4, 'remote', 'submitted', $5::jsonb, '{}'::jsonb)
     returning id`,
    [mosque, staff, `P169 ${tag}`, `p169-${tag}@probe.test`, JSON.stringify(empDetails)])).rows[0].id;

  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);
  await db.query(`select approve_onboarding_session($1)`, [session]);
  await db.query(`reset role`);

  return (await db.query(
    `select contract_type, hours_per_week, salary_pence, hourly_rate_pence, salary_rate,
            address, emergency_contact_name
       from mosque_staff_employment where staff_id = $1`, [staff])).rows[0];
}

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== P1: live function body shape ===');
  const def = (await db.query(
    `select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='approve_onboarding_session'`)).rows[0].def;
  /salary_pence/.test(def)      ? ok('salary_pence written')       : bad('salary_pence ABSENT');
  /hourly_rate_pence/.test(def) ? ok('hourly_rate_pence written')  : bad('hourly_rate_pence ABSENT');
  !/salary_rate/.test(def)      ? ok('legacy salary_rate removed') : bad('salary_rate STILL PRESENT');
  /nullif\(emp->>'employment_type',''\)/.test(def)
    ? ok('reads employment_type (with contract_type fallback)') : bad('employment_type key not read');
  const bare = (def.match(/^\s+\w+\s+= excluded\.\w+,?$/gm) || []).map((s) => s.trim());
  (bare.length === 1 && bare[0].startsWith('student_loan'))
    ? ok('student_loan is the ONLY bare excluded.* on-conflict line')
    : bad(`unexpected bare excluded lines: ${JSON.stringify(bare)}`);

  await db.query('begin');

  owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'p169-owner@probe.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(
    `insert into profiles (id, name) values ($1, 'P169 Owner')
       on conflict (id) do update set name = excluded.name`, [owner]);
  mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'p169-probe', 'P169 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;

  console.log('\n=== P2: salaried approve — pay lands in the pence columns ===');
  const salaried = await approveWith('salaried', {
    role: 'Teacher', employment_type: 'employed_full_time', start_date: '2026-09-01',
    hours_per_week: 37.5, salary_pence: 2850000, hourly_rate_pence: null,
  });
  console.log('  row:', JSON.stringify(salaried));
  (salaried.salary_pence === 2850000) ? ok('salary_pence = 2850000 (£28,500)') : bad(`salary_pence = ${salaried.salary_pence}`);
  (Number(salaried.hours_per_week) === 37.5) ? ok('hours_per_week = 37.5') : bad(`hours_per_week = ${salaried.hours_per_week}`);
  (salaried.contract_type === 'employed_full_time') ? ok('contract_type from employment_type key') : bad(`contract_type = ${salaried.contract_type}`);
  (salaried.salary_rate === null) ? ok('legacy salary_rate left null') : bad(`salary_rate = ${salaried.salary_rate}`);
  (salaried.hourly_rate_pence === null) ? ok('hourly_rate_pence null on a salaried record') : bad(`hourly_rate_pence = ${salaried.hourly_rate_pence}`);

  console.log('\n=== P3: zero-hours approve — hourly rate lands ===');
  const zero = await approveWith('zerohours', {
    role: 'Teacher', employment_type: 'zero_hours', hourly_rate_pence: 1250, salary_pence: null, hours_per_week: null,
  });
  console.log('  row:', JSON.stringify(zero));
  (zero.hourly_rate_pence === 1250) ? ok('hourly_rate_pence = 1250 (£12.50)') : bad(`hourly_rate_pence = ${zero.hourly_rate_pence}`);
  (zero.salary_pence === null) ? ok('salary_pence null on a zero-hours record') : bad(`salary_pence = ${zero.salary_pence}`);
  (zero.contract_type === 'zero_hours') ? ok('contract_type = zero_hours') : bad(`contract_type = ${zero.contract_type}`);

  console.log('\n=== P4: legacy contract_type key still honoured (fallback) ===');
  const legacy = await approveWith('legacykey', { role: 'Teacher', contract_type: 'employed_part_time', hours_per_week: 20 });
  console.log('  row:', JSON.stringify(legacy));
  (legacy.contract_type === 'employed_part_time') ? ok('contract_type read from the legacy key') : bad(`contract_type = ${legacy.contract_type}`);

  console.log('\n=== P5: NON-DESTRUCTION — pre-set values survive an empty session ===');
  const preserved = await approveWith('preserve',
    { role: 'Teacher' },  // session carries NO pay, NO address, NO emergency contact
    { salary_pence: 3100000, hours_per_week: 35, contract_type: 'employed_full_time',
      address: '9 Pre-set Lane', emergency_contact_name: 'Pre-set Contact' });
  console.log('  row:', JSON.stringify(preserved));
  (preserved.salary_pence === 3100000) ? ok('pre-set salary_pence SURVIVED') : bad(`salary_pence CLOBBERED -> ${preserved.salary_pence}`);
  (Number(preserved.hours_per_week) === 35) ? ok('pre-set hours_per_week SURVIVED') : bad(`hours_per_week CLOBBERED -> ${preserved.hours_per_week}`);
  (preserved.contract_type === 'employed_full_time') ? ok('pre-set contract_type SURVIVED') : bad(`contract_type CLOBBERED -> ${preserved.contract_type}`);
  (preserved.address === '9 Pre-set Lane') ? ok('pre-set address SURVIVED') : bad(`address CLOBBERED -> ${preserved.address}`);
  (preserved.emergency_contact_name === 'Pre-set Contact') ? ok('pre-set emergency contact SURVIVED') : bad(`emergency contact CLOBBERED -> ${preserved.emergency_contact_name}`);

  console.log('\n=== P6: blank pay is NULL, never 0 ===');
  const blank = await approveWith('blank', { role: 'Teacher', employment_type: 'volunteer', salary_pence: null, hourly_rate_pence: null, hours_per_week: null });
  console.log('  row:', JSON.stringify(blank));
  (blank.salary_pence === null && blank.hourly_rate_pence === null && blank.hours_per_week === null)
    ? ok('blank pay stored as NULL (not 0)')
    : bad(`blank pay coerced: ${JSON.stringify({ s: blank.salary_pence, h: blank.hourly_rate_pence, w: blank.hours_per_week })}`);

  await db.query('rollback');
  console.log('\n  probe rows rolled back.');

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  await db.end();
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  try { await db.query('rollback'); } catch {}
  try { await db.end(); } catch {}
  process.exit(1);
}

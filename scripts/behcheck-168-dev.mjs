// Migration 168 dev apply + probes: strip plaintext ni_number from
// get_staff_sensitive, replace with server-masked ni_number_masked. DEV ONLY.
// P1 function body. P2 owner call shape + masked value. P3 get_staff_ni regression.
// Seed rows are created/read inside a transaction that is ROLLED BACK.
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

const NI = 'QQ123456C';
const EXPECT_MASK = 'QQ•••••••C';
const EXPECTED_KEYS = [
  'date_of_birth', 'phone', 'address', 'nationality', 'next_of_kin',
  'emergency_contact_name', 'emergency_contact_phone', 'ni_number_masked',
  'rtw_document_number', 'dbs_certificate_number',
];

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== BEFORE: does the live function still carry plaintext ni_number? ===');
  const before = (await db.query(
    `select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_staff_sensitive'`)).rows[0]?.def || '';
  console.log("  contains \"'ni_number', e.ni_number\":", before.includes("'ni_number', e.ni_number"));

  console.log('\n=== APPLY migration 168 ===');
  await db.query(readFileSync('migrations/168_strip_ni_from_sensitive.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: pg_get_functiondef — plaintext gone, masked present ===');
  const def = (await db.query(
    `select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='get_staff_sensitive'`)).rows[0].def;
  const hasPlain = /'ni_number',\s*e\.ni_number/.test(def);
  const hasMasked = /'ni_number_masked',\s*mask_ni\(e\.ni_number\)/.test(def);
  console.log('  plaintext line present:', hasPlain, '| masked line present:', hasMasked);
  (!hasPlain && hasMasked) ? ok("'ni_number' plaintext absent; 'ni_number_masked' present")
                           : bad(`plaintext=${hasPlain} masked=${hasMasked}`);

  console.log('\n=== P2 + P3: behavioural (BEGIN…ROLLBACK, role-simulated owner) ===');
  await db.query('begin');
  const owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'p168-owner@probe.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  // dev has a trigger that auto-creates the profiles row on auth.users insert —
  // upsert rather than insert, or this collides on profiles_pkey.
  await db.query(
    `insert into profiles (id, name) values ($1, 'P168 Owner')
       on conflict (id) do update set name = excluded.name`, [owner]);
  const mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'p168-probe', 'P168 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;
  const staff = (await db.query(
    `insert into mosque_staff (mosque_id, name, role, status, invite_status, email)
     values ($1, 'P168 Staff', 'Teacher', 'active', 'not_invited', 'p168-staff@probe.test')
     returning id`, [mosque])).rows[0].id;
  await db.query(
    `insert into mosque_staff_employment
       (staff_id, mosque_id, ni_number, dob, nationality, next_of_kin, address,
        emergency_contact_name, emergency_contact_phone, rtw_document_number, dbs_certificate_number)
     values ($1, $2, $3, '1990-04-01', 'British', 'Fatima Khan — 07700 900123', '5 Old Road',
             'Aisha Khan', '07700 900333', 'RTW-123', 'DBS-456')`, [staff, mosque, NI]);

  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);

  const sens = (await db.query(`select get_staff_sensitive($1) j`, [staff])).rows[0].j;
  await db.query(`reset role`);
  console.log('  get_staff_sensitive returned:');
  console.log('   ', JSON.stringify(sens, null, 2).split('\n').join('\n    '));

  ('ni_number' in sens) ? bad('PLAINTEXT ni_number key STILL PRESENT') : ok('no ni_number key in the returned jsonb');
  const missing = EXPECTED_KEYS.filter((k) => !(k in sens));
  const extra = Object.keys(sens).filter((k) => !EXPECTED_KEYS.includes(k));
  console.log('  missing keys:', JSON.stringify(missing), '| unexpected keys:', JSON.stringify(extra));
  (missing.length === 0 && extra.length === 0)
    ? ok(`all ${EXPECTED_KEYS.length} expected keys present, nothing extra`)
    : bad(`missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`);
  (sens.ni_number_masked === EXPECT_MASK)
    ? ok(`ni_number_masked === ${EXPECT_MASK}`)
    : bad(`ni_number_masked = ${JSON.stringify(sens.ni_number_masked)}, expected ${EXPECT_MASK}`);
  // The mask must not leak the middle digits.
  (!String(sens.ni_number_masked || '').includes('123456'))
    ? ok('mask does not leak the middle digits')
    : bad(`mask leaks digits: ${sens.ni_number_masked}`);
  (sens.date_of_birth && sens.nationality === 'British' && sens.next_of_kin)
    ? ok('date_of_birth / nationality / next_of_kin still returned (item-2 read path intact)')
    : bad(`item-2 fields missing: ${JSON.stringify({ d: sens.date_of_birth, n: sens.nationality, k: sens.next_of_kin })}`);

  console.log('\n  --- P3 REGRESSION: get_staff_ni untouched ---');
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);
  const ni = (await db.query(`select get_staff_ni($1) j`, [staff])).rows[0].j;
  await db.query(`reset role`);
  console.log('  get_staff_ni returned:', JSON.stringify(ni));
  (ni?.ni_number === NI) ? ok(`get_staff_ni still returns the plaintext (${NI})`)
                         : bad(`get_staff_ni returned ${JSON.stringify(ni)}`);
  const audit = (await db.query(
    `select action, count(*)::int n from mosque_staff_audit_log where staff_id = $1 group by action order by action`,
    [staff])).rows;
  console.log('  audit rows written by this probe:', JSON.stringify(audit));
  (audit.some((a) => a.action === 'ni_number_viewed') && audit.some((a) => a.action === 'sensitive_data_viewed'))
    ? ok('both audit actions still fire (ni_number_viewed + sensitive_data_viewed)')
    : bad(`unexpected audit set: ${JSON.stringify(audit)}`);

  console.log('\n  --- mask_ni edge cases ---');
  const edges = (await db.query(
    `select mask_ni(null) a, mask_ni('') b, mask_ni('   ') c, mask_ni('QQ 12 34 56 C') d, mask_ni('AB') e`)).rows[0];
  console.log('  mask_ni(null/""/"   "/"QQ 12 34 56 C"/"AB") =', JSON.stringify(edges));
  (edges.a === null && edges.b === null && edges.c === null && edges.d === EXPECT_MASK && edges.e === 'AB•••••••')
    ? ok('edge cases: null/empty/blank → null; spaced NI masks correctly; 2-char degrades safely')
    : bad(`edge case mismatch: ${JSON.stringify(edges)}`);

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

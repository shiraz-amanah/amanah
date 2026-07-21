// Seed ONE mosque with all three staff-view populations at once — current,
// former and erased — so the Staff page's three views can be verified against
// real counts in a single session. DEV ONLY.
//
// Why this exists: seed-former-staff-dev.mjs and seed-erased-staff-dev.mjs both
// build slug 'former-tab-verify' for the SAME owner, and both begin with
// `delete from mosques where slug=…`. So they silently clobber each other —
// whichever ran last is the only population left, and the Staff page shows two
// of its three views empty. This script uses its OWN slug + owner so all three
// fixtures can coexist; it does not touch theirs.
//
// Counts are DELIBERATELY DISTINCT (4 current / 3 former / 2 erased) so a stale
// or mis-wired count cannot coincidentally match the right one — the same
// lesson the former-staff seed records.
//
//   current — 4, across 3 departments (gives the Department filter real options)
//   former  — 3: 1 retention-LOCKED (left recently), 2 ELIGIBLE (left 2018/19)
//   erased  — 2, via the real offboard → anonymise path
//
// Lifecycle transitions go through the REAL RPCs (offboard_staff /
// anonymise_staff), never a direct UPDATE: the 157 privileged-column guard
// blocks writing offboarded_at/anonymised_at/retention_eligible_at outside the
// SECURITY DEFINER path, and going around it would seed states the app itself
// can never produce.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
if (!process.env.DEV_DATABASE_URL?.includes(DEV)) { console.error('SAFETY: not the dev database — abort'); process.exit(1); }
const db = new pg.Client({ connectionString: process.env.DEV_DATABASE_URL });
const svc = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
await db.connect();

const EMAIL = 'staff-views-owner@amanah-verify.test', PW = 'staffViews-Aa1!', SLUG = 'staff-views-verify';

const dropFixture = async () => {
  const m = (await db.query(`select id from mosques where slug=$1`, [SLUG])).rows[0];
  if (!m) return null;
  await db.query(`delete from mosque_staff_employment where mosque_id=$1`, [m.id]).catch(() => {});
  await db.query(`delete from mosque_staff_audit_log where mosque_id=$1`, [m.id]).catch(() => {});
  await db.query(`delete from mosque_staff where mosque_id=$1`, [m.id]);
  await db.query(`delete from mosques where id=$1`, [m.id]);
  return m.id;
};

if (process.argv.includes('--clean')) {
  const id = await dropFixture();
  console.log(id ? `cleaned ${id}` : 'nothing to clean');
  const { data: l } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = (l?.users || []).find((x) => x.email === EMAIL);
  if (u) await svc.auth.admin.deleteUser(u.id);
  await db.end(); process.exit(0);
}

try {
  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let u = (list?.users || []).find((x) => x.email === EMAIL);
  if (!u) { const { data, error } = await svc.auth.admin.createUser({ email: EMAIL, password: PW, email_confirm: true }); if (error) throw error; u = data.user; }
  else await svc.auth.admin.updateUserById(u.id, { password: PW });
  await db.query(`insert into profiles (id,name) values ($1,'Staff Views Owner') on conflict (id) do update set name=excluded.name`, [u.id]);

  await dropFixture();
  const mosque = (await db.query(
    `insert into mosques (user_id,slug,name,address,city,postcode,status)
     values ($1,$2,'Staff Views Verify Masjid','2 Verify St','Bradford','BD1 1AB','active') returning id`,
    [u.id, SLUG])).rows[0].id;

  // Run a statement as the OWNER, so SECURITY DEFINER RPCs see a real auth.uid().
  const asOwner = async (sql, p) => {
    await db.query('begin');
    try {
      await db.query(`select set_config('request.jwt.claims',$1,true)`, [JSON.stringify({ sub: u.id, role: 'authenticated' })]);
      await db.query(`set local role authenticated`);
      const r = await db.query(sql, p);
      await db.query('commit');
      return r;
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; }
  };

  const add = async (name, email, role, department) => (await db.query(
    `insert into mosque_staff (mosque_id,name,email,role,job_title,status,invite_status,department)
     values ($1,$2,$3,$4,$4,'active','not_invited',$5) returning id`,
    [mosque, name, email, role, department])).rows[0].id;

  // 4 CURRENT — three departments so Department is a meaningful filter.
  const current = [
    ['Aisha Rahman',   'aisha.rahman@probe.test',   'Teacher',      'Madrasah'],
    ['Omar Siddiqui',  'omar.siddiqui@probe.test',  'Teacher',      'Madrasah'],
    ['Fatima Bilal',   'fatima.bilal@probe.test',   'Administrator', 'Office'],
    ['Ibrahim Musa',   'ibrahim.musa@probe.test',   'Caretaker',    'Facilities'],
  ];
  for (const [n, e, r, d] of current) await add(n, e, r, d);

  // 3 FORMER — 1 locked by retention, 2 past their eligible date.
  const recent = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const former = [
    ['Zahra Iqbal',  'zahra.iqbal@probe.test',  'Teacher', 'Madrasah',   recent],       // retention ACTIVE
    ['Bilal Osman',  'bilal.osman@probe.test',  'Teacher', 'Madrasah',   '2019-01-01'], // eligible
    ['Yusuf Kamal',  'yusuf.kamal@probe.test',  'Cleaner', 'Facilities', '2018-06-30'], // eligible
  ];
  for (const [n, e, r, d, end] of former) {
    const id = await add(n, e, r, d);
    await asOwner(`select offboard_staff($1,'seed: staff views verification',$2::date)`, [id, end]);
  }

  // 2 ERASED — distinctive strings, so any "no personal data" assertion downstream is meaningful.
  const erased = [
    ['Khadijah Zenithbourne', 'khadijah.zenithbourne@probe.test'],
    ['Tariq Quillfeather',    'tariq.quillfeather@probe.test'],
  ];
  for (const [n, e] of erased) {
    const id = await add(n, e, 'Teacher', 'Madrasah');
    await asOwner(`select offboard_staff($1,'seed: staff views verification',$2::date)`, [id, '2018-06-30']);
    await asOwner(`select anonymise_staff($1)`, [id]);
  }

  const rows = (await db.query(
    `select name, end_date, anonymised_at is not null as erased, offboarded_at is not null as offboarded,
            retention_eligible_at, (retention_eligible_at <= now()) as eligible_now
       from mosque_staff where mosque_id=$1 order by erased, offboarded, name`, [mosque])).rows;
  console.table(rows);
  const cur = rows.filter((r) => !r.offboarded && !r.erased).length;
  const fmr = rows.filter((r) => r.offboarded && !r.erased).length;
  const ers = rows.filter((r) => r.erased).length;
  console.log(`mosque=${mosque}`);
  console.log(`counts — current ${cur} / former ${fmr} / erased ${ers} (deliberately distinct)`);
  if (cur !== 4 || fmr !== 3 || ers !== 2) { console.error('UNEXPECTED COUNTS — fixture is not as intended'); process.exitCode = 1; }
  console.log(`\nSign in: ${EMAIL} / ${PW}  →  Staff`);
  console.log('Clean up: node scripts/seed-staff-views-dev.mjs --clean');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

// Seed / clean up a self-contained fixture for verifying the Former staff tab
// by usage in a browser. DEV ONLY.
//
// Dev holds zero offboarded and zero anonymised rows, so the tab renders its
// empty state and none of the restyle is reachable. This builds its OWN mosque
// with a known-password owner (rather than seeding into a real dev mosque whose
// login we don't have, and whose password we should not be changing) and
// offboards three staff through the REAL offboard_staff RPC — never a direct
// UPDATE, since the 157 guard blocks writing offboarded_at/retention_eligible_at
// outside the SECURITY DEFINER path and going around it would seed states the
// app can never actually produce.
//
//   Zahra Iqbal   — left 30 days ago   → RETENTION ACTIVE (locked pill)
//   Bilal Osman   — left 2019-01-01    → ELIGIBLE (green pill + Review)
//   Yusuf Kamal   — left 2018-06-30    → ELIGIBLE
//
// Counts are DELIBERATELY DISTINCT (3 total / 1 locked / 2 eligible) so a stale
// or wrong number cannot coincidentally match the right one — the lesson from
// the header-count defect.
//
//   node scripts/seed-former-staff-dev.mjs           # seed, prints the login
//   node scripts/seed-former-staff-dev.mjs --clean   # remove the whole fixture
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }
if (!URL_ || !URL_.includes(DEV)) { console.error(`SAFETY: SUPABASE_URL not dev (${DEV}).`); process.exit(1); }

export const OWNER_EMAIL = 'former-tab-owner@amanah-verify.test';
export const OWNER_PW = 'formerTab-Aa1!';
const SLUG = 'former-tab-verify';
const CLEAN = process.argv.includes('--clean');

const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const db = new pg.Client({ connectionString: DBURL });
await db.connect();

const findUser = async () => {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => u.email === OWNER_EMAIL) || null;
};

try {
  if (CLEAN) {
    const m = (await db.query(`select id from mosques where slug = $1`, [SLUG])).rows[0];
    if (m) {
      // Anonymised rows lose their name and email, so cleanup keys off the
      // mosque, not the person — erasing during the browser pass must not
      // strand a row that cleanup can no longer see.
      const s = await db.query(`delete from mosque_staff where mosque_id = $1 returning id`, [m.id]);
      await db.query(`delete from mosque_staff_audit_log where mosque_id = $1`, [m.id]);
      await db.query(`delete from mosques where id = $1`, [m.id]);
      console.log(`deleted mosque ${m.id} + ${s.rowCount} staff rows`);
    } else console.log('no fixture mosque found');
    const u = await findUser();
    if (u) { await svc.auth.admin.deleteUser(u.id); console.log(`deleted owner ${u.id}`); }
    else console.log('no fixture owner found');
    process.exit(0);
  }

  let user = await findUser();
  if (!user) {
    const { data, error } = await svc.auth.admin.createUser({
      email: OWNER_EMAIL, password: OWNER_PW, email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
  } else {
    await svc.auth.admin.updateUserById(user.id, { password: OWNER_PW });
  }
  // profiles_role_check allows only user/scholar/admin — mosque ownership is
  // carried by mosques.user_id, not by a profile role.
  await db.query(`insert into profiles (id, name) values ($1, 'Former Tab Owner')
                    on conflict (id) do update set name = excluded.name`, [user.id]);

  await db.query(`delete from mosque_staff where mosque_id in (select id from mosques where slug = $1)`, [SLUG]);
  await db.query(`delete from mosques where slug = $1`, [SLUG]);
  const mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, $2, 'Former Tab Verify Masjid', '1 Verify St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [user.id, SLUG])).rows[0].id;

  // set_config(..., true) and `set local role` are TRANSACTION-scoped, so the
  // whole impersonation must sit inside one begin/commit — without it the claim
  // is gone by the time the RPC runs and offboard_staff raises not_mosque_owner.
  const asOwner = async (sql, params) => {
    await db.query('begin');
    try {
      await db.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: user.id, role: 'authenticated' })]);
      await db.query(`set local role authenticated`);
      const r = await db.query(sql, params);
      await db.query('commit');
      return r;
    } catch (e) { await db.query('rollback').catch(() => {}); throw e; }
  };

  const PEOPLE = [
    { name: 'Zahra Iqbal', role: 'Quran Teacher',  end: null },
    { name: 'Bilal Osman', role: 'Madrasah Admin', end: '2019-01-01' },
    { name: 'Yusuf Kamal', role: 'Caretaker',      end: '2018-06-30' },
  ];
  // One row that STAYS current, so the Employees tab is non-empty and the
  // Former tab is demonstrably a subset rather than the whole list.
  await db.query(
    `insert into mosque_staff (mosque_id, name, email, role, job_title, status, invite_status)
     values ($1, 'Aisha Malik', 'zz-seed-aisha@probe.test', 'Teacher', 'Teacher', 'active', 'not_invited')`,
    [mosque]);

  const ids = [];
  for (const p of PEOPLE) {
    const email = `zz-seed-${p.name.split(' ')[0].toLowerCase()}@probe.test`;
    const id = (await db.query(
      `insert into mosque_staff (mosque_id, name, email, role, job_title, status, invite_status)
       values ($1, $2, $3, $4, $4, 'active', 'not_invited') returning id`,
      [mosque, p.name, email, p.role])).rows[0].id;
    const end = p.end ?? new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    await asOwner(`select offboard_staff($1, 'seed: browser verification', $2::date)`, [id, end]);
    ids.push(id);
  }

  const check = await db.query(`
    select name, end_date, retention_eligible_at, (retention_eligible_at <= now()) as eligible_now
      from mosque_staff where id = any($1::uuid[]) order by end_date`, [ids]);
  console.log('Seeded former staff:'); console.table(check.rows);
  const n = check.rows.filter((r) => r.eligible_now).length;
  console.log(`mosque=${mosque}`);
  console.log(`counts — total ${check.rows.length} / locked ${check.rows.length - n} / eligible ${n} (deliberately distinct)`);
  console.log(`\nSign in: ${OWNER_EMAIL} / ${OWNER_PW}  →  Staff → Former staff`);
  console.log('Clean up: node scripts/seed-former-staff-dev.mjs --clean');
} catch (e) {
  console.error('FAILED:', e.message);
  process.exitCode = 1;
} finally {
  await db.end();
}

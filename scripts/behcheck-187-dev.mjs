// Migration 187 dev apply + probes: mosque_time_logs anonymised-staff guard.
// DEV ONLY (hard ref guard). A pg superuser (DEV_DATABASE_URL) applies the DDL,
// then proves the NARROW scope: current + OFFBOARDED logs are ALLOWED (the
// differentiator vs 186 — back-pay is legitimate), while ANONYMISED logs are
// rejected on both INSERT and UPDATE with the real 23514 error text. Seed rows
// live in an outer transaction that is ROLLED BACK; the migration DDL is
// committed by the file's own begin/commit first.
import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };

const db = new pg.Client({ connectionString: DBURL });

const trySp = async (fn) => {
  await db.query('savepoint sp');
  try { const r = await fn(); await db.query('release savepoint sp'); return { raised: false, result: r }; }
  catch (e) { await db.query('rollback to savepoint sp'); return { raised: true, code: e.code, message: e.message }; }
};

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 187 ===');
  await db.query(readFileSync('migrations/187_mosque_time_logs_anonymised_guard.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== STEP 2: trigger attached ===');
  const trg = await db.query(
    `select tgname, tgenabled, pg_get_triggerdef(oid) as def
       from pg_trigger
      where tgrelid='public.mosque_time_logs'::regclass and tgname='mosque_time_logs_guard_not_anonymised'`);
  console.log(JSON.stringify(trg.rows, null, 2));
  (trg.rows.length === 1) ? ok('trigger present') : bad(`expected 1 trigger, got ${trg.rows.length}`);
  (trg.rows[0]?.def || '').includes('BEFORE INSERT OR UPDATE')
    ? ok('fires BEFORE INSERT OR UPDATE') : bad('trigger timing/events wrong');

  console.log('\n=== STEP 0: pre-flight — existing logs against anonymised staff (informational) ===');
  const pre = await db.query(
    `select tl.id, tl.staff_id, ms.anonymised_at
       from public.mosque_time_logs tl
       join public.mosque_staff ms on ms.id = tl.staff_id
      where ms.anonymised_at is not null`);
  console.log(`   rows: ${pre.rowCount}`);
  console.log(JSON.stringify(pre.rows, null, 2));

  // ---- seed in an outer transaction we roll back at the end ----
  await db.query('begin');

  const owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'beh187-owner@amanah-verify.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(`insert into profiles (id, name) values ($1, 'BEH187 Owner')
                    on conflict (id) do update set name = excluded.name`, [owner]);
  const mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'beh187-probe', 'BEH187 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;

  const mkStaff = (name, status, extraCols = '', extraColVals = []) => db.query(
    `insert into mosque_staff (mosque_id, name, email, role, status, invite_status${extraCols})
     values ($1, $2, $3, 'Teacher', $4, 'not_invited'${extraColVals.map((_, i) => `, $${5 + i}`).join('')})
     returning id`,
    [mosque, name, `${name.replace(/\W+/g, '').toLowerCase()}@amanah-verify.test`, status, ...extraColVals]
  ).then((r) => r.rows[0].id);

  const current    = await mkStaff('beh187 current',    'active');
  const offboarded = await mkStaff('beh187 offboarded', 'offboarded', ', offboarded_at', [new Date().toISOString()]);
  const anonymised = await mkStaff('beh187 anonymised', 'active',     ', anonymised_at', [new Date().toISOString()]);
  console.log(`\n   seeded owner=${owner} mosque=${mosque}`);
  console.log(`   current=${current} offboarded=${offboarded} anonymised=${anonymised}`);

  // A clocked-out 3h shift with a 30m break → worked_hours should compute to 2.50.
  const insLog = (staffId) => db.query(
    `insert into public.mosque_time_logs (mosque_id, staff_id, clock_in, clock_out, break_minutes)
     values ($1, $2, now() - interval '3 hours', now(), 30)
     returning id, worked_hours`,
    [mosque, staffId]);

  console.log('\n=== TEST 3: ALLOWED — log for a CURRENT staff member ===');
  const t3 = await trySp(() => insLog(current));
  t3.raised
    ? bad(`current-staff log unexpectedly rejected: ${t3.code} ${t3.message}`)
    : ok(`current-staff log inserted (id ${t3.result.rows[0].id}, worked_hours ${t3.result.rows[0].worked_hours})`);

  console.log('\n=== TEST 4: ALLOWED (differentiator vs 186) — log for an OFFBOARDED staff member (back-pay) ===');
  const t4 = await trySp(() => insLog(offboarded));
  t4.raised
    ? bad(`offboarded-staff log WRONGLY rejected (back-pay must be allowed): ${t4.code} ${t4.message}`)
    : ok(`offboarded-staff log inserted (id ${t4.result.rows[0].id}) — offboarded NOT blocked`);

  console.log('\n=== TEST 5: REJECT — log for an ANONYMISED staff member (INSERT) ===');
  const t5 = await trySp(() => insLog(anonymised));
  console.log(`   raised=${t5.raised} code=${t5.code}\n   message: ${t5.message}`);
  (t5.raised && t5.code === '23514')
    ? ok('anonymised INSERT rejected with 23514') : bad('anonymised INSERT NOT rejected with 23514');

  console.log('\n=== TEST 6: REJECT (UPDATE path) — repoint a valid log to ANONYMISED staff ===');
  const logId = (await insLog(current)).rows[0].id;   // persists in the outer txn
  const t6 = await trySp(() => db.query(
    `update public.mosque_time_logs set staff_id = $1 where id = $2`, [anonymised, logId]));
  console.log(`   raised=${t6.raised} code=${t6.code}\n   message: ${t6.message}`);
  (t6.raised && t6.code === '23514')
    ? ok('UPDATE to an anonymised staff_id rejected with 23514') : bad('UPDATE path NOT rejected with 23514');

  console.log('\n=== TEST 6b: ALLOWED — benign UPDATE on a current-staff log (guard not over-blocking) ===');
  const t6b = await trySp(() => db.query(
    `update public.mosque_time_logs set break_minutes = 15 where id = $1`, [logId]));
  t6b.raised
    ? bad(`benign UPDATE on a current-staff log wrongly rejected: ${t6b.code} ${t6b.message}`)
    : ok('benign UPDATE on a current-staff log allowed');

  await db.query('rollback');   // discard all seed rows
  console.log('\n   (seed rolled back — dev clean)');

  console.log('\n=== STEP 7: HASH — md5(prosrc) of the guard function (record for prod match) ===');
  const h = await db.query(
    `select md5(prosrc) as md5, length(prosrc) as len
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='guard_mosque_time_logs_not_anonymised'`);
  console.log(JSON.stringify(h.rows, null, 2));

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
  process.exit(fail ? 1 : 0);
} catch (e) {
  try { await db.query('rollback'); } catch {}
  console.error('FATAL:', e.message);
  process.exit(1);
} finally {
  await db.end().catch(() => {});
}

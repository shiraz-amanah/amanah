// Migration 186 dev apply + probes: mosque_shifts current-staff guard.
// DEV ONLY (hard ref guard). A pg superuser (DEV_DATABASE_URL) applies the DDL,
// then exercises the trigger: happy path + three rejection cases, each proven by
// usage with the REAL raised error text. Seed rows live in an outer transaction
// that is ROLLED BACK at the end, so nothing persists on dev; the migration DDL
// is committed by the file's own begin/commit before that.
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

// Run `fn` inside a savepoint; return { raised, code, message }. On any raise the
// savepoint is rolled back so the outer txn stays usable.
const trySp = async (fn) => {
  await db.query('savepoint sp');
  try { const r = await fn(); await db.query('release savepoint sp'); return { raised: false, result: r }; }
  catch (e) { await db.query('rollback to savepoint sp'); return { raised: true, code: e.code, message: e.message }; }
};

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 186 ===');
  await db.query(readFileSync('migrations/186_mosque_shifts_current_staff_guard.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== STEP 2: trigger attached ===');
  const trg = await db.query(
    `select tgname, tgenabled,
            pg_get_triggerdef(oid) as def
       from pg_trigger
      where tgrelid='public.mosque_shifts'::regclass and tgname='mosque_shifts_guard_current_staff'`);
  console.log(JSON.stringify(trg.rows, null, 2));
  (trg.rows.length === 1) ? ok('trigger present') : bad(`expected 1 trigger, got ${trg.rows.length}`);
  (trg.rows[0]?.def || '').includes('BEFORE INSERT OR UPDATE')
    ? ok('fires BEFORE INSERT OR UPDATE') : bad('trigger timing/events wrong');

  console.log('\n=== STEP 0: pre-flight — existing shifts referencing non-current staff (expect 0) ===');
  const pre = await db.query(
    `select sh.id, sh.staff_id, ms.status, ms.archived, ms.offboarded_at, ms.anonymised_at, sh.shift_date
       from public.mosque_shifts sh
       join public.mosque_staff ms on ms.id = sh.staff_id
      where ms.anonymised_at is not null or ms.offboarded_at is not null
         or ms.status = 'offboarded' or ms.archived is true`);
  console.log(`   rows: ${pre.rowCount}`);
  console.log(JSON.stringify(pre.rows, null, 2));
  (pre.rowCount === 0) ? ok('no pre-existing violators on dev') : bad(`${pre.rowCount} pre-existing violator(s) — manual sweep needed`);

  // ---- seed in an outer transaction we roll back at the end ----
  await db.query('begin');

  const owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'beh186-owner@amanah-verify.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(`insert into profiles (id, name) values ($1, 'BEH186 Owner')
                    on conflict (id) do update set name = excluded.name`, [owner]);
  const mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'beh186-probe', 'BEH186 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;

  // status is always $4; extraColVals fill any additional columns from $5 on.
  const mkStaff = (name, status, extraCols = '', extraColVals = []) => db.query(
    `insert into mosque_staff (mosque_id, name, email, role, status, invite_status${extraCols})
     values ($1, $2, $3, 'Teacher', $4, 'not_invited'${extraColVals.map((_, i) => `, $${5 + i}`).join('')})
     returning id`,
    [mosque, name, `${name.replace(/\W+/g, '').toLowerCase()}@amanah-verify.test`, status, ...extraColVals]
  ).then((r) => r.rows[0].id);

  const current    = await mkStaff('beh186 current',    'active');
  const offboarded = await mkStaff('beh186 offboarded', 'offboarded', ', offboarded_at', [new Date().toISOString()]);
  const anonymised = await mkStaff('beh186 anonymised', 'active',     ', anonymised_at', [new Date().toISOString()]);
  const archived   = await mkStaff('beh186 archived',   'active',     ', archived',      [true]);
  console.log(`\n   seeded owner=${owner} mosque=${mosque}`);
  console.log(`   current=${current} offboarded=${offboarded} anonymised=${anonymised} archived=${archived}`);

  const insShift = (staffId, day) => db.query(
    `insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
     values ($1, $2, $3, time '09:00', time '11:00') returning id`,
    [mosque, staffId, day]);

  console.log('\n=== TEST 3: HAPPY PATH — shift for a CURRENT staff member inserts ===');
  const t3 = await trySp(() => insShift(current, '2999-01-02'));
  t3.raised
    ? bad(`current-staff insert unexpectedly rejected: ${t3.code} ${t3.message}`)
    : ok(`current-staff insert OK (shift id ${t3.result.rows[0].id})`);

  console.log('\n=== TEST 4: REJECT — OFFBOARDED staff ===');
  const t4 = await trySp(() => insShift(offboarded, '2999-01-03'));
  console.log(`   raised=${t4.raised} code=${t4.code}\n   message: ${t4.message}`);
  (t4.raised && t4.code === '23514')
    ? ok('offboarded insert rejected with 23514') : bad('offboarded insert NOT rejected with 23514');

  console.log('\n=== TEST 5: REJECT — ANONYMISED staff ===');
  const t5 = await trySp(() => insShift(anonymised, '2999-01-04'));
  console.log(`   raised=${t5.raised} code=${t5.code}\n   message: ${t5.message}`);
  (t5.raised && t5.code === '23514')
    ? ok('anonymised insert rejected with 23514') : bad('anonymised insert NOT rejected with 23514');

  console.log('\n=== TEST 5b (bonus): REJECT — ARCHIVED staff (isFormer branch c) ===');
  const t5b = await trySp(() => insShift(archived, '2999-01-06'));
  console.log(`   raised=${t5b.raised} code=${t5b.code}\n   message: ${t5b.message}`);
  (t5b.raised && t5b.code === '23514')
    ? ok('archived insert rejected with 23514') : bad('archived insert NOT rejected with 23514');

  console.log('\n=== TEST 6: REJECT (UPDATE path) — repoint a valid shift to OFFBOARDED staff ===');
  // A valid shift for the current member (must succeed), then flip staff_id.
  const shId = (await insShift(current, '2999-01-05')).rows[0].id;
  const t6 = await trySp(() => db.query(
    `update public.mosque_shifts set staff_id = $1 where id = $2`, [offboarded, shId]));
  console.log(`   raised=${t6.raised} code=${t6.code}\n   message: ${t6.message}`);
  (t6.raised && t6.code === '23514')
    ? ok('UPDATE to a non-current staff_id rejected with 23514') : bad('UPDATE path NOT rejected with 23514');

  await db.query('rollback');   // discard all seed rows
  console.log('\n   (seed rolled back — dev clean)');

  console.log('\n=== STEP 7: HASH — md5(prosrc) of the guard function (record for prod match) ===');
  const h = await db.query(
    `select md5(prosrc) as md5, length(prosrc) as len
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='guard_mosque_shifts_current_staff'`);
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

// Former staff + Erasure register behaviour probe. DEV ONLY. All seed rows are
// ROLLED BACK.
//
// WHY THIS EXISTS. The retention arc (172-176) shipped two new lifecycle tabs
// that have never been exercised with data: dev and prod both hold ZERO
// offboarded and ZERO anonymised rows, so every "counts unchanged" pass on
// Former staff / Erasure register to date has been an EMPTY-SET pass. This
// seeds real rows through the real RPCs and asserts the partition actually
// works.
//
// ASSERTS AGAINST SHIPPED CODE, NOT AGAINST EXPECTATIONS. The header-count
// defect (see NOTES.md) happened because a probe asserted the tab label against
// its author's expectation instead of against the other number on the screen.
// So the three partition predicates here are not re-stated — they are
// EXTRACTED FROM src/lib/staffHelpers.js AND EVALUATED, so this probe cannot
// drift from the UI. staffHelpers imports supabaseClient (import.meta.env),
// which will not load under plain node; extracting the pure helpers sidesteps
// that without copying them.
//
// P1 partition predicates + row shaper load from the shipped source.
// P2 baseline — the RPC's partition before any lifecycle row exists.
// P3 offboard_staff(null end_date)      → 'end_date_required' (ruling a).
// P4 recent leaver offboarded           → lands in FORMER, retention stamped,
//                                         deleted_at still null (the 176 invariant).
// P5 anonymise before retention expires → 'retention_active', row UNTOUCHED,
//                                         no audit row, still in Former.
// P6 old leaver (retention expired)     → anonymise SUCCEEDS, email NULL,
//                                         anonymised_at stamped, moves Former → ERASURE.
// P7 176 invariant — every lifecycle row is still RETURNED by
//    get_mosque_staff_list (pre-176 a deleted_at write would have hidden them),
//    and the erased row is identified by anonymised_at, never by sniffing
//    the '[REDACTED]' string.
// P8 the three buckets are a TRUE PARTITION — every row in exactly one.
import pg from 'pg';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }

const db = new pg.Client({ connectionString: DBURL });
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const claims = (uid) => JSON.stringify({ sub: uid, role: 'authenticated' });

// ── Extract the shipped helpers rather than restating them ──────────
const HELPERS = 'src/lib/staffHelpers.js';
const srcText = readFileSync(HELPERS, 'utf8');
// Brace-matched slice of a top-level `export function NAME(...) {...}`.
function sliceFn(text, name) {
  const start = text.indexOf(`export function ${name}`);
  if (start < 0) throw new Error(`${name} not found in ${HELPERS}`);
  let i = text.indexOf('{', start), depth = 0;
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1).replace('export ', '');
  }
  throw new Error(`unbalanced braces in ${name}`);
}
const predStart = srcText.indexOf('export const isAnonymised');
if (predStart < 0) throw new Error(`isAnonymised not found in ${HELPERS}`);
const predEnd = srcText.indexOf('\n', srcText.indexOf('export const isCurrentStaff'));
const predBlock = srcText.slice(predStart, predEnd).replaceAll('export ', '');
const { isAnonymised, isFormer, isCurrentStaff, shapeStaffListRow } = new Function(
  `${sliceFn(srcText, 'shapeStaffListRow')}\n${predBlock}
   return { isAnonymised, isFormer, isCurrentStaff, shapeStaffListRow };`)();

// Call the RPC as the owner and partition exactly as StaffDirectory does.
async function listAs(owner, mosque) {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);
  const rows = (await db.query(`select * from get_mosque_staff_list($1)`, [mosque])).rows;
  await db.query(`reset role`);
  const staff = rows.map(shapeStaffListRow);
  return {
    all: staff,
    employees: staff.filter(isCurrentStaff),
    former: staff.filter(isFormer),
    erasure: staff.filter(isAnonymised),
  };
}
// A raise inside a transaction poisons it ("current transaction is aborted"),
// so every expected failure runs inside its own SAVEPOINT and rolls back to it.
// That is also what makes the "row completely untouched" assertion in P5 mean
// something: the savepoint rollback undoes nothing, because a correct
// anonymise_staff refuses before its first write.
const expectRaise = async (fn, code) => {
  await db.query('savepoint sp');
  try {
    await fn();
    await db.query('release savepoint sp');
    return { raised: false };
  } catch (e) {
    await db.query('rollback to savepoint sp');
    await db.query('reset role').catch(() => {});
    return { raised: true, match: (e.message || '').includes(code), message: e.message };
  }
};
const seedStaff = (mosque, name, email) => db.query(
  `insert into mosque_staff (mosque_id, name, email, role, status, invite_status)
   values ($1, $2, $3, 'Teacher', 'active', 'not_invited') returning id`,
  [mosque, name, email]).then((r) => r.rows[0].id);
const asOwner = async (owner, sql, params) => {
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);
  // reset role is best-effort: if the statement raised, the transaction is
  // aborted and the reset itself would throw, masking the real error.
  try { return await db.query(sql, params); }
  finally { await db.query(`reset role`).catch(() => {}); }
};

let owner, mosque;
try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== P1: partition predicates load from shipped source ===');
  [['isAnonymised', isAnonymised], ['isFormer', isFormer], ['isCurrentStaff', isCurrentStaff],
   ['shapeStaffListRow', shapeStaffListRow]].forEach(([n, f]) =>
    typeof f === 'function' ? ok(`${n} extracted from ${HELPERS}`) : bad(`${n} FAILED to extract`));
  // Sanity: the predicates behave as the tabs need on synthetic rows.
  isFormer({ archived: true }) ? ok('isFormer catches legacy archived rows (no offboardedAt)')
    : bad('isFormer missed an archived row — the tab would under-count legacy leavers');
  !isFormer({ anonymisedAt: 'x', archived: true })
    ? ok('anonymised outranks former (no double-count)') : bad('an erased row also reads as former');

  await db.query('begin');

  owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'p176-owner@probe.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(`insert into profiles (id, name) values ($1, 'P176 Owner')
                    on conflict (id) do update set name = excluded.name`, [owner]);
  mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'p176-probe', 'P176 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;
  const current = await seedStaff(mosque, 'P176 Current', 'p176-current@probe.test');
  const recent  = await seedStaff(mosque, 'P176 Recent Leaver', 'p176-recent@probe.test');
  const old     = await seedStaff(mosque, 'P176 Old Leaver', 'p176-old@probe.test');
  console.log(`   owner=${owner} mosque=${mosque}`);

  console.log('\n=== P2: baseline partition (no lifecycle rows yet) ===');
  const base = await listAs(owner, mosque);
  console.log(`   employees=${base.employees.length} former=${base.former.length} erasure=${base.erasure.length}`);
  (base.all.length === 3) ? ok('RPC returns all 3 seeded rows') : bad(`RPC returned ${base.all.length}, expected 3`);
  (base.employees.length === 3) ? ok('all 3 start as Employees') : bad(`${base.employees.length} employees, expected 3`);
  (base.former.length === 0 && base.erasure.length === 0)
    ? ok('Former and Erasure both empty at baseline') : bad('a lifecycle tab was non-empty at baseline');

  console.log('\n=== P3: offboard requires an end_date (ruling a) ===');
  const p3 = await expectRaise(() => asOwner(owner,
    `select offboard_staff($1, 'left', null)`, [recent]), 'end_date_required');
  (p3.raised && p3.match) ? ok("null end_date raises 'end_date_required'")
    : bad(`expected end_date_required, got: ${p3.raised ? p3.message : 'NO RAISE'}`);

  console.log('\n=== P4: recent leaver offboarded → FORMER ===');
  await asOwner(owner, `select offboard_staff($1, 'left', (now() - interval '30 days')::date)`, [recent]);
  const p4 = await listAs(owner, mosque);
  const recentRow = p4.all.find((r) => r.id === recent);
  console.log(`   employees=${p4.employees.length} former=${p4.former.length} erasure=${p4.erasure.length}`);
  (p4.former.length === 1 && p4.former[0].id === recent)
    ? ok('the offboarded row appears in Former staff') : bad(`Former holds ${p4.former.length} rows`);
  (p4.employees.length === 2) ? ok('Employees drops to 2') : bad(`Employees = ${p4.employees.length}, expected 2`);
  recentRow?.offboardedAt ? ok('offboarded_at stamped') : bad('offboarded_at NOT stamped');
  recentRow?.retentionEligibleAt ? ok('retention_eligible_at stamped') : bad('retention_eligible_at NOT stamped');
  const delAt = (await db.query(`select deleted_at from mosque_staff where id = $1`, [recent])).rows[0].deleted_at;
  (delAt === null) ? ok('deleted_at still NULL — 176 invariant holds (nothing writes it)')
    : bad(`deleted_at was written (${delAt}) — the 176 predicate removal is NOT safe`);

  console.log('\n=== P5: erasure refused while retention is active ===');
  const before = (await db.query(
    `select name, email, anonymised_at from mosque_staff where id = $1`, [recent])).rows[0];
  await db.query(`delete from mosque_staff_audit_log where mosque_id = $1`, [mosque]);
  const p5 = await expectRaise(() => asOwner(owner, `select anonymise_staff($1)`, [recent]), 'retention_active');
  (p5.raised && p5.match) ? ok("raises 'retention_active'")
    : bad(`expected retention_active, got: ${p5.raised ? p5.message : 'NO RAISE'}`);
  const after = (await db.query(
    `select name, email, anonymised_at from mosque_staff where id = $1`, [recent])).rows[0];
  (after.name === before.name && after.email === before.email && after.anonymised_at === null)
    ? ok('row completely untouched (refused BEFORE the first write)')
    : bad('the refused attempt still mutated the row');
  const auditCount = (await db.query(
    `select count(*)::int c from mosque_staff_audit_log where mosque_id = $1`, [mosque])).rows[0].c;
  (auditCount === 0) ? ok('no audit row written for a refused erasure') : bad(`${auditCount} audit rows written`);
  const p5list = await listAs(owner, mosque);
  (p5list.former.length === 1 && p5list.erasure.length === 0)
    ? ok('still in Former, not in Erasure register') : bad('the refused row moved tabs');

  console.log('\n=== P6: retention expired → erasure SUCCEEDS, moves to ERASURE ===');
  // end_date far enough back that greatest(end_date + 2y, first 5 Apr after + 3y) is past.
  await asOwner(owner, `select offboard_staff($1, 'left', '2019-01-01'::date)`, [old]);
  const elig = (await db.query(
    `select retention_eligible_at, retention_eligible_at < now() as expired
       from mosque_staff where id = $1`, [old])).rows[0];
  console.log(`   retention_eligible_at=${elig.retention_eligible_at?.toISOString?.() ?? elig.retention_eligible_at} expired=${elig.expired}`);
  elig.expired ? ok('retention window has expired for a 2019 leaver')
    : bad('2019 leaver is still retention-gated — check staff_retention_eligible_at');
  await asOwner(owner, `select anonymise_staff($1)`, [old]);
  const erased = (await db.query(
    `select name, email, phone, anonymised_at from mosque_staff where id = $1`, [old])).rows[0];
  (erased.email === null) ? ok('email set to NULL (never a sentinel — it is the invite join key)')
    : bad(`email = ${JSON.stringify(erased.email)}, expected NULL`);
  (erased.name === '[REDACTED]') ? ok('name redacted') : bad(`name = ${erased.name}`);
  erased.anonymised_at ? ok('anonymised_at stamped') : bad('anonymised_at NOT stamped');
  const p6 = await listAs(owner, mosque);
  console.log(`   employees=${p6.employees.length} former=${p6.former.length} erasure=${p6.erasure.length}`);
  (p6.erasure.length === 1 && p6.erasure[0].id === old)
    ? ok('the erased row appears in the Erasure register') : bad(`Erasure holds ${p6.erasure.length} rows`);
  (p6.former.length === 1 && p6.former[0].id === recent)
    ? ok('Former still holds only the retention-gated leaver') : bad(`Former holds ${p6.former.length} rows`);
  (p6.employees.length === 1) ? ok('Employees down to 1') : bad(`Employees = ${p6.employees.length}, expected 1`);

  console.log('\n=== P7: 176 invariant + no [REDACTED] sniffing ===');
  (p6.all.length === 3)
    ? ok('all 3 rows still RETURNED by get_mosque_staff_list (none hidden)')
    : bad(`RPC returned ${p6.all.length} — a lifecycle row was filtered out`);
  const noDeleted = (await db.query(
    `select count(*)::int c from mosque_staff where mosque_id = $1 and deleted_at is not null`,
    [mosque])).rows[0].c;
  (noDeleted === 0) ? ok('no row acquired a deleted_at through the whole lifecycle')
    : bad(`${noDeleted} rows have deleted_at — 176 removed a LOAD-BEARING predicate`);
  isAnonymised(p6.erasure[0]) && p6.erasure[0].name === '[REDACTED]'
    ? ok('erased row identified by anonymised_at while its name happens to be [REDACTED]')
    : bad('erasure identification did not key on anonymised_at');

  console.log('\n=== P8: the three buckets are a true partition ===');
  const sum = p6.employees.length + p6.former.length + p6.erasure.length;
  (sum === p6.all.length) ? ok(`buckets sum to the total (${sum} = ${p6.all.length})`)
    : bad(`buckets sum to ${sum}, total is ${p6.all.length} — rows dropped or double-counted`);
  const counted = p6.all.filter((r) =>
    [isCurrentStaff(r), isFormer(r), isAnonymised(r)].filter(Boolean).length !== 1);
  (counted.length === 0) ? ok('every row lands in exactly one bucket')
    : bad(`${counted.length} rows in zero or multiple buckets`);

} catch (e) {
  bad(`UNEXPECTED: ${e.message}`);
  console.error(e);
} finally {
  try { await db.query('rollback'); console.log('\n(seed rolled back)'); } catch {}
  await db.end();
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

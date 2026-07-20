// Migration 162 dev apply + probes: mosque_roles + 3 employment cols +
// update_staff_employment. DEV ONLY (hard ref guard). Single superuser pg
// connection; metadata probes + behavioural probes inside BEGIN...ROLLBACK with
// role simulation (SET ROLE + injected request.jwt.claims), savepoint per raise.
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
    bad(`${label}: expected raise "${needle}" but call SUCCEEDED`);
    await db.query('rollback to savepoint sp');
  } catch (e) {
    await db.query('rollback to savepoint sp');
    e.message.includes(needle) ? ok(`${label}: ${e.message}`) : bad(`${label}: wrong error → ${e.message}`);
  }
}

const RPC = 'select public.update_staff_employment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as r';
//                        staff  salP  hrP   hrs   ctype notEmp notEmpe prob  place pension

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 162 ===');
  await db.query(readFileSync('migrations/162_mosque_roles_and_employment_writer.sql', 'utf8'));
  console.log('applied OK');

  // ── P1: mosque_roles ──
  console.log('\n=== P1: mosque_roles table + constraints + RLS + seed ===');
  const cols = await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='mosque_roles' order by ordinal_position`);
  console.log(JSON.stringify(cols.rows));
  cols.rows.length === 9 ? ok('9 columns present') : bad(`expected 9 cols, got ${cols.rows.length}`);

  const uniq = await db.query(
    `select conname, pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='public.mosque_roles'::regclass and contype='u'`);
  console.log(JSON.stringify(uniq.rows));
  (uniq.rows.length === 1 && /mosque_id, slug/.test(uniq.rows[0].def))
    ? ok('unique(mosque_id, slug)') : bad(`unique constraint: ${JSON.stringify(uniq.rows)}`);

  const pol = await db.query(
    `select policyname, cmd from pg_policies where schemaname='public' and tablename='mosque_roles' order by cmd`);
  console.log(JSON.stringify(pol.rows));
  const cmds = pol.rows.map(r => r.cmd).sort().join(',');
  (pol.rows.length === 2 && cmds === 'ALL,SELECT') ? ok('2 policies: SELECT readers + ALL owner/admin')
    : bad(`policies: ${JSON.stringify(pol.rows)}`);

  const anon = await db.query(`select has_table_privilege('anon','public.mosque_roles','SELECT') as s`);
  anon.rows[0].s === false ? ok('anon SELECT revoked') : bad(`anon SELECT = ${anon.rows[0].s}`);

  const seed = await db.query(
    `select count(*)::int mosques,
            count(*) filter (where n = 7)::int with7,
            min(n)::int minn, max(n)::int maxn
       from (select m.id, count(r.id)::int n
               from public.mosques m left join public.mosque_roles r on r.mosque_id=m.id
              group by m.id) s`);
  console.log('backfill per-mosque role counts:', JSON.stringify(seed.rows[0]));
  (seed.rows[0].mosques === seed.rows[0].with7 && seed.rows[0].minn === 7 && seed.rows[0].maxn === 7)
    ? ok(`backfill seeded exactly 7 roles for all ${seed.rows[0].mosques} mosques`)
    : bad(`backfill uneven: ${JSON.stringify(seed.rows[0])}`);

  const trg = await db.query(
    `select tgname, tgenabled from pg_trigger where tgrelid='public.mosques'::regclass and tgname='mosques_seed_default_roles'`);
  trg.rows.length === 1 ? ok(`seed trigger present (${trg.rows[0].tgname})`) : bad('seed trigger missing');

  // seed trigger fires on a real new-mosque INSERT (rolled back)
  await db.query('begin');
  try {
    const m = await db.query(
      `insert into public.mosques (slug, name, address, city, postcode)
       values ('behcheck162-seed','BEHCHECK162 Seed','1 Test St','Testville','TE1 1ST') returning id`);
    const n = await db.query(`select count(*)::int n from public.mosque_roles where mosque_id=$1`, [m.rows[0].id]);
    n.rows[0].n === 7 ? ok(`seed trigger fired on new mosque → ${n.rows[0].n} roles`) : bad(`new mosque got ${n.rows[0].n} roles`);
  } finally { await db.query('rollback'); }

  // ── P2: employment columns ──
  console.log('\n=== P2: three new mosque_staff_employment columns (nullable) ===');
  const ec = await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='mosque_staff_employment'
        and column_name in ('place_of_work','notice_period_employer_weeks','notice_period_employee_weeks')
      order by column_name`);
  console.log(JSON.stringify(ec.rows));
  (ec.rows.length === 3 && ec.rows.every(r => r.is_nullable === 'YES'))
    ? ok('3 columns present + all nullable') : bad(`employment cols: ${JSON.stringify(ec.rows)}`);

  // ── P3: RPC metadata ──
  console.log('\n=== P3: update_staff_employment metadata ===');
  const sig = 'public.update_staff_employment(uuid,integer,integer,numeric,text,integer,integer,date,text,boolean)';
  const rpc = await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) owner,
            has_function_privilege('anon','${sig}','EXECUTE') anon,
            has_function_privilege('authenticated','${sig}','EXECUTE') authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='update_staff_employment'`);
  console.log(JSON.stringify(rpc.rows[0]));
  (rpc.rows[0]?.prosecdef === true && rpc.rows[0]?.owner === 'postgres' && rpc.rows[0]?.anon === false && rpc.rows[0]?.authd === true)
    ? ok('prosecdef=true, owner=postgres, anon denied, authenticated granted')
    : bad(`rpc meta: ${JSON.stringify(rpc.rows[0])}`);

  // ── P4: behavioural ──
  console.log('\n=== P4: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  const s1 = await db.query(
    `select ms.id staff_id, ms.mosque_id, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id=ms.mosque_id
      where mo.user_id is not null order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`, [s1.rows[0]?.owner]);
  if (!s1.rows.length || !owner2q.rows.length) { bad('need a staff row + two distinct owners'); throw new Error('fixtures'); }
  const F = s1.rows[0], owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ staff: F.staff_id, mosque: F.mosque_id, owner1: F.owner, owner2 }));

  const auditN = async () => (await db.query(
    `select count(*)::int n from public.mosque_staff_audit_log where staff_id=$1 and action='salary_changed'`,
    [F.staff_id])).rows[0].n;
  // Fetch a specific salary_changed row by content (created_at is txn-constant via
  // now(), so ordering by time is non-deterministic within the fixture txn).
  const salaryRow = async (fromV, toV) => (await db.query(
    `select count(*)::int n from public.mosque_staff_audit_log
      where staff_id=$1 and action='salary_changed'
        and details->>'from_salary_pence' is not distinct from $2
        and details->>'to_salary_pence'   is not distinct from $3`,
    [F.staff_id, fromV, toV])).rows[0].n;

  await db.query('begin');
  try {
    await db.query('delete from public.mosque_staff_employment where staff_id=$1', [F.staff_id]);

    // (a) anon → blocked
    await db.query('set role anon');
    await expectRaise(RPC, [F.staff_id, 50000, null, 37.5, 'permanent', 4, 2, null, 'Main', true], 'permission denied', 'anon call');
    await db.query('reset role');

    // (b) non-owner → not_authorised
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise(RPC, [F.staff_id, 50000, null, 37.5, 'permanent', 4, 2, null, 'Main', true], 'not_authorised', 'non-owner call');

    // switch to owner
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);

    // (c) negative salary → salary_invalid
    await expectRaise(RPC, [F.staff_id, -100, null, 37.5, 'permanent', 4, 2, null, 'Main', true], 'salary_invalid', 'negative salary');

    // (d) owner first-set → row + one salary_changed audit (null→50000)
    const before = await auditN();
    const r1 = await db.query(RPC, [F.staff_id, 50000, null, 37.5, 'permanent', 4, 2, null, 'Main site', true]);
    console.log('  first-set return:', JSON.stringify(r1.rows[0].r));
    await db.query('reset role');
    const emp1 = await db.query(`select salary_pence, place_of_work, notice_period_employer_weeks from public.mosque_staff_employment where staff_id=$1`, [F.staff_id]);
    const a1 = await auditN();
    const firstSetRow = await salaryRow(null, '50000');
    console.log('  employment:', JSON.stringify(emp1.rows[0]), '| audit rows:', a1, '| null→50000 rows:', firstSetRow);
    (r1.rows[0].r.success === true && emp1.rows[0]?.salary_pence === 50000 && a1 === before + 1 && firstSetRow === 1)
      ? ok('first-set: row created, exactly one salary_changed audit (null→50000)')
      : bad(`first-set wrong: emp=${JSON.stringify(emp1.rows[0])} audit+${a1-before} null→50000=${firstSetRow}`);

    // (e) owner salary change → one more audit row, correct from/to
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const r2 = await db.query(RPC, [F.staff_id, 60000, null, 37.5, 'permanent', 4, 2, null, 'Main site', true]);
    await db.query('reset role');
    const a2 = await auditN();
    const changeRow = await salaryRow('50000', '60000');
    console.log('  change return:', JSON.stringify(r2.rows[0].r), '| audit rows:', a2, '| 50000→60000 rows:', changeRow);
    (r2.rows[0].r.salary_changed === true && a2 === a1 + 1 && changeRow === 1)
      ? ok('salary change: +1 audit row, from 50000 → 60000')
      : bad(`salary change wrong: audit+${a2-a1} 50000→60000=${changeRow}`);

    // (f) owner non-salary change (same salary, change hours + place) → NO new audit
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    await db.query(RPC, [F.staff_id, 60000, null, 40, 'permanent', 6, 3, null, 'Annex', false]);
    await db.query('reset role');
    const a3 = await auditN();
    const emp3 = await db.query(`select hours_per_week, place_of_work, pension_enrolled from public.mosque_staff_employment where staff_id=$1`, [F.staff_id]);
    console.log('  after non-salary change: audit rows:', a3, '| emp:', JSON.stringify(emp3.rows[0]));
    (a3 === a2 && Number(emp3.rows[0].hours_per_week) === 40 && emp3.rows[0].place_of_work === 'Annex')
      ? ok('non-salary change: fields updated, NO new salary audit row')
      : bad(`non-salary wrong: audit+${a3-a2} emp=${JSON.stringify(emp3.rows[0])}`);

    // (g) bank / ni untouched by the RPC
    await db.query(`update public.mosque_staff_employment set bank_account_number='12345678', ni_number='AB123456C' where staff_id=$1`, [F.staff_id]);
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    await db.query(RPC, [F.staff_id, 60000, null, 42, 'permanent', 6, 3, null, 'Annex', false]);
    await db.query('reset role');
    const bankni = await db.query(`select bank_account_number, ni_number, hours_per_week from public.mosque_staff_employment where staff_id=$1`, [F.staff_id]);
    console.log('  bank/ni after RPC:', JSON.stringify(bankni.rows[0]));
    (bankni.rows[0].bank_account_number === '12345678' && bankni.rows[0].ni_number === 'AB123456C' && Number(bankni.rows[0].hours_per_week) === 42)
      ? ok('bank_account_number + ni_number untouched by the RPC (hours updated)')
      : bad(`bank/ni touched: ${JSON.stringify(bankni.rows[0])}`);
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

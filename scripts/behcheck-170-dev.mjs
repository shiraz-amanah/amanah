// Migration 170 dev behaviour probes: update_employee_permissions must write an
// audit row for a PERMISSIONS-ONLY change (previously it wrote none), without
// changing any existing behaviour. DEV ONLY. All seed rows are ROLLED BACK.
//
// P1 live function body shape.
// P2 permissions-only change      → exactly ONE audit row, with permissions from/to.
// P3 no-op save                   → ZERO audit rows.
// P4 role_preset-only change      → still audits (regression).
// P5 assigned_classes-only change → still audits (regression).
// P6 'custom' guard (option i, bc089c9) — p_permissions NULL must PRESERVE the
//    existing permissions blob, not blank it. The audit row still fires for the
//    preset move, with permissions from == to.
// P7 update-only, never insert — an unknown employee id raises, inserts nothing.
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
// jsonb does not preserve key order, so compare key-sorted. A plain
// JSON.stringify comparison fails on values that are in fact identical.
const eqPerm = (a, b) => {
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
  return norm(a) === norm(b);
};

const START = {
  classes: 'all', students: 'all', attendance: 'all', hifz: 'all', homework: 'all',
  pastoral: 'all', reports: 'all', finance: false, waiting_list: true,
  messages: 'all', mosque_settings: false, employee_management: false, analytics: true,
};
// Differs from START in exactly two keys — an unambiguous permissions-only edit.
const TIGHTENED = { ...START, finance: false, analytics: false, waiting_list: false };

let owner, mosque, employee;

// Call the RPC as the owner and return the audit rows it produced.
async function callRpc({ permissions = null, assignedClasses = null, rolePreset = null }) {
  await db.query(`delete from mosque_staff_audit_log where mosque_id = $1`, [mosque]);
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
  await db.query(`set local role authenticated`);
  await db.query(
    `select update_employee_permissions($1, $2::jsonb, $3::uuid[], $4)`,
    [employee, permissions ? JSON.stringify(permissions) : null, assignedClasses, rolePreset]);
  await db.query(`reset role`);
  const rows = (await db.query(
    `select action, staff_id, details from mosque_staff_audit_log
      where mosque_id = $1 order by created_at`, [mosque])).rows;
  const emp = (await db.query(
    `select permissions, role_preset, assigned_classes from mosque_employees where id = $1`,
    [employee])).rows[0];
  return { rows, emp };
}

const resetEmployee = () => db.query(
  `update mosque_employees set permissions = $2::jsonb, role_preset = 'coordinator', assigned_classes = '{}'
    where id = $1`, [employee, JSON.stringify(START)]);

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== P1: live function body shape ===');
  const def = (await db.query(
    `select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='update_employee_permissions'`)).rows[0].def;
  /v_old_permissions/.test(def) ? ok('v_old_permissions captured') : bad('v_old_permissions ABSENT');
  /v_new_permissions is distinct from v_old_permissions/.test(def)
    ? ok('permissions included in the is-distinct-from gate') : bad('permissions NOT in the gate');
  /'permissions', jsonb_build_object/.test(def)
    ? ok("details carries a 'permissions' from/to object") : bad('permissions from/to ABSENT from details');
  !/insert into public\.mosque_employees/.test(def)
    ? ok('update-only — no INSERT into mosque_employees') : bad('an INSERT into mosque_employees appeared');

  await db.query('begin');

  owner = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'p170-owner@probe.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(`insert into profiles (id, name) values ($1, 'P170 Owner')
                    on conflict (id) do update set name = excluded.name`, [owner]);
  const staffUser = (await db.query(
    `insert into auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
     values (gen_random_uuid(), 'p170-staff@probe.test', 'x', now(), 'authenticated', 'authenticated')
     returning id`)).rows[0].id;
  await db.query(`insert into profiles (id, name) values ($1, 'P170 Staff')
                    on conflict (id) do update set name = excluded.name`, [staffUser]);
  mosque = (await db.query(
    `insert into mosques (user_id, slug, name, address, city, postcode, status)
     values ($1, 'p170-probe', 'P170 Masjid', '1 Test St', 'Bradford', 'BD1 1AA', 'active')
     returning id`, [owner])).rows[0].id;
  employee = (await db.query(
    `insert into mosque_employees (mosque_id, profile_id, status, invited_email, invited_name,
                                   permissions, role_preset, assigned_classes)
     values ($1, $2, 'active', 'p170-staff@probe.test', 'P170 Staff', $3::jsonb, 'coordinator', '{}')
     returning id`, [mosque, staffUser, JSON.stringify(START)])).rows[0].id;
  console.log(`   owner=${owner} mosque=${mosque} employee=${employee}`);

  console.log('\n=== P2: permissions-only change → ONE audit row (the 170 fix) ===');
  const p2 = await callRpc({ permissions: TIGHTENED });
  console.log('   audit rows:', p2.rows.length);
  console.log('   details   :', JSON.stringify(p2.rows[0]?.details));
  (p2.rows.length === 1) ? ok('exactly one audit row') : bad(`${p2.rows.length} audit rows, expected 1`);
  (p2.rows[0]?.action === 'employee_permissions_changed')
    ? ok("action = 'employee_permissions_changed'") : bad(`action = ${p2.rows[0]?.action}`);
  (p2.rows[0]?.staff_id === null) ? ok('staff_id NULL (157 shape preserved)') : bad(`staff_id = ${p2.rows[0]?.staff_id}`);
  (p2.rows[0]?.details?.employee_id === employee) ? ok('employee_id in details') : bad('employee_id missing from details');
  const d2 = p2.rows[0]?.details?.permissions;
  (d2 && eqPerm(d2.from, START) && eqPerm(d2.to, TIGHTENED))
    ? ok('permissions from/to recorded correctly')
    : bad(`permissions from/to wrong: ${JSON.stringify(d2)}`);
  eqPerm(p2.emp.permissions, TIGHTENED)
    ? ok('the row actually took the new permissions') : bad('permissions not applied to the row');

  console.log('\n=== P3: no-op save → ZERO audit rows ===');
  await resetEmployee();
  const p3 = await callRpc({ permissions: START, rolePreset: 'coordinator', assignedClasses: [] });
  console.log('   audit rows:', p3.rows.length);
  (p3.rows.length === 0) ? ok('no audit row for an identical save') : bad(`${p3.rows.length} rows written for a no-op`);

  console.log('\n=== P4: role_preset-only change still audits (regression) ===');
  await resetEmployee();
  const p4 = await callRpc({ rolePreset: 'treasurer' });
  console.log('   audit rows:', p4.rows.length, '| role_preset now:', p4.emp.role_preset);
  (p4.rows.length === 1) ? ok('one audit row for a preset-only change') : bad(`${p4.rows.length} rows`);
  (p4.rows[0]?.details?.role_preset?.from === 'coordinator' && p4.rows[0]?.details?.role_preset?.to === 'treasurer')
    ? ok('role_preset from/to correct') : bad(`role_preset detail: ${JSON.stringify(p4.rows[0]?.details?.role_preset)}`);

  console.log('\n=== P5: assigned_classes-only change still audits (regression) ===');
  await resetEmployee();
  const cls = (await db.query(
    `insert into madrasa_classes (mosque_id, name, status) values ($1, 'P170 Class', 'active') returning id`,
    [mosque])).rows[0].id;
  const p5 = await callRpc({ assignedClasses: [cls] });
  console.log('   audit rows:', p5.rows.length);
  (p5.rows.length === 1) ? ok('one audit row for an assigned_classes-only change') : bad(`${p5.rows.length} rows`);

  console.log("\n=== P6: 'custom' guard — p_permissions NULL must PRESERVE permissions ===");
  await resetEmployee();
  const p6 = await callRpc({ permissions: null, rolePreset: 'custom' });
  console.log('   permissions after:', JSON.stringify(p6.emp.permissions));
  console.log('   role_preset after:', p6.emp.role_preset);
  eqPerm(p6.emp.permissions, START)
    ? ok('existing permissions PRESERVED on a custom reassignment (guard intact)')
    : bad(`permissions were altered: ${JSON.stringify(p6.emp.permissions)}`);
  (p6.emp.role_preset === 'custom') ? ok("role_preset moved to 'custom'") : bad(`role_preset = ${p6.emp.role_preset}`);
  (p6.rows.length === 1) ? ok('the preset move is audited') : bad(`${p6.rows.length} audit rows`);
  const d6 = p6.rows[0]?.details?.permissions;
  (d6 && JSON.stringify(d6.from) === JSON.stringify(d6.to))
    ? ok('permissions from == to (label-only change, correctly recorded)')
    : bad(`permissions from/to should be equal: ${JSON.stringify(d6)}`);

  console.log('\n=== P7: unknown employee id raises, inserts nothing ===');
  const before = (await db.query(`select count(*)::int n from mosque_employees`)).rows[0].n;
  let raised = null;
  // The raise aborts the surrounding transaction, so isolate it in a savepoint —
  // otherwise every later statement fails with "current transaction is aborted".
  await db.query(`savepoint sp7`);
  try {
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [claims(owner)]);
    await db.query(`set local role authenticated`);
    await db.query(`select update_employee_permissions(gen_random_uuid(), null, null, 'viewer')`);
  } catch (e) { raised = e.message; }
  await db.query(`rollback to savepoint sp7`);
  await db.query(`reset role`).catch(() => {});
  const after = (await db.query(`select count(*)::int n from mosque_employees`)).rows[0].n;
  /employee_not_found/.test(raised || '') ? ok('raises employee_not_found') : bad(`raised: ${raised}`);
  (before === after) ? ok('no row inserted (update-only invariant)') : bad(`row count moved ${before} -> ${after}`);

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

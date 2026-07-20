// Migration 165 dev apply + probes: mosque_roles default_role_preset +
// default_assigned_classes + CHECK. DEV ONLY (ref guard). BEGIN...ROLLBACK.
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

async function expectRaise(sql, params, needle, label) {
  await db.query('savepoint sp');
  try {
    await db.query(sql, params);
    bad(`${label}: expected raise "${needle}" but SUCCEEDED`);
    await db.query('rollback to savepoint sp');
  } catch (e) {
    await db.query('rollback to savepoint sp');
    e.message.includes(needle) ? ok(`${label}: ${e.message}`) : bad(`${label}: wrong error → ${e.message}`);
  }
}

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 165 ===');
  await db.query(readFileSync('migrations/165_mosque_roles_permission_defaults.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: columns + CHECK ===');
  const cols = await db.query(
    `select column_name, data_type, is_nullable from information_schema.columns
      where table_schema='public' and table_name='mosque_roles'
        and column_name in ('default_role_preset','default_assigned_classes')
      order by column_name`);
  console.log(JSON.stringify(cols.rows));
  const byName = Object.fromEntries(cols.rows.map((r) => [r.column_name, r]));
  (byName.default_role_preset?.data_type === 'text' && byName.default_role_preset?.is_nullable === 'YES'
    && byName.default_assigned_classes?.data_type === 'ARRAY' && byName.default_assigned_classes?.is_nullable === 'YES')
    ? ok('both columns present, nullable, correct types (text / ARRAY)') : bad(`cols: ${JSON.stringify(cols.rows)}`);

  const chk = await db.query(
    `select conname, pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='public.mosque_roles'::regclass and contype='c' and conname='mosque_roles_default_preset_check'`);
  console.log(JSON.stringify(chk.rows));
  (chk.rows.length === 1 && /default_role_preset/.test(chk.rows[0].def))
    ? ok('CHECK constraint on default_role_preset present') : bad(`check: ${JSON.stringify(chk.rows)}`);

  console.log('\n=== P2: behavioural (BEGIN...ROLLBACK) ===');
  const mosque = (await db.query('select id from public.mosques order by id limit 1')).rows[0].id;
  const ins = `insert into public.mosque_roles (mosque_id, name, slug, is_default, default_role_preset) values ($1,$2,$3,false,$4) returning id`;

  await db.query('begin');
  try {
    // invalid preset → CHECK violation
    await expectRaise(ins, [mosque, 'ZZ_Bad', 'zz-bad-165', 'bogus'], 'mosque_roles_default_preset_check', 'invalid preset');

    // valid preset → OK
    const r1 = await db.query(ins, [mosque, 'ZZ_Teacher', 'zz-teacher-165', 'teacher']);
    r1.rows.length === 1 ? ok("valid preset 'teacher' → inserted") : bad('valid preset failed');

    // null preset → OK
    const r2 = await db.query(ins, [mosque, 'ZZ_NullPreset', 'zz-null-165', null]);
    r2.rows.length === 1 ? ok('null preset → inserted') : bad('null preset failed');

    // default_assigned_classes uuid[] assignment → OK
    await db.query(
      `update public.mosque_roles set default_assigned_classes = array[gen_random_uuid()] where id=$1`, [r1.rows[0].id]);
    const arr = (await db.query('select default_assigned_classes from public.mosque_roles where id=$1', [r1.rows[0].id])).rows[0].default_assigned_classes;
    (Array.isArray(arr) && arr.length === 1) ? ok(`default_assigned_classes uuid[] set (len ${arr.length})`) : bad(`array wrong: ${JSON.stringify(arr)}`);
  } finally {
    await db.query('rollback');
    console.log('  (rolled back — nothing persisted)');
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

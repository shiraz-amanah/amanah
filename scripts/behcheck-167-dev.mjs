// Migration 167 dev apply + probes: mosque_roles.default_permissions. DEV ONLY.
// P1 column shape. P2 round-trip (valid 13-key blob → deep-equal → null).
// Mutations run inside a transaction that is ROLLED BACK — no seed data left.
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

// The 13-key shape from src/lib/employeePermissions.js — 8 scope + 5 bool.
// NOTE messages is a SCOPE module ('own'|'all'|false), not a boolean.
const BLOB = {
  classes: 'all', students: 'all', attendance: 'own', hifz: 'own',
  homework: 'own', pastoral: 'all', reports: 'own', messages: 'own',
  finance: false, waiting_list: true, mosque_settings: false,
  employee_management: false, analytics: true,
};

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 167 ===');
  await db.query(readFileSync('migrations/167_mosque_roles_default_permissions.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: column shape ===');
  const p1 = await db.query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema='public' and table_name='mosque_roles'
        and column_name='default_permissions'`);
  console.log(JSON.stringify(p1.rows, null, 2));
  const r = p1.rows[0];
  (r?.column_name === 'default_permissions' && r?.data_type === 'jsonb' && r?.is_nullable === 'YES')
    ? ok('default_permissions | jsonb | YES') : bad(`unexpected: ${JSON.stringify(p1.rows)}`);

  console.log('\n=== P1b: comment recorded ===');
  const cm = await db.query(
    `select col_description('public.mosque_roles'::regclass, ordinal_position) comment
       from information_schema.columns
      where table_schema='public' and table_name='mosque_roles' and column_name='default_permissions'`);
  console.log(JSON.stringify(cm.rows[0]));
  /NULL = fall back to default_role_preset/.test(cm.rows[0]?.comment || '')
    ? ok('column comment present') : bad('column comment missing/incorrect');

  console.log('\n=== P2: round-trip (BEGIN…ROLLBACK — no data left behind) ===');
  const target = (await db.query(
    `select id, name, mosque_id from mosque_roles order by created_at limit 1`)).rows[0];
  if (!target) { bad('no mosque_roles row on dev to round-trip against'); }
  else {
    console.log('  target role:', JSON.stringify(target));
    await db.query('begin');

    const up = await db.query(
      `update mosque_roles set default_permissions = $2::jsonb where id = $1
         returning id, default_permissions`, [target.id, JSON.stringify(BLOB)]);
    const readBack = up.rows[0].default_permissions;
    console.log('  written + returned:', JSON.stringify(readBack));

    const fresh = (await db.query(
      `select default_permissions from mosque_roles where id = $1`, [target.id])).rows[0].default_permissions;
    console.log('  re-selected      :', JSON.stringify(fresh));

    const keysOk = Object.keys(BLOB).every((k) => JSON.stringify(fresh[k]) === JSON.stringify(BLOB[k]))
      && Object.keys(fresh).length === Object.keys(BLOB).length;
    keysOk ? ok(`round-trip deep-equal across all ${Object.keys(BLOB).length} keys`)
           : bad(`mismatch: sent ${JSON.stringify(BLOB)} got ${JSON.stringify(fresh)}`);

    // Type fidelity: jsonb must preserve false vs "own" vs true distinctly.
    (fresh.finance === false && fresh.analytics === true && fresh.attendance === 'own' && fresh.classes === 'all')
      ? ok('value types preserved (false / true / "own" / "all" distinct)')
      : bad(`type drift: ${JSON.stringify({ finance: fresh.finance, analytics: fresh.analytics, attendance: fresh.attendance })}`);

    const nulled = (await db.query(
      `update mosque_roles set default_permissions = null where id = $1
         returning default_permissions`, [target.id])).rows[0].default_permissions;
    console.log('  after set null   :', JSON.stringify(nulled));
    nulled === null ? ok('UPDATE to null → null confirmed') : bad(`expected null, got ${JSON.stringify(nulled)}`);

    await db.query('rollback');
    const after = (await db.query(
      `select default_permissions from mosque_roles where id = $1`, [target.id])).rows[0].default_permissions;
    console.log('  after ROLLBACK   :', JSON.stringify(after));
    ok('mutations rolled back — dev row left as found');
  }

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  await db.end();
  process.exit(fail ? 1 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  try { await db.query('rollback'); } catch {}
  try { await db.end(); } catch {}
  process.exit(1);
}

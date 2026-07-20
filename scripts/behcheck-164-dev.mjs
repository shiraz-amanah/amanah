// Migration 164 dev apply + probes: delete_mosque_role. DEV ONLY (ref guard).
// Metadata + behavioural inside BEGIN...ROLLBACK with role simulation + savepoints.
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
    bad(`${label}: expected raise "${needle}" but SUCCEEDED`);
    await db.query('rollback to savepoint sp');
  } catch (e) {
    await db.query('rollback to savepoint sp');
    e.message.includes(needle) ? ok(`${label}: ${e.message}`) : bad(`${label}: wrong error → ${e.message}`);
  }
}
const RPC = 'select public.delete_mosque_role($1) as r';
const roleExists = async (id) => (await db.query('select count(*)::int n from public.mosque_roles where id=$1', [id])).rows[0].n === 1;

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() db, current_user usr')).rows[0]);

  console.log('\n=== APPLY migration 164 ===');
  await db.query(readFileSync('migrations/164_delete_mosque_role.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== P1: delete_mosque_role metadata ===');
  const sig = 'public.delete_mosque_role(uuid)';
  const m = (await db.query(
    `select p.prosecdef, pg_get_userbyid(p.proowner) owner,
            has_function_privilege('anon','${sig}','EXECUTE') anon,
            has_function_privilege('authenticated','${sig}','EXECUTE') authd
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='delete_mosque_role'`)).rows[0];
  console.log(JSON.stringify(m));
  (m?.prosecdef === true && m?.owner === 'postgres' && m?.anon === false && m?.authd === true)
    ? ok('prosecdef=true, owner=postgres, anon denied, authenticated granted') : bad(`meta: ${JSON.stringify(m)}`);

  console.log('\n=== P2: behavioural (BEGIN...ROLLBACK, role-simulated) ===');
  // an active staff row → gives us m1 + owner1 + an active staff to mark in-use
  const a = await db.query(
    `select ms.id staff_id, ms.mosque_id, mo.user_id owner
       from public.mosque_staff ms join public.mosques mo on mo.id=ms.mosque_id
      where mo.user_id is not null and ms.archived=false and ms.status<>'offboarded'
      order by ms.id limit 1`);
  const owner2q = await db.query(
    `select user_id from public.mosques where user_id is not null and user_id <> $1 limit 1`, [a.rows[0]?.owner]);
  if (!a.rows.length || !owner2q.rows.length) { bad('need an active staff + two owners'); throw new Error('fixtures'); }
  const F = a.rows[0], owner2 = owner2q.rows[0].user_id;
  console.log('fixture:', JSON.stringify({ activeStaff: F.staff_id, mosque: F.mosque_id, owner1: F.owner, owner2 }));

  await db.query('begin');
  try {
    // fixtures (as postgres)
    const defRole = (await db.query(
      `select id from public.mosque_roles where mosque_id=$1 and is_default=true order by display_order limit 1`, [F.mosque_id])).rows[0].id;
    const mkRole = async (name, slug) => (await db.query(
      `insert into public.mosque_roles (mosque_id, name, slug, is_default) values ($1,$2,$3,false) returning id`,
      [F.mosque_id, name, slug])).rows[0].id;
    const inUseRole = await mkRole('ZZ_InUse', 'zz-inuse');
    const offRole   = await mkRole('ZZ_Offboarded', 'zz-offboarded');
    const unusedRole = await mkRole('ZZ_Unused', 'zz-unused');
    // active staff uses ZZ_InUse
    await db.query('update public.mosque_staff set role=$1 where id=$2', ['ZZ_InUse', F.staff_id]);
    // an OFFBOARDED + archived staff uses ZZ_Offboarded (no active staff has it).
    // Unique email — (mosque_id, email) is uniquely constrained (null emails collide).
    await db.query(`insert into public.mosque_staff (mosque_id, role, status, archived, email) values ($1,'ZZ_Offboarded','offboarded',true,'behcheck164-offboarded@example.com')`, [F.mosque_id]);

    // (a) anon → blocked
    await db.query('set role anon');
    await expectRaise(RPC, [unusedRole], 'permission denied', 'anon call');
    await db.query('reset role');

    // (b) non-owner → not_authorised
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(owner2)]);
    await expectRaise(RPC, [unusedRole], 'not_authorised', 'non-owner call');

    // owner from here
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);

    // (c) default role → kept
    const rDef = (await db.query(RPC, [defRole])).rows[0].r;
    console.log('  default →', JSON.stringify(rDef));
    (rDef.deleted === false && rDef.reason === 'default' && (await db.query('reset role'), await roleExists(defRole)))
      ? ok('default role: { deleted:false, reason:"default" }, role kept') : bad(`default wrong: ${JSON.stringify(rDef)}`);

    // (d) in-use by ACTIVE staff → kept, used_by ≥ 1
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const rUse = (await db.query(RPC, [inUseRole])).rows[0].r;
    console.log('  in-use →', JSON.stringify(rUse));
    (rUse.deleted === false && rUse.reason === 'in_use' && rUse.used_by >= 1 && (await db.query('reset role'), await roleExists(inUseRole)))
      ? ok(`in-use (active): { deleted:false, reason:"in_use", used_by:${rUse.used_by} }, role kept`) : bad(`in-use wrong: ${JSON.stringify(rUse)}`);

    // (e) used only by OFFBOARDED/ARCHIVED → deletable (exclusion working)
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const rOff = (await db.query(RPC, [offRole])).rows[0].r;
    console.log('  offboarded-only →', JSON.stringify(rOff));
    (rOff.deleted === true && (await db.query('reset role'), !(await roleExists(offRole))))
      ? ok('used only by offboarded/archived: { deleted:true } (exclusion working), role gone') : bad(`offboarded-only wrong: ${JSON.stringify(rOff)}`);

    // (f) unused non-default → deletable
    await db.query('set role authenticated');
    await db.query(`select set_config('request.jwt.claims',$1,true)`, [claims(F.owner)]);
    const rUnused = (await db.query(RPC, [unusedRole])).rows[0].r;
    console.log('  unused →', JSON.stringify(rUnused));
    (rUnused.deleted === true && (await db.query('reset role'), !(await roleExists(unusedRole))))
      ? ok('unused non-default: { deleted:true }, role gone') : bad(`unused wrong: ${JSON.stringify(rUnused)}`);
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

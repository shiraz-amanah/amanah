// Migration 157 dev apply + probes: mosque_staff privileged-column guard (P1) +
// update_employee_permissions audit (P2). DEV ONLY (hard ref guards).
//   - pg client (DEV_DATABASE_URL, superuser) applies DDL + reads pg_proc metadata.
//   - supabase-js anon+owner JWT exercises the AUTHENTICATED (PostgREST) path.
//   - supabase-js service client exercises the SERVICE_ROLE path.
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: DEV_DATABASE_URL not dev (${DEV}).`); process.exit(1); }
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: SUPABASE_URL not dev (${DEV}).`); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'beh157-Aa1!';
const E = { owner: 'beh157-owner@amanah-verify.test', staff: 'beh157-staff@amanah-verify.test', link: 'beh157-link@amanah-verify.test' };
const emails = new Set(Object.values(E));
let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const expectErr = (label, { error }) => error ? ok(`${label} -> REJECTED: ${error.code || ''} ${error.message}`) : bad(`${label} -> NOT rejected (should have been)`);
const expectOk  = (label, { error }) => error ? bad(`${label} -> ERROR: ${error.message}`) : ok(`${label} -> ok`);

async function teardown() {
  await svc.from('mosque_staff').delete().like('email', 'beh157-%@amanah-verify.test');
  await svc.from('mosque_employees').delete().like('invited_email', 'beh157-%@amanah-verify.test');
  await svc.from('mosques').delete().like('name', 'beh157 %');
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  for (const u of data.users.filter(u => emails.has(u.email))) { await svc.from('profiles').delete().eq('id', u.id); await svc.auth.admin.deleteUser(u.id); }
}
async function mkUser(email) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name: email.split('@')[0], email, role: 'user' }, { onConflict: 'id' });
  return data.user.id;
}
async function signIn(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

const db = new pg.Client({ connectionString: DBURL });

try {
  await db.connect();
  console.log('DB:', (await db.query('select current_database() as db, current_user as usr')).rows[0]);

  console.log('\n=== APPLY migration 157 ===');
  await db.query(readFileSync('migrations/157_mosque_staff_privileged_guard.sql', 'utf8'));
  console.log('applied OK');

  console.log('\n=== PROBE A: guard trigger present + enabled ===');
  console.log(JSON.stringify((await db.query(
    `select tgname, tgenabled from pg_trigger
      where tgrelid='public.mosque_staff'::regclass and not tgisinternal
        and tgname='mosque_staff_guard_privileged_cols'`)).rows, null, 2));

  console.log('\n=== PROBE B (the current_user answer): prosecdef + owner of named writers ===');
  console.log('(SECURITY DEFINER owned by postgres => current_user INSIDE = postgres => exempt)');
  console.log(JSON.stringify((await db.query(
    `select p.proname, p.prosecdef as security_definer, r.rolname as owner
       from pg_proc p join pg_roles r on r.oid = p.proowner
      where p.pronamespace='public'::regnamespace
        and p.proname in ('submit_staff_wizard','mosque_link_scholar_to_staff',
                          'approve_onboarding_session','suspend_staff','offboard_staff',
                          'update_employee_permissions')
      order by p.proname`)).rows, null, 2));

  // ---- fixtures ----
  await teardown();
  const ownerId        = await mkUser(E.owner);
  const staffProfileId = await mkUser(E.staff);
  const { data: m, error: em } = await svc.from('mosques')
    .insert({ name: 'beh157 Mosque', slug: `beh157-${ownerId.slice(0,8)}`, user_id: ownerId, status: 'active', address: '1 St', city: 'Bradford', postcode: 'BD1 1AA' }).select('id').single();
  if (em) throw new Error(`mosque insert: ${em.message}`);
  const { data: m2, error: em2 } = await svc.from('mosques')
    .insert({ name: 'beh157 Mosque Two', slug: `beh157b-${ownerId.slice(0,8)}`, user_id: ownerId, status: 'active', address: '2 St', city: 'Bradford', postcode: 'BD1 2AA' }).select('id').single();
  if (em2) console.log(`  (note: second owned mosque not creatable — ${em2.message}; mosque_id probe uses a foreign uuid instead)`);
  const { data: s, error: es } = await svc.from('mosque_staff')
    .insert({ mosque_id: m.id, name: 'Beh Staff', email: E.staff, role: 'Imam', status: 'active', invite_status: 'active', profile_id: staffProfileId }).select('id').single();
  if (es) throw new Error(`staff insert: ${es.message}`);

  const owner = await signIn(E.owner);

  console.log('\n=== 157 P1.1: authed owner UPDATE status directly -> REJECT ===');
  expectErr('update status=suspended', await owner.from('mosque_staff').update({ status: 'suspended' }).eq('id', s.id));

  console.log('\n=== 157 P1.2: authed owner UPDATE profile_id / invite_status / mosque_id -> REJECT ===');
  expectErr('update profile_id=ownerId',       await owner.from('mosque_staff').update({ profile_id: ownerId }).eq('id', s.id));
  expectErr('update invite_status=invited',    await owner.from('mosque_staff').update({ invite_status: 'invited' }).eq('id', s.id));
  if (m2?.id) {
    // Trigger-specific: RLS with_check ALLOWS moving to another owned mosque, so a
    // rejection here can only be the guard trigger.
    expectErr('update mosque_id -> other OWNED mosque', await owner.from('mosque_staff').update({ mosque_id: m2.id }).eq('id', s.id));
  } else {
    // One-mosque-per-owner: no owned target exists. A foreign uuid is blocked
    // jointly by RLS with_check + the trigger; the mosque_id trigger branch is
    // byte-identical to the (proven) status/profile_id/invite_status branches.
    expectErr('update mosque_id -> foreign uuid (RLS+trigger)', await owner.from('mosque_staff').update({ mosque_id: '00000000-0000-0000-0000-000000000000' }).eq('id', s.id));
  }

  console.log('\n=== 157 P1.3: authed owner UPDATE non-privileged cols -> OK ===');
  expectOk('update name',        await owner.from('mosque_staff').update({ name: 'Beh Staff Renamed' }).eq('id', s.id));
  expectOk('update avatar_path', await owner.from('mosque_staff').update({ avatar_path: `${m.id}/${s.id}/avatar.jpg` }).eq('id', s.id));

  console.log('\n=== 157 P1.4: named SECURITY DEFINER RPCs write guarded cols -> OK ===');
  expectOk('suspend_staff(suspended)', await owner.rpc('suspend_staff', { p_staff_id: s.id, p_status: 'suspended' }));
  { const { data } = await svc.from('mosque_staff').select('status').eq('id', s.id).single();
    data?.status === 'suspended' ? ok('  ↳ status flipped to suspended') : bad(`  ↳ status=${data?.status}`); }
  expectOk('suspend_staff(active)', await owner.rpc('suspend_staff', { p_staff_id: s.id, p_status: 'active' }));
  expectOk('offboard_staff (status+profile_id+invite_status)', await owner.rpc('offboard_staff', { p_staff_id: s.id, p_reason: 'probe', p_end_date: '2026-07-31' }));
  { const { data } = await svc.from('mosque_staff').select('status, profile_id, invite_status').eq('id', s.id).single();
    (data?.status === 'offboarded' && data?.profile_id === null && data?.invite_status === 'not_invited')
      ? ok(`  ↳ offboard applied: ${JSON.stringify(data)}`) : bad(`  ↳ offboard state=${JSON.stringify(data)}`); }

  console.log('\n=== 157 P1.5: service_role sets profile_id + invite_status (mirrors create-account.js) -> OK ===');
  const { data: s2 } = await svc.from('mosque_staff')
    .insert({ mosque_id: m.id, name: 'Beh Link', email: E.link, role: 'Imam', status: 'pending_rtw', invite_status: 'not_invited' }).select('id').single();
  expectOk('service_role update profile_id+invite_status', await svc.from('mosque_staff').update({ profile_id: staffProfileId, invite_status: 'active' }).eq('id', s2.id));

  console.log('\n=== 157 P2.1: update_employee_permissions role_preset change -> exactly one audit row ===');
  const { data: emp, error: ee } = await svc.from('mosque_employees')
    .insert({ mosque_id: m.id, invited_email: E.staff, invited_name: 'Beh Emp', role_preset: 'viewer' }).select('id').single();
  if (ee) throw new Error(`employee insert: ${ee.message}`);
  const countAudit = async () => (await svc.from('mosque_staff_audit_log').select('id, details', { count: 'exact' })
    .eq('mosque_id', m.id).eq('action', 'employee_permissions_changed'));
  const before = (await countAudit()).count || 0;
  expectOk('update_employee_permissions role_preset viewer->teacher',
    await owner.rpc('update_employee_permissions', { p_employee_id: emp.id, p_permissions: null, p_assigned_classes: null, p_role_preset: 'teacher' }));
  const after1 = await countAudit();
  (after1.count === before + 1) ? ok(`  ↳ exactly one new audit row (${before}->${after1.count})`) : bad(`  ↳ count ${before}->${after1.count}`);
  console.log('  audit row details:', JSON.stringify(after1.data?.[after1.data.length - 1]?.details));

  console.log('\n=== 157 P2.2: same call, no change -> no new audit row ===');
  expectOk('update_employee_permissions role_preset teacher->teacher (no-op)',
    await owner.rpc('update_employee_permissions', { p_employee_id: emp.id, p_permissions: null, p_assigned_classes: null, p_role_preset: 'teacher' }));
  const after2 = await countAudit();
  (after2.count === after1.count) ? ok(`  ↳ no new audit row (still ${after2.count})`) : bad(`  ↳ count changed ${after1.count}->${after2.count}`);

  console.log('\n=== teardown ===');
  await teardown();
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 3 : 0);
} catch (e) {
  console.error('FATAL:', e.message);
  try { await teardown(); } catch {}
  process.exit(2);
} finally {
  await db.end();
}

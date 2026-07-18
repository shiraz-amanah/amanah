// scripts/smoke-onboarding-provision.mjs
// End-to-end verification for the onboarding auto-provision fix. DEV ONLY.
//
// Drives the REAL api/create-account.js handler (imported + invoked with mock
// req/res) against the dev DB, after a real owner JWT runs approve_onboarding_session.
// Proves the whole approval → account → staff-link chain the app now performs:
//   1. approve_onboarding_session promotes the stub → mosque_staff (active) + employment.
//   2. create-account, gated on the mosque OWNER (not admin), provisions the auth
//      user AND links the promoted row (profile_id + invite_status='active').
//   3. The new employee then resolves as staff via the EXACT getMyStaffMembership
//      query, through their OWN JWT (so RLS "Staff read own row" is exercised).
//   4. A recovery (set-password) link is generated targeting /reset-password.
//   5. Re-running is idempotent and reports existed=true (email_exists path).
//   6. Negatives: no JWT → 401, bad session → 404, non-owner JWT → 403, and
//      an unapproved session → 409 not_approved.
// Idempotent: tears down its own seed at start and end. Never prints secrets.

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;             // .env non-VITE = pbej (dev)
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;       // .env SUPABASE_ANON_KEY = pbej anon
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
if (!SVC || !ANON) { console.error('Missing SVC or ANON key in .env'); process.exit(1); }

// The handler reads env at import time and builds its own service-role client.
// Point PUBLIC_APP_URL at prod so the recovery link's redirect is realistic, but
// give a dummy CRON_SECRET so the welcome-email POST to prod send-transactional
// 401s (caught, non-fatal) — no real email is sent from this test.
process.env.SUPABASE_URL = URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SVC;
process.env.PUBLIC_APP_URL = 'https://youramanah.co.uk';
process.env.CRON_SECRET = 'smoke-dummy-not-a-real-secret';

const { default: handler } = await import('../api/create-account.js');

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const PW = 'onbprov-verify-Aa1!';
const EMAILS = {
  owner:     'onbprov-owner@amanah-verify.test',
  bystander: 'onbprov-bystander@amanah-verify.test', // owns a DIFFERENT mosque
  employee:  'onbprov-employee@amanah-verify.test',  // the onboarding staffer (no account yet)
};
const emailSet = new Set(Object.values(EMAILS));

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const assert = (cond, m) => (cond ? ok(m) : bad(m));

function mockRes() {
  const r = { statusCode: null, body: null, headers: {} };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  return r;
}
async function callCreateAccount(jwt, sessionId) {
  const req = { method: 'POST', headers: jwt ? { authorization: `Bearer ${jwt}` } : {}, body: { session_id: sessionId } };
  const res = mockRes();
  await handler(req, res);
  return res;
}

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'onbprov-%@amanah-verify.test');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) {
      const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
      const sIds = (staff || []).map(s => s.id);
      if (sIds.length) {
        await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
        await svc.from('mosque_staff_onboarding_sessions').delete().in('staff_id', sIds);
        await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      }
      await svc.from('mosque_staff').delete().in('mosque_id', mIds);
      await svc.from('mosques').delete().in('id', mIds);
    }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  const { error: pe } = await svc.from('profiles').upsert({ id, name }, { onConflict: 'id' });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  return id;
}
async function jwtFor(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return { jwt: data.session.access_token, client: c };
}
async function mkMosque(ownerId, tag) {
  const { data, error } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `onbprov-masjid-${tag}-${ownerId.slice(0, 8)}`, name: 'Onbprov Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select('id').single();
  if (error) throw new Error(`mosque: ${error.message}`);
  return data.id;
}
// Seed a stub mosque_staff + a SUBMITTED onboarding session (mirrors
// createStaffWizardInvite + submit_onboarding_session), ready for approval.
async function seedSubmittedSession(mosqueId) {
  const { data: staff, error: se } = await svc.from('mosque_staff').insert({
    mosque_id: mosqueId, name: 'Onbprov Employee', email: EMAILS.employee, role: 'Imam',
    staff_type: 'permanent', invite_status: 'not_invited', onboarding_method: 'remote_invite',
  }).select('id').single();
  if (se) throw new Error(`staff stub: ${se.message}`);
  const { data: sess, error: oe } = await svc.from('mosque_staff_onboarding_sessions').insert({
    mosque_id: mosqueId, staff_id: staff.id, employee_name: 'Onbprov Employee',
    employee_email: EMAILS.employee, path: 'remote', status: 'submitted',
    personal_details: { name: 'Onbprov Employee', phone: '07000000000' },
    employment_details: { role: 'Imam', contract_type: 'permanent', start_date: '2026-08-01', hours_per_week: '20' },
    rtw_details: {}, dbs_details: {}, tax_details: {}, bank_details: {},
  }).select('id, token').single();
  if (oe) throw new Error(`session: ${oe.message}`);
  return { staffId: staff.id, sessionId: sess.id };
}

async function main() {
  console.log('\n== smoke: onboarding auto-provision (dev) ==\n');
  await teardown();

  const ownerId     = await mkUser(EMAILS.owner, 'Onbprov Owner');
  const bystanderId = await mkUser(EMAILS.bystander, 'Onbprov Bystander');
  const mosqueId    = await mkMosque(ownerId, 'a');
  await mkMosque(bystanderId, 'b'); // bystander owns a different mosque
  const { jwt: ownerJwt }     = await jwtFor(EMAILS.owner);
  const { jwt: bystanderJwt } = await jwtFor(EMAILS.bystander);

  // ---- Negative: unapproved session is rejected BEFORE any approval ----
  {
    const { sessionId } = await seedSubmittedSession(mosqueId);
    const res = await callCreateAccount(ownerJwt, sessionId);
    assert(res.statusCode === 409 && res.body?.error === 'not_approved',
      `unapproved session → 409 not_approved (got ${res.statusCode} ${res.body?.error})`);
    // clean this probe session so the main run starts fresh
    await svc.from('mosque_staff_onboarding_sessions').delete().eq('id', sessionId);
    await svc.from('mosque_staff').delete().eq('email', EMAILS.employee);
  }

  // ---- Main happy path: approve (owner JWT) → create-account ----
  const { staffId, sessionId } = await seedSubmittedSession(mosqueId);

  const ownerClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await ownerClient.auth.signInWithPassword({ email: EMAILS.owner, password: PW });
  const { data: approved, error: apErr } = await ownerClient.rpc('approve_onboarding_session', { p_session_id: sessionId });
  assert(!apErr && approved === true, `approve_onboarding_session → true (${apErr?.message || approved})`);

  const { data: preStaff } = await svc.from('mosque_staff').select('status, profile_id, invite_status').eq('id', staffId).single();
  assert(preStaff?.status === 'active', `post-approve mosque_staff.status = active (${preStaff?.status})`);
  assert(preStaff?.profile_id == null, `post-approve profile_id still null — the gap create-account fills (${preStaff?.profile_id})`);

  // Negative gates BEFORE the real provision
  const noAuth = await callCreateAccount(null, sessionId);
  assert(noAuth.statusCode === 401, `no JWT → 401 (got ${noAuth.statusCode})`);
  const badSess = await callCreateAccount(ownerJwt, '00000000-0000-0000-0000-000000000000');
  assert(badSess.statusCode === 404 && badSess.body?.error === 'session_not_found',
    `bad session → 404 session_not_found (got ${badSess.statusCode} ${badSess.body?.error})`);
  const nonOwner = await callCreateAccount(bystanderJwt, sessionId);
  assert(nonOwner.statusCode === 403 && nonOwner.body?.error === 'forbidden',
    `non-owner JWT → 403 forbidden (got ${nonOwner.statusCode} ${nonOwner.body?.error})`);

  // The real provision
  const res = await callCreateAccount(ownerJwt, sessionId);
  assert(res.statusCode === 200 && res.body?.success === true,
    `provision → 200 success (got ${res.statusCode} ${JSON.stringify(res.body)})`);
  assert(res.body?.existed === false, `first provision existed=false (${res.body?.existed})`);
  const newUserId = res.body?.user_id;
  assert(!!newUserId, `returned a user_id (${newUserId})`);

  // Staff row is now linked
  const { data: linked } = await svc.from('mosque_staff').select('profile_id, invite_status, status').eq('id', staffId).single();
  assert(linked?.profile_id === newUserId, `mosque_staff.profile_id = new user id (${linked?.profile_id === newUserId})`);
  assert(linked?.invite_status === 'active', `mosque_staff.invite_status = active (${linked?.invite_status})`);

  // The auth user + its profile (handle_new_user trigger) exist
  const { data: prof } = await svc.from('profiles').select('id').eq('id', newUserId).maybeSingle();
  assert(prof?.id === newUserId, `profiles row exists for the new account (trigger fired)`);

  // The employee resolves as staff via the EXACT getMyStaffMembership query,
  // through their OWN JWT (RLS "Staff read own row" exercised). Give them a
  // password first (createUser made no password).
  await svc.auth.admin.updateUserById(newUserId, { password: PW });
  const empClient = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: empSignErr } = await empClient.auth.signInWithPassword({ email: EMAILS.employee, password: PW });
  assert(!empSignErr, `employee can sign in with a set password (${empSignErr?.message || 'ok'})`);
  const { data: membership } = await empClient
    .from('mosque_staff')
    .select('*, mosque:mosques(id, name, city, slug, status, prayer_times)')
    .eq('profile_id', newUserId)
    .eq('invite_status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  assert(membership?.id === staffId, `getMyStaffMembership resolves the employee's active staff row`);
  assert(membership?.mosque?.id === mosqueId, `...with the mosque joined (portal target present)`);

  // Recovery (set-password) link generation. The handler passes redirectTo
  // `${APP_URL}/reset-password`; whether the DIRECT redirect lands there or falls
  // back to the project Site URL depends on the Supabase project's Redirect-URLs
  // allowlist (dev here strips any custom URL → Site URL localhost:3000). Either
  // way the app's PASSWORD_RECOVERY event routes to the resetPassword view, so we
  // assert the MECHANISM (a recovery link with a redirect_to) rather than the
  // dev-specific host. On prod, allowlist `youramanah.co.uk/reset-password` for
  // the clean direct landing.
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: 'recovery', email: EMAILS.employee, options: { redirectTo: 'https://youramanah.co.uk/reset-password' },
  });
  const actionLink = linkData?.properties?.action_link || '';
  const redirectTo = actionLink ? new globalThis.URL(actionLink).searchParams.get('redirect_to') : null;
  assert(!linkErr && !!actionLink, `recovery link generated (${linkErr?.message || 'ok'})`);
  assert(/type=recovery/.test(actionLink) && !!redirectTo, `recovery link carries a redirect_to (${redirectTo})`);
  console.log(`  ℹ dev redirect_to fell back to Site URL: ${redirectTo} (prod honours /reset-password if allowlisted)`);

  // Idempotent re-run → existed=true (email_exists path resolves + re-links)
  const res2 = await callCreateAccount(ownerJwt, sessionId);
  assert(res2.statusCode === 200 && res2.body?.existed === true,
    `re-run → 200 existed=true (got ${res2.statusCode} ${JSON.stringify(res2.body)})`);
  assert(res2.body?.user_id === newUserId, `re-run resolves the SAME existing account`);

  await teardown();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error('\n💥', e.message); try { await teardown(); } catch {} process.exit(1); });

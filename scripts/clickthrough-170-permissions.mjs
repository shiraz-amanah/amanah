// scripts/clickthrough-170-permissions.mjs
// Migration 170 UI exercise. DEV DATA ONLY — runs against the Vercel PREVIEW
// deployment, whose bundle was verified to carry the DEV supabase ref.
//
// Drives the REAL Permissions panel (StaffProfile §4, section=account) and
// proves the 170 gap is closed through the actual UI path:
//   PermissionsSection.save() → updateEmployeePermissions → the RPC.
//
// The employee is seeded on a CUSTOM (non-preset-matching) blob on purpose.
// The panel sends rolePreset: detectPreset(perms), so on any preset-matching
// employee a toggle ALSO moves role_preset — and that would have audited even
// before 170. Starting from custom keeps detectPreset pinned at 'custom', so the
// only field that changes is `permissions`. That is the exact case that wrote
// ZERO audit rows before this migration.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');

const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL_ || !URL_.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }

const APP = process.env.P170_APP;
const SHARE = process.env.P170_SHARE || '';
if (!APP) { console.error('SAFETY: set P170_APP to the preview origin.'); process.exit(1); }
if (/zgoyvztooyxqkcftwylr/.test(APP)) { console.error('SAFETY: APP looks like prod.'); process.exit(1); }

const STORAGE_KEY = `sb-${DEV}-auth-token`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const PW = 'p170-Aa1!';
const EMAILS = { owner: 'p170ui-owner@amanah-verify.test', staff: 'p170ui-staff@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

// Deliberately matches NO preset (mixed scopes + odd bools) → detectPreset = 'custom'.
const CUSTOM = {
  classes: 'all', students: 'own', attendance: 'own', hifz: 'all', homework: false,
  pastoral: false, reports: 'own', finance: true, waiting_list: false,
  messages: 'own', mosque_settings: false, employee_management: false, analytics: true,
};

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const eqPerm = (a, b) => {
  const norm = (o) => JSON.stringify(Object.keys(o || {}).sort().map((k) => [k, o[k]]));
  return norm(a) === norm(b);
};

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ids = users.filter((u) => emailSet.has(u.email)).map((u) => u.id);
  const { data: mosques } = ids.length ? await svc.from('mosques').select('id').in('user_id', ids) : { data: [] };
  const mIds = (mosques || []).map((m) => m.id);
  if (mIds.length) {
    const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
    const sIds = (staff || []).map((s) => s.id);
    if (sIds.length) {
      await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
    }
    await svc.from('mosque_staff_audit_log').delete().in('mosque_id', mIds);
    await svc.from('mosque_employees').delete().in('mosque_id', mIds);
    await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('mosques').delete().in('id', mIds);
  }
  if (ids.length) {
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

const mkUser = async (email, name) => {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
};

let mosqueId, employeeId;
const readEmployee = async () => (await svc.from('mosque_employees')
  .select('permissions, role_preset').eq('id', employeeId).single()).data;
const readAudit = async () => (await svc.from('mosque_staff_audit_log')
  .select('action, staff_id, details, created_at').eq('mosque_id', mosqueId)
  .order('created_at', { ascending: true })).data || [];
const clearAudit = () => svc.from('mosque_staff_audit_log').delete().eq('mosque_id', mosqueId);

let browser;
(async () => {
  console.log(`clickthrough-170-permissions: preview=${APP}  dev=${DEV}`);
  await teardown();

  const ownerId = await mkUser(EMAILS.owner, 'P170UI Owner');
  const staffUserId = await mkUser(EMAILS.staff, 'P170UI Staff');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `p170ui-${ownerId.slice(0, 8)}`, name: 'P170UI Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  mosqueId = mosque.id;
  const { data: staff } = await svc.from('mosque_staff').insert({
    mosque_id: mosqueId, name: 'P170UI Staff', role: 'Teacher', status: 'active',
    invite_status: 'active', email: EMAILS.staff, profile_id: staffUserId,
    employment_type: 'employed_full_time',
  }).select().single();
  const { data: emp, error: empErr } = await svc.from('mosque_employees').insert({
    mosque_id: mosqueId, profile_id: staffUserId, status: 'active',
    invited_email: EMAILS.staff, invited_name: 'P170UI Staff',
    permissions: CUSTOM, role_preset: 'custom', assigned_classes: [],
  }).select().single();
  if (empErr) throw new Error(`seed mosque_employees: ${empErr.message}`);
  employeeId = emp.id;
  console.log(`   staff=${staff.id} employee=${employeeId} role_preset=custom`);

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;
  if (!sess) throw new Error('owner sign-in failed');

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1800 });
  p.on('console', (m) => { if (m.type() === 'error') console.log('   [browser error]', m.text().slice(0, 160)); });
  if (SHARE) { await p.goto(`${APP}/?_vercel_share=${SHARE}`, { waitUntil: 'domcontentloaded' }); await sleep(1000); }
  await p.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));

  // Toggle a BOOL module by label, then Save.
  async function toggleAndSave(moduleLabel) {
    const toggled = await p.evaluate((label) => {
      const row = [...document.querySelectorAll('div')].find((d) => {
        const t = d.querySelector(':scope > div > div');
        return t && t.textContent.trim() === label && d.querySelector('button');
      });
      if (!row) return false;
      const btn = [...row.querySelectorAll('button')].pop();
      if (!btn) return false;
      btn.click();
      return true;
    }, moduleLabel);
    if (!toggled) return false;
    await sleep(500);
    const saved = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save changes' || x.textContent.trim() === 'Save');
      if (!b || b.disabled) return false; b.click(); return true;
    });
    await sleep(3000);
    return saved;
  }

  console.log('\n=== PHASE 1: permissions-only edit through the real UI ===');
  await clearAudit();
  await p.goto(`${APP}/staff/profile?staffId=${staff.id}&section=account`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Permissions/.test(document.body.innerText), { timeout: 40000 });
  await sleep(2500);

  const before = await readEmployee();
  console.log('   BEFORE permissions:', JSON.stringify(before.permissions));
  console.log('   BEFORE role_preset:', before.role_preset);

  const drove = await toggleAndSave('Analytics');
  console.log('   [UI] toggle + save:', drove);
  if (!drove) { bad('could not drive the Permissions panel — assertions below would be vacuous'); }

  const after = await readEmployee();
  const audit = await readAudit();
  console.log('   AFTER  permissions:', JSON.stringify(after.permissions));
  console.log('   AFTER  role_preset:', after.role_preset);
  console.log('   audit rows:', audit.length);
  if (audit[0]) console.log('   details:', JSON.stringify(audit[0].details).slice(0, 400));

  (after.role_preset === 'custom')
    ? ok("role_preset stayed 'custom' — this IS a permissions-only change")
    : bad(`role_preset moved to ${after.role_preset} — not a clean permissions-only case`);
  (!eqPerm(after.permissions, before.permissions))
    ? ok('permissions actually changed in the DB')
    : bad('permissions did not change — the UI drive failed');
  (audit.length === 1)
    ? ok('exactly ONE audit row for a permissions-only UI edit (170 closes the gap)')
    : bad(`${audit.length} audit rows, expected 1`);
  (audit[0]?.action === 'employee_permissions_changed')
    ? ok("action = 'employee_permissions_changed'") : bad(`action = ${audit[0]?.action}`);
  (audit[0]?.staff_id === null)
    ? ok('staff_id NULL (157 shape preserved)') : bad(`staff_id = ${audit[0]?.staff_id}`);
  (audit[0]?.details?.employee_id === employeeId)
    ? ok('employee_id recorded in details') : bad('employee_id missing');
  const dp = audit[0]?.details?.permissions;
  (dp && eqPerm(dp.from, before.permissions) && eqPerm(dp.to, after.permissions))
    ? ok('permissions from/to match the real before/after')
    : bad(`permissions from/to wrong: ${JSON.stringify(dp)}`);

  console.log('\n=== PHASE 2: no-op save writes NO audit row ===');
  await clearAudit();
  const savedAgain = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Save changes' || x.textContent.trim() === 'Save');
    if (!b || b.disabled) return 'disabled';
    b.click(); return 'clicked';
  });
  await sleep(3500);
  const noop = await readAudit();
  console.log('   save button:', savedAgain, '| audit rows:', noop.length);
  (noop.length === 0)
    ? ok('no-op save wrote ZERO audit rows')
    : bad(`${noop.length} audit rows written for a no-op save`);

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Cleaning up seed…');
  await teardown();
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { await browser?.close(); } catch {}
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed (aborted) ====`);
  console.log('NOTE: seed rows left for inspection. Re-run to clean.');
  process.exit(1);
});

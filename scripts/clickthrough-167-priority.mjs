// scripts/clickthrough-167-priority.mjs
// Migration 167 auto-apply PRIORITY probe. DEV ONLY.
// Drives the REAL Employment editor (puppeteer → local dev :5173 → dev pbej) as
// the mosque OWNER and changes the staff member's role, so the actual
// EmploymentEditForm → applyRoleDefaults → update_employee_permissions path runs.
// Deliberately NOT re-implementing applyRoleDefaults in this script — that would
// test the copy, not the code.
//
// CASE 1 — role has BOTH default_permissions (restrictive blob) AND
//          default_role_preset='coordinator' → the BLOB must win.
// CASE 2 — role has ONLY default_role_preset='teacher' → the preset path fires.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'p167-Aa1!';
const EMAILS = { owner: 'p167-owner@amanah-verify.test', staff: 'p167-staff@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

// Deliberately unlike ANY preset, so "the blob was applied" is unambiguous.
const BLOB = {
  classes: false, students: 'own', attendance: false, hifz: false,
  homework: false, pastoral: false, reports: false, messages: false,
  finance: false, waiting_list: false, mosque_settings: false,
  employee_management: false, analytics: false,
};
// employeePermissions.js PRESET_ROLES.coordinator — what must NOT be applied in case 1.
const COORDINATOR = {
  classes: 'all', students: 'all', attendance: 'all', hifz: 'all', homework: 'all',
  pastoral: 'all', reports: 'all', finance: false, waiting_list: true,
  messages: 'all', mosque_settings: false, employee_management: false, analytics: true,
};
const TEACHER = {
  classes: 'own', students: 'own', attendance: 'own', hifz: 'own', homework: 'own',
  pastoral: 'own', reports: 'own', finance: false, waiting_list: false,
  messages: 'own', mosque_settings: false, employee_management: false, analytics: false,
};
const START = { ...COORDINATOR }; // seeded starting permissions, so any change is visible

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(Object.keys(a).sort().map(k => [k, a[k]])) === JSON.stringify(Object.keys(b).sort().map(k => [k, b[k]]));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  const { data: mosques } = ids.length ? await svc.from('mosques').select('id').in('user_id', ids) : { data: [] };
  const mIds = (mosques || []).map(m => m.id);
  if (mIds.length) {
    const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
    const sIds = (staff || []).map(s => s.id);
    if (sIds.length) {
      await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
    }
    await svc.from('mosque_staff_audit_log').delete().in('mosque_id', mIds);
    await svc.from('mosque_employees').delete().in('mosque_id', mIds);
    await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('mosque_roles').delete().in('mosque_id', mIds);
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
const readEmployee = async (empId) => (await svc.from('mosque_employees')
  .select('permissions, role_preset, assigned_classes').eq('id', empId).single()).data;

// Change the staff member's role through the REAL Employment editor.
async function changeRoleViaUI(p, staffId, roleName) {
  await p.goto(`${APP}/staff/profile?staffId=${staffId}&section=employment`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Employment/.test(document.body.innerText), { timeout: 25000 });
  await sleep(900);
  // There are TWO "Edit" buttons on this page: the HEADER one (opens the identity
  // dialog, whose Role select is a hardcoded ROLE_OPTIONS list that will never
  // contain a custom mosque_roles name) and the Employment panel's INLINE one.
  // Target the inline one by its text-xs class, and confirm the inline editor
  // rendered by waiting for a heading only it has ("Role & type").
  const diag = await p.evaluate(() => ({
    buttons: [...document.querySelectorAll('button')]
      .map(b => ({ t: b.textContent.trim().slice(0, 28), xs: (b.className || '').includes('text-xs') }))
      .filter(b => b.t),
    hasEmploymentHeading: /Terms and pay/.test(document.body.innerText),
  }));
  console.log('   [DIAG] employment heading:', diag.hasEmploymentHeading);
  console.log('   [DIAG] buttons:', JSON.stringify(diag.buttons));
  const clickedEdit = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Edit' && (x.className || '').includes('text-xs'));
    if (!b) return false; b.click(); return true;
  });
  await p.waitForFunction(() => /role & type/i.test(document.body.innerText), { timeout: 20000 })
    .catch(async () => {
      const after = await p.evaluate(() => document.body.innerText.slice(0, 600));
      console.log('   [DIAG] editor did not appear. Page text head:\n' + after);
      throw new Error('inline Employment editor never rendered');
    });
  await sleep(700);
  const setRole = await p.evaluate((name) => {
    const sel = [...document.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.textContent.trim() === name));
    if (!sel) return { ok: false, options: [] };
    const opt = [...sel.options].find(o => o.textContent.trim() === name);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, opt.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, selected: opt.textContent.trim() };
  }, roleName);
  await sleep(400);
  const saved = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save');
    if (!b || b.disabled) return false; b.click(); return true;
  });
  console.log(`   [UI] Edit=${clickedEdit} setRole=${JSON.stringify(setRole)} saveClicked=${saved}`);
  if (!clickedEdit || !setRole.ok || !saved) bad('UI drive failed — assertions below would be vacuous');
  await p.waitForFunction(() => /Employment updated/.test(document.body.innerText), { timeout: 25000 })
    .catch(() => console.log('   [UI] (no "Employment updated" toast seen)'));
  await sleep(1800); // let the fire-and-forget applyRoleDefaults land
}

let browser;
(async () => {
  console.log(`clickthrough-167-priority: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + staff(with account) + mosque_employees + 2 roles…');
  const ownerId = await mkUser(EMAILS.owner, 'P167 Owner');
  const staffUserId = await mkUser(EMAILS.staff, 'P167 Staff');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `p167-${ownerId.slice(0, 8)}`, name: 'P167 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: staff } = await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, name: 'P167 Teacher', role: 'Imam', status: 'active',
    invite_status: 'active', email: EMAILS.staff, profile_id: staffUserId,
    employment_type: 'employed_full_time',
  }).select().single();
  // invited_email + invited_name are NOT NULL with no default (probed live).
  const { data: emp, error: empErr } = await svc.from('mosque_employees').insert({
    mosque_id: mosque.id, profile_id: staffUserId, status: 'active',
    invited_email: EMAILS.staff, invited_name: 'P167 Staff',
    permissions: START, role_preset: 'coordinator', assigned_classes: [],
  }).select().single();
  if (empErr || !emp) throw new Error(`seed mosque_employees: ${empErr?.message}`);

  // Role A — BOTH set. Role B — preset only. Both active so they reach the dropdown.
  const { data: roleA } = await svc.from('mosque_roles').insert({
    mosque_id: mosque.id, name: 'P167 Granular', slug: 'p167-granular', display_order: 90,
    is_active: true, is_default: false,
    default_permissions: BLOB, default_role_preset: 'coordinator', default_assigned_classes: [],
  }).select().single();
  const { data: roleB } = await svc.from('mosque_roles').insert({
    mosque_id: mosque.id, name: 'P167 PresetOnly', slug: 'p167-presetonly', display_order: 91,
    is_active: true, is_default: false,
    default_permissions: null, default_role_preset: 'teacher', default_assigned_classes: [],
  }).select().single();
  console.log(`   staff=${staff.id} employee=${emp.id}`);
  console.log(`   roleA "${roleA.name}": default_permissions=SET default_role_preset=${roleA.default_role_preset}`);
  console.log(`   roleB "${roleB.name}": default_permissions=null default_role_preset=${roleB.default_role_preset}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1600 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));

  // ---------- CASE 1: blob must beat the preset ----------
  console.log('\n=== CASE 1: role has BOTH default_permissions AND default_role_preset=coordinator ===');
  const before1 = await readEmployee(emp.id);
  console.log('   BEFORE permissions:', JSON.stringify(before1.permissions));
  console.log('   BEFORE role_preset:', JSON.stringify(before1.role_preset));
  await changeRoleViaUI(p, staff.id, roleA.name);
  const after1 = await readEmployee(emp.id);
  console.log('   AFTER  permissions:', JSON.stringify(after1.permissions));
  console.log('   AFTER  role_preset:', JSON.stringify(after1.role_preset));
  console.log('   expected BLOB     :', JSON.stringify(BLOB));
  console.log('   coordinator expand:', JSON.stringify(COORDINATOR));

  eq(after1.permissions, BLOB)
    ? ok('permissions == the granular BLOB')
    : bad(`permissions != BLOB → ${JSON.stringify(after1.permissions)}`);
  !eq(after1.permissions, COORDINATOR)
    ? ok('permissions != coordinator preset expansion (blob won)')
    : bad('coordinator expansion was applied — PRIORITY INVERTED');
  after1.role_preset === 'custom'
    ? ok(`role_preset relabelled to derived "custom" (matches the blob)`)
    : bad(`role_preset=${JSON.stringify(after1.role_preset)}, expected "custom"`);

  // ---------- CASE 2: preset-only fallback ----------
  console.log('\n=== CASE 2: role has ONLY default_role_preset=teacher (default_permissions null) ===');
  const before2 = await readEmployee(emp.id);
  console.log('   BEFORE permissions:', JSON.stringify(before2.permissions));
  console.log('   BEFORE role_preset:', JSON.stringify(before2.role_preset));
  await changeRoleViaUI(p, staff.id, roleB.name);
  const after2 = await readEmployee(emp.id);
  console.log('   AFTER  permissions:', JSON.stringify(after2.permissions));
  console.log('   AFTER  role_preset:', JSON.stringify(after2.role_preset));
  console.log('   teacher expansion :', JSON.stringify(TEACHER));

  after2.role_preset === 'teacher'
    ? ok('role_preset updated to "teacher" (fallback path fired)')
    : bad(`role_preset=${JSON.stringify(after2.role_preset)}, expected "teacher"`);
  // The interesting one — does the preset fallback actually REWRITE permissions?
  if (eq(after2.permissions, TEACHER)) {
    ok('permissions rewritten to the teacher expansion');
  } else if (eq(after2.permissions, before2.permissions)) {
    bad('PERMISSIONS UNCHANGED — the preset fallback relabels role_preset but does NOT apply the preset\'s permissions');
  } else {
    bad(`permissions are neither the teacher expansion nor unchanged → ${JSON.stringify(after2.permissions)}`);
  }

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

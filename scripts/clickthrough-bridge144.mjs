// scripts/clickthrough-bridge144.mjs
// Browser click-through for the migration-144 scholar->staff bridge + the commit-2
// routing change. DEV ONLY. Seeds a PERSISTENT fixture (owner + ACTIVE mosque +
// active claimed scholar — NOT pre-linked), then drives the installed Chrome:
//   PART 1  admin opens Staff Directory -> Add staff -> "Link an existing Amanah
//           scholar" -> picks the scholar -> Link. (Real UI, real RPC.)
//   PART 2  that scholar signs in for real (Sign in -> Scholar sign in -> /auth
//           form) and must land on the STAFF PORTAL, not the scholar dashboard.
// Screenshots each step. Leaves the fixture in place (teardown only at START, so
// re-runs are clean). The mosque is created status='active' on purpose — a
// non-active mosque is unreadable under the scholar's RLS, so getMyStaffMembership
// would return the row with mosque=null and the portal would render "No active
// staff record" (see the routing guard). Active mosque avoids that trap.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'bridge144ct-Aa1!';
const EMAILS = { owner: 'bridge144ct-owner@amanah-verify.test', scholar: 'bridge144ct-scholar@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'bridge144ct-%@amanah-verify.test');
  await svc.from('scholars').delete().like('slug', 'bridge144ct-%');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('scholars').delete().in('user_id', ids);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}
async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
}
async function session(email) {
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return data.session;
}
// Click the first visible element (button/a/div[role]) whose text matches re.
async function clickText(page, reSource, tag = 'button, a, [role="button"]') {
  return page.evaluate((reSource, tag) => {
    const re = new RegExp(reSource);
    const els = [...document.querySelectorAll(tag)];
    const el = els.find(e => re.test((e.textContent || '').trim()) && e.offsetParent !== null);
    if (el) { el.click(); return true; }
    return false;
  }, reSource, tag);
}
async function dump(page, label) {
  const t = await page.evaluate(() => document.body.innerText).catch(() => '');
  console.log(`PAGE TEXT [${label}] >>>`, t.slice(0, 400).replace(/\n+/g, ' | '));
}

let browser;
(async () => {
  console.log(`clickthrough-bridge144: dev ${DEV}. Cleaning any prior fixture…`);
  await teardown();

  // ---- SEED (persistent) ----
  console.log('Seeding owner + ACTIVE mosque + active claimed scholar (NOT linked)…');
  const ownerId = await mkUser(EMAILS.owner, 'Bridge144CT Owner');
  const scholarUid = await mkUser(EMAILS.scholar, 'Bridge144CT Scholar');
  const { data: mosque, error: me } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `bridge144ct-${ownerId.slice(0, 8)}`, name: 'Bridge144CT Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  if (me) throw new Error(`mosque: ${me.message}`);
  const { data: scholarRow, error: se } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `bridge144ct-sch-${scholarUid.slice(0, 8)}`, name: 'Bridge144CT Scholar', status: 'active',
  }).select().single();
  if (se) throw new Error(`scholar: ${se.message}`);

  // BEFORE state.
  const beforeRows = (await svc.from('mosque_staff').select('id').eq('mosque_id', mosque.id)).data || [];
  console.log(`\nBEFORE — mosque_staff rows for fixture mosque: ${beforeRows.length} (expect 0)`);
  console.log(`  mosque ${mosque.id} status=${mosque.status} · scholar ${scholarRow.id} (user ${scholarUid})`);
  beforeRows.length === 0 ? ok('no staff link exists before the click-through') : bad(`expected 0 staff rows, got ${beforeRows.length}`);

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

  // ============ PART 1 — admin links the scholar via AddStaffModal ============
  console.log('\nPART 1 — admin links the scholar via the UI');
  const ownerSess = await session(EMAILS.owner);
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1400 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(ownerSess));
  await p.goto(APP + '/mosque-dashboard?tab=people&sub=staff', { waitUntil: 'networkidle2' });

  const dirReady = await p.waitForFunction(() => /Add staff/i.test(document.body.innerText), { timeout: 25000 }).then(() => true).catch(() => false);
  await p.screenshot({ path: `${SHOT_DIR}/bridge144-p1-0-staffdir.png` });
  if (!dirReady) { await dump(p, 'staffdir'); throw new Error('Staff Directory / Add staff not visible'); }
  ok('owner reached Staff Directory (Add staff visible)');

  if (!(await clickText(p, 'Add staff'))) { await dump(p, 'no-addstaff'); throw new Error('Add staff button not clickable'); }
  await p.waitForFunction(() => /How would you like to add them\?/i.test(document.body.innerText), { timeout: 8000 });
  await p.screenshot({ path: `${SHOT_DIR}/bridge144-p1-1-modal.png` });
  ok('Add staff modal opened (3 paths)');

  if (!(await clickText(p, 'Link an existing Amanah scholar'))) { await dump(p, 'no-link-option'); throw new Error('Link-scholar option not found'); }
  // Picker loads scholars; wait for our seeded scholar to appear.
  const pickerReady = await p.waitForFunction(() => /Bridge144CT Scholar/.test(document.body.innerText), { timeout: 15000 }).then(() => true).catch(() => false);
  await p.screenshot({ path: `${SHOT_DIR}/bridge144-p1-2-picker.png` });
  if (!pickerReady) { await dump(p, 'picker'); throw new Error('seeded scholar not offered in picker'); }
  ok('link path shows the claimed scholar in the picker');

  if (!(await clickText(p, 'Bridge144CT Scholar'))) { await dump(p, 'pick-fail'); throw new Error('could not select the scholar'); }
  await sleep(300);
  if (!(await clickText(p, 'Continue'))) { await dump(p, 'no-continue'); throw new Error('Continue not clickable'); }
  await p.waitForFunction(() => /Review/i.test(document.body.innerText), { timeout: 8000 });
  await p.screenshot({ path: `${SHOT_DIR}/bridge144-p1-3-review.png` });
  ok('reached review with the scholar + role');

  if (!(await clickText(p, '^Link scholar$'))) { await dump(p, 'no-linkbtn'); throw new Error('Link scholar button not clickable'); }
  // Modal closes on success (onCreated). Confirm the DB row landed.
  await sleep(2500);
  await p.screenshot({ path: `${SHOT_DIR}/bridge144-p1-4-linked.png` });

  const { data: linked } = await svc.from('mosque_staff').select('*').eq('mosque_id', mosque.id).eq('linked_scholar_id', scholarRow.id).maybeSingle();
  linked ? ok('mosque_staff row created via the UI link') : bad('no linked staff row after clicking Link scholar');
  if (linked) {
    linked.profile_id === scholarUid ? ok('profile_id = scholar user_id (routing key set by RPC)') : bad(`profile_id = ${linked.profile_id}`);
    linked.invite_status === 'active' ? ok('invite_status = active') : bad(`invite_status = ${linked.invite_status}`);
    linked.status === 'active' ? ok('status = active') : bad(`status = ${linked.status}`);
  }
  await p.close();

  // ============ PART 2 — scholar signs in for real -> STAFF PORTAL ============
  console.log('\nPART 2 — scholar signs in for real and must land on the staff portal');
  await browser.close();
  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const s = await browser.newPage();
  await s.setViewport({ width: 1280, height: 1400 });
  // The publicHome landing (LANDING-V2) is mosque-only and exposes no scholar
  // sign-in. A legal page still renders the drawer-based PublicHeader, which
  // carries the "Scholar sign in" entry (onSignIn("imam") -> scholarPostAuth).
  await s.goto(APP + '/privacy-policy', { waitUntil: 'networkidle2' });

  // Open the sign-in drawer -> "Scholar sign in" (sets returnView scholarPostAuth).
  if (!(await clickText(s, '^Sign in$'))) { await dump(s, 'no-signin'); throw new Error('header Sign in not found'); }
  await s.waitForFunction(() => /Scholar sign in/i.test(document.body.innerText), { timeout: 8000 });
  if (!(await clickText(s, 'Scholar sign in'))) { await dump(s, 'no-scholar-entry'); throw new Error('Scholar sign in entry not found'); }
  await s.waitForFunction(() => location.pathname === '/auth', { timeout: 10000 });
  await s.waitForSelector('input[type="email"]', { timeout: 8000 });
  await s.type('input[type="email"]', EMAILS.scholar, { delay: 8 });
  await s.type('input[type="password"]', PW, { delay: 8 });
  await s.screenshot({ path: `${SHOT_DIR}/bridge144-p2-0-login.png` });
  if (!(await clickText(s, '^Sign in$'))) { await dump(s, 'no-submit'); throw new Error('Sign in submit not found'); }

  // Must land on the staff portal, NOT the scholar dashboard.
  const landed = await s.waitForFunction(() => location.pathname === '/staff/portal', { timeout: 20000 }).then(() => true).catch(() => false);
  await sleep(1000);
  await s.screenshot({ path: `${SHOT_DIR}/bridge144-p2-1-portal.png` });
  const path2 = await s.evaluate(() => location.pathname);
  const text2 = await s.evaluate(() => document.body.innerText);
  if (!landed) { await dump(s, 'landing'); bad(`scholar landed on ${path2}, expected /staff/portal`); }
  else {
    ok('scholar login routed to /staff/portal (NOT /scholar-dashboard)');
    /Bridge144CT Test Masjid/.test(text2) ? ok('portal renders the mosque (staff record active, not the empty "No active staff record" state)') : bad('portal did not render the mosque name');
    /No active staff record/i.test(text2) ? bad('portal shows "No active staff record" — mosque-active trap hit') : ok('portal is NOT the empty "No active staff record" state');
  }

  await browser.close();

  // AFTER state (leave fixture in place).
  const afterRows = (await svc.from('mosque_staff').select('id,profile_id,linked_scholar_id,invite_status,status').eq('mosque_id', mosque.id)).data || [];
  console.log(`\nAFTER — mosque_staff rows for fixture mosque: ${afterRows.length} (expect 1)`);
  console.log('  ' + JSON.stringify(afterRows[0] || null));
  console.log('\nFixture LEFT IN PLACE:');
  console.log(`  owner    ${EMAILS.owner} / ${PW}`);
  console.log(`  scholar  ${EMAILS.scholar} / ${PW}`);
  console.log(`  mosque   ${mosque.id} (active) · scholar ${scholarRow.id} · staff link ${afterRows[0]?.id || 'MISSING'}`);

  console.log(`\n==== CLICK-THROUGH: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots in scratchpad: bridge144-p1-0..4, bridge144-p2-0..1');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { if (browser) await browser.close(); } catch {}
  process.exit(1);
});

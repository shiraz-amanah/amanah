// scripts/clickthrough-signin-b3.mjs
// Job B commit 3 verification — the brief's full standard: start from the ACTUAL
// landing page (not a direct sign-in URL) and find your way in via what the landing
// now surfaces. DEV ONLY.
//   mosque admin  -> landing "Sign in"        -> /mosque-dashboard
//   parent        -> landing "Parent sign-in" -> /dashboard
//   plain employee-> landing "Staff sign-in"  -> /staff/portal
// Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY; // eslint-disable-line no-unused-vars
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'signinb3-Aa1!';
const EMAILS = { owner: 'signinb3-owner@amanah-verify.test', parent: 'signinb3-parent@amanah-verify.test', employee: 'signinb3-employee@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'signinb3-%@amanah-verify.test');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('mosque_staff').delete().in('mosque_id', mIds);
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
async function freshPage(browser) {
  const p = await browser.newPage(); await p.setViewport({ width: 1280, height: 1100 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  return p;
}
// Click a landing element by its exact trimmed text.
async function clickExact(page, text) {
  return page.evaluate((text) => {
    const el = [...document.querySelectorAll('button, a')].find(e => (e.textContent || '').trim() === text && e.offsetParent !== null);
    if (el) { el.click(); return true; } return false;
  }, text);
}
async function landed(page, pathRe) {
  return page.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout: 20000 }, pathRe).then(() => true).catch(() => false);
}
async function fromLanding(browser, { landingText, email, expectPath, label, shot }) {
  const p = await freshPage(browser);
  await p.goto(APP + '/', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Book a demo/i.test(document.body.innerText), { timeout: 15000 });
  if (shot) await p.screenshot({ path: `${SHOT}/${shot}` });
  const clicked = await clickExact(p, landingText);
  clicked ? ok(`${label}: found "${landingText}" on the landing`) : bad(`${label}: "${landingText}" not found on landing`);
  await landed(p, '^/sign-in/');
  await p.waitForSelector('input[type="email"]', { timeout: 12000 });
  await p.type('input[type="email"]', email, { delay: 5 });
  await p.type('input[type="password"]', PW, { delay: 5 });
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Sign in$/.test(x.textContent.trim())); b && b.click(); });
  const done = await landed(p, expectPath);
  done ? ok(`${label}: landed on ${await p.evaluate(() => location.pathname)}`) : bad(`${label}: landed on ${await p.evaluate(() => location.pathname)}, expected ${expectPath}`);
  await p.close();
}

let browser;
(async () => {
  console.log(`clickthrough-signin-b3: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + active mosque + parent + plain employee…');
  const ownerId = await mkUser(EMAILS.owner, 'SigninB3 Owner');
  await mkUser(EMAILS.parent, 'SigninB3 Parent');
  const employeeUid = await mkUser(EMAILS.employee, 'SigninB3 Employee');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `signinb3-${ownerId.slice(0, 8)}`, name: 'SigninB3 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: employeeUid, role: 'Administrator',
    invite_status: 'active', status: 'active', name: 'SigninB3 Employee', email: EMAILS.employee,
  });

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

  console.log('\n1 — MOSQUE ADMIN from the landing');
  await fromLanding(browser, { landingText: 'Sign in', email: EMAILS.owner, expectPath: '^/mosque-dashboard', label: 'mosque', shot: 'signin-b3-landing.png' });

  console.log('\n2 — PARENT from the landing');
  await fromLanding(browser, { landingText: 'Parent sign-in', email: EMAILS.parent, expectPath: '^/dashboard', label: 'parent' });

  console.log('\n3 — PLAIN EMPLOYEE from the landing');
  await fromLanding(browser, { landingText: 'Staff sign-in', email: EMAILS.employee, expectPath: '^/staff/portal', label: 'employee' });

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

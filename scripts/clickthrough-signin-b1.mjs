// scripts/clickthrough-signin-b1.mjs
// Job B commit 1 verification. DEV ONLY. Drives the three canonical sign-in URLs
// directly (the landing surface is Commit 3), each unauthenticated, and confirms:
//   - the audience-correct sign-in copy renders
//   - signing in lands the right user on the right dashboard
//     /sign-in/mosque -> mosque owner  -> /mosque-dashboard
//     /sign-in/parent -> parent        -> /dashboard
//     /sign-in/staff  -> scholar-staff -> /staff/portal
// Plus: /?signin=scholar (the notification-email link) still works as a permanent
// alias -> redirects to /sign-in/staff -> portal. Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'signinb-Aa1!';
const EMAILS = { owner: 'signinb-owner@amanah-verify.test', parent: 'signinb-parent@amanah-verify.test', scholar: 'signinb-scholar@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'signinb-%@amanah-verify.test');
  await svc.from('scholars').delete().like('slug', 'signinb-%');
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
async function loginForm(page, email) {
  await page.waitForSelector('input[type="email"]', { timeout: 12000 });
  await page.type('input[type="email"]', email, { delay: 5 });
  await page.type('input[type="password"]', PW, { delay: 5 });
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Sign in$/.test(x.textContent.trim())); b && b.click(); });
}
async function freshPage(browser) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1100 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  return p;
}
async function landed(page, pathRe) {
  return page.waitForFunction((src) => new RegExp(src).test(location.pathname), { timeout: 20000 }, pathRe).then(() => true).catch(() => false);
}

let browser;
(async () => {
  console.log(`clickthrough-signin-b1: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding mosque owner + parent + scholar-staff…');
  const ownerId = await mkUser(EMAILS.owner, 'SigninB Owner');
  const parentId = await mkUser(EMAILS.parent, 'SigninB Parent'); // eslint-disable-line no-unused-vars
  const scholarUid = await mkUser(EMAILS.scholar, 'SigninB Scholar');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `signinb-${ownerId.slice(0, 8)}`, name: 'SigninB Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: scholarRow } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `signinb-sch-${scholarUid.slice(0, 8)}`, name: 'SigninB Scholar', status: 'active',
  }).select().single();
  await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: scholarUid, linked_scholar_id: scholarRow.id, role: 'Scholar',
    invite_status: 'active', status: 'active', name: 'SigninB Scholar', email: EMAILS.scholar,
  });

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

  // 1. /sign-in/mosque -> mosque owner -> /mosque-dashboard
  console.log('\n1 — /sign-in/mosque (mosque owner)');
  let p = await freshPage(browser);
  await p.goto(APP + '/sign-in/mosque', { waitUntil: 'networkidle2' });
  let body = await p.evaluate(() => document.body.innerText);
  /your mosque's Amanah workspace/i.test(body) ? ok('mosque sign-in copy shown') : bad(`mosque copy missing: ${body.slice(0, 100)}`);
  await p.screenshot({ path: `${SHOT}/signin-b1-mosque.png` });
  await loginForm(p, EMAILS.owner);
  (await landed(p, '^/mosque-dashboard')) ? ok(`mosque owner landed on ${await p.evaluate(() => location.pathname)}`) : bad(`mosque landed on ${await p.evaluate(() => location.pathname)}`);
  await p.close();

  // 2. /sign-in/parent -> parent -> /dashboard
  console.log('\n2 — /sign-in/parent (parent)');
  p = await freshPage(browser);
  await p.goto(APP + '/sign-in/parent', { waitUntil: 'networkidle2' });
  body = await p.evaluate(() => document.body.innerText);
  /children's madrasah, community and giving/i.test(body) ? ok('parent sign-in copy shown') : bad(`parent copy missing: ${body.slice(0, 100)}`);
  await loginForm(p, EMAILS.parent);
  (await landed(p, '^/dashboard')) ? ok(`parent landed on ${await p.evaluate(() => location.pathname)}`) : bad(`parent landed on ${await p.evaluate(() => location.pathname)}`);
  await p.close();

  // 3. /sign-in/staff -> scholar-staff -> /staff/portal
  console.log('\n3 — /sign-in/staff (scholar-staff)');
  p = await freshPage(browser);
  await p.goto(APP + '/sign-in/staff', { waitUntil: 'networkidle2' });
  body = await p.evaluate(() => document.body.innerText);
  /your staff portal/i.test(body) ? ok('staff sign-in copy shown') : bad(`staff copy missing: ${body.slice(0, 100)}`);
  await p.screenshot({ path: `${SHOT}/signin-b1-staff.png` });
  await loginForm(p, EMAILS.scholar);
  (await landed(p, '^/staff/portal')) ? ok(`scholar-staff landed on ${await p.evaluate(() => location.pathname)}`) : bad(`staff landed on ${await p.evaluate(() => location.pathname)}`);
  await p.close();

  // 4. /?signin=scholar alias (unauthed) -> /sign-in/staff -> portal
  console.log('\n4 — /?signin=scholar ALIAS (the email link)');
  p = await freshPage(browser);
  await p.goto(APP + '/?signin=scholar', { waitUntil: 'networkidle2' });
  const redirected = await landed(p, '^/sign-in/staff');
  redirected ? ok('/?signin=scholar redirected to /sign-in/staff') : bad(`alias landed on ${await p.evaluate(() => location.pathname)}`);
  body = await p.evaluate(() => document.body.innerText);
  /your staff portal/i.test(body) ? ok('alias shows staff sign-in copy') : bad('alias copy missing');
  await loginForm(p, EMAILS.scholar);
  (await landed(p, '^/staff/portal')) ? ok(`alias sign-in landed on /staff/portal`) : bad(`alias landed on ${await p.evaluate(() => location.pathname)}`);
  await p.close();

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-signin-b2.mjs
// Job B commit 2 verification. DEV ONLY. Proves /sign-in/staff now unifies BOTH
// staff audiences:
//   - a PLAIN EMPLOYEE (mosque_staff row, NO scholars row) -> /staff/portal
//     (previously they could only reach it via a buried banner on the parent dash)
//   - REGRESSION: a scholar-who-is-staff still -> /staff/portal
// Reads the real landing path in a real browser. Tears down its own seed.
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
const PW = 'signinb2-Aa1!';
const EMAILS = { owner: 'signinb2-owner@amanah-verify.test', employee: 'signinb2-employee@amanah-verify.test', scholar: 'signinb2-scholar@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'signinb2-%@amanah-verify.test');
  await svc.from('scholars').delete().like('slug', 'signinb2-%');
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
async function freshPage(browser) {
  const p = await browser.newPage(); await p.setViewport({ width: 1280, height: 1100 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  return p;
}
async function signInStaff(browser, email, label, shotName) {
  const p = await freshPage(browser);
  await p.goto(APP + '/sign-in/staff', { waitUntil: 'networkidle2' });
  await p.waitForSelector('input[type="email"]', { timeout: 12000 });
  await p.type('input[type="email"]', email, { delay: 5 });
  await p.type('input[type="password"]', PW, { delay: 5 });
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Sign in$/.test(x.textContent.trim())); b && b.click(); });
  const landed = await p.waitForFunction(() => location.pathname === '/staff/portal', { timeout: 20000 }).then(() => true).catch(() => false);
  const path = await p.evaluate(() => location.pathname);
  const text = await p.evaluate(() => document.body.innerText);
  if (shotName) await p.screenshot({ path: `${SHOT}/${shotName}` });
  landed ? ok(`${label} landed on /staff/portal`) : bad(`${label} landed on ${path}, expected /staff/portal`);
  /SigninB2 Test Masjid/.test(text) ? ok(`${label} portal rendered the mosque`) : bad(`${label} portal did not render mosque`);
  await p.close();
}

let browser;
(async () => {
  console.log(`clickthrough-signin-b2: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + active mosque + plain employee + scholar-staff…');
  const ownerId = await mkUser(EMAILS.owner, 'SigninB2 Owner');
  const employeeUid = await mkUser(EMAILS.employee, 'SigninB2 Employee');
  const scholarUid = await mkUser(EMAILS.scholar, 'SigninB2 Scholar');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `signinb2-${ownerId.slice(0, 8)}`, name: 'SigninB2 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();

  // PLAIN EMPLOYEE — active staff, NO scholars row, NO linked_scholar_id.
  await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: employeeUid, role: 'Administrator',
    invite_status: 'active', status: 'active', name: 'SigninB2 Employee', email: EMAILS.employee,
  });
  const { count: empScholarCount } = await svc.from('scholars').select('*', { count: 'exact', head: true }).eq('user_id', employeeUid);
  empScholarCount === 0 ? ok('plain employee has NO scholars row (the case this commit fixes)') : bad(`employee unexpectedly has ${empScholarCount} scholars rows`);

  // SCHOLAR-STAFF — scholars row + linked active staff (144 bridge shape).
  const { data: scholarRow } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `signinb2-sch-${scholarUid.slice(0, 8)}`, name: 'SigninB2 Scholar', status: 'active',
  }).select().single();
  await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: scholarUid, linked_scholar_id: scholarRow.id, role: 'Scholar',
    invite_status: 'active', status: 'active', name: 'SigninB2 Scholar', email: EMAILS.scholar,
  });

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

  console.log('\n1 — PLAIN EMPLOYEE via /sign-in/staff (the fix)');
  await signInStaff(browser, EMAILS.employee, 'plain employee', 'signin-b2-employee-portal.png');

  console.log('\n2 — REGRESSION: scholar-staff via /sign-in/staff (must still work)');
  await signInStaff(browser, EMAILS.scholar, 'scholar-staff', null);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-status-compliance.mjs
// Job A commit 2 verification: the compliance/admin status maps now emit success-*.
// DEV ONLY. Seeds an approved mosque claim, a valid document, and an approved
// onboarding session, then drives Chrome to each screen and reads the ACTUAL
// rendered colour of the positive badge — must be success-green (== emerald-50/700
// today), same standard as commit 1. Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'statuscompliance-Aa1!';
const EMAILS = { admin: 'statuscompliance-admin@amanah-verify.test', owner: 'statuscompliance-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const future = () => new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
const EMERALD_50 = 'rgb(236, 253, 245)', EMERALD_700 = 'rgb(4, 120, 87)', EMERALD_800 = 'rgb(6, 95, 70)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['mosque_claims', 'mosque_documents', 'mosque_staff_onboarding_sessions']) {
      if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    }
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}
async function mkUser(email, name, role) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name, ...(role ? { role } : {}) }, { onConflict: 'id' });
  return data.user.id;
}
async function inject(page, sess) {
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
}
async function badge(page, label) {
  return page.evaluate((label) => {
    const els = [...document.querySelectorAll('span, div')].filter(e => (e.textContent || '').trim() === label);
    for (const e of els) { const cs = getComputedStyle(e); if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return { bg: cs.backgroundColor, color: cs.color }; }
    return null;
  }, label);
}
const isGreen = (b) => b && b.bg === EMERALD_50 && (b.color === EMERALD_700 || b.color === EMERALD_800);

let browser;
(async () => {
  console.log(`clickthrough-status-compliance: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding admin + owner + approved claim / valid doc / approved onboarding…');
  const adminId = await mkUser(EMAILS.admin, 'Compliance Admin', 'admin');
  const ownerId = await mkUser(EMAILS.owner, 'Compliance Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `statuscompliance-${ownerId.slice(0, 8)}`, name: 'Compliance Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  await svc.from('mosque_claims').insert({ mosque_id: mosque.id, claimant_name: 'Approved Claimant', claimant_email: 'claimant@amanah-verify.test', status: 'approved' });
  const { error: docErr } = await svc.from('mosque_documents').insert({ mosque_id: mosque.id, category: 'policy', label: 'Safeguarding Policy', expiry_date: future() });
  if (docErr) throw new Error(`document: ${docErr.message}`);
  const { error: obErr } = await svc.from('mosque_staff_onboarding_sessions').insert({ mosque_id: mosque.id, employee_name: 'Approved Staff', employee_email: 'newstaff@amanah-verify.test', path: 'remote', status: 'approved' });
  if (obErr) throw new Error(`onboarding: ${obErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const adminSess = (await anon.auth.signInWithPassword({ email: EMAILS.admin, password: PW })).data.session;
  const ownerSess = (await (createClient(URL, ANON, { auth: { persistSession: false } })).auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });

  // --- 1. AdminClaims: "Approved" ---
  console.log('\n1 — AdminClaims (approved)');
  let p = await browser.newPage(); await p.setViewport({ width: 1400, height: 1100 });
  await inject(p, adminSess);
  await p.goto(APP + '/admin?section=claims', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Approved Claimant|Mosque claims|Claims|approved/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  // AdminClaims defaults to the "pending" filter — switch to "approved" to reveal it.
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'approved'); b && b.click(); });
  await sleep(800); await p.screenshot({ path: `${SHOT}/status-c2-1-claims.png` });
  // Badge text is the raw lowercase status ('approved'); CSS `capitalize` is display-only.
  const b1 = await badge(p, 'approved');
  console.log('   Approved claim badge:', JSON.stringify(b1));
  isGreen(b1) ? ok(`AdminClaims "Approved" is success-green (${b1.bg})`) : bad(`Approved badge = ${JSON.stringify(b1)}`);
  await p.close();

  // --- 2. MosqueDocuments: "Valid" ---
  console.log('\n2 — MosqueDocuments (valid)');
  p = await browser.newPage(); await p.setViewport({ width: 1400, height: 1100 });
  await inject(p, ownerSess);
  await p.goto(APP + '/mosque-dashboard?tab=compliance&sub=documents', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Safeguarding Policy|Valid|Documents/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await sleep(800); await p.screenshot({ path: `${SHOT}/status-c2-2-documents.png` });
  const b2 = await badge(p, 'Valid');
  console.log('   Valid document badge:', JSON.stringify(b2));
  isGreen(b2) ? ok(`MosqueDocuments "Valid" is success-green (${b2.bg})`) : bad(`Valid badge = ${JSON.stringify(b2)}`);
  await p.close();

  // --- 3. OnboardingReview: "Approved" ---
  console.log('\n3 — OnboardingReview (approved)');
  p = await browser.newPage(); await p.setViewport({ width: 1400, height: 1100 });
  await inject(p, ownerSess);
  await p.goto(APP + '/mosque-dashboard?tab=people&sub=staff', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Onboarding/i.test(document.body.innerText), { timeout: 20000 });
  // Click the "Onboarding" tab within StaffDirectory.
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Onboarding$/.test(x.textContent.trim())); b && b.click(); });
  await p.waitForFunction(() => /Approved Staff|Approved|Awaiting review/i.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
  await sleep(1000); await p.screenshot({ path: `${SHOT}/status-c2-3-onboarding.png` });
  const b3 = await badge(p, 'Approved');
  console.log('   Approved onboarding badge:', JSON.stringify(b3));
  isGreen(b3) ? ok(`OnboardingReview "Approved" is success-green (${b3.bg})`) : bad(`Approved badge = ${JSON.stringify(b3)}`);
  await p.close();

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: status-c2-1-claims.png, status-c2-2-documents.png, status-c2-3-onboarding.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

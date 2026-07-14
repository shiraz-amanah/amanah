// scripts/clickthrough-jobc-portal.mjs
// Job C batch 2 verification — MosqueStaffPortal brand-* migration (structural,
// identical colours). DEV ONLY. Renders the portal for a staff member and reads
// the ACTUAL rendered colour of:
//   - the header LOGO badge (bg-brand-700) -> must be rgb(4,120,87) == emerald-700
//   - a timesheet "approved" badge (success-*) -> emerald-50/700
// proving the brand-* chrome and success-* status render byte-identical to before.
// Tears down its own seed.
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
const PW = 'jc2-Aa1!';
const EMAILS = { owner: 'jc2-owner@amanah-verify.test', staff: 'jc2-staff@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BRAND_700 = 'rgb(4, 120, 87)', SUCCESS_50 = 'rgb(236, 253, 245)', SUCCESS_700 = 'rgb(4, 120, 87)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('mosque_staff').delete().like('email', 'jc2-%@amanah-verify.test');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('mosque_timesheets').delete().in('mosque_id', mIds); await svc.from('mosque_staff').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
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

let browser;
(async () => {
  console.log(`clickthrough-jobc-portal: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + staff + approved timesheet…');
  const ownerId = await mkUser(EMAILS.owner, 'JC2 Owner');
  const staffUid = await mkUser(EMAILS.staff, 'JC2 Staff');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc2-${ownerId.slice(0, 8)}`, name: 'JC2 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: staff } = await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: staffUid, role: 'Teacher', invite_status: 'active', status: 'active',
    name: 'JC2 Staff', email: EMAILS.staff,
  }).select().single();
  const { error: tsErr } = await svc.from('mosque_timesheets').insert({
    mosque_id: mosque.id, staff_id: staff.id, week_start: '2026-07-06', hours: 12, status: 'approved',
  });
  if (tsErr) throw new Error(`timesheet: ${tsErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.staff, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1100 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/staff/portal', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /JC2 Test Masjid/.test(document.body.innerText), { timeout: 20000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-portal.png` });

  // Brand logo badge (bg-brand-700) — find an element whose computed bg == brand-700.
  const logoBg = await p.evaluate((want) => {
    const el = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).backgroundColor === want);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, BRAND_700);
  logoBg === BRAND_700 ? ok(`brand-700 logo badge renders ${logoBg} (== emerald-700, unchanged)`) : bad(`brand-700 element not found (got ${logoBg})`);

  // Timesheets tab -> success-* "approved" badge.
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /My Timesheets/.test(x.textContent)); b && b.click(); });
  await p.waitForFunction(() => /approved|Week of/i.test(document.body.innerText), { timeout: 12000 }).catch(() => {});
  await sleep(600);
  const approved = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(e => (e.textContent || '').trim() === 'approved');
    if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log('   approved timesheet badge:', JSON.stringify(approved));
  (approved && approved.bg === SUCCESS_50 && approved.color === SUCCESS_700)
    ? ok(`success-* "approved" badge renders ${approved.bg}/${approved.color} (== emerald-50/700)`)
    : bad(`approved badge = ${JSON.stringify(approved)}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-jobc-financereports.mjs
// Job C (Finance cluster) COMBINED verification — FinanceReports + FinanceAI
// (FinanceAI renders inside FinanceReports). Both all-brand. DEV ONLY.
// Seeds a mosque + a gift-aid sadaqah donation (income + GA), opens finance/reports:
//   FinanceReports: Stat accent -> text-brand-700 ; Export CSV -> bg-brand-900 ;
//                   "Claimable (25%)" amount -> text-brand-700
//   FinanceAI:      "AI Finance Brief" heading -> text-brand-900 ; card border -> brand-200
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
const EMAILS = { owner: 'fr-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B700 = 'rgb(4, 120, 87)', B900 = 'rgb(6, 78, 59)', B200 = 'rgb(167, 243, 208)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('finance_sadaqah').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-financereports: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + gift-aid donation…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'fr-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'FR Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `fr-${u.user.id.slice(0, 8)}`, name: 'FR Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error: dErr } = await svc.from('finance_sadaqah').insert({ mosque_id: mosque.id, donor_name: 'Test Donor', amount: 400, gift_aid_eligible: true });
  if (dErr) throw new Error(`donation: ${dErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'fr-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=finance&sub=reports', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Total income|Gift Aid|AI Finance Brief|Claimable/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-financereports.png`, fullPage: true });

  // ---- FinanceReports ----
  const stat = await p.evaluate((want) => { const el = [...document.querySelectorAll('p')].find(x => getComputedStyle(x).color === want && /£|\d/.test(x.textContent)); return el ? getComputedStyle(el).color : null; }, B700);
  stat === B700 ? ok(`Reports: Stat/GA accent is brand-700 (${stat})`) : bad(`stat accent = ${stat}`);

  const exportBtn = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => /Export CSV/.test(x.textContent) && getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, B900);
  exportBtn === B900 ? ok(`Reports: "Export CSV" button is brand-900 (${exportBtn})`) : bad(`export btn = ${exportBtn}`);

  const claim = await p.evaluate(() => { const lab = [...document.querySelectorAll('p')].find(x => /Claimable \(25%\)/.test(x.textContent)); return lab ? getComputedStyle(lab).color : null; });
  claim === B700 ? ok(`Reports: "Claimable (25%)" label is brand-700 (${claim})`) : bad(`claimable = ${claim}`);

  // ---- FinanceAI (embedded) ----
  const heading = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].find(x => x.textContent.trim().startsWith('AI Finance Brief') && x.textContent.trim().length < 20); return el ? getComputedStyle(el).color : null; });
  heading === B900 ? ok(`AI: "AI Finance Brief" heading is brand-900 (${heading})`) : bad(`AI heading = ${heading}`);

  const card = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(x => /AI Finance Brief/.test(x.textContent) && getComputedStyle(x).borderColor === want); return el ? getComputedStyle(el).borderColor : null; }, B200);
  card === B200 ? ok(`AI: brief card border is brand-200 (${card} == emerald-200)`) : bad(`AI card border = ${card}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-financereports.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

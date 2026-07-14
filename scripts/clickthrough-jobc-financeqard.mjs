// scripts/clickthrough-jobc-financeqard.mjs
// Job C (Finance cluster) verification — FinanceQard migration. DEV ONLY.
// Seeds a mosque + a REPAID loan + an ACTIVE loan, opens finance/qard, reads pixels:
//   BRAND (migrated chrome):
//     - loan avatar        -> bg-brand-50 / text-brand-800
//     - "Record loan" btn   -> bg-brand-900
//   JOB A STATUS MAP (untouched — must still render):
//     - "Repaid" badge      -> success (bg-success-50 / text-success-800)
//     - "Active" badge      -> amber-700
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
const EMAILS = { owner: 'fq-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B50 = 'rgb(236, 253, 245)', B800 = 'rgb(6, 95, 70)', B900 = 'rgb(6, 78, 59)', AMBER700 = 'rgb(180, 83, 9)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('finance_qard_hasan').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-financeqard: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + repaid + active loans…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'fq-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'FQ Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `fq-${u.user.id.slice(0, 8)}`, name: 'FQ Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error: e1 } = await svc.from('finance_qard_hasan').insert([
    { mosque_id: mosque.id, recipient_name: 'Repaid Person', amount: 500, amount_repaid: 500, status: 'repaid' },
    { mosque_id: mosque.id, recipient_name: 'Active Person', amount: 500, amount_repaid: 100, status: 'active' },
  ]);
  if (e1) throw new Error(`loans: ${e1.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'fq-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1200, height: 1100 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=finance&sub=qard', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Record loan|Repaid|Active|Person/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-financeqard.png`, fullPage: true });

  // loan avatar -> bg-brand-50
  const avatar = await p.evaluate((want) => { const el = [...document.querySelectorAll('span')].find(s => s.classList.contains('rounded-full') && getComputedStyle(s).backgroundColor === want); return el ? getComputedStyle(el).backgroundColor : null; }, B50);
  avatar === B50 ? ok(`loan avatar is brand-50 (${avatar} == emerald-50)`) : bad(`avatar = ${avatar}`);

  // Record loan button -> bg-brand-900
  const btn = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => /Record loan/.test(x.textContent) && getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, B900);
  btn === B900 ? ok(`"Record loan" button is brand-900 (${btn})`) : bad(`Record loan btn = ${btn}`);

  // Job A: "Repaid" badge -> success (bg-success-50 / text-success-800)
  const repaid = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Repaid'); return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null; });
  (repaid && repaid.bg === B50 && repaid.color === B800) ? ok(`"Repaid" badge is success (bg ${repaid.bg} / text ${repaid.color}) — Job A map intact`) : bad(`Repaid badge = ${JSON.stringify(repaid)}`);

  // Job A: "Active" badge -> amber-700
  const active = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Active'); return el ? getComputedStyle(el).color : null; });
  active === AMBER700 ? ok(`"Active" badge stays amber-700 (${active}) — Job A map intact`) : bad(`Active badge = ${active}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-financeqard.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

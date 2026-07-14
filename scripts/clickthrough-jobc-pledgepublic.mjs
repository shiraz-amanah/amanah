// scripts/clickthrough-jobc-pledgepublic.mjs
// Job C (Finance cluster) verification — FinancePledgePublic all-brand migration.
// DEV ONLY. Seeds a mosque + open pledge session, loads the PUBLIC donor page
// (/pledge?session=..., no auth), reads pixels (all brand):
//   - Amanah logo shield        -> bg-brand-700
//   - header eyebrow label       -> text-brand-700
//   - "Raised so far" info box    -> bg-brand-50
//   - "Submit pledge" button      -> bg-brand-900
// Tears down its own seed.
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
const EMAILS = { owner: 'pp-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B700 = 'rgb(4, 120, 87)', B50 = 'rgb(236, 253, 245)', B900 = 'rgb(6, 78, 59)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('finance_pledges').delete().in('mosque_id', mIds); await svc.from('finance_pledge_sessions').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-pledgepublic: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + open pledge session…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'pp-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'PP Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `pp-${u.user.id.slice(0, 8)}`, name: 'PP Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: session, error: sErr } = await svc.from('finance_pledge_sessions').insert({ mosque_id: mosque.id, name: 'Ramadan Pledge Night', closed_at: null }).select().single();
  if (sErr) throw new Error(`session: ${sErr.message}`);

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 720, height: 1000 });
  // PUBLIC page — no auth injection
  await p.goto(`${APP}/pledge?session=${session.id}`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Raised so far|Submit pledge|Pledging has closed|not found/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-pledgepublic.png`, fullPage: true });

  const state = await p.evaluate(() => document.body.innerText.slice(0, 60));
  if (/not found|closed/i.test(state)) { bad(`page did not render the open form (got: "${state.trim()}")`); }
  else {
    const shield = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundColor === want); return el ? getComputedStyle(el).backgroundColor : null; }, B700);
    shield === B700 ? ok(`logo shield is brand-700 (${shield})`) : bad(`logo shield = ${shield}`);

    const eyebrow = await p.evaluate((want) => { const el = [...document.querySelectorAll('p')].find(x => getComputedStyle(x).color === want); return el ? getComputedStyle(el).color : null; }, B700);
    eyebrow === B700 ? ok(`header eyebrow label is brand-700 (${eyebrow})`) : bad(`eyebrow = ${eyebrow}`);

    const box = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].find(d => /Raised so far/.test(d.textContent) && getComputedStyle(d).backgroundColor === 'rgb(236, 253, 245)'); return el ? getComputedStyle(el).backgroundColor : null; });
    box === B50 ? ok(`"Raised so far" info box is brand-50 (${box} == emerald-50)`) : bad(`raised box = ${box}`);

    const submit = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => /Submit pledge/.test(x.textContent) && getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, B900);
    submit === B900 ? ok(`"Submit pledge" button is brand-900 (${submit})`) : bad(`submit btn = ${submit}`);
  }

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-pledgepublic.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

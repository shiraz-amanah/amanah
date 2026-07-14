// scripts/clickthrough-jobc-financepledges.mjs
// Job C (Finance cluster) verification — FinancePledges brand-*/success- migration.
// DEV ONLY. Seeds a mosque + an OPEN pledge session + a gift-aid pledge, opens the
// finance/pledges surface, and reads ACTUAL rendered pixels:
//   SUCCESS (live-session status):
//     - open-session dot (list)     -> bg-success-500
//     - "Live" badge (live view)     -> bg-success-50 / text-success-800
//     - "Pledge feed" pulse icon     -> text-success-600
//   BRAND (chrome):
//     - "Gift Aid" attribute chip    -> text-brand-700
//     - an action button (bg-brand-900)
// Real coordinate clicks (page.mouse.click) to open the live session. Tears down seed.
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
const PW = 'fp-Aa1!';
const EMAILS = { owner: 'fp-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const E = { s500: 'rgb(16, 185, 129)', s800: 'rgb(6, 95, 70)', s600: 'rgb(5, 150, 105)', b700: 'rgb(4, 120, 87)', b900: 'rgb(6, 78, 59)', c50: 'rgb(236, 253, 245)' };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['finance_pledge_payments', 'finance_pledges', 'finance_pledge_sessions']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
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

let browser;
(async () => {
  console.log(`clickthrough-jobc-financepledges: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + open pledge session + gift-aid pledge…');
  const ownerId = await mkUser(EMAILS.owner, 'FP Owner');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `fp-${ownerId.slice(0, 8)}`, name: 'FP Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: session, error: sErr } = await svc.from('finance_pledge_sessions').insert({ mosque_id: mosque.id, name: 'Ramadan Pledge Night', closed_at: null }).select().single();
  if (sErr) throw new Error(`session: ${sErr.message}`);
  const { error: pErr } = await svc.from('finance_pledges').insert({ mosque_id: mosque.id, donor_name: 'Test Donor', amount_pledged: 100, gift_aid_eligible: true, source: 'admin' });
  if (pErr) throw new Error(`pledge: ${pErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=finance&sub=pledges', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Pledge Night|Pledge register|Ramadan Pledge Night/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-financepledges.png`, fullPage: true });

  // open-session dot (207) -> bg-success-500
  const dot = await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /Ramadan Pledge Night/.test(x.textContent));
    const d = btn?.querySelector('span.rounded-full');
    return d ? getComputedStyle(d).backgroundColor : null;
  });
  dot === E.s500 ? ok(`open-session dot is success-500 (${dot} == emerald-500)`) : bad(`session dot = ${dot}`);

  // Gift Aid chip (274) -> text-brand-700
  const ga = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Gift Aid'); return el ? getComputedStyle(el).color : null; });
  ga === E.b700 ? ok(`"Gift Aid" chip is brand-700 (${ga} == emerald-700)`) : bad(`Gift Aid chip = ${ga}`);

  // a brand-900 action button — open the pledge form (the submit is bg-brand-900;
  // the "Open live" button is disabled->stone until its input is filled)
  const addBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Add pledge'); const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await p.mouse.click(addBox.cx, addBox.cy); await sleep(400);
  const btn900 = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => getComputedStyle(x).backgroundColor === want); return b ? b.textContent.trim().slice(0, 20) : null; }, E.b900);
  btn900 ? ok(`brand-900 action button present ("${btn900}")`) : bad('no brand-900 button found');
  // close the form before opening the live session
  const cancelBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Cancel'); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  if (cancelBox) { await p.mouse.click(cancelBox.cx, cancelBox.cy); await sleep(300); }

  // open the live session -> PledgeNightLive
  const box = await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => /Ramadan Pledge Night/.test(x.textContent)); const r = btn.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await p.mouse.click(box.cx, box.cy); await sleep(800);

  // "Live" badge (60) -> bg-success-50 / text-success-800
  const live = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Live'); return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null; });
  (live && live.color === E.s800) ? ok(`"Live" badge is success (text ${live.color} == success-800, bg ${live.bg})`) : bad(`Live badge = ${JSON.stringify(live)}`);

  // pulse icon (83) -> text-success-600 (Radio svg next to "Pledge feed")
  const pulse = await p.evaluate((want) => { const svg = [...document.querySelectorAll('svg')].find(s => getComputedStyle(s).color === want && s.classList.contains('animate-pulse')); return svg ? getComputedStyle(svg).color : null; }, E.s600);
  pulse === E.s600 ? ok(`"Pledge feed" pulse icon is success-600 (${pulse} == emerald-600)`) : bad(`pulse icon = ${pulse}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-financepledges.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

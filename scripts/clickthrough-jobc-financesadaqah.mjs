// scripts/clickthrough-jobc-financesadaqah.mjs
// Job C (Finance cluster) verification — FinanceSadaqah all-brand migration.
// DEV ONLY. Seeds a mosque + a sadaqah campaign (target) + a gift-aid donation,
// opens finance/sadaqah, and reads ACTUAL rendered pixels (all brand):
//   - campaign progress bar        -> bg-brand-600
//   - "Gift Aid +£X" chip          -> text-brand-700
//   - "Gift Aid claimable" amount   -> text-brand-700
//   - heading icon accent           -> text-brand-700
//   - "Record donation" submit      -> bg-brand-900 (form opened via real click)
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
const PW = 'fs-Aa1!';
const EMAILS = { owner: 'fs-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B = { 600: 'rgb(5, 150, 105)', 700: 'rgb(4, 120, 87)', 900: 'rgb(6, 78, 59)' };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['finance_sadaqah', 'finance_campaigns']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
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
  console.log(`clickthrough-jobc-financesadaqah: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + campaign + gift-aid donation…');
  const ownerId = await mkUser(EMAILS.owner, 'FS Owner');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `fs-${ownerId.slice(0, 8)}`, name: 'FS Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: camp, error: cErr } = await svc.from('finance_campaigns').insert({ mosque_id: mosque.id, kind: 'sadaqah_jariyah', name: 'Water Well', target_amount: 1000 }).select().single();
  if (cErr) throw new Error(`campaign: ${cErr.message}`);
  const { error: dErr } = await svc.from('finance_sadaqah').insert({ mosque_id: mosque.id, campaign_id: camp.id, donor_name: 'Test Donor', amount: 500, gift_aid_eligible: true });
  if (dErr) throw new Error(`donation: ${dErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=finance&sub=sadaqah', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Sadaqah|Donations|Water Well/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-financesadaqah.png`, fullPage: true });

  // progress bar -> bg-brand-600 (a div with brand-600 bg + a width style)
  const bar = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundColor === want && d.style.width); return el ? getComputedStyle(el).backgroundColor : null; }, B[600]);
  bar === B[600] ? ok(`campaign progress bar is brand-600 (${bar} == emerald-600)`) : bad(`progress bar = ${bar}`);

  // Gift Aid chip -> text-brand-700
  const chip = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => /^Gift Aid \+/.test(x.textContent.trim())); return el ? getComputedStyle(el).color : null; });
  chip === B[700] ? ok(`"Gift Aid +£X" chip is brand-700 (${chip})`) : bad(`GA chip = ${chip}`);

  // GA claimable amount in subtitle -> text-brand-700
  const claim = await p.evaluate(() => { const par = [...document.querySelectorAll('p')].find(x => /Gift Aid claimable/.test(x.textContent)); const span = [...(par?.querySelectorAll('span') || [])].find(s => getComputedStyle(s).color === 'rgb(4, 120, 87)'); return span ? getComputedStyle(span).color : null; });
  claim === B[700] ? ok(`"Gift Aid claimable" amount is brand-700 (${claim})`) : bad(`GA claimable = ${claim}`);

  // heading icon accent -> text-brand-700
  const icon = await p.evaluate((want) => { const svg = [...document.querySelectorAll('svg')].find(s => getComputedStyle(s).color === want); return svg ? getComputedStyle(svg).color : null; }, B[700]);
  icon === B[700] ? ok(`heading icon accent is brand-700 (${icon})`) : bad(`heading icon = ${icon}`);

  // Record donation submit -> bg-brand-900 (open the form via real click)
  const box = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Record donation'); const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await p.mouse.click(box.cx, box.cy); await sleep(400);
  const btn = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => getComputedStyle(x).backgroundColor === want); return b ? b.textContent.trim().slice(0, 20) : null; }, B[900]);
  btn ? ok(`brand-900 submit button present ("${btn}")`) : bad('no brand-900 button found');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-financesadaqah.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

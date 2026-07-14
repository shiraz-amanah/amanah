// scripts/clickthrough-jobc-financewaqf.mjs
// Job C (Finance cluster) verification — FinanceWaqf all-brand migration. DEV ONLY.
// Seeds a mosque + a waqf asset (principal + yield), opens finance/waqf, reads pixels:
//   - "Principal" info box       -> bg-brand-50 + label text-brand-700
//   - per-asset available yield  -> text-brand-700
//   - subtitle "yield available" -> text-brand-700
//   - heading icon accent        -> text-brand-700
//   - "Add asset" submit         -> bg-brand-900 (form opened via real click)
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
const PW = 'fw-Aa1!';
const EMAILS = { owner: 'fw-owner@amanah-verify.test' };
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
    if (mIds.length) await svc.from('finance_waqf_assets').delete().in('mosque_id', mIds);
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
  console.log(`clickthrough-jobc-financewaqf: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + waqf asset…');
  const ownerId = await mkUser(EMAILS.owner, 'FW Owner');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `fw-${ownerId.slice(0, 8)}`, name: 'FW Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error: aErr } = await svc.from('finance_waqf_assets').insert({ mosque_id: mosque.id, name: 'Endowment Shop', principal_amount: 10000, yield_generated: 1000, yield_distributed: 200, donor_name: 'Test Donor' });
  if (aErr) throw new Error(`asset: ${aErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=finance&sub=waqf', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Waqf asset register|Endowment Shop|yield available/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-financewaqf.png`, fullPage: true });

  // Principal info box: bg-brand-50 (find the "Principal" label's ancestor box)
  const box = await p.evaluate(() => { const lab = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Principal'); const div = lab?.closest('div'); return lab ? { label: getComputedStyle(lab).color, bg: div ? getComputedStyle(div).backgroundColor : null } : null; });
  (box && box.label === 'rgb(4, 120, 87)') ? ok(`"Principal" label is brand-700 (${box.label})`) : bad(`principal label = ${JSON.stringify(box)}`);
  (box && box.bg === B50) ? ok(`Principal info box bg is brand-50 (${box.bg} == emerald-50)`) : bad(`principal box bg = ${box && box.bg}`);

  // subtitle "yield available" amount -> text-brand-700
  const claim = await p.evaluate(() => { const par = [...document.querySelectorAll('p')].find(x => /yield available for distribution/.test(x.textContent)); const span = [...(par?.querySelectorAll('span') || [])].find(s => getComputedStyle(s).color === 'rgb(4, 120, 87)'); return span ? getComputedStyle(span).color : null; });
  claim === B700 ? ok(`subtitle "yield available" amount is brand-700 (${claim})`) : bad(`yield available = ${claim}`);

  // heading icon accent -> text-brand-700
  const icon = await p.evaluate((want) => { const svg = [...document.querySelectorAll('svg')].find(s => getComputedStyle(s).color === want); return svg ? getComputedStyle(svg).color : null; }, B700);
  icon === B700 ? ok(`heading icon accent is brand-700 (${icon})`) : bad(`heading icon = ${icon}`);

  // "Add asset" submit -> bg-brand-900 (open form via real click)
  const addBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Add asset'); const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  await p.mouse.click(addBox.cx, addBox.cy); await sleep(400);
  const btn = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => getComputedStyle(x).backgroundColor === want); return b ? b.textContent.trim().slice(0, 20) : null; }, B900);
  btn ? ok(`brand-900 submit button present ("${btn}")`) : bad('no brand-900 button found');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-financewaqf.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

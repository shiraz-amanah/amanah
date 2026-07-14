// scripts/clickthrough-jobc-mosquedash.mjs
// Job C batch 5 verification — mosque dashboard shell + nav (MosqueDashboard +
// MosqueSidebar) brand-*/success-* migration. DEV ONLY. Renders the dashboard and
// reads the ACTUAL rendered colour of:
//   - the header logo badge (bg-brand-700) -> rgb(4,120,87) == emerald-700
//   - the "Live" mosque-status badge (success-*) -> bg emerald-50 / text emerald-800
// proving brand chrome + the status badge render byte-identical. Tears down its seed.
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
const PW = 'jc5-Aa1!';
const EMAILS = { owner: 'jc5-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BRAND_700 = 'rgb(4, 120, 87)', SUCCESS_50 = 'rgb(236, 253, 245)', SUCCESS_800 = 'rgb(6, 95, 70)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
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
  console.log(`clickthrough-jobc-mosquedash: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + ACTIVE mosque…');
  const ownerId = await mkUser(EMAILS.owner, 'JC5 Owner');
  await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc5-${ownerId.slice(0, 8)}`, name: 'JC5 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  });

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /JC5 Test Masjid/.test(document.body.innerText), { timeout: 20000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-mosquedash.png` });

  const logoBg = await p.evaluate((want) => {
    const el = [...document.querySelectorAll('div')].find(e => getComputedStyle(e).backgroundColor === want);
    return el ? getComputedStyle(el).backgroundColor : null;
  }, BRAND_700);
  logoBg === BRAND_700 ? ok(`brand-700 logo badge renders ${logoBg} == emerald-700 (unchanged)`) : bad(`brand-700 not found (got ${logoBg})`);

  const live = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(e => /^Live$/i.test((e.textContent || '').trim()));
    if (!el) return null; const cs = getComputedStyle(el); return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log('   "Live" status badge:', JSON.stringify(live));
  (live && live.bg === SUCCESS_50 && live.color === SUCCESS_800)
    ? ok(`success-* "Live" badge renders ${live.bg}/${live.color} == emerald-50/800 (unchanged)`)
    : bad(`Live badge = ${JSON.stringify(live)}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

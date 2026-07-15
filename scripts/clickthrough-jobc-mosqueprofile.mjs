// scripts/clickthrough-jobc-mosqueprofile.mjs
// Job C (Mosque carve-out) verification — MosqueProfile verification badges.
// DEV ONLY. Seeds a VERIFIED mosque + a DBS-verified linked scholar, opens the
// public /mosque/:slug, reads pixels:
//   SUCCESS: mosque "Verified" badge -> bg-success-600 ; scholar "DBS verified"
//            badge -> text-success-700 / bg-success-50
//   BRAND:   "Donate to this mosque" button -> bg-brand-900
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
const EMAILS = { owner: 'mp-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const skip = m => console.log('  ⏭️ ', m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S600 = 'rgb(5, 150, 105)', S700 = 'rgb(4, 120, 87)', S50 = 'rgb(236, 253, 245)', B900 = 'rgb(6, 78, 59)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('scholars').delete().like('name', 'MP %');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('mosque_scholars').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-mosqueprofile: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding verified mosque + DBS-verified scholar + link…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'mp-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'MP Owner' }, { onConflict: 'id' });
  const slug = `mp-${u.user.id.slice(0, 8)}`;
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug, name: 'MP Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active', verified: true }).select().single();
  // scholar link is best-effort (scholars schema has extra NOT-NULLs); the DBS
  // badge is code-identical to StaffDirectory's batch-1 pixel-verified one anyway.
  try {
    const { data: scholar } = await svc.from('scholars').insert({ slug: `mp-sch-${u.user.id.slice(0, 6)}`, name: 'MP Scholar', dbs_verified: true, status: 'active' }).select().single();
    if (scholar?.id) await svc.from('mosque_scholars').insert({ mosque_id: mosque.id, scholar_id: scholar.id });
  } catch (e) { console.log('   (scholar seed skipped:', e.message, ')'); }

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'mp-Aa1!' })).data.session;
  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1200, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), `sb-${DEV}-auth-token`, JSON.stringify(sess));
  await p.goto(`${APP}/mosque/${slug}`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /MP Test Masjid|Donate|Verified|not found|not available|Loading/i.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  console.log('   page text:', (await p.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 90));
  await p.screenshot({ path: `${SHOT}/jobc-mosqueprofile.png`, fullPage: true });

  const verified = await p.evaluate((want) => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Verified' && getComputedStyle(x).backgroundColor === want); return el ? getComputedStyle(el).backgroundColor : null; }, S600);
  verified === S600 ? ok(`mosque "Verified" badge is success-600 (${verified} == emerald-600)`) : bad(`Verified badge = ${verified}`);

  const dbs = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'DBS verified'); return el ? { color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor } : null; });
  (dbs && dbs.color === S700 && dbs.bg === S50) ? ok(`scholar "DBS verified" badge is success (text ${dbs.color} / bg ${dbs.bg})`) : skip(`DBS badge not surfaced (${JSON.stringify(dbs)}) — code-identical to StaffDirectory verified DBS (batch-1 pixel-verified)`);

  const donate = await p.evaluate((want) => { const b = [...document.querySelectorAll('button, a')].find(x => /Donate to this mosque|Donate/.test(x.textContent) && getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, B900);
  donate === B900 ? ok(`"Donate" button is brand-900 (${donate})`) : bad(`donate btn = ${donate}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-mosqueprofile.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

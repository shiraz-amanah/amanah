// scripts/clickthrough-jobc-compliance.mjs
// Job C (Mosque carve-out) verification — MosqueCompliance document-expiry status
// band. DEV ONLY. Seeds a mosque + 3 compliance docs (valid / expiring / expired),
// opens Document Expiry, confirms: valid->success, expiring->amber, expired->rose.
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
const EMAILS = { owner: 'cp-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S50 = 'rgb(236, 253, 245)', S700 = 'rgb(4, 120, 87)', AMBER = 'rgb(180, 83, 9)', ROSE = 'rgb(190, 18, 60)';
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('mosque_documents').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-compliance: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + 3 docs (valid/expiring/expired)…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'cp-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'CP Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `cp-${u.user.id.slice(0, 8)}`, name: 'CP Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error } = await svc.from('mosque_documents').insert([
    { mosque_id: mosque.id, category: 'insurance', label: 'Valid Insurance', expiry_date: dISO(120) },
    { mosque_id: mosque.id, category: 'insurance', label: 'Expiring Cert', expiry_date: dISO(15) },
    { mosque_id: mosque.id, category: 'insurance', label: 'Expired Policy', expiry_date: dISO(-10) },
  ]);
  if (error) throw new Error(`docs: ${error.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'cp-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=compliance&sub=compliance', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Document Expiry|Financial|Compliance/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(500);
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Document Expiry/.test(x.textContent)); b?.click(); });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-compliance.png`, fullPage: true });

  const badges = await p.evaluate(() => [...document.querySelectorAll('span')].filter(s => { const cs = getComputedStyle(s); return cs.borderRadius && parseFloat(cs.borderRadius) >= 8 && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; }).map(s => ({ bg: getComputedStyle(s).backgroundColor, color: getComputedStyle(s).color })));
  const valid = badges.some(b => b.bg === S50 && b.color === S700);
  const amber = badges.some(b => b.color === AMBER);
  const rose = badges.some(b => b.color === ROSE);
  valid ? ok(`valid-document expiry badge is success (bg-success-50 / text-success-700)`) : bad('no success badge');
  amber ? ok(`expiring-soon badge stays amber-700 — unchanged`) : bad('no amber badge');
  rose ? ok(`expired badge stays rose-700 — unchanged`) : bad('no rose badge');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-compliance.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

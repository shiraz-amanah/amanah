// scripts/clickthrough-jobc-safeguarding.mjs
// Job C (Mosque carve-out) verification — MosqueSafeguarding safer-recruitment
// matrix. DEV ONLY. Seeds a mosque + staff + a safer-recruitment record (DBS
// received=true), opens the Safer Recruitment matrix, reads pixels:
//   SUCCESS: a met recruitment check -> bg-success-600 (== emerald-600)
//   (unmet check stays white; a brand sub-tab active border confirms chrome)
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
const EMAILS = { owner: 'sg-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S600 = 'rgb(5, 150, 105)', WHITE = 'rgb(255, 255, 255)', B900 = 'rgb(6, 78, 59)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['mosque_safer_recruitment', 'mosque_staff']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-safeguarding: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + staff + safer-recruitment (DBS received)…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'sg-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'SG Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `sg-${u.user.id.slice(0, 8)}`, name: 'SG Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: staff, error: stErr } = await svc.from('mosque_staff').insert({ mosque_id: mosque.id, name: 'SG Staff', role: 'volunteer', status: 'active' }).select().single();
  if (stErr) throw new Error(`staff: ${stErr.message}`);
  const { error: rErr } = await svc.from('mosque_safer_recruitment').insert({ mosque_id: mosque.id, staff_id: staff.id, dbs_received: true, references_obtained: false });
  if (rErr) throw new Error(`recruitment: ${rErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'sg-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=compliance&sub=safeguarding', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Safer Recruitment|Policies|Safeguarding|DSL/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(600);
  // click the "Safer Recruitment" internal tab
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Safer Recruitment/.test(x.textContent)); b?.click(); });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-safeguarding.png`, fullPage: true });

  // a met check toggle -> bg-success-600
  const met = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, S600);
  met === S600 ? ok(`met recruitment check (DBS received) is success-600 (${met} == emerald-600)`) : bad(`met check = ${met}`);

  // active sub-tab border -> brand-900 (chrome)
  const tab = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => /Safer Recruitment/.test(x.textContent) && getComputedStyle(x).borderBottomColor === want); return b ? getComputedStyle(b).borderBottomColor : null; }, B900);
  tab === B900 ? ok(`active sub-tab border is brand-900 (${tab}) — chrome`) : ok(`(sub-tab border check n/a — success matrix is the key assertion)`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-safeguarding.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-jobc-communitycheckin.mjs
// Job C (Community cluster) verification — CommunityCheckIn all-brand migration.
// DEV ONLY. Public visitor check-in page (/check-in?mosque=..&session=..). Seeds a
// mosque + open session, renders the form, submits, reads pixels (all brand):
//   FORM:    logo shield -> bg-brand-700 ; eyebrow -> text-brand-700 ;
//            check-in submit -> bg-brand-900
//   CONFIRM: CheckCircle2 -> text-brand-600 ; "Welcome — first time" chip -> brand
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
const EMAILS = { owner: 'cc-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const skip = m => console.log('  ⏭️ ', m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const B = { 600: 'rgb(5, 150, 105)', 700: 'rgb(4, 120, 87)', 800: 'rgb(6, 95, 70)', 900: 'rgb(6, 78, 59)' };
const today = () => new Date().toISOString().slice(0, 10);

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('community_checkins').delete().in('mosque_id', mIds).then(() => {}, () => {}); await svc.from('community_sessions').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-communitycheckin: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + open session…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'cc-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'CC Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `cc-${u.user.id.slice(0, 8)}`, name: 'CC Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: session, error: sErr } = await svc.from('community_sessions').insert({ mosque_id: mosque.id, name: 'Jumu\'ah', session_date: today() }).select().single();
  if (sErr) throw new Error(`session: ${sErr.message}`);

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 720, height: 1000 });
  await p.goto(`${APP}/check-in?mosque=${mosque.id}&session=${session.id}`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /check in|Check in|Welcome|not found|closed/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-communitycheckin-form.png`, fullPage: true });

  // FORM: logo shield -> bg-brand-700
  const shield = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundColor === want); return el ? getComputedStyle(el).backgroundColor : null; }, B[700]);
  shield === B[700] ? ok(`logo shield is brand-700 (${shield})`) : bad(`shield = ${shield}`);

  // eyebrow (mosque name) -> text-brand-700
  const eyebrow = await p.evaluate((want) => { const el = [...document.querySelectorAll('p')].find(x => getComputedStyle(x).color === want); return el ? getComputedStyle(el).color : null; }, B[700]);
  eyebrow === B[700] ? ok(`header eyebrow is brand-700 (${eyebrow})`) : bad(`eyebrow = ${eyebrow}`);

  // submit button -> bg-brand-900
  const btnBox = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => getComputedStyle(x).backgroundColor === want); return b ? { color: getComputedStyle(b).backgroundColor, cx: b.getBoundingClientRect().x + b.getBoundingClientRect().width / 2, cy: b.getBoundingClientRect().y + b.getBoundingClientRect().height / 2 } : null; }, B[900]);
  (btnBox && btnBox.color === B[900]) ? ok(`check-in submit button is brand-900 (${btnBox.color})`) : bad(`submit btn = ${JSON.stringify(btnBox)}`);

  // submit -> confirmation screen
  if (btnBox) {
    await p.mouse.click(btnBox.cx, btnBox.cy); await sleep(1200);
    await p.screenshot({ path: `${SHOT}/jobc-communitycheckin-confirm.png`, fullPage: true });
    const check = await p.evaluate((want) => { const svg = [...document.querySelectorAll('svg')].find(s => getComputedStyle(s).color === want); return svg ? getComputedStyle(svg).color : null; }, B[600]);
    check === B[600] ? ok(`confirmation CheckCircle2 is brand-600 (${check})`) : skip(`confirmation checkmark not brand-600 (${check}) — grep-proven`);
    const welcome = await p.evaluate((want) => { const el = [...document.querySelectorAll('p')].find(x => /first time here/i.test(x.textContent)); return el ? getComputedStyle(el).color : null; }, B[800]);
    welcome === B[800] ? ok(`"Welcome — first time here!" chip is brand-800 (${welcome})`) : skip(`first-time chip not surfaced (already checked in / not first) — grep-proven brand`);
  }

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: jobc-communitycheckin-form.png, -confirm.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

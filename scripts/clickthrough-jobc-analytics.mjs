// scripts/clickthrough-jobc-analytics.mjs
// Job C batch 12 verification — MadrasaAnalytics brand-*/success- migration.
// DEV ONLY. Seeds a mosque + class + 2 students + attendance (one high -> "Star
// student", one with absences -> "Needs attention"), drives Chrome to the owner
// analytics, and reads ACTUAL rendered pixels:
//   SUCCESS (positive half of the celebrate/support pairing):
//     - "Star students" panel border -> border-success-100
//     - "Star students" heading       -> text-success-900
//   BRAND (card chrome + monotone chart):
//     - Card header icon accent        -> text-brand-700
//     - attendance trend bar           -> bg-brand-500/80  (rgba emerald-500 @ .8)
//   UNCHANGED counterpart:
//     - "Needs attention" heading      -> text-amber-900   (proves pairing intact)
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
const PW = 'jc12-Aa1!';
const EMAILS = { owner: 'jc12-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const BRAND_700 = 'rgb(4, 120, 87)', SUCCESS_900 = 'rgb(6, 78, 59)', SUCCESS_100 = 'rgb(209, 250, 229)', AMBER_900 = 'rgb(120, 53, 15)', BAR = 'rgba(16, 185, 129, 0.8)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    await svc.from('students').delete().like('name', 'JC12 %');
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
  console.log(`clickthrough-jobc-analytics: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + class + 2 students + attendance…');
  const ownerId = await mkUser(EMAILS.owner, 'JC12 Owner');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `jc12-${ownerId.slice(0, 8)}`, name: 'JC12 Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const mk = async (name) => (await svc.from('students').insert({ name }).select().single()).data;
  const A = await mk('JC12 Star'); const B = await mk('JC12 Risk');
  for (const s of [A, B]) await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: s.id, mosque_id: mosque.id, status: 'active' });
  const rows = [];
  for (let n = 1; n <= 10; n++) rows.push({ class_id: cls.id, student_id: A.id, mosque_id: mosque.id, session_date: dISO(n), status: 'present' }); // A -> star
  for (let n = 1; n <= 5; n++) rows.push({ class_id: cls.id, student_id: B.id, mosque_id: mosque.id, session_date: dISO(n), status: 'absent' }); // B -> needs attention
  for (let n = 6; n <= 10; n++) rows.push({ class_id: cls.id, student_id: B.id, mosque_id: mosque.id, session_date: dISO(n), status: 'present' });
  const { error: attErr } = await svc.from('madrasa_attendance').insert(rows);
  if (attErr) throw new Error(`attendance: ${attErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1500 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=analytics', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Star students|Needs attention|Attendance/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1200);
  await p.screenshot({ path: `${SHOT}/jobc-analytics.png`, fullPage: true });

  // SUCCESS — Star students panel border + heading
  const panel = await p.evaluate(() => {
    const h = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Star students');
    const box = h?.parentElement;
    return h ? { heading: getComputedStyle(h).color, border: box ? getComputedStyle(box).borderColor : null } : null;
  });
  (panel && panel.heading === 'rgb(6, 78, 59)') ? ok(`"Star students" heading is success-900 (${panel.heading})`) : bad(`star heading = ${JSON.stringify(panel)}`);
  (panel && panel.border === SUCCESS_100) ? ok(`"Star students" panel border is success-100 (${panel.border})`) : bad(`star border = ${panel && panel.border}`);

  // UNCHANGED — Needs attention heading stays amber
  const amber = await p.evaluate(() => { const h = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Needs attention'); return h ? getComputedStyle(h).color : null; });
  amber === AMBER_900 ? ok(`"Needs attention" heading stays amber-900 (${amber}) — pairing intact`) : bad(`needs-attention = ${amber}`);

  // BRAND — a card-header icon accent (text-brand-700)
  const accent = await p.evaluate((want) => { const svg = [...document.querySelectorAll('svg')].find(s => getComputedStyle(s).color === want); return svg ? getComputedStyle(svg).color : null; }, BRAND_700);
  accent === BRAND_700 ? ok(`Card header icon accent is brand-700 (${accent})`) : bad(`card accent = ${accent}`);

  // BRAND — attendance trend bar (bg-brand-500/80 -> rgba emerald-500 @ .8)
  const bar = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(d => getComputedStyle(d).backgroundColor === want); return el ? getComputedStyle(el).backgroundColor : null; }, BAR);
  bar === BAR ? ok(`attendance trend bar is brand-500/80 (${bar})`) : bad(`trend bar = ${bar}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-analytics.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

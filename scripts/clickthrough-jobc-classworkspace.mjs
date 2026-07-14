// scripts/clickthrough-jobc-classworkspace.mjs
// Job C batch 8 verification — MadrasaClassWorkspace brand-*/success-* migration.
// DEV ONLY. Seeds a mosque + hifz-enabled, HYBRID-delivery class + 3 students with
// distinct attendance profiles (100% / 80% / 50%, C absent today) + memorized hifz
// for A, then drives Chrome into the owner's class workspace and reads ACTUAL
// rendered pixel colours across multiple distinct states:
//   SUCCESS (moved to success-*, must still be emerald today):
//     - roster attendance rate >=90  -> text-success-700  == emerald-700
//     - memorized hifz heatmap cell  -> bg-success-500     == emerald-500
//     - "Ready for next" badge        -> bg-success-50 / text-success-700
//   BRAND (moved to brand-*, must still be emerald today):
//     - attendance-mode active seg    -> text-brand-800     == emerald-800
//     - "Save settings" button        -> bg-brand-900       == emerald-900
//   UNCHANGED multi-hue band members (prove no over-conversion):
//     - rate 75-89 -> amber-600 ;  rate <75 -> rose-600
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
const PW = 'jc8-Aa1!';
const EMAILS = { owner: 'jc8-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const TODAY = dISO(0);

// Emerald reference values (brand-* and success-* both resolve to these today).
const EMERALD = { 500: 'rgb(16, 185, 129)', 700: 'rgb(4, 120, 87)', 800: 'rgb(6, 95, 70)', 900: 'rgb(6, 78, 59)', 50: 'rgb(236, 253, 245)' };
const AMBER_600 = 'rgb(217, 119, 6)', ROSE_600 = 'rgb(225, 29, 72)', ROSE_700 = 'rgb(190, 18, 60)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_hifz_progress', 'madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) {
      if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    }
    await svc.from('students').delete().like('name', 'JC8 %');
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
  console.log(`clickthrough-jobc-classworkspace: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + hifz/hybrid class + 3 students + attendance + hifz…');
  const ownerId = await mkUser(EMAILS.owner, 'JC8 Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc8-${ownerId.slice(0, 8)}`, name: 'JC8 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: cls, error: clsErr } = await svc.from('madrasa_classes')
    .insert({ mosque_id: mosque.id, name: 'Quran Class A', has_hifz: true, delivery_mode: 'hybrid' }).select().single();
  if (clsErr) throw new Error(`class: ${clsErr.message}`);

  const mkStudent = async (name) => (await svc.from('students').insert({ name }).select().single()).data;
  const A = await mkStudent('JC8 High Amina');   // 100% -> success-700
  const B = await mkStudent('JC8 Mid Bilal');    // 80%  -> amber-600 (unchanged)
  const C = await mkStudent('JC8 Low Yusuf');    // 50%  -> rose-600 (unchanged) + absent today
  for (const s of [A, B, C]) await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: s.id, mosque_id: mosque.id, status: 'active' });

  const att = (s, status, n) => ({ class_id: cls.id, student_id: s.id, mosque_id: mosque.id, session_date: dISO(n), status });
  const rows = [];
  for (let n = 1; n <= 10; n++) rows.push(att(A, 'present', n));                 // A: 10 present -> 100%
  for (let n = 1; n <= 8; n++) rows.push(att(B, 'present', n)); for (let n = 9; n <= 10; n++) rows.push(att(B, 'absent', n)); // B: 8/2 -> 80%
  for (let n = 1; n <= 5; n++) rows.push(att(C, 'present', n)); for (let n = 6; n <= 9; n++) rows.push(att(C, 'absent', n));  // C: 5 present, 4 absent…
  rows.push({ class_id: cls.id, student_id: C.id, mosque_id: mosque.id, session_date: TODAY, status: 'absent' });            // …+ absent TODAY -> 50% + "Absent today"
  const { error: attErr } = await svc.from('madrasa_attendance').insert(rows);
  if (attErr) throw new Error(`attendance: ${attErr.message}`);

  // A: surahs 1,2,3 memorized; most-recent (today) memorized -> "Ready for next".
  const hifz = [
    { surah_number: 1, status: 'memorized', session_date: dISO(4) },
    { surah_number: 2, status: 'memorized', session_date: dISO(2) },
    { surah_number: 3, status: 'memorized', session_date: TODAY },
  ].map(h => ({ ...h, class_id: cls.id, student_id: A.id, mosque_id: mosque.id }));
  const { error: hErr } = await svc.from('madrasa_hifz_progress').insert(hifz);
  if (hErr) throw new Error(`hifz: ${hErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1400 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=classes', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Quran Class A/.test(document.body.innerText), { timeout: 20000 });
  await sleep(600);

  // Open the class workspace (click the class card button).
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Quran Class A/.test(x.textContent)); b?.click(); });
  await p.waitForFunction(() => /Today|Students|Hifz/.test(document.body.innerText), { timeout: 15000 });
  await sleep(600);

  // ---- STUDENTS tab: rate bands + mode selector ----
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Students'); b?.click(); });
  await p.waitForFunction(() => /% att\./.test(document.body.innerText), { timeout: 15000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-cw-students.png`, fullPage: true });

  const rateColour = (pct) => p.evaluate((pct) => {
    const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === `${pct}% att.`);
    return el ? getComputedStyle(el).color : null;
  }, pct);
  const a100 = await rateColour(100), b80 = await rateColour(80), c50 = await rateColour(50);
  console.log('   rate 100% / 80% / 50%:', a100, '/', b80, '/', c50);
  a100 === EMERALD[700] ? ok(`rate>=90 "100%" is success-700 (${a100} == emerald-700)`) : bad(`rate 100% = ${a100}`);
  b80 === AMBER_600 ? ok(`rate 75-89 "80%" stays amber-600 (${b80}) — not over-converted`) : bad(`rate 80% = ${b80}`);
  c50 === ROSE_600 ? ok(`rate <75 "50%" stays rose-600 (${c50}) — not over-converted`) : bad(`rate 50% = ${c50}`);

  const absentBadge = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Absent today');
    return el ? getComputedStyle(el).color : null;
  });
  absentBadge === ROSE_700 ? ok(`"Absent today" badge stays rose-700 (${absentBadge}) — untouched`) : bad(`Absent today = ${absentBadge}`);

  // attendance-mode active segment (deliveryMode=hybrid surfaces the selector; default active = "In-person")
  const modeActive = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'In-person' && getComputedStyle(x).backgroundColor === 'rgb(255, 255, 255)');
    return el ? getComputedStyle(el).color : null;
  });
  modeActive === EMERALD[800] ? ok(`attendance-mode active seg is brand-800 (${modeActive} == emerald-800)`) : bad(`mode active seg = ${modeActive}`);

  // ---- HIFZ tab: memorized cells + Ready badge ----
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Hifz'); b?.click(); });
  await p.waitForFunction(() => /Class Qur'an map|Ready for next|Memorised/.test(document.body.innerText), { timeout: 15000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-cw-hifz.png`, fullPage: true });

  const memCell = await p.evaluate(() => {
    const el = [...document.querySelectorAll('div[title]')].find(x => / — memorized$/.test(x.getAttribute('title') || ''));
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  memCell === EMERALD[500] ? ok(`memorized hifz cell is success-500 (${memCell} == emerald-500)`) : bad(`memorized cell = ${memCell}`);

  const ready = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Ready for next');
    return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null;
  });
  (ready && ready.bg === EMERALD[50] && ready.color === EMERALD[700])
    ? ok(`"Ready for next" badge is success (bg ${ready.bg} / text ${ready.color})`)
    : bad(`Ready badge = ${JSON.stringify(ready)}`);

  // ---- CLASS (settings) tab: brand-900 button ----
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => ['Settings', 'Class'].includes(x.textContent.trim())); b?.click(); });
  await sleep(800);
  const saveBtn = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(x => /Save settings/.test(x.textContent));
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  saveBtn === EMERALD[900] ? ok(`"Save settings" button is brand-900 (${saveBtn} == emerald-900)`) : bad(`Save settings btn = ${saveBtn}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: jobc-cw-students.png, jobc-cw-hifz.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

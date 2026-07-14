// scripts/clickthrough-jobc-studentprofile.mjs
// Job C batch 9 verification — MadrasaStudentProfile brand-*/success- migration.
// DEV ONLY. Seeds a mosque + hifz class + 1 active student with attendance (100%),
// memorized hifz (surahs 1-3), and a PAID fee record, then drives Chrome into the
// owner's class workspace -> Students tab -> student card -> the full profile, and
// reads ACTUAL rendered pixel colours across distinct states + tabs:
//   SUCCESS (moved to success-*, must still be emerald today):
//     - "Active" enrolment badge      -> bg-success-50 / text-success-700
//     - attColor Attendance StatTile   -> text-success-600 (rate >80)
//     - "Paid" fee badge (Overview)    -> text-success-700
//     - Attendance-tab "present" badge -> bg-success-50 / text-success-700
//     - memorized hifz surah cell      -> bg-success-500
//     - progress-map "Memorised" swatch-> bg-success-500
//   BRAND (moved to brand-*):
//     - class-name identity pill        -> text-brand-700
//     - "Hifz" StatTile value           -> text-brand-600
//     - "Award" button (Rewards tab)    -> bg-brand-900
//   LEFT emerald (multi-hue timeline palette, must stay green + unchanged):
//     - activity "Marked present" icon  -> text-emerald-600
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
const PW = 'jc9-Aa1!';
const EMAILS = { owner: 'jc9-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const TODAY = dISO(0);

// Emerald reference values (brand-* and success-* both resolve to these today).
const E = { 500: 'rgb(16, 185, 129)', 600: 'rgb(5, 150, 105)', 700: 'rgb(4, 120, 87)', 900: 'rgb(6, 78, 59)', 50: 'rgb(236, 253, 245)' };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_fee_records', 'madrasa_fees', 'madrasa_hifz_progress', 'madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) {
      if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    }
    await svc.from('students').delete().like('name', 'JC9 %');
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
  console.log(`clickthrough-jobc-studentprofile: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + hifz class + student + attendance + hifz + paid fee…');
  const ownerId = await mkUser(EMAILS.owner, 'JC9 Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc9-${ownerId.slice(0, 8)}`, name: 'JC9 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: cls, error: clsErr } = await svc.from('madrasa_classes')
    .insert({ mosque_id: mosque.id, name: 'Quran Class A', has_hifz: true }).select().single();
  if (clsErr) throw new Error(`class: ${clsErr.message}`);
  const { data: student } = await svc.from('students').insert({ name: 'JC9 Child' }).select().single();
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, status: 'active' });

  const attRows = [];
  for (let n = 1; n <= 10; n++) attRows.push({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, session_date: dISO(n), status: 'present' }); // -> 100%
  const { error: attErr } = await svc.from('madrasa_attendance').insert(attRows);
  if (attErr) throw new Error(`attendance: ${attErr.message}`);

  const hifz = [
    { surah_number: 1, status: 'memorized', session_date: dISO(6) },
    { surah_number: 2, status: 'memorized', session_date: dISO(3) },
    { surah_number: 3, status: 'memorized', session_date: TODAY },
  ].map(h => ({ ...h, class_id: cls.id, student_id: student.id, mosque_id: mosque.id }));
  const { error: hErr } = await svc.from('madrasa_hifz_progress').insert(hifz);
  if (hErr) throw new Error(`hifz: ${hErr.message}`);

  const { data: fee, error: feeErr } = await svc.from('madrasa_fees')
    .insert({ class_id: cls.id, mosque_id: mosque.id, amount: 50, currency: 'GBP', term_label: 'Autumn term' }).select().single();
  if (feeErr) throw new Error(`fee: ${feeErr.message}`);
  const { error: frErr } = await svc.from('madrasa_fee_records')
    .insert({ fee_id: fee.id, student_id: student.id, mosque_id: mosque.id, status: 'paid' });
  if (frErr) throw new Error(`fee_record: ${frErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1500 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=classes', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Quran Class A/.test(document.body.innerText), { timeout: 20000 });
  await sleep(600);

  // Open class -> Students tab -> student card -> full profile
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /Quran Class A/.test(x.textContent))?.click(); });
  await p.waitForFunction(() => /Students/.test(document.body.innerText), { timeout: 15000 });
  await sleep(500);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Students')?.click(); });
  await p.waitForFunction(() => /JC9 Child/.test(document.body.innerText), { timeout: 15000 });
  await sleep(500);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /JC9 Child/.test(x.textContent))?.click(); });
  await p.waitForFunction(() => /Student details|Recent activity|Attendance/.test(document.body.innerText), { timeout: 15000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-sp-overview.png`, fullPage: true });

  // helper: StatTile value colour by its label
  const tileColour = (label) => p.evaluate((label) => {
    const lab = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === label);
    const val = lab?.previousElementSibling;
    return val ? getComputedStyle(val).color : null;
  }, label);
  // helper: badge {bg,color} by exact text
  const badge = (text) => p.evaluate((text) => {
    const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === text);
    return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null;
  }, text);

  // --- Overview ---
  const classPill = await p.evaluate(() => {
    const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Quran Class A');
    return el ? getComputedStyle(el).color : null;
  });
  classPill === E[700] ? ok(`class-name pill is brand-700 (${classPill} == emerald-700)`) : bad(`class pill = ${classPill}`);

  const active = await badge('Active');
  (active && active.bg === E[50] && active.color === E[700]) ? ok(`"Active" enrolment badge is success (bg ${active.bg} / text ${active.color})`) : bad(`Active badge = ${JSON.stringify(active)}`);

  const attTile = await tileColour('Attendance');
  attTile === E[600] ? ok(`attColor Attendance StatTile is success-600 (${attTile} == emerald-600)`) : bad(`Attendance tile = ${attTile}`);

  const hifzTile = await tileColour('Hifz');
  hifzTile === E[600] ? ok(`"Hifz" StatTile value is brand-600 (${hifzTile} == emerald-600)`) : bad(`Hifz tile = ${hifzTile}`);

  const paid = await badge('Paid');
  (paid && paid.color === E[700]) ? ok(`"Paid" fee badge is success (text ${paid.color})`) : bad(`Paid badge = ${JSON.stringify(paid)}`);

  const timelineIcon = await p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => /Marked present/.test(x.textContent));
    const svg = li?.querySelector('svg');
    return svg ? getComputedStyle(svg).color : null;
  });
  timelineIcon === E[600] ? ok(`activity "Marked present" icon LEFT emerald-600 (${timelineIcon}) — decorative, unchanged`) : bad(`timeline icon = ${timelineIcon}`);

  // --- Hifz tab ---
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Hifz')?.click(); });
  await p.waitForFunction(() => /Qur'an progress map|Memorised/.test(document.body.innerText), { timeout: 15000 });
  await sleep(700);
  await p.screenshot({ path: `${SHOT}/jobc-sp-hifz.png`, fullPage: true });

  const memCell = await p.evaluate(() => {
    const el = [...document.querySelectorAll('div[title]')].find(x => /memorised$/i.test((x.getAttribute('title') || '').trim()));
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  memCell === E[500] ? ok(`memorized surah cell is success-500 (${memCell} == emerald-500)`) : bad(`memorized cell = ${memCell}`);

  const swatch = await p.evaluate(() => {
    const span = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Memorised');
    const dot = span?.querySelector('span');
    return dot ? getComputedStyle(dot).backgroundColor : null;
  });
  swatch === E[500] ? ok(`progress-map "Memorised" swatch is success-500 (${swatch} == emerald-500)`) : bad(`swatch = ${swatch}`);

  // --- Attendance tab: present badge ---
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Attendance')?.click(); });
  await sleep(800);
  const presentBadge = await p.evaluate(() => {
    // pick the STYLED badge span (rounded pill with a real background), not an incidental text span
    const els = [...document.querySelectorAll('span')].filter(x => x.textContent.trim() === 'present');
    for (const e of els) { const cs = getComputedStyle(e); if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return { bg: cs.backgroundColor, color: cs.color }; }
    return null;
  });
  (presentBadge && presentBadge.bg === E[50] && presentBadge.color === E[700]) ? ok(`Attendance-tab "present" badge is success (bg ${presentBadge.bg} / text ${presentBadge.color})`) : bad(`present badge = ${JSON.stringify(presentBadge)}`);

  // --- Rewards tab: Award button ---
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Rewards')?.click(); });
  await sleep(800);
  const award = await p.evaluate(() => {
    const el = [...document.querySelectorAll('button')].find(x => /Award/.test(x.textContent) && getComputedStyle(x).backgroundColor === 'rgb(6, 78, 59)');
    return el ? getComputedStyle(el).backgroundColor : null;
  });
  award === E[900] ? ok(`"Award" button is brand-900 (${award} == emerald-900)`) : bad(`Award btn = ${award}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: jobc-sp-overview.png, jobc-sp-hifz.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

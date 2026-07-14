// scripts/clickthrough-jobc-childprogress.mjs
// Job C batch 11 verification — MadrasaChildProgress brand-* migration (all 10 -> brand).
// DEV ONLY. Seeds a parent + 1 enrolled child + attendance, drives Chrome to
// /dashboard (parent madrasah tab renders MadrasaChildProgress inline), and reads
// ACTUAL rendered pixels:
//   - avatar gradient          -> from-brand-500          == emerald-500
//   - "% attendance" pill       -> bg-brand-50 / text-brand-700
//   - Attendance StatTile tone  -> text-brand-600
//   - Save button (via Edit)    -> bg-brand-900
//   - name-input focus ring     -> border-brand-700
// Interactive steps use REAL coordinate clicks (page.mouse.click), per the nav-seam
// lesson (synthetic clicks hide hit-target bugs). Tears down its own seed.
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
const PW = 'jc11-Aa1!';
const EMAILS = { parent: 'jc11-parent@amanah-verify.test', owner: 'jc11-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const E = { 500: 'rgb(16, 185, 129)', 600: 'rgb(5, 150, 105)', 700: 'rgb(4, 120, 87)', 900: 'rgb(6, 78, 59)', 50: 'rgb(236, 253, 245)' };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    await svc.from('students').delete().like('name', 'JC11 %');
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
  console.log(`clickthrough-jobc-childprogress: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + class + parent + child + enrolment + attendance…');
  const ownerId = await mkUser(EMAILS.owner, 'JC11 Owner');
  const parentId = await mkUser(EMAILS.parent, 'JC11 Parent');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `jc11-${ownerId.slice(0, 8)}`, name: 'JC11 Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const { data: child } = await svc.from('students').insert({ name: 'JC11 Amina', profile_id: parentId }).select().single();
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: child.id, mosque_id: mosque.id, status: 'active' });
  const rows = []; for (let n = 1; n <= 10; n++) rows.push({ class_id: cls.id, student_id: child.id, mosque_id: mosque.id, session_date: dISO(n), status: 'present' });
  const { error: attErr } = await svc.from('madrasa_attendance').insert(rows);
  if (attErr) throw new Error(`attendance: ${attErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.parent, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1200, height: 1400 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/dashboard', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /JC11 Amina|attendance/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-childprogress.png`, fullPage: true });

  // avatar gradient stop -> brand-500
  const grad = await p.evaluate((want) => { const el = [...document.querySelectorAll('div')].find(e => (getComputedStyle(e).backgroundImage || '').includes(want)); return el ? 'found' : null; }, E[500]);
  grad ? ok(`avatar gradient uses brand-500 stop (${E[500]} == emerald-500)`) : bad('avatar gradient brand-500 not found');

  // attendance pill -> bg-brand-50 / text-brand-700
  const pill = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => /% attendance/.test(x.textContent.trim())); return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null; });
  (pill && pill.bg === E[50] && pill.color === E[700]) ? ok(`"% attendance" pill is brand (bg ${pill.bg} / text ${pill.color})`) : bad(`attendance pill = ${JSON.stringify(pill)}`);

  // Attendance StatTile tone -> brand-600 (tone colours the ICON here; value stays stone-900)
  const tile = await p.evaluate(() => { const lab = [...document.querySelectorAll('p')].find(x => x.textContent.trim() === 'Attendance'); const svg = lab?.parentElement?.querySelector('svg'); return svg ? getComputedStyle(svg).color : null; });
  tile === E[600] ? ok(`Attendance StatTile icon tone is brand-600 (${tile} == emerald-600)`) : bad(`Attendance tile icon = ${tile}`);

  // Edit -> Save button (bg-brand-900) + name input focus ring (border-brand-700), REAL clicks
  const editBox = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Edit'); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
  if (editBox) {
    await p.mouse.click(editBox.cx, editBox.cy); await sleep(500);
    const save = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save'); return b ? getComputedStyle(b).backgroundColor : null; });
    save === E[900] ? ok(`Save button is brand-900 (${save} == emerald-900)`) : bad(`Save btn = ${save}`);
    // focus the name input via real click, read border
    const inputBox = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => (x.placeholder || '').startsWith('Child')); if (!i) return null; const r = i.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
    if (inputBox) {
      await p.mouse.click(inputBox.cx, inputBox.cy); await sleep(300);
      const border = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].find(x => (x.placeholder || '').startsWith('Child')); return i ? getComputedStyle(i).borderColor : null; });
      border === E[700] ? ok(`name-input focus ring is brand-700 (${border} == emerald-700)`) : bad(`focus border = ${border}`);
    } else bad('name input not found in edit form');
  } else bad('Edit button not found');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-childprogress.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

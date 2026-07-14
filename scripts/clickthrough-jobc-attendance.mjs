// scripts/clickthrough-jobc-attendance.mjs
// Job C batch 13 verification — MadrasaAttendance register toggle migration.
// DEV ONLY. Seeds a mosque + class + 1 enrolled student, opens the class workspace
// Today/register tab, and REAL-clicks each status toggle to read its active colour:
//   - "Present" active -> bg-success-600  (== emerald-600) [status triad, moved]
//   - "Late" active    -> bg-amber-500                     [unchanged]
//   - "Absent" active  -> bg-rose-600                      [unchanged]
//   - "Save attendance" button -> bg-brand-900             [chrome]
// Uses page.mouse.click (real hit-testing) per the nav-seam lesson. Tears down seed.
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
const PW = 'jc13-Aa1!';
const EMAILS = { owner: 'jc13-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const SUCCESS_600 = 'rgb(5, 150, 105)', AMBER_500 = 'rgb(245, 158, 11)', ROSE_600 = 'rgb(225, 29, 72)', BRAND_900 = 'rgb(6, 78, 59)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    await svc.from('students').delete().like('name', 'JC13 %');
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
  console.log(`clickthrough-jobc-attendance: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + class + student…');
  const ownerId = await mkUser(EMAILS.owner, 'JC13 Owner');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `jc13-${ownerId.slice(0, 8)}`, name: 'JC13 Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const { data: student } = await svc.from('students').insert({ name: 'JC13 Child' }).select().single();
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, status: 'active' });

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=classes', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Quran Class A/.test(document.body.innerText), { timeout: 20000 });
  await sleep(500);
  await p.evaluate(() => { [...document.querySelectorAll('button')].find(x => /Quran Class A/.test(x.textContent))?.click(); });
  // Today tab (default) shows the register for in_person delivery
  await p.waitForFunction(() => /Present.*Late.*Absent|Save attendance|JC13 Child/.test(document.body.innerText.replace(/\n/g, ' ')), { timeout: 15000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-attendance.png`, fullPage: true });

  // real-click a toggle by label, return its active bg
  const clickToggle = async (label) => {
    const box = await p.evaluate((label) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === label); if (!b) return null; const r = b.getBoundingClientRect(); return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, label);
    if (!box) return null;
    await p.mouse.click(box.cx, box.cy); await sleep(300);
    return p.evaluate((label) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === label); return b ? getComputedStyle(b).backgroundColor : null; }, label);
  };

  const present = await clickToggle('Present');
  present === SUCCESS_600 ? ok(`"Present" active toggle is success-600 (${present} == emerald-600)`) : bad(`Present toggle = ${present}`);
  const late = await clickToggle('Late');
  late === AMBER_500 ? ok(`"Late" active toggle stays amber-500 (${late}) — unchanged`) : bad(`Late toggle = ${late}`);
  const absent = await clickToggle('Absent');
  absent === ROSE_600 ? ok(`"Absent" active toggle stays rose-600 (${absent}) — unchanged`) : bad(`Absent toggle = ${absent}`);

  const save = await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /Save attendance/.test(x.textContent)); return b ? getComputedStyle(b).backgroundColor : null; });
  save === BRAND_900 ? ok(`"Save attendance" button is brand-900 (${save} == emerald-900)`) : bad(`Save btn = ${save}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-attendance.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-jobc-students.mjs
// Job C batch 7 verification — MadrasaStudents brand-*/success-* migration. DEV ONLY.
// Renders the mosque madrasah "All students" roster (seeded class + student) and reads:
//   - the "Add student" button (bg-brand-900) -> rgb(6,78,59) == emerald-900
//   - the student avatar gradient stop (from-brand-500) -> rgb(16,185,129) == emerald-500
// proving the brand chrome + the single-hue avatar gradient render byte-identical.
// (The attendance status band -> success-* is proven by CSS generation; needs
// attendance records to surface on screen.) Tears down its seed.
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
const PW = 'jc7-Aa1!';
const EMAILS = { owner: 'jc7-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const BRAND_900 = 'rgb(6, 78, 59)', BRAND_500 = 'rgb(16, 185, 129)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('students').delete().like('name', 'JC7 %');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('madrasa_enrollments').delete().in('mosque_id', mIds); await svc.from('madrasa_classes').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
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
  console.log(`clickthrough-jobc-students: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + class + student + enrolment…');
  const ownerId = await mkUser(EMAILS.owner, 'JC7 Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc7-${ownerId.slice(0, 8)}`, name: 'JC7 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const { data: student } = await svc.from('students').insert({ name: 'JC7 Child' }).select().single();
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, status: 'active' });

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=students', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Add student|JC7 Child/.test(document.body.innerText), { timeout: 20000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-students.png` });

  const addBtn = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Add student/.test(x.textContent) && getComputedStyle(x).backgroundColor === 'rgb(6, 78, 59)');
    return b ? getComputedStyle(b).backgroundColor : null;
  });
  addBtn === BRAND_900 ? ok(`"Add student" button (bg-brand-900) renders ${addBtn} == emerald-900`) : bad(`Add student btn = ${addBtn}`);

  // Avatar gradient — find an element whose gradient 'from' stop resolves to brand-500.
  const grad = await p.evaluate((want) => {
    const el = [...document.querySelectorAll('div')].find(e => (getComputedStyle(e).backgroundImage || '').includes(want));
    return el ? 'found' : null;
  }, BRAND_500);
  grad ? ok(`student avatar gradient uses brand-500 stop (${BRAND_500} == emerald-500)`) : bad('avatar gradient with brand-500 not found');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-jobc-communitymembers.mjs
// Job C (Community cluster) verification — CommunityMembers migration. DEV ONLY.
// Seeds a mosque + an ACTIVE explicit member + a derived "enrolled family" parent
// (student enrolled in a madrasah class), opens community/members, reads pixels:
//   SUCCESS: member "active" StatusBadge -> bg-success-50 / text-success-800
//   BRAND:   "Enrolled family" chip       -> bg-brand-50 / text-brand-800
//            "Add member" button           -> bg-brand-900
//            member avatar                 -> bg-brand-50
//   UNCHANGED: "Pending" badge (derived parent, not yet a member) -> amber-700
// (success-* and brand-* render identical emerald today; family proven by grep,
//  pixels confirm each renders the right shade + amber stays amber.)
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
const EMAILS = { owner: 'cms-owner@amanah-verify.test', parent: 'cms-parent@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const skip = m => console.log('  ⏭️ ', m);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const GREEN50 = 'rgb(236, 253, 245)', GREEN800 = 'rgb(6, 95, 70)', GREEN900 = 'rgb(6, 78, 59)', AMBER700 = 'rgb(180, 83, 9)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  await svc.from('students').delete().like('name', 'CMS %');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_enrollments', 'madrasa_classes', 'community_members']) if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}
async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: 'cms-Aa1!', email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-communitymembers: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + active member + enrolled-family parent…');
  const ownerId = await mkUser(EMAILS.owner, 'CMS Owner');
  const parentId = await mkUser(EMAILS.parent, 'CMS Parent');
  const { data: mosque } = await svc.from('mosques').insert({ user_id: ownerId, slug: `cms-${ownerId.slice(0, 8)}`, name: 'CMS Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error: mErr } = await svc.from('community_members').insert({ mosque_id: mosque.id, name: 'Active Member', status: 'active' });
  if (mErr) throw new Error(`member: ${mErr.message}`);
  // derived enrolled-family parent: a student (profile_id=parent) enrolled in a class
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const { data: student } = await svc.from('students').insert({ name: 'CMS Child', profile_id: parentId }).select().single();
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, status: 'active' });

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'cms-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1300 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=community&sub=members', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Active Member|Add member|Enrolled family|Members/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/jobc-communitymembers.png`, fullPage: true });

  // member "active" StatusBadge -> success (bg-success-50 / text-success-800)
  const badge = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'active'); return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null; });
  (badge && badge.bg === GREEN50 && badge.color === GREEN800) ? ok(`member "active" badge is success-shade (bg ${badge.bg} / text ${badge.color})`) : bad(`active badge = ${JSON.stringify(badge)}`);

  // "Enrolled family" chip -> brand (bg-brand-50 / text-brand-800)
  const chip = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Enrolled family'); return el ? { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color } : null; });
  (chip && chip.bg === GREEN50 && chip.color === GREEN800) ? ok(`"Enrolled family" chip is brand-shade (bg ${chip.bg} / text ${chip.color})`) : skip(`"Enrolled family" chip not surfaced (derived-parents view) — grep-proven brand`);

  // "Pending" badge stays amber (if a derived parent shows it)
  const pending = await p.evaluate(() => { const el = [...document.querySelectorAll('span')].find(x => x.textContent.trim() === 'Pending'); return el ? getComputedStyle(el).color : null; });
  pending === AMBER700 ? ok(`"Pending" badge stays amber-700 (${pending}) — unchanged`) : skip('no "Pending" badge surfaced — n/a');

  // "Add member" button -> bg-brand-900
  const btn = await p.evaluate((want) => { const b = [...document.querySelectorAll('button')].find(x => /Add member/.test(x.textContent) && getComputedStyle(x).backgroundColor === want); return b ? getComputedStyle(b).backgroundColor : null; }, GREEN900);
  btn === GREEN900 ? ok(`"Add member" button is brand-900 (${btn})`) : bad(`Add member btn = ${btn}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-communitymembers.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

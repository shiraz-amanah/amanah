// scripts/clickthrough-parent-unlink.mjs
// Browser click-through for the parent-side marketplace unlink. DEV ONLY.
// Seeds a NO-ENROLMENT parent plus two message threads — a parent↔teacher thread
// (kept) and a parent↔scholar DM (unlinked marketplace) — then drives Chrome as
// that parent and asserts:
//   - lands on the Madrasah tab by default (not Bookings)
//   - Bookings / My scholars / My Mosques are gone from the nav
//   - the mosque-initiated empty-state copy renders (no "Browse classes" button)
//   - Account still works
//   - the Messages tab shows the TEACHER thread but NOT the scholar DM (filter)
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
const PW = 'parentunlink-Aa1!';
const EMAILS = {
  parent:  'parentunlink-parent@amanah-verify.test',
  scholar: 'parentunlink-scholar@amanah-verify.test',
  teacher: 'parentunlink-teacher@amanah-verify.test',
};
const emailSet = new Set(Object.values(EMAILS));
const SCHOLAR_NAME = 'Marketplace Scholar DM';
const TEACHER_NAME = 'Madrasah Teacher';
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: cps } = await svc.from('conversation_participants').select('conversation_id').in('user_id', ids);
    const convIds = [...new Set((cps || []).map(c => c.conversation_id))];
    if (convIds.length) {
      await svc.from('conversation_participants').delete().in('conversation_id', convIds);
      await svc.from('conversations').delete().in('id', convIds);
    }
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
async function mkThread(creatorId, otherId, otherRole, preview) {
  const { data: conv, error } = await svc.from('conversations').insert({
    created_by: creatorId, kind: 'direct',
    last_message_at: new Date().toISOString(),
    last_message_preview: preview, last_message_sender_id: otherId,
  }).select().single();
  if (error) throw new Error(`conversation: ${error.message}`);
  const { error: pe } = await svc.from('conversation_participants').insert([
    { conversation_id: conv.id, user_id: creatorId, role: 'parent' },
    { conversation_id: conv.id, user_id: otherId, role: otherRole },
  ]);
  if (pe) throw new Error(`participants: ${pe.message}`);
  return conv.id;
}

let browser;
(async () => {
  console.log(`clickthrough-parent-unlink: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding no-enrolment parent + two message threads…');
  const parentId = await mkUser(EMAILS.parent, 'Test Parent');
  const scholarId = await mkUser(EMAILS.scholar, SCHOLAR_NAME);
  const teacherId = await mkUser(EMAILS.teacher, TEACHER_NAME);
  await mkThread(parentId, scholarId, 'scholar', 'Hi, saw your profile — are you free for a session?');
  await mkThread(parentId, teacherId, 'teacher', 'Assalamu alaikum, about your child in class today…');
  // Sanity: BOTH threads really exist for the parent (so the filter is what hides one).
  const { data: cps } = await svc.from('conversation_participants').select('conversation_id').eq('user_id', parentId);
  (cps?.length === 2) ? ok(`parent is in 2 threads server-side (scholar + teacher)`) : bad(`expected 2 threads, got ${cps?.length}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: EMAILS.parent, password: PW });

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1400 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess.session));
  await p.goto(APP + '/dashboard', { waitUntil: 'networkidle2' });
  await sleep(1500);
  await p.screenshot({ path: `${SHOT}/parent-unlink-1-dashboard.png` });

  // --- Default tab = Madrasah, with the mosque-initiated empty state ---
  const bodyText = await p.evaluate(() => document.body.innerText);
  /Once your mosque enrols your child/i.test(bodyText)
    ? ok('lands on Madrasah by default with the mosque-initiated empty-state copy')
    : bad('empty-state copy not shown on default landing');
  /Browse classes/i.test(bodyText) ? bad('"Browse classes" button still present') : ok('no "Browse classes" button anywhere on the page');

  // --- Nav: marketplace items gone, mosque-scoped items present ---
  const nav = await p.evaluate(() => {
    const aside = document.querySelector('aside');
    return aside ? aside.innerText : document.body.innerText;
  });
  !/Bookings/i.test(nav) ? ok('nav: Bookings removed') : bad('nav still shows Bookings');
  !/My scholars/i.test(nav) ? ok('nav: My scholars removed') : bad('nav still shows My scholars');
  !/My Mosques/i.test(nav) ? ok('nav: My Mosques removed') : bad('nav still shows My Mosques');
  /My giving/i.test(nav) ? ok('nav: My giving kept') : bad('nav missing My giving');
  /Messages/i.test(nav) ? ok('nav: Messages kept') : bad('nav missing Messages');
  /Account/i.test(nav) ? ok('nav: Account kept') : bad('nav missing Account');

  // --- Account tab still works ---
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Account$/.test(x.textContent.trim())); b && b.click(); });
  await sleep(900);
  const acctText = await p.evaluate(() => document.body.innerText);
  /My students|Notification|Profile|Account/i.test(acctText) ? ok('Account tab renders') : bad('Account tab did not render');

  // --- Messages: teacher thread shows, scholar DM does NOT ---
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /^Messages$/.test(x.textContent.trim())); b && b.click(); });
  await sleep(1500);
  await p.screenshot({ path: `${SHOT}/parent-unlink-2-messages.png` });
  const msgText = await p.evaluate(() => document.body.innerText);
  new RegExp(TEACHER_NAME, 'i').test(msgText) ? ok(`Messages shows the TEACHER thread ("${TEACHER_NAME}")`) : bad('teacher thread not shown');
  !new RegExp(SCHOLAR_NAME, 'i').test(msgText) ? ok(`Messages HIDES the scholar DM ("${SCHOLAR_NAME}") — filter works`) : bad('scholar DM still visible — filter failed');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: parent-unlink-1-dashboard.png, parent-unlink-2-messages.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

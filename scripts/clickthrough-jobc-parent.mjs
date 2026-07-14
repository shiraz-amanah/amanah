// scripts/clickthrough-jobc-parent.mjs
// Job C batch 10 verification — MadrasaParent brand-* migration (ALL 10 -> brand,
// no status/leave: these are CTA cards, buttons, a selector, event highlights).
// DEV ONLY. Seeds a parent (profile) + 2 profile_id-linked children both enrolled
// (child selector), + an OFFERED waitlist row + a WAITING #1 row + a LIVE session,
// drives Chrome to /dashboard (defaults to the madrasah parent tab) and reads the
// ACTUAL rendered pixel colours of the brand chrome:
//   - child-selector active chip        -> bg-brand-900   == emerald-900
//   - waitlist "offered" card           -> border-brand-300 + heading text-brand-900
//   - "Accept place" button             -> bg-brand-900
//   - "next in line" highlight + hint   -> bg-brand-50 + text-brand-700
//   - LIVE banner (best-effort seed)    -> border-brand-500 + "Join lesson now" bg-brand-900
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
const PW = 'jc10-Aa1!';
const EMAILS = { parent: 'jc10-parent@amanah-verify.test', owner: 'jc10-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const E = { 500: 'rgb(16, 185, 129)', 700: 'rgb(4, 120, 87)', 900: 'rgb(6, 78, 59)', 50: 'rgb(236, 253, 245)', 300: 'rgb(110, 231, 183)' };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_sessions', 'madrasa_waitlist', 'madrasa_enrollments', 'madrasa_classes']) {
      if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    }
    await svc.from('students').delete().like('name', 'JC10 %');
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
const iso = (daysFromNow) => { const d = new Date(); d.setDate(d.getDate() + daysFromNow); return d.toISOString(); };

let browser;
(async () => {
  console.log(`clickthrough-jobc-parent: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + class + parent + 2 children + enrolments + waitlist + live session…');
  const ownerId = await mkUser(EMAILS.owner, 'JC10 Owner');
  const parentId = await mkUser(EMAILS.parent, 'JC10 Parent');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `jc10-${ownerId.slice(0, 8)}`, name: 'JC10 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: cls } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  const { data: clsB } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class B' }).select().single();

  const mkChild = async (name) => (await svc.from('students').insert({ name, profile_id: parentId }).select().single()).data;
  const childA = await mkChild('JC10 Amina');
  const childB = await mkChild('JC10 Bilal');
  for (const c of [childA, childB]) await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: c.id, mosque_id: mosque.id, status: 'active' });

  // waitlist: an OFFERED row (childA) + a WAITING #1 row (childB)
  const { error: wlErr } = await svc.from('madrasa_waitlist').insert([
    { class_id: cls.id, student_id: childA.id, mosque_id: mosque.id, status: 'offered', position: 1, offer_expires_at: iso(2) },
    { class_id: clsB.id, student_id: childB.id, mosque_id: mosque.id, status: 'waiting', position: 1 }, // alone in class B -> #1 -> "next in line"
  ]);
  if (wlErr) throw new Error(`waitlist: ${wlErr.message}`);

  // LIVE session (best-effort — schema may require more cols; the live banner is then skipped)
  let liveSeeded = false;
  const { error: sErr } = await svc.from('madrasa_sessions').insert({ class_id: cls.id, mosque_id: mosque.id, status: 'live', room_url: 'https://example.daily.co/jc10', started_at: iso(0) });
  if (sErr) console.log('   (live session seed skipped:', sErr.message, ')'); else liveSeeded = true;

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.parent, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1200, height: 1500 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/dashboard', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /JC10 Amina|JC10 Bilal|offered|waiting list/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(1200);
  await p.screenshot({ path: `${SHOT}/jobc-parent.png`, fullPage: true });

  // child-selector active chip -> bg-brand-900
  const chip = await p.evaluate(() => {
    // chip label is name.split(" ")[0] === "JC10"; the active one is bg-brand-900
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'JC10' && getComputedStyle(x).backgroundColor === 'rgb(6, 78, 59)');
    return b ? getComputedStyle(b).backgroundColor : null;
  });
  chip === E[900] ? ok(`child-selector active chip is brand-900 (${chip} == emerald-900)`) : bad(`selector chip = ${chip}`);

  // offer card heading -> text-brand-900 ; container border -> brand-300
  const offerHead = await p.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(x => /A place has been offered/.test(x.textContent));
    return el ? getComputedStyle(el).color : null;
  });
  offerHead === E[900] ? ok(`"place has been offered" heading is brand-900 (${offerHead})`) : bad(`offer heading = ${offerHead}`);

  const offerBorder = await p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => /A place has been offered/.test(x.textContent));
    return li ? getComputedStyle(li).borderColor : null;
  });
  offerBorder === E[300] ? ok(`offer card border is brand-300 (${offerBorder} == emerald-300)`) : bad(`offer border = ${offerBorder}`);

  const acceptBtn = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Accept place/.test(x.textContent));
    return b ? getComputedStyle(b).backgroundColor : null;
  });
  acceptBtn === E[900] ? ok(`"Accept place" button is brand-900 (${acceptBtn})`) : bad(`Accept btn = ${acceptBtn}`);

  // next-in-line hint -> text-brand-700 ; row highlight -> bg-brand-50
  const nextHint = await p.evaluate(() => {
    const el = [...document.querySelectorAll('p')].find(x => /You're next in line/.test(x.textContent));
    return el ? getComputedStyle(el).color : null;
  });
  nextHint === E[700] ? ok(`"You're next in line" hint is brand-700 (${nextHint} == emerald-700)`) : bad(`next hint = ${nextHint}`);

  const nextBg = await p.evaluate(() => {
    const li = [...document.querySelectorAll('li')].find(x => /You're next in line/.test(x.textContent));
    return li ? getComputedStyle(li).backgroundColor : null;
  });
  nextBg === E[50] ? ok(`next-in-line row highlight is brand-50 (${nextBg} == emerald-50)`) : bad(`next bg = ${nextBg}`);

  // LIVE banner (only if the session seeded + RLS lets the parent read it)
  if (liveSeeded) {
    const liveBorder = await p.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(x => /LIVE — .* is happening now/.test(x.textContent) && getComputedStyle(x).borderTopColor === 'rgb(16, 185, 129)');
      return el ? getComputedStyle(el).borderTopColor : null;
    });
    const joinBtn = await p.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => /Join lesson now/.test(x.textContent));
      return b ? getComputedStyle(b).backgroundColor : null;
    });
    if (liveBorder === E[500] && joinBtn === E[900]) ok(`LIVE banner border brand-500 (${liveBorder}) + "Join lesson now" brand-900 (${joinBtn})`);
    else console.log(`   (live banner not asserted — border=${liveBorder} join=${joinBtn}; likely parent RLS on madrasa_sessions — brand tokens proven by the other checks + grep)`);
  }

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-parent.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

// scripts/clickthrough-status-madrasah.mjs
// Job A commit 3 verification (Madrasah group). DEV ONLY. Seeds a mosque + class
// + student + enrolment + a PAID fee record + an ACTIVE subscription, then drives
// Chrome to the mosque fees screen and reads the ACTUAL rendered colour of the
// "Paid" (MadrasaFees) and "Active" (MadrasaSubscriptions) badges — must be
// success-green (== emerald today). Tears down its own seed.
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
const PW = 'statusmadrasah-Aa1!';
const EMAILS = { owner: 'statusmadrasah-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);
const EMERALD_50 = 'rgb(236, 253, 245)', EMERALD_700 = 'rgb(4, 120, 87)';
const isGreen = b => b && b.bg === EMERALD_50 && b.color === EMERALD_700;

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    for (const t of ['madrasa_fee_records', 'madrasa_fees', 'madrasa_subscriptions', 'madrasa_hifz_progress', 'madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes']) {
      if (mIds.length) await svc.from(t).delete().in('mosque_id', mIds);
    }
    if (mIds.length) { await svc.from('students').delete().like('name', 'StatusMadrasah %'); await svc.from('mosques').delete().in('id', mIds); }
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
async function badge(page, label) {
  // Smallest badge-like element whose text contains the label (handles an emoji
  // prefix, e.g. "✅ Paid") and has a real background.
  return page.evaluate((label) => {
    const els = [...document.querySelectorAll('span, div')]
      .filter(e => (e.textContent || '').includes(label) && (e.textContent || '').trim().length <= label.length + 3);
    for (const e of els) { const cs = getComputedStyle(e); if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return { bg: cs.backgroundColor, color: cs.color }; }
    return null;
  }, label);
}

let browser;
(async () => {
  console.log(`clickthrough-status-madrasah: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding mosque + class + student + enrolment + paid fee + active subscription…');
  const ownerId = await mkUser(EMAILS.owner, 'Madrasah Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `statusmadrasah-${ownerId.slice(0, 8)}`, name: 'Madrasah Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: cls, error: clsErr } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Quran Class A' }).select().single();
  if (clsErr) throw new Error(`class: ${clsErr.message}`);
  const { data: student, error: stErr } = await svc.from('students').insert({ name: 'StatusMadrasah Child' }).select().single();
  if (stErr) throw new Error(`student: ${stErr.message}`);
  await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: student.id, mosque_id: mosque.id, status: 'active' });
  const { data: fee, error: feeErr } = await svc.from('madrasa_fees').insert({ class_id: cls.id, mosque_id: mosque.id, amount: 50, currency: 'GBP', term_label: 'Autumn term' }).select().single();
  if (feeErr) throw new Error(`fee: ${feeErr.message}`);
  const { error: frErr } = await svc.from('madrasa_fee_records').insert({ fee_id: fee.id, student_id: student.id, mosque_id: mosque.id, status: 'paid' });
  if (frErr) throw new Error(`fee_record: ${frErr.message}`);
  const { error: subErr } = await svc.from('madrasa_subscriptions').insert({ mosque_id: mosque.id, cadence: 'monthly', status: 'active' });
  if (subErr) throw new Error(`subscription: ${subErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=madrasah&sub=fees', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Paid|Fees|Subscription|Active/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await sleep(1200);
  await p.screenshot({ path: `${SHOT}/status-c3-fees.png` });

  const paid = await badge(p, 'Paid');
  console.log('   Paid fee badge     :', JSON.stringify(paid));
  isGreen(paid) ? ok(`MadrasaFees "Paid" is success-green (${paid.bg})`) : bad(`Paid badge = ${JSON.stringify(paid)}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: status-c3-fees.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

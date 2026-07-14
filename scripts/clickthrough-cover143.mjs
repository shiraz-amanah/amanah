// scripts/clickthrough-cover143.mjs
// Browser click-through (Option A) for the SCHOLAR RECIPIENT side after the 143
// re-key. DEV ONLY. Seeds a mosque + scholar + one 'requested' cover_request via
// service role, injects the scholar's real Supabase session into localStorage,
// drives the installed Chrome to /scholar-dashboard?tab=cover, verifies the
// request is visible, clicks Accept, and confirms the UI + DB both flip to
// confirmed. Screenshots each step. Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT_DIR = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/5730e4a4-5177-4618-92de-b11b10a19d34/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'cover143ct-Aa1!';
const EMAILS = { owner: 'cover143ct-owner@amanah-verify.test', scholar: 'cover143ct-scholar@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (!ids.length) return;
  const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
  const mIds = (mosques || []).map(m => m.id);
  if (mIds.length) await svc.from('cover_requests').delete().in('mosque_id', mIds);
  await svc.from('cover_requests').delete().in('recipient_profile_id', ids);
  await svc.from('scholars').delete().in('user_id', ids);
  await svc.from('notifications').delete().in('user_id', ids);
  if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
  await svc.from('profiles').delete().in('id', ids);
  for (const id of ids) await svc.auth.admin.deleteUser(id);
}
async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
}

let browser;
(async () => {
  await teardown();
  console.log('Seeding mosque + scholar + one requested cover request…');
  const ownerId = await mkUser(EMAILS.owner, 'Cover143CT Owner');
  const scholarId = await mkUser(EMAILS.scholar, 'Cover143CT Scholar');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `cover143ct-${ownerId.slice(0, 8)}`, name: 'Cover143CT Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA',
  }).select().single();
  const { data: scholarRow } = await svc.from('scholars').insert({
    user_id: scholarId, slug: `cover143ct-sch-${scholarId.slice(0, 8)}`, name: 'Cover143CT Scholar', status: 'active',
  }).select().single();
  const { data: req } = await svc.from('cover_requests').insert({
    mosque_id: mosque.id, recipient_profile_id: scholarId, scholar_id: scholarRow.id,
    cover_type: ['short'], sessions: ['fajr'], notes: 'Please cover Fajr (browser click-through)',
  }).select().single();
  console.log('Seeded cover_request', req.id, 'status', req.status);

  // Real scholar session via anon signIn.
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email: EMAILS.scholar, password: PW });
  if (sErr) throw new Error(`signIn: ${sErr.message}`);

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400 });

  // Establish origin, inject session, then load the cover tab authenticated.
  await page.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess.session));
  await page.goto(APP + '/scholar-dashboard?tab=cover', { waitUntil: 'networkidle2' });

  // Wait for the cover request card to render.
  // Anchor on the unique note text (the mosques public-SELECT policy masks an
  // unverified seed mosque's name in the embedded join → renders "A mosque").
  const seen = await page.waitForFunction(() => {
    const t = document.body.innerText;
    return t.includes('Cover requests') && t.includes('Please cover Fajr (browser click-through)') && /Accept/.test(t) ? t : false;
  }, { timeout: 25000 }).then(() => true).catch(() => false);
  const bodyText = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${SHOT_DIR}/cover-ct-1-before.png` });
  if (!seen) { console.log('PAGE TEXT >>>', bodyText.slice(0, 500)); throw new Error('cover request card not visible'); }
  ok('scholar dashboard cover tab shows the seeded request (note + type/sessions + Accept button visible)');
  const badgeBefore = /requested/i.test(bodyText);
  badgeBefore ? ok('status badge reads "requested" before click') : bad('expected "requested" badge before click');

  // Click the Accept button.
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /Accept/.test(b.textContent));
    if (btn) { btn.click(); return true; } return false;
  });
  clicked ? ok('clicked Accept') : bad('Accept button not found to click');

  // Wait for the UI to reflect confirmed (badge flips + Accept button disappears).
  // NB: innerText applies CSS text-transform:capitalize, so the badge reads
  // "Confirmed" — match case-insensitively.
  const flipped = await page.waitForFunction(() => {
    const t = document.body.innerText;
    const hasConfirmed = /confirmed/i.test(t);
    const acceptGone = ![...document.querySelectorAll('button')].some(b => /Accept/.test(b.textContent));
    return hasConfirmed && acceptGone;
  }, { timeout: 15000 }).then(() => true).catch(() => false);
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: `${SHOT_DIR}/cover-ct-2-after.png` });
  const afterText = await page.evaluate(() => document.body.innerText);
  flipped && /confirmed/i.test(afterText) ? ok('UI badge flipped to "confirmed" after Accept') : bad('UI did not reflect confirmed');

  // DB confirms the click actually wrote through RLS + fired the owner notification.
  const { data: after } = await svc.from('cover_requests').select('status').eq('id', req.id).single();
  after?.status === 'confirmed' ? ok(`DB status persisted = confirmed`) : bad(`DB status = ${after?.status}`);
  const ownerN = (await svc.from('notifications').select('id,title').eq('user_id', ownerId).eq('type', 'cover_request').eq('data->>cover_request_id', req.id)).data || [];
  ownerN.length === 1 && /confirmed/.test(ownerN[0].title) ? ok('mosque owner got the acceptance notification') : bad(`owner notifications: ${ownerN.length}`);

  await browser.close();
  await teardown();
  console.log(`\n==== CLICK-THROUGH: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: cover-ct-1-before.png, cover-ct-2-after.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { if (browser) await browser.close(); } catch {}
  try { await teardown(); } catch {}
  process.exit(1);
});

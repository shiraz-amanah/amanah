// Former staff tab restyle — browser verification by USAGE. DEV ONLY.
// Requires: node scripts/seed-former-staff-dev.mjs, and `npm run dev` running.
//
// Fixture counts are DELIBERATELY DISTINCT (3 total / 1 locked / 2 eligible) so
// a wrong number cannot coincidentally match the right one.
//
// P1 tab + chip counts agree with the fixture (3 / 1 / 2).
// P2 banner present, GREEN, clock icon, plural copy for N=2.
// P3 pills: Zahra locked "Retained until…", Bilal + Yusuf green "Eligible".
// P4 Review appears on ELIGIBLE rows only (2 buttons, not 3) — so the locked
//    row has no inline route to erasure at all.
// P5 Review opens the danger zone for the RIGHT person, and Offboard is absent.
// P6 erasing Bilal through the real dialog: row leaves Former, banner drops to
//    the SINGULAR "1 record has…", and the erased person is gone from the list.
// P7 erasing the last eligible row makes the banner DISAPPEAR — the
//    only-when-eligible condition, tested by usage rather than by reading it.
// P8 the locked row's profile still shows Anonymise disabled behind the lock
//    (the extraction did not break StaffProfile's danger zone).
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const URL_ = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY;
if (!URL_ || !URL_.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const APP = process.env.APP || 'http://localhost:5173';
if (/zgoyvztooyxqkcftwylr/.test(APP)) { console.error('SAFETY: APP looks like prod.'); process.exit(1); }

const OWNER_EMAIL = 'former-tab-owner@amanah-verify.test';
const OWNER_PW = 'formerTab-Aa1!';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
const { data: sess, error: signErr } = await anon.auth.signInWithPassword({ email: OWNER_EMAIL, password: OWNER_PW });
if (signErr) { console.error('sign-in failed:', signErr.message); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 1000 });
page.on('console', (m) => { if (m.type() === 'error') console.log('   [console.error]', m.text().slice(0, 160)); });

// Inject the session the way the app stores it, then boot.
await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.evaluate(([key, value]) => localStorage.setItem(key, value),
  [`sb-${DEV}-auth-token`, JSON.stringify({
    access_token: sess.session.access_token, refresh_token: sess.session.refresh_token,
    expires_at: sess.session.expires_at, expires_in: sess.session.expires_in,
    token_type: 'bearer', user: sess.user,
  })]);

const text = () => page.evaluate(() => document.body.innerText);
const clickText = async (sel, needle) => page.evaluate(([s, n]) => {
  const el = [...document.querySelectorAll(s)].find((e) => (e.innerText || '').trim().includes(n));
  if (!el) return false; el.click(); return true;
}, [sel, needle]);
const countText = async (sel, needle) => page.evaluate(([s, n]) =>
  [...document.querySelectorAll(s)].filter((e) => (e.innerText || '').trim() === n).length, [sel, needle]);

try {
  // /mosque-dashboard is a real route (App.jsx assigns to it); a ?view= query is
  // not — the view is state, restored from the path.
  await page.goto(`${APP}/mosque-dashboard`, { waitUntil: 'networkidle2' });
  await sleep(3000);
  if (!(await clickText('button, a', 'Staff'))) bad('could not find the Staff nav item');
  await sleep(2500);
  if (!(await clickText('button', 'Former staff'))) bad('could not find the Former staff tab');
  await sleep(1500);

  // PRECONDITION. Without this, every negative assertion below ("Offboard row
  // hidden", "only that person's panel is open") passes trivially on a blank
  // page — the first run of this probe reported two such false passes while
  // nothing had rendered at all. Absence is only evidence once presence is.
  const boot = await text();
  if (!/Zahra Iqbal/.test(boot) || !/Former staff/.test(boot)) {
    bad('PRECONDITION FAILED — the Former staff tab did not render the fixture; ' +
        'the assertions below would be meaningless, so stopping here.');
    console.log('   page text was:\n', boot.slice(0, 600));
    throw new Error('precondition failed');
  }
  ok('precondition: Former staff tab rendered with fixture rows');

  console.log('\n=== P1: tab + chip counts match the fixture ===');
  let t = await text();
  /Former staff \(3\)/.test(t) ? ok('tab reads "Former staff (3)"') : bad(`tab count wrong: ${(t.match(/Former staff[^\n]*/) || [])[0]}`);
  /Retention active \(1\)/.test(t) ? ok('chip "Retention active (1)"') : bad(`locked chip wrong: ${(t.match(/Retention active[^\n]*/) || [])[0]}`);
  /Eligible to anonymise \(2\)/.test(t) ? ok('chip "Eligible to anonymise (2)"') : bad(`eligible chip wrong: ${(t.match(/Eligible to anonymise[^\n]*/) || [])[0]}`);

  console.log('\n=== P2: banner, plural copy for N=2 ===');
  /2 records have cleared their retention period and can now be anonymised/.test(t)
    ? ok('banner shows the plural copy for 2') : bad(`banner copy wrong: ${(t.match(/cleared their retention[^\n]*/) || ['ABSENT'])[0]}`);
  const bannerGreen = await page.evaluate(() => {
    // Walk UP from the text to the nearest ancestor actually carrying the tone
    // class — the text sits in an inner div with no class of its own, so
    // reading className off the match returned an empty string.
    let el = [...document.querySelectorAll('div')].reverse()
      .find((e) => (e.innerText || '').includes('cleared their retention period'));
    if (!el) return null;
    // Walk up to the BANNER CONTAINER, not merely the first ancestor carrying a
    // success class — the innermost such ancestor is the text div, whose sibling
    // (not child) holds the icon. Stop at the element that has the tone AND
    // contains the icon, which is the banner itself.
    let box = el;
    while (box && !(/success/.test(box.className || '') && box.querySelector('svg'))) box = box.parentElement;
    return { cls: (box || el).className, hasSvg: !!(box || el).querySelector('svg') };
  });
  bannerGreen?.cls?.includes('success') ? ok('banner uses the success (green) tone') : bad(`banner tone: ${bannerGreen?.cls}`);
  bannerGreen?.hasSvg ? ok('banner carries an icon') : bad('banner icon missing');

  console.log('\n=== P3: pill states per row ===');
  /Retained until 5 Apr 2030/.test(t) ? ok('Zahra locked: "Retained until 5 Apr 2030"') : bad('locked pill wrong/absent');
  ((t.match(/Eligible to anonymise/g) || []).length >= 3)
    ? ok('two eligible pills present (plus the chip)') : bad('eligible pills missing');
  /Quran Teacher · left/.test(t) ? ok('subtitle reads "<role> · left <date>"') : bad(`subtitle wrong: ${(t.match(/·[^\n]*/) || [])[0]}`);

  console.log('\n=== P4: Review on eligible rows ONLY ===');
  const reviews = await countText('button', 'Review');
  (reviews === 2) ? ok('exactly 2 Review buttons (not 3 — the locked row has none)')
    : bad(`${reviews} Review buttons, expected 2`);

  console.log('\n=== P5: Review opens the right person\'s danger zone ===');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find((e) => (e.innerText || '').startsWith('Bilal Osman'));
    const btn = [...(row?.closest('div.border')?.querySelectorAll('button') || [])].find((b) => b.innerText.trim() === 'Review');
    btn?.click();
  });
  await sleep(800);
  t = await text();
  /Danger zone — Bilal Osman/.test(t) ? ok('heading "Danger zone — Bilal Osman"') : bad('danger zone heading wrong/absent');
  !/Danger zone — Yusuf|Danger zone — Zahra/.test(t) ? ok('only that person\'s panel is open') : bad('another panel opened too');
  !/Archives the record and ends their access/.test(t) ? ok('Offboard row hidden (all already offboarded)') : bad('Offboard row rendered on the Former tab');
  /Retention expired .* now eligible for erasure/.test(t) ? ok('unlocked copy shown') : bad('unlocked copy missing');

  console.log('\n=== P6: erase Bilal through the real dialog ===');
  await clickText('button', 'Anonymise…');
  await sleep(700);
  t = await text();
  /Type Bilal Osman to confirm|Anonymise this record/.test(t) ? ok('confirm dialog opened') : bad('dialog did not open');
  await page.type('input[placeholder="Bilal Osman"]', 'Bilal Osman');
  await sleep(300);
  await clickText('button', 'Anonymise permanently');
  await sleep(3000);
  t = await text();
  !/Bilal Osman/.test(t) ? ok('Bilal no longer listed on Former staff') : bad('Bilal still listed after erasure');
  /Former staff \(2\)/.test(t) ? ok('tab count fell to 2') : bad(`tab count after erase: ${(t.match(/Former staff[^\n]*/) || [])[0]}`);
  /1 record has cleared their retention period/.test(t)
    ? ok('banner switched to the SINGULAR "1 record has…"') : bad(`banner not singular: ${(t.match(/cleared their retention[^\n]*/) || ['ABSENT'])[0]}`);

  console.log('\n=== P7: banner disappears when nothing is eligible ===');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find((e) => (e.innerText || '').startsWith('Yusuf Kamal'));
    const btn = [...(row?.closest('div.border')?.querySelectorAll('button') || [])].find((b) => b.innerText.trim() === 'Review');
    btn?.click();
  });
  await sleep(700);
  await clickText('button', 'Anonymise…');
  await sleep(700);
  await page.type('input[placeholder="Yusuf Kamal"]', 'Yusuf Kamal');
  await sleep(300);
  await clickText('button', 'Anonymise permanently');
  await sleep(3000);
  t = await text();
  !/cleared their retention period/.test(t) ? ok('banner GONE once no row is eligible') : bad('banner still showing with zero eligible');
  /Former staff \(1\)/.test(t) ? ok('one former row left (the locked one)') : bad(`tab count: ${(t.match(/Former staff[^\n]*/) || [])[0]}`);
  const reviewsLeft = await countText('button', 'Review');
  (reviewsLeft === 0) ? ok('no Review buttons left') : bad(`${reviewsLeft} Review buttons remain`);
  /Erasure register \(2\)/.test(t) ? ok('Erasure register picked up both erased rows') : bad(`erasure count: ${(t.match(/Erasure register[^\n]*/) || [])[0]}`);

  console.log('\n=== P8: locked row still blocked on the profile (extraction intact) ===');
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('div')].find((e) => (e.innerText || '').startsWith('Zahra Iqbal'));
    row?.click();
  });
  await sleep(1500);
  // The drawer's button is labelled "Full profile" — not "View full profile".
  if (!(await clickText('button', 'Full profile'))) bad('could not find the drawer\'s Full profile button');
  await sleep(3000);
  t = await text();
  /Danger zone/.test(t) ? ok('profile danger zone renders after the extraction') : bad('profile danger zone missing');
  /Locked until 5 Apr 2030/.test(t) ? ok('profile shows the locked copy') : bad('profile lock copy wrong');
  const disabled = await page.evaluate(() =>
    [...document.querySelectorAll('span')].some((s) => s.innerText.trim() === 'Anonymise…' && s.className.includes('cursor-not-allowed')));
  disabled ? ok('Anonymise is the disabled locked control, not a button') : bad('locked row exposed a live Anonymise button');
} catch (e) {
  bad(`UNEXPECTED: ${e.message}`);
  await page.screenshot({ path: '/tmp/former-tab-fail.png' }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

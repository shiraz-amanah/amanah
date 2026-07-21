// Verifies the Staff page "Filter" panel is fully on-screen and usable at
// phone widths. The bug: the panel was `absolute right-0 w-64` anchored to a
// button that, once the flex row wraps at ~390px, sits near the LEFT edge —
// so a 256px panel growing leftward from the button's right edge spilled off
// the left of the viewport, cut off and unreadable.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV = 'pbejyukihhmybxxtheqq';
const DIR = process.env.SHOT_DIR || '/tmp/staff-filter-shots';
const TAG = process.env.SHOT_TAG || 'after'; // 'before' | 'after'
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); };
const bad = m => { fail++; console.log('  ❌', m); };

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
// seed-staff-views-dev.mjs — 4 current / 3 former / 2 erased in ONE mosque.
const { data: sess } = await anon.auth.signInWithPassword({ email: 'staff-views-owner@amanah-verify.test', password: 'staffViews-Aa1!' });
if (!sess?.session) { console.log('❌ could not sign in as the dev owner'); process.exit(1); }

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await p.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${DEV}-auth-token`, JSON.stringify(sess.session)]);
const clickText = (s, n) => p.evaluate(([s, n]) => { const e = [...document.querySelectorAll(s)].find(x => (x.innerText || '').trim().includes(n)); if (e) { e.click(); return true; } return false; }, [s, n]);
const wait = ms => new Promise(r => setTimeout(r, ms));

await p.goto('http://localhost:5173/mosque-dashboard', { waitUntil: 'networkidle2' });
await wait(3000);
await clickText('button, a', 'Staff');
await wait(2500);

// Locate the Filter trigger + its panel without depending on the fix's markup.
const findBtn = () => p.evaluateHandle(() => [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim())));
const openPanel = async () => {
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim()));
    if (btn && ![...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0)) btn.click();
  });
  await wait(500);
};
const closePanel = async () => {
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim())); if (btn && [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0)) btn.click(); });
  await wait(400);
};

// The panel is whatever popup element appears on open. Prefer the explicit
// hook if the fix added one; otherwise fall back to the sibling of the button.
const probe = () => p.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim()));
  if (!btn) return { err: 'Filter button not found' };
  const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0) || btn.nextElementSibling;
  if (!panel) return { err: 'Filter panel not found (did it open?)' };
  const r = panel.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  // Every interactive control inside must be reachable, not just the box.
  const controls = [...panel.querySelectorAll('select, button, input')];
  const offscreen = controls.filter(c => { const b = c.getBoundingClientRect(); return b.left < -1 || b.right > vw + 1 || b.width === 0; }).length;
  // Is the top-left of the panel actually hit-testable (not covered/clipped)?
  const probePt = document.elementFromPoint(Math.max(2, r.left + 4), Math.max(2, r.top + 4));
  return {
    left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom),
    w: Math.round(r.width), h: Math.round(r.height), vw, vh,
    fullyInsideX: r.left >= -1 && r.right <= vw + 1,
    fullyInsideY: r.top >= -1 && r.bottom <= vh + 1,
    controls: controls.length, offscreen,
    hitTestable: !!probePt && (panel === probePt || panel.contains(probePt)),
    docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});

for (const [w, h, label] of [[390, 844, 'mobile 390'], [430, 932, 'mobile 430'], [768, 1000, 'tablet 768'], [1400, 900, 'desktop 1400']]) {
  console.log(`\n=== ${label} ===`);
  await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
  await wait(700);
  await openPanel();
  const r = await probe();
  console.log('  ', JSON.stringify(r));
  if (r.err) { bad(r.err); continue; }
  r.fullyInsideX ? ok('panel is fully within the viewport horizontally') : bad(`panel spills horizontally (left=${r.left}, right=${r.right}, vw=${r.vw})`);
  r.fullyInsideY ? ok('panel is fully within the viewport vertically') : bad(`panel spills vertically (top=${r.top}, bottom=${r.bottom}, vh=${r.vh})`);
  r.controls >= 6 ? ok(`all ${r.controls} controls rendered`) : bad(`only ${r.controls} controls`);
  r.offscreen === 0 ? ok('every control inside the panel is reachable') : bad(`${r.offscreen} control(s) off-screen`);
  r.hitTestable ? ok('panel is on top / clickable at its own corner') : bad('panel corner is not hit-testable');
  !r.docOverflow ? ok('page does not scroll horizontally') : bad('PAGE overflows horizontally');
  await p.screenshot({ path: `${DIR}/filter-${TAG}-${w}.png` });
  await closePanel();
}

// Closability: at phone width there must be a way out that is not the trigger.
console.log('\n=== dismissal at 390 ===');
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await wait(600);
await openPanel();
const hasExplicitClose = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0);
  if (!panel) return false;
  return [...panel.querySelectorAll('button')].some(x => /done|close/i.test((x.innerText || '') + (x.getAttribute('aria-label') || '')));
});
hasExplicitClose ? ok('panel has an explicit Done/Close control at phone width') : bad('no explicit close control');
// These must not pass vacuously: assert the panel is actually OPEN first,
// otherwise "it's gone" is true simply because it never appeared.
const isOpen = () => p.evaluate(() => !![...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0));
(await isOpen()) ? ok('panel is open before testing dismissal') : bad('panel never opened — dismissal checks are meaningless');
await p.keyboard.press('Escape');
await wait(400);
!(await isOpen()) ? ok('Escape closes the panel') : bad('Escape does not close the panel');
await openPanel();
(await isOpen()) ? ok('panel reopened') : bad('panel did not reopen');
await p.mouse.click(195, 60); // tap well outside the panel
await wait(400);
!(await isOpen()) ? ok('outside tap closes the panel') : bad('outside tap does not close the panel');

await b.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

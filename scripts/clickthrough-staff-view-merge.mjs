// Verifies the Employees / Former staff / Erasure register tabs were folded
// into the Filter dropdown's View section WITHOUT losing anything: the counts
// still match their old data source, selecting a view still swaps the whole
// content below, and the control stays reachable from every view.
//
// The regression this most guards against: the Filter control used to live
// INSIDE the `tab === "employees"` block. Left there, selecting "Former staff"
// would unmount the only remaining way back — a one-way trip.
//
// Fixture: seed-staff-views-dev.mjs — 4 current / 3 former / 2 erased, counts
// deliberately distinct so a mis-wired number can't coincidentally match.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const DEV = 'pbejyukihhmybxxtheqq';
const DIR = process.env.SHOT_DIR || '/tmp/staff-filter-shots';
const EXPECT = { employees: 4, former: 3, erasure: 2 };
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); };
const bad = m => { fail++; console.log('  ❌', m); };

const anon = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sess } = await anon.auth.signInWithPassword({ email: 'staff-views-owner@amanah-verify.test', password: 'staffViews-Aa1!' });
if (!sess?.session) { console.log('❌ sign-in failed — run: node scripts/seed-staff-views-dev.mjs'); process.exit(1); }

const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
const wait = ms => new Promise(r => setTimeout(r, ms));
await p.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
await p.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });
await p.evaluate(([k, v]) => localStorage.setItem(k, v), [`sb-${DEV}-auth-token`, JSON.stringify(sess.session)]);
await p.goto('http://localhost:5173/mosque-dashboard', { waitUntil: 'networkidle2' });
await wait(3000);
await p.evaluate(() => [...document.querySelectorAll('button,a')].find(x => (x.innerText || '').trim().includes('Staff'))?.click());
await wait(2500);

const panelOpen = () => p.evaluate(() => !![...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0));
const openPanel = async () => {
  if (!await panelOpen()) {
    await p.evaluate(() => [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim()))?.click());
    await wait(450);
  }
};
const selectView = async (v) => {
  await openPanel();
  const hit = await p.evaluate((v) => {
    const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0);
    const el = panel?.querySelector(`[data-view="${v}"]`);
    if (!el) return false; el.click(); return true;
  }, v);
  await wait(1400);
  return hit;
};
const state = () => p.evaluate(() => {
  const tabs = [...document.querySelectorAll('[data-tab]')].map(x => x.dataset.tab);
  const filterBtn = [...document.querySelectorAll('button')].find(x => /^Filter/.test((x.innerText || '').trim()));
  const badge = document.querySelector('[data-active-view]');
  const body = document.body.innerText;
  return {
    tabs,
    filterVisible: !!filterBtn && filterBtn.getBoundingClientRect().width > 0,
    badge: badge ? badge.innerText.trim() : null,
    hasSearch: !!document.querySelector('input[placeholder^="Search by name"]'),
    hasPills: /Needs attention/.test(body),
    // Content fingerprints, one per view.
    seesEmployeeTable: /Aisha Rahman/.test(body),
    seesFormer: /Zahra Iqbal/.test(body) || /No former staff/.test(body),
    seesErasure: /REDACTED/.test(body) || /Erasure register/.test(body),
  };
});

console.log('=== tab row no longer carries the three staff-list views ===');
const s0 = await state();
console.log('  tabs:', JSON.stringify(s0.tabs));
!s0.tabs.includes('employees') ? ok('Employees is not a tab') : bad('Employees still a tab');
!s0.tabs.includes('former') ? ok('Former staff is not a tab') : bad('Former staff still a tab');
!s0.tabs.includes('erasure') ? ok('Erasure register is not a tab') : bad('Erasure register still a tab');
s0.tabs.includes('org') && s0.tabs.includes('onboarding') ? ok('Org Structure + Onboarding kept as tabs') : bad(`org/onboarding missing: ${s0.tabs}`);

console.log('\n=== View section: present, with counts from the tabs\' old source ===');
await openPanel();
const views = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0);
  return [...(panel?.querySelectorAll('[data-view]') || [])].map(x => ({ v: x.dataset.view, text: x.innerText.replace(/\s+/g, ' ').trim() }));
});
console.log('  ', JSON.stringify(views));
views.length === 3 ? ok('three views listed') : bad(`${views.length} views listed`);
for (const [v, n] of Object.entries(EXPECT)) {
  const row = views.find(x => x.v === v);
  row && new RegExp(`\\b${n}\\b`).test(row.text) ? ok(`${v} shows count ${n}`) : bad(`${v} count wrong/missing — got "${row?.text}"`);
}
// Order: View section must sit ABOVE the existing filter fields.
const viewAboveFilters = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0);
  const firstView = panel?.querySelector('[data-view]');
  const firstSelect = panel?.querySelector('select');
  if (!firstView || !firstSelect) return false;
  return firstView.getBoundingClientRect().top < firstSelect.getBoundingClientRect().top;
});
viewAboveFilters ? ok('View section is above the role/department filters') : bad('View section is NOT at the top');

console.log('\n=== selecting a view swaps the content, and stays escapable ===');
for (const v of ['former', 'erasure', 'employees']) {
  const hit = await selectView(v);
  if (!hit) { bad(`could not select ${v}`); continue; }
  const s = await state();
  ok(`selected ${v}`);
  s.filterVisible ? ok(`  Filter control still reachable on ${v}`) : bad(`  Filter control GONE on ${v} — one-way trip`);
  const want = { employees: s.seesEmployeeTable, former: s.seesFormer, erasure: s.seesErasure }[v];
  want ? ok(`  ${v} content rendered`) : bad(`  ${v} content NOT rendered`);
  // Cross-check: the other two views' content must be gone (a real swap).
  const others = { employees: ['seesFormer'], former: ['seesEmployeeTable'], erasure: ['seesEmployeeTable'] }[v];
  others.every(k => !s[k]) ? ok('  previous view\'s content is gone (real swap)') : bad('  previous content still on screen');
  s.badge === { employees: 'Employees', former: 'Former staff', erasure: 'Erasure register' }[v]
    ? ok(`  Filter button labels the active view ("${s.badge}")`) : bad(`  badge wrong: "${s.badge}"`);
  // Search + status pills belong to the employees table only.
  const expectChrome = v === 'employees';
  s.hasSearch === expectChrome ? ok(`  search ${expectChrome ? 'shown' : 'hidden'}`) : bad(`  search visibility wrong on ${v}`);
  s.hasPills === expectChrome ? ok(`  status pills ${expectChrome ? 'shown' : 'hidden'}`) : bad(`  pills visibility wrong on ${v}`);
}

console.log('\n=== status pills still work on Employees (unchanged behaviour) ===');
const pillCount = await p.evaluate(() => {
  const want = ['All', 'Active', 'Needs attention', 'Inactive'];
  return want.filter(l => [...document.querySelectorAll('button')].some(b => b.innerText.trim().startsWith(l))).length;
});
pillCount === 4 ? ok('all four status pills present in their original place') : bad(`${pillCount}/4 pills`);

console.log('\n=== back button still restores the previous view ===');
await selectView('former');
await p.goBack({ waitUntil: 'domcontentloaded' }); await wait(1400);
const back = await state();
back.seesEmployeeTable ? ok('browser back returned to Employees') : bad('back did not restore the previous view');

console.log('\n=== phone width (390) ===');
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await wait(800);
await openPanel();
const m = await p.evaluate(() => {
  const panel = [...document.querySelectorAll('[data-filter-panel]')].find(x => x.getBoundingClientRect().width > 0);
  const r = panel.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const rows = [...panel.querySelectorAll('[data-view]')];
  return { inside: r.left >= -1 && r.right <= vw + 1, rows: rows.length,
           rowsInside: rows.every(x => { const q = x.getBoundingClientRect(); return q.left >= -1 && q.right <= vw + 1 && q.width > 0; }) };
});
m.inside ? ok('panel on-screen at 390') : bad('panel off-screen at 390');
m.rows === 3 && m.rowsInside ? ok('all three view rows reachable at 390') : bad(`view rows not reachable (${m.rows})`);
await p.screenshot({ path: `${DIR}/merge-390-panel.png` });
await selectView('erasure');
await p.screenshot({ path: `${DIR}/merge-390-erasure.png` });
const s390 = await state();
s390.filterVisible ? ok('Filter control reachable on Erasure register at 390') : bad('no way back at 390');

await b.close();
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

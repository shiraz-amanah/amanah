// scripts/clickthrough-landing-nav.mjs
// Landing nav "Sign in" dropdown verification — REAL coordinate-based clicks
// (page.mouse.click at bounding-box points), NOT element.click(), because a
// synthetic click bypasses hit-testing and previously hid a seam bug where a
// mis-aimed caret click fell through to the adjacent "Sign in"->mosque button.
// The fix is a SINGLE control: the whole button opens the dropdown; there is no
// adjacent mosque target, so no boundary click should ever navigate to mosque.
// Public page, no seed. Tests localhost (the current build).
import puppeteer from 'puppeteer-core';
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
let browser;

async function reset(p) { await p.goto(APP + '/', { waitUntil: 'networkidle2' }); await p.waitForFunction(() => /Book a demo/.test(document.body.innerText), { timeout: 15000 }); await sleep(250); }
const btnRect = (p) => p.evaluate(() => { const b = [...document.querySelectorAll('nav button')].find(x => /Sign in/.test(x.textContent)); const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2, right: r.x + r.width }; });

(async () => {
  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 800 });

  // ---- screenshots: closed + open ----
  await reset(p);
  await p.screenshot({ path: `${SHOT}/navfix2-closed.png`, clip: { x: 0, y: 0, width: 1280, height: 78 } });
  const r0 = await btnRect(p);
  await p.mouse.click(r0.cx, r0.cy); await sleep(400);
  await p.screenshot({ path: `${SHOT}/navfix2-open.png`, clip: { x: 0, y: 0, width: 1280, height: 260 } });

  // ---- 1. panel lists the three doors, Mosque first + emphasised ----
  const panel = await p.evaluate(() => {
    const items = [...document.querySelectorAll('.lpv-signin-item')];
    return items.map(e => ({ t: e.textContent.trim(), weight: getComputedStyle(e).fontWeight, primary: e.classList.contains('lpv-signin-item--primary') }));
  });
  console.log('   panel:', JSON.stringify(panel));
  (panel.length === 3 && panel[0].t === 'Mosque sign-in' && panel[1].t === 'Parent sign-in' && panel[2].t === 'Staff / Employee sign-in')
    ? ok('panel lists Mosque / Parent / Staff (Mosque first)') : bad(`panel = ${JSON.stringify(panel.map(x => x.t))}`);
  (panel[0].primary && Number(panel[0].weight) >= 600) ? ok(`Mosque sign-in emphasised (weight ${panel[0].weight}, primary class)`) : bad(`Mosque emphasis = ${JSON.stringify(panel[0])}`);

  // ---- 2. BOUNDARY SWEEP — real clicks across the whole button + just outside.
  // Every click INSIDE opens the panel; NO click may navigate to /sign-in/mosque. ----
  await reset(p);
  const r = await btnRect(p);
  const xs = [r.x - 6, r.x + 2, r.x + r.w * 0.25, r.cx, r.x + r.w * 0.75, r.right - 3, r.right + 6];
  let seamMosque = 0, insideOpen = 0, insideTotal = 0;
  for (const x of xs) {
    await reset(p);
    await p.mouse.click(x, r.cy); await sleep(350);
    const res = await p.evaluate(() => ({ path: location.pathname, panel: !!document.querySelector('.lpv-signin-item') }));
    const inside = x >= r.x && x <= r.right;
    const dx = (x - r.x).toFixed(0);
    if (inside) { insideTotal++; if (res.panel && res.path === '/') insideOpen++; }
    if (res.path === '/sign-in/mosque') seamMosque++;
    console.log(`   x=${x.toFixed(0)} (left+${dx}px, ${inside ? 'inside ' : 'outside'}): ${res.panel ? 'PANEL' : res.path === '/' ? 'no-op' : res.path}`);
  }
  seamMosque === 0 ? ok(`NO boundary click navigates to mosque (seam defect gone) — 0/${xs.length}`) : bad(`${seamMosque} clicks fell through to /sign-in/mosque`);
  insideOpen === insideTotal ? ok(`every in-button click opens the panel (${insideOpen}/${insideTotal})`) : bad(`only ${insideOpen}/${insideTotal} in-button clicks opened the panel`);

  // ---- 3. Panel items route correctly (REAL coordinate clicks on each) ----
  const clickPanelItem = async (label) => {
    await reset(p);
    const rr = await btnRect(p);
    await p.mouse.click(rr.cx, rr.cy); await sleep(350); // open
    const box = await p.evaluate((label) => { const el = [...document.querySelectorAll('.lpv-signin-item')].find(x => x.textContent.trim() === label); const b = el.getBoundingClientRect(); return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 }; }, label);
    await p.mouse.click(box.cx, box.cy); await sleep(500);
    return p.evaluate(() => location.pathname);
  };
  const m = await clickPanelItem('Mosque sign-in'); m === '/sign-in/mosque' ? ok(`Mosque sign-in -> ${m}`) : bad(`Mosque -> ${m}`);
  const u = await clickPanelItem('Parent sign-in'); u === '/sign-in/parent' ? ok(`Parent sign-in -> ${u}`) : bad(`Parent -> ${u}`);
  const s = await clickPanelItem('Staff / Employee sign-in'); s === '/sign-in/staff' ? ok(`Staff sign-in -> ${s}`) : bad(`Staff -> ${s}`);

  // ---- 4. outside-click + Escape close ----
  await reset(p);
  const r2 = await btnRect(p);
  await p.mouse.click(r2.cx, r2.cy); await sleep(300);
  await p.mouse.click(30, 400); await sleep(300); // click far away
  const closedByOutside = await p.evaluate(() => !document.querySelector('.lpv-signin-item'));
  closedByOutside ? ok('outside-click closes the panel') : bad('panel stayed open after outside-click');
  await p.mouse.click(r2.cx, r2.cy); await sleep(300);
  await p.keyboard.press('Escape'); await sleep(300);
  const closedByEsc = await p.evaluate(() => !document.querySelector('.lpv-signin-item'));
  closedByEsc ? ok('Escape closes the panel') : bad('panel stayed open after Escape');

  await browser.close();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: navfix2-closed.png, navfix2-open.png');
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('FATAL', e.message); try { if (browser) await browser.close(); } catch {} process.exit(1); });

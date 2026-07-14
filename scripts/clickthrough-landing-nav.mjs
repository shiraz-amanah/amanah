// Landing nav fix verification — public page, no seed. Screenshots 3 widths,
// opens the "Sign in" caret dropdown, and asserts every sign-in path + demo + anchors.
import puppeteer from 'puppeteer-core';
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
let browser;

async function navItems(p) {
  return p.evaluate(() => [...document.querySelectorAll('nav a, nav button')].filter(e => e.textContent.trim() && e.offsetParent !== null).map(e => e.textContent.trim()));
}
async function goHome(p) { await p.goto(APP + '/', { waitUntil: 'networkidle2' }); await p.waitForFunction(() => /Book a demo/.test(document.body.innerText), { timeout: 15000 }); await sleep(300); }
// click a nav control by exact text, return resulting pathname
async function clickAndPath(p, text, { openFirst } = {}) {
  await goHome(p);
  if (openFirst) { await p.evaluate(() => [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === 'More sign-in options')?.click()); await sleep(300); }
  const clicked = await p.evaluate((t) => { const b = [...document.querySelectorAll('nav button')].find(x => x.textContent.trim() === t); if (b) { b.click(); return true; } return false; }, text);
  await sleep(500);
  return { clicked, path: await p.evaluate(() => location.pathname) };
}

(async () => {
  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();

  // ---- 1. Responsive screenshots (after) + item audit ----
  await goHome(p);
  for (const [w, name] of [[1280, 'desktop'], [820, 'tablet'], [390, 'phone']]) {
    await p.setViewport({ width: w, height: 700 });
    await sleep(400);
    await p.screenshot({ path: `${SHOT}/navfix-${name}.png`, clip: { x: 0, y: 0, width: w, height: 78 } });
    console.log(`${name} (${w}px): [ ${(await navItems(p)).join(' | ')} ]`);
  }

  // ---- 2. Dropdown open screenshot (desktop) ----
  await p.setViewport({ width: 1280, height: 700 });
  await goHome(p);
  await p.evaluate(() => [...document.querySelectorAll('nav button')].find(b => b.getAttribute('aria-label') === 'More sign-in options')?.click());
  await sleep(400);
  await p.screenshot({ path: `${SHOT}/navfix-dropdown-open.png`, clip: { x: 0, y: 0, width: 1280, height: 260 } });
  const panelItems = await p.evaluate(() => [...document.querySelectorAll('.lpv-signin-item')].map(e => e.textContent.trim()));
  console.log('   dropdown items:', JSON.stringify(panelItems));
  (panelItems.length === 3 && panelItems.includes('Parent sign-in') && panelItems.includes('Staff / Employee sign-in')) ? ok('dropdown lists Mosque/Parent/Staff') : bad(`dropdown items = ${JSON.stringify(panelItems)}`);

  // ---- 3. Every sign-in path fires the right route ----
  const bareMosque = await clickAndPath(p, 'Sign in');
  bareMosque.path === '/sign-in/mosque' ? ok(`bare "Sign in" -> mosque (${bareMosque.path})`) : bad(`bare Sign in -> ${bareMosque.path}`);

  const panelMosque = await clickAndPath(p, 'Mosque sign-in', { openFirst: true });
  panelMosque.path === '/sign-in/mosque' ? ok(`panel "Mosque sign-in" -> mosque (${panelMosque.path})`) : bad(`panel Mosque -> ${panelMosque.path}`);

  const parent = await clickAndPath(p, 'Parent sign-in', { openFirst: true });
  parent.path === '/sign-in/parent' ? ok(`panel "Parent sign-in" -> parent (${parent.path})`) : bad(`Parent -> ${parent.path}`);

  const staff = await clickAndPath(p, 'Staff / Employee sign-in', { openFirst: true });
  staff.path === '/sign-in/staff' ? ok(`panel "Staff / Employee sign-in" -> staff (${staff.path})`) : bad(`Staff -> ${staff.path}`);

  // ---- 4. Book a demo opens the modal ----
  await goHome(p);
  await p.evaluate(() => [...document.querySelectorAll('nav button')].find(b => /Book a demo/.test(b.textContent))?.click());
  await sleep(500);
  const demoOpen = await p.evaluate(() => /Book a demo/.test(document.body.innerText) && !!document.querySelector('input'));
  demoOpen ? ok('nav "Book a demo" opens the demo modal') : bad('demo modal did not open');

  // ---- 5. Product/Pricing anchors intact ----
  await goHome(p);
  const anchors = await p.evaluate(() => [...document.querySelectorAll('nav a')].map(a => ({ t: a.textContent.trim(), href: a.getAttribute('href') })));
  const prod = anchors.find(a => a.t === 'Product'), price = anchors.find(a => a.t === 'Pricing');
  (prod?.href === '#product' && price?.href === '#pricing') ? ok('Product/Pricing anchors intact (#product/#pricing)') : bad(`anchors = ${JSON.stringify(anchors)}`);

  await browser.close();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshots: navfix-desktop.png, navfix-tablet.png, navfix-phone.png, navfix-dropdown-open.png');
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('FATAL', e.message); try { if (browser) await browser.close(); } catch {} process.exit(1); });

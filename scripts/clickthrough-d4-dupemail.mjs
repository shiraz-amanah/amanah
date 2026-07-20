// scripts/clickthrough-d4-dupemail.mjs
// D4 #6 verification — duplicate-email error copy in the Add Staff modal.
// DEV ONLY. Drives the REAL UI (puppeteer-core → local dev :5173 → dev DB pbej)
// as the mosque OWNER, submitting an email that already exists on this mosque's
// mosque_staff, down BOTH create paths:
//   Path A — "Onboard in-house"        → createMosqueStaff
//   Path B — "Send invitation (remote)" → createStaffWizardInvite
// Both must surface "A staff member with this email already exists" — never the
// raw Postgres 23505 text, never a generic fallback. Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Documents-amanah-project/c301b5d5-5a36-473d-80eb-fd1e8b63bd20/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'd4-Aa1!';
const EMAILS = { owner: 'd4-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
const DUPE = 'd4-existing@amanah-verify.test';   // seeded onto mosque_staff up front
const EXPECTED = 'A staff member with this email already exists';

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clickText = (p, txt) => p.evaluate((t) => {
  const els = [...document.querySelectorAll('button, a, span, div')].filter(e => (e.textContent || '').trim() === t);
  const el = els[els.length - 1];
  const target = el?.closest('button, a') || el;
  if (!target) return false;
  target.click(); return true;
}, txt);
const clickContains = (p, txt) => p.evaluate((t) => {
  const btns = [...document.querySelectorAll('button')].filter(e => (e.textContent || '').includes(t));
  const b = btns[btns.length - 1];
  if (!b) return false; b.click(); return true;
}, txt);
const setField = (p, label, value) => p.evaluate((l, v) => {
  const lbl = [...document.querySelectorAll('label')].find(x => (x.querySelector('span')?.textContent || '').trim() === l);
  const el = lbl?.querySelector('input');
  if (!el) return false;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}, label, value);

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  const { data: mosques } = ids.length ? await svc.from('mosques').select('id').in('user_id', ids) : { data: [] };
  const mIds = (mosques || []).map(m => m.id);
  if (mIds.length) {
    const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
    const sIds = (staff || []).map(s => s.id);
    if (sIds.length) {
      await svc.from('mosque_staff_onboarding_sessions').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
    }
    await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('mosques').delete().in('id', mIds);
  }
  if (ids.length) {
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

// Drive the modal from a fresh open through to the create button, then read the
// error the UI actually renders.
async function runPath(p, { pathLabel, submitLabel, mosqueId }) {
  console.log(`\n--- PATH: ${pathLabel} ---`);
  // Fresh page load per path — closing the modal in-place proved flaky and a
  // half-closed modal silently poisons the next run.
  await p.goto(APP + '/mosque-dashboard?tab=people&sub=staff', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /D4 Existing Staff/.test(document.body.innerText), { timeout: 25000 });
  await sleep(900);
  await clickContains(p, 'Add staff');
  await p.waitForFunction(() => /How would you like to add them\?/.test(document.body.innerText), { timeout: 15000 });
  await sleep(300);
  await clickContains(p, pathLabel);
  await p.waitForFunction(() => /Full name/.test(document.body.innerText), { timeout: 15000 });
  await sleep(300);

  await setField(p, 'Full name', 'D4 Duplicate Attempt');
  await setField(p, 'Email', DUPE);
  await sleep(250);
  console.log(`   entered email: ${DUPE} (already on this mosque)`);

  // Walk Continue → Continue → … until the create button is on screen.
  for (let i = 0; i < 4; i++) {
    const atEnd = await p.evaluate((s) => [...document.querySelectorAll('button')].some(b => b.textContent.includes(s)), submitLabel);
    if (atEnd) break;
    await clickContains(p, 'Continue');
    await sleep(500);
  }
  // Remote path gates the send behind a contract-acknowledgement checkbox that
  // only renders once the draft contract has finished generating (async effect).
  // Ticking too early is a no-op and leaves the submit disabled — wait for the
  // button to exist, then tick every unchecked box, then wait for it to go live.
  await p.waitForFunction((s) => [...document.querySelectorAll('button')].some(b => b.textContent.includes(s)),
    { timeout: 20000 }, submitLabel);
  await sleep(1200); // let the contract preview + ack checkbox mount
  await p.evaluate(() => {
    [...document.querySelectorAll('input[type=checkbox]')].filter(c => !c.checked).forEach(c => c.click());
  });
  await p.waitForFunction((s) => {
    const b = [...document.querySelectorAll('button')].filter(x => x.textContent.includes(s)).pop();
    return b && !b.disabled;
  }, { timeout: 15000 }, submitLabel).catch(() => console.log('   WARN: submit still disabled after ticking'));
  await sleep(300);

  // Diagnostics: a disabled submit swallows the click silently, which would look
  // identical to "the error never rendered". Prove the button was live.
  const btnState = await p.evaluate((s) => {
    const b = [...document.querySelectorAll('button')].filter(x => x.textContent.includes(s)).pop();
    const cbs = [...document.querySelectorAll('input[type=checkbox]')].map(c => c.checked);
    return b ? { found: true, disabled: b.disabled, text: b.textContent.trim(), checkboxes: cbs } : { found: false, checkboxes: cbs };
  }, submitLabel);
  console.log('   submit button state:', JSON.stringify(btnState));

  // A disabled button would make every downstream assertion pass vacuously.
  btnState.found && btnState.disabled === false
    ? ok(`${pathLabel}: submit button is enabled (the click genuinely fires create())`)
    : bad(`${pathLabel}: submit not clickable — assertions below would be vacuous: ${JSON.stringify(btnState)}`);

  const submitted = await clickContains(p, submitLabel);
  console.log(`   clicked "${submitLabel}": ${submitted}`);
  await sleep(3500);

  const shown = await p.evaluate(() => {
    // The modal renders `err` in a rose-toned line; grab any rose/red text in it.
    const els = [...document.querySelectorAll('p, div, span')]
      .filter(e => e.children.length === 0 && (e.textContent || '').trim())
      .filter(e => /rose|red/.test(e.className || '') || /already exists|duplicate|violates|constraint|went wrong/i.test(e.textContent));
    return [...new Set(els.map(e => e.textContent.trim()))];
  });
  console.log('   error text rendered by the UI:', JSON.stringify(shown));
  const roseText = await p.evaluate(() =>
    [...document.querySelectorAll('.text-rose-600, .text-amber-700')].map(e => e.textContent.trim()));
  console.log('   rose/amber (err + emailWarn) nodes:', JSON.stringify(roseText));

  const joined = shown.join(' | ');
  joined.includes(EXPECTED)
    ? ok(`${pathLabel}: shows "${EXPECTED}"`)
    : bad(`${pathLabel}: expected "${EXPECTED}", got ${JSON.stringify(shown)}`);
  /duplicate key value|violates unique constraint|23505|mosque_staff_mosque_email_unique/i.test(joined)
    ? bad(`${pathLabel}: RAW POSTGRES TEXT LEAKED → ${joined}`)
    : ok(`${pathLabel}: no raw Postgres text leaked`);
  /Something went wrong|Could not create staff record/i.test(joined)
    ? bad(`${pathLabel}: fell through to the generic fallback → ${joined}`)
    : ok(`${pathLabel}: not the generic fallback`);

  // No partial row may survive a rejected create.
  const { data: rows } = await svc.from('mosque_staff').select('id, email').eq('mosque_id', mosqueId);
  console.log(`   mosque_staff rows for this mosque now: ${rows.length} → ${JSON.stringify(rows.map(r => r.email))}`);
  rows.length === 1 ? ok(`${pathLabel}: no duplicate/orphan row created`) : bad(`${pathLabel}: expected 1 row, found ${rows.length}`);

  await p.screenshot({ path: `${SHOT}/d4-dupe-${pathLabel.split(' ')[0].toLowerCase()}.png` });
}

let browser;
(async () => {
  console.log(`clickthrough-d4-dupemail: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + ONE existing staff member…');
  const ownerId = await svc.auth.admin.createUser({ email: EMAILS.owner, password: PW, email_confirm: true })
    .then(r => { if (r.error) throw new Error(r.error.message); return r.data.user.id; });
  await svc.from('profiles').upsert({ id: ownerId, name: 'D4 Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `d4-${ownerId.slice(0, 8)}`, name: 'D4 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, name: 'D4 Existing Staff', role: 'Teacher', status: 'active',
    invite_status: 'not_invited', email: DUPE,
  });
  console.log(`   mosque=${mosque.id}  existing staff email=${DUPE}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1500 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  console.log('   session seeded into localStorage');

  // Path A — in-house → createMosqueStaff
  await runPath(p, { pathLabel: 'Onboard in-house', submitLabel: 'Create staff member', mosqueId: mosque.id });
  // Path B — remote → createStaffWizardInvite
  await runPath(p, { pathLabel: 'Send invitation (remote)', submitLabel: 'send invitation', mosqueId: mosque.id });

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

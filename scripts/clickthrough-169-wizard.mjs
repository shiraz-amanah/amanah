// scripts/clickthrough-169-wizard.mjs
// Migration 169 UI exercise. DEV DATA ONLY — runs against the Vercel PREVIEW
// deployment, whose bundle was verified to carry the DEV supabase ref
// (pbejyukihhmybxxtheqq) before this script was ever run.
//
// Drives the REAL remote-onboarding path end to end:
//   owner → Add staff → "Send invitation (remote)" → salary + hours on step 3
//   → employee opens /staff/onboard/<token> and completes all 9 steps
//     (including the RTW upload, which exercises the Preview-scoped
//      SUPABASE_SERVICE_ROLE_KEY via /api/onboarding-upload)
//   → owner approves in the Onboarding tab
//   → probe mosque_staff_employment for the pence columns.
//
// This is the behaviour test that behcheck-169-dev.mjs cannot be: it proves the
// CLIENT (commit A's employment blob) and the RPC work together.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
process.loadEnvFile('.env');

const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL_ || !URL_.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }

const APP = process.env.P169_APP;          // preview origin
const SHARE = process.env.P169_SHARE || ''; // ?_vercel_share=… bypass token
if (!APP) { console.error('SAFETY: set P169_APP to the preview origin.'); process.exit(1); }
if (/zgoyvztooyxqkcftwylr/.test(APP)) { console.error('SAFETY: APP looks like prod.'); process.exit(1); }

const STORAGE_KEY = `sb-${DEV}-auth-token`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const PW = 'p169-Aa1!';
const EMAILS = { owner: 'p169-owner@amanah-verify.test', staff: 'p169-staff@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

const SALARY_GBP = 28500, HOURS = 37.5;
const EXPECT_SALARY_PENCE = SALARY_GBP * 100;

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const ids = users.filter((u) => emailSet.has(u.email)).map((u) => u.id);
  const { data: mosques } = ids.length ? await svc.from('mosques').select('id').in('user_id', ids) : { data: [] };
  const mIds = (mosques || []).map((m) => m.id);
  if (mIds.length) {
    const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
    const sIds = (staff || []).map((s) => s.id);
    if (sIds.length) {
      await svc.from('mosque_staff_bank_changes').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
    }
    await svc.from('mosque_staff_onboarding_sessions').delete().in('mosque_id', mIds);
    await svc.from('mosque_staff_audit_log').delete().in('mosque_id', mIds);
    await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('mosques').delete().in('id', mIds);
  }
  if (ids.length) {
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

// ---- React-safe field setters (native setter + the event React listens for) ----
const SETTERS = `
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__setSelect = (el, v) => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // Two label shapes in this app:
  //   AddStaffModal L:  <label><span>Label</span><input/></label>   (input INSIDE)
  //   Wizard Field:     <div><label>Label<span> *</span></label><input/></div>  (SIBLING)
  // A <select>'s option text lands in label.textContent, so an exact whole-text
  // match silently fails on every select — match the LEADING text instead.
  window.__labelled = (txt) => {
    const norm = (s) => (s || '').replace(/\\s*\\*\\s*$/, '').trim();
    for (const lab of document.querySelectorAll('label')) {
      const span = lab.querySelector(':scope > span');
      const lead = norm(span ? span.textContent : (lab.childNodes[0] && lab.childNodes[0].textContent));
      const whole = norm(lab.textContent);
      if (lead !== txt && whole !== txt) continue;
      const inside = lab.querySelector('input, select, textarea');
      if (inside) return inside;
      const sib = lab.parentElement && lab.parentElement.querySelector('input, select, textarea');
      if (sib) return sib;
    }
    return null;
  };
  window.__btn = (txt) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === txt);
  window.__btnHas = (txt) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(txt));
`;

const fill = (p, label, value) => p.evaluate((l, v) => {
  const el = window.__labelled(l); if (!el) return false;
  window.__setInput(el, v); return true;
}, label, value);

const pick = (p, label, value) => p.evaluate((l, v) => {
  const el = window.__labelled(l); if (!el) return false;
  window.__setSelect(el, v); return true;
}, label, value);

const click = (p, text) => p.evaluate((t) => {
  const b = window.__btn(t) || window.__btnHas(t); if (!b || b.disabled) return false;
  b.click(); return true;
}, text);

const bodyText = (p) => p.evaluate(() => document.body.innerText);

async function step(p, label, fn) {
  const r = await fn();
  if (r === false) { bad(`UI step failed: ${label}`); throw new Error(`UI step failed: ${label}`); }
  console.log(`   [UI] ${label}`);
  await sleep(500);
}

let browser;
(async () => {
  console.log(`clickthrough-169-wizard: preview=${APP}  dev=${DEV}`);
  console.log('Cleaning prior seed…');
  await teardown();

  const ownerId = (await svc.auth.admin.createUser({ email: EMAILS.owner, password: PW, email_confirm: true })).data.user.id;
  await svc.from('profiles').upsert({ id: ownerId, name: 'P169 Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `p169-${ownerId.slice(0, 8)}`, name: 'P169 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  console.log(`   owner=${ownerId} mosque=${mosque.id}`);

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;
  if (!sess) throw new Error('owner sign-in failed');

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1800 });
  p.on('console', (m) => { if (m.type() === 'error') console.log('   [browser error]', m.text().slice(0, 200)); });

  // Vercel deployment protection: the share link sets the bypass cookie.
  if (SHARE) { await p.goto(`${APP}/?_vercel_share=${SHARE}`, { waitUntil: 'domcontentloaded' }); await sleep(1200); }
  await p.evaluateOnNewDocument(SETTERS);
  await p.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));

  // ================= PHASE 1: owner sends the remote invite =================
  console.log('\n=== PHASE 1: Add staff → remote invite with salary + hours ===');
  await p.goto(`${APP}/mosque-dashboard?tab=people&sub=staff`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Add staff/.test(document.body.innerText), { timeout: 40000 });
  await sleep(1200);

  await step(p, 'open Add staff', () => click(p, 'Add staff'));
  await p.waitForFunction(() => /How would you like to add them\?/.test(document.body.innerText), { timeout: 20000 });
  await step(p, 'choose remote path', () => click(p, 'Send invitation (remote)'));
  await sleep(800);

  await step(p, 'fill name',  () => fill(p, 'Full name', 'P169 Remote Staff'));
  await step(p, 'fill email', () => fill(p, 'Email', EMAILS.staff));
  await step(p, 'employment type = employed_full_time', () => pick(p, 'Employment type', 'employed_full_time'));
  await step(p, 'start date',  () => fill(p, 'Start date', '2026-09-01'));
  await step(p, 'continue → step 3', () => click(p, 'Continue'));
  await sleep(700);

  // The commit-A payload under test.
  await step(p, `salary £${SALARY_GBP}`, () => fill(p, 'Salary (£ / year)', String(SALARY_GBP)));
  await step(p, `hours ${HOURS}`, () => fill(p, 'Hours / week', String(HOURS)));
  await step(p, 'continue → step 4', () => click(p, 'Continue'));

  await p.waitForFunction(() => !/Preparing contract…/.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
  await sleep(1500);

  // Acknowledgement gates the send (only present when a contract attached).
  const ticked = await p.evaluate(() => {
    const cb = document.querySelector('label.bg-amber-50 input[type=checkbox]');
    if (!cb) return 'absent';
    if (!cb.checked) cb.click();
    return cb.checked ? 'ticked' : 'failed';
  });
  console.log(`   [UI] acknowledgement: ${ticked}`);

  await step(p, 'send invitation', () => click(p, 'Looks good — send invitation'));
  await sleep(6000);
  const afterSend = await bodyText(p);
  if (/couldn't be sent|could not be sent/i.test(afterSend)) {
    console.log("   [UI] invite email failed (expected — .test address); record + session still created.");
  }

  const { data: session0 } = await svc.from('mosque_staff_onboarding_sessions')
    .select('id, token, staff_id, status, employment_details').eq('mosque_id', mosque.id).maybeSingle();
  if (!session0) { bad('no onboarding session row created — cannot continue'); throw new Error('no session'); }
  console.log('   session.employment_details =', JSON.stringify(session0.employment_details));

  const ed = session0.employment_details || {};
  (ed.salary_pence === EXPECT_SALARY_PENCE)
    ? ok(`session carries salary_pence=${EXPECT_SALARY_PENCE} (commit A payload reached the DB)`)
    : bad(`session salary_pence = ${JSON.stringify(ed.salary_pence)}, expected ${EXPECT_SALARY_PENCE}`);
  (Number(ed.hours_per_week) === HOURS)
    ? ok(`session carries hours_per_week=${HOURS}`)
    : bad(`session hours_per_week = ${JSON.stringify(ed.hours_per_week)}`);
  (ed.hourly_rate_pence === null)
    ? ok('hourly_rate_pence null on a salaried invite (zero-hours guard)')
    : bad(`hourly_rate_pence = ${JSON.stringify(ed.hourly_rate_pence)}, expected null`);

  // ================= PHASE 2: employee completes the wizard =================
  console.log('\n=== PHASE 2: employee completes /staff/onboard/<token> ===');
  const w = await browser.newPage();          // fresh page: wizard is anon/token-gated
  await w.setViewport({ width: 1400, height: 1800 });
  w.on('console', (m) => { if (m.type() === 'error') console.log('   [wizard error]', m.text().slice(0, 200)); });
  await w.evaluateOnNewDocument(SETTERS);
  if (SHARE) { await w.goto(`${APP}/?_vercel_share=${SHARE}`, { waitUntil: 'domcontentloaded' }); await sleep(800); }
  await w.goto(`${APP}/staff/onboard/${session0.token}`, { waitUntil: 'networkidle2' });
  await w.waitForFunction(() => /Onboarding —/.test(document.body.innerText), { timeout: 40000 });
  await sleep(1200);

  // -- Step 1 Personal
  await step(w, 'phone', () => fill(w, 'Phone', '07700 900111'));
  await step(w, 'dob', () => fill(w, 'Date of birth', '1990-04-01'));
  await step(w, 'emergency contact name', () => fill(w, 'Emergency contact name', 'Aisha Khan'));
  await step(w, 'emergency contact number', () => fill(w, 'Emergency contact number', '07700 900333'));
  await step(w, 'next → RTW', () => click(w, 'Next'));
  await sleep(900);

  // -- Step 2 Right to Work (+ the upload that exercises the Preview service key)
  await step(w, 'rtw check type', () => pick(w, 'Check type', 'manual'));
  await step(w, 'rtw document type (no-expiry)', () => pick(w, 'Document type', 'British/Irish Passport'));
  await step(w, 'rtw check date', () => fill(w, 'Check date', '2026-07-20'));

  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  const tmp = '/tmp/p169-rtw.png';
  writeFileSync(tmp, PNG);
  const fileInput = await w.$('input[type=file]');
  if (!fileInput) { bad('no RTW file input found'); } else {
    await fileInput.uploadFile(tmp);
    await w.waitForFunction(
      () => /Replace file|Upload failed/.test(document.body.innerText), { timeout: 45000 }).catch(() => {});
    const up = await bodyText(w);
    const m = up.match(/Upload failed: [^\n]*/);
    if (m) {
      bad(`RTW UPLOAD FAILED — ${m[0]}`);
      console.log('   ⚠️  Per the brief this is the live test of the Preview SUPABASE_SERVICE_ROLE_KEY.');
      console.log('   ⚠️  STOPPING rather than routing around the step.');
      throw new Error('rtw_upload_failed');
    }
    ok('RTW document uploaded (Preview service key + /api/onboarding-upload work)');
  }
  await step(w, 'next → DBS', () => click(w, 'Next'));
  await sleep(900);

  // -- Step 3 DBS
  await step(w, 'dbs check type', () => pick(w, 'DBS check type', 'enhanced'));
  await step(w, 'workforce type', () => pick(w, 'Workforce type', 'child'));
  await step(w, 'tick both declarations', () => w.evaluate(() => {
    const boxes = [...document.querySelectorAll('label')]
      .filter(l => /never been barred|submitting an Enhanced DBS application on my behalf/.test(l.textContent))
      .map(l => l.querySelector('input[type=checkbox]')).filter(Boolean);
    boxes.forEach(b => { if (!b.checked) b.click(); });
    return boxes.length === 2 && boxes.every(b => b.checked);
  }));
  await step(w, 'next → Employment', () => click(w, 'Next'));
  await sleep(900);

  // -- Steps 4,5 (nothing required)
  await step(w, 'next → Medical', () => click(w, 'Next'));
  await sleep(700);
  await step(w, 'next → Tax', () => click(w, 'Next'));
  await sleep(700);

  // -- Step 6 Tax / P46
  await step(w, 'p46 statement', () => pick(w, 'P46 starter statement', 'A'));
  await step(w, 'next → Bank', () => click(w, 'Next'));
  await sleep(700);

  // -- Step 7 Bank (optional; left blank so no bank_changes row is expected)
  await step(w, 'next → Contract', () => click(w, 'Next'));
  await sleep(900);

  // -- Step 8 Contract: sign if one is attached
  const needsSign = await w.evaluate(() => !!document.querySelector('input[placeholder="Type your full legal name"]'));
  if (needsSign) {
    await step(w, 'type signature', () => w.evaluate(() => {
      const el = document.querySelector('input[placeholder="Type your full legal name"]');
      window.__setInput(el, 'P169 Remote Staff'); return true;
    }));
    await step(w, 'click Sign', () => click(w, 'Sign'));
    await w.waitForFunction(() => /Signed as/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
    ok('contract signed in the wizard');
  } else {
    console.log('   [UI] no contract attached — nothing to sign');
  }
  await step(w, 'next → Review', () => click(w, 'Next'));
  await sleep(900);

  await step(w, 'submit onboarding', () => click(w, 'Submit onboarding'));
  await sleep(4000);

  const { data: session1 } = await svc.from('mosque_staff_onboarding_sessions')
    .select('status').eq('id', session0.id).single();
  (session1.status === 'submitted')
    ? ok('session status = submitted')
    : bad(`session status = ${session1.status}, expected submitted`);
  if (session1.status !== 'submitted') throw new Error('wizard did not submit');

  // ================= PHASE 3: owner approves =================
  console.log('\n=== PHASE 3: owner approves in the Onboarding tab ===');
  await p.goto(`${APP}/mosque-dashboard?tab=people&sub=staff&staffTab=onboarding`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Onboarding/.test(document.body.innerText), { timeout: 40000 });
  await sleep(1500);
  await step(p, 'open Review', () => click(p, 'Review'));
  await sleep(1500);
  await step(p, 'Approve & add to staff', () => click(p, 'Approve & add to staff'));
  await p.waitForFunction(() => /Approved/.test(document.body.innerText), { timeout: 60000 }).catch(() => {});
  await sleep(2500);
  const approvedText = (await bodyText(p)).match(/Approved[^\n]*/);
  console.log('   [UI] approve result:', approvedText ? approvedText[0].slice(0, 160) : '(no banner seen)');

  // ================= PHASE 4: post-approval probes =================
  console.log('\n=== PHASE 4: post-approval SQL probes (dev) ===');
  const { data: empRow } = await svc.from('mosque_staff_employment')
    .select('contract_type, hours_per_week, salary_pence, hourly_rate_pence, salary_rate, emergency_contact_name')
    .eq('staff_id', session0.staff_id).maybeSingle();
  console.log('   mosque_staff_employment =', JSON.stringify(empRow));

  if (!empRow) { bad('NO mosque_staff_employment row after approval'); }
  else {
    (empRow.salary_pence === EXPECT_SALARY_PENCE)
      ? ok(`salary_pence = ${EXPECT_SALARY_PENCE} (£${SALARY_GBP}) — THE DEFECT IS CLOSED`)
      : bad(`salary_pence = ${empRow.salary_pence}, expected ${EXPECT_SALARY_PENCE}`);
    (Number(empRow.hours_per_week) === HOURS)
      ? ok(`hours_per_week = ${HOURS}`) : bad(`hours_per_week = ${empRow.hours_per_week}`);
    (empRow.contract_type === 'employed_full_time')
      ? ok('contract_type = employed_full_time (employment_type key honoured)')
      : bad(`contract_type = ${empRow.contract_type}`);
    (empRow.salary_rate === null)
      ? ok('legacy salary_rate left null') : bad(`salary_rate = ${empRow.salary_rate}`);
    (empRow.emergency_contact_name === 'Aisha Khan')
      ? ok('wizard personal data persisted (emergency contact)')
      : bad(`emergency_contact_name = ${empRow.emergency_contact_name}`);
  }

  // Employment panel render check
  console.log('\n=== PHASE 5: Employment panel renders the pay ===');
  await p.goto(`${APP}/staff/profile?staffId=${session0.staff_id}&section=employment`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Employment/.test(document.body.innerText), { timeout: 40000 }).catch(() => {});
  await sleep(2500);
  // Salary is reveal-gated (migration 163 get_staff_salary — the read is audit
  // logged), so it renders as "Reveal — logged" until clicked. Assert the gate,
  // then click through it and assert the value.
  const panel = await bodyText(p);
  /Reveal — logged/.test(panel)
    ? ok('Salary row is reveal-gated (163 audit-logged read), as designed')
    : bad('expected a reveal gate on the Salary row — ' + (panel.match(/Salary[^\n]*/) || ['(no Salary row)'])[0]);
  /37\.5/.test(panel)
    ? ok('Employment panel renders hours / week = 37.5')
    : bad('hours not visible in the Employment panel');

  await step(p, 'click Reveal on Salary', () => click(p, 'Reveal — logged'));
  await p.waitForFunction(() => /28,500|28500/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
  await sleep(800);
  const revealed = await bodyText(p);
  /28,500|28500/.test(revealed)
    ? ok('revealed salary renders as £28,500 in the Employment panel')
    : bad('revealed salary not shown — ' + (revealed.match(/Salary[^\n]*/) || ['(no Salary row)'])[0]);
  await p.screenshot({ path: '/tmp/p169-employment-panel.png', fullPage: false });
  console.log('   screenshot: /tmp/p169-employment-panel.png');

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Cleaning up seed…');
  await teardown();
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { await browser?.close(); } catch {}
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed (aborted) ====`);
  console.log('NOTE: seed rows left in place for inspection. Re-run to clean.');
  process.exit(1);
});

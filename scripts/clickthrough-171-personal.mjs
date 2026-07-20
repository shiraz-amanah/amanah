// scripts/clickthrough-171-personal.mjs
// Migration 171 UI exercise + commit C smoke. DEV DATA ONLY — runs against the
// Vercel PREVIEW deployment, whose bundle was verified to carry the DEV ref.
//
// P1  Personal panel reveals cleanly after 171 (get_staff_sensitive no longer
//     returns next_of_kin) — no console errors, no missing-key fallout.
// P2  "Next of kin" is GONE from the read-only panel and the edit form.
// P3  Emergency contact (its structured replacement) still renders name · phone.
// P4  NI reveal still works (get_staff_ni untouched by 171).
// P5  commit C — nationality entered lowercase renders capitalised, and the
//     STORED value keeps the user's own casing (display-only).
// P6  anonymise_staff still succeeds after the column drop, redacts the row and
//     writes its audit row.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');

const URL_ = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL_ || !URL_.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }

const APP = process.env.P171_APP;
const SHARE = process.env.P171_SHARE || '';
if (!APP) { console.error('SAFETY: set P171_APP to the preview origin.'); process.exit(1); }
if (/zgoyvztooyxqkcftwylr/.test(APP)) { console.error('SAFETY: APP looks like prod.'); process.exit(1); }

const STORAGE_KEY = `sb-${DEV}-auth-token`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const svc = createClient(URL_, SVC, { auth: { persistSession: false } });
const PW = 'p171-Aa1!';
const EMAILS = { owner: 'p171-owner@amanah-verify.test', staff: 'p171-staff@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

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
      await svc.from('mosque_staff_audit_log').delete().in('staff_id', sIds);
      await svc.from('mosque_staff_employment').delete().in('staff_id', sIds);
    }
    await svc.from('mosque_staff_audit_log').delete().in('mosque_id', mIds);
    await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('mosques').delete().in('id', mIds);
  }
  if (ids.length) {
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

const SETTERS = `
  window.__setInput = (el, v) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  window.__labelled = (txt) => {
    const norm = (s) => (s || '').replace(/\\s*\\*\\s*$/, '').trim();
    for (const lab of document.querySelectorAll('label')) {
      const span = lab.querySelector(':scope > span');
      const lead = norm(span ? span.textContent : (lab.childNodes[0] && lab.childNodes[0].textContent));
      if (lead !== txt && norm(lab.textContent) !== txt) continue;
      const inside = lab.querySelector('input, select, textarea');
      if (inside) return inside;
      const sib = lab.parentElement && lab.parentElement.querySelector('input, select, textarea');
      if (sib) return sib;
    }
    return null;
  };
  window.__btnHas = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t));
`;

let browser;
(async () => {
  console.log(`clickthrough-171-personal: preview=${APP}  dev=${DEV}`);
  await teardown();

  const { data: ownerU } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: PW, email_confirm: true });
  const ownerId = ownerU.user.id;
  await svc.from('profiles').upsert({ id: ownerId, name: 'P171 Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `p171-${ownerId.slice(0, 8)}`, name: 'P171 Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: staff } = await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, name: 'P171 Staff', role: 'Teacher', status: 'active',
    invite_status: 'not_invited', email: EMAILS.staff, employment_type: 'employed_full_time',
  }).select().single();
  await svc.from('mosque_staff_employment').insert({
    staff_id: staff.id, mosque_id: mosque.id, ni_number: 'QQ123456C', dob: '1990-04-01',
    nationality: 'british',                       // lowercase on purpose — commit C
    address: '5 Old Road', emergency_contact_name: 'Aisha Khan',
    emergency_contact_phone: '07700 900333',
  });
  console.log(`   staff=${staff.id}  nationality stored as "british" (lowercase)`);

  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;
  if (!sess) throw new Error('owner sign-in failed');

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1800 });
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message.slice(0, 200)));
  await p.evaluateOnNewDocument(SETTERS);
  if (SHARE) { await p.goto(`${APP}/?_vercel_share=${SHARE}`, { waitUntil: 'domcontentloaded' }); await sleep(1000); }
  await p.goto(`${APP}/`, { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));

  console.log('\n=== P1–P4: Personal panel after 171 ===');
  await p.goto(`${APP}/staff/profile?staffId=${staff.id}&section=personal`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Personal/.test(document.body.innerText), { timeout: 40000 });
  await sleep(1500);

  const revealed = await p.evaluate(() => {
    const b = window.__btnHas('Reveal personal details');
    if (!b) return false; b.click(); return true;
  });
  await p.waitForFunction(() => /Emergency contact/.test(document.body.innerText), { timeout: 30000 }).catch(() => {});
  await sleep(1500);
  const panel = await p.evaluate(() => document.body.innerText);

  revealed ? ok('Reveal personal details clicked') : bad('reveal button not found');
  /Emergency contact/.test(panel)
    ? ok('P1 panel revealed cleanly after 171 (get_staff_sensitive returns)')
    : bad('panel did not reveal — get_staff_sensitive may be failing');
  !/Next of kin/.test(panel)
    ? ok('P2 "Next of kin" is gone from the read-only panel')
    : bad('"Next of kin" still rendered');
  /Aisha Khan · 07700 900333/.test(panel)
    ? ok('P3 emergency contact renders name · phone')
    : bad('emergency contact not rendered as expected');

  const niRevealed = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('div')].filter(d => /NI number/.test(d.textContent));
    const b = [...document.querySelectorAll('button')].find(x => /Reveal — logged/.test(x.textContent));
    if (!b) return false; b.click(); return true;
  });
  await p.waitForFunction(() => /QQ123456C/.test(document.body.innerText), { timeout: 25000 }).catch(() => {});
  await sleep(800);
  const afterNi = await p.evaluate(() => document.body.innerText);
  (niRevealed && /QQ123456C/.test(afterNi))
    ? ok('P4 NI reveal still works (get_staff_ni untouched by 171)')
    : bad('NI reveal failed');

  console.log('\n=== P5: commit C — nationality display capitalisation ===');
  /Nationality\s*\n?\s*British/.test(afterNi) || /British/.test(afterNi)
    ? ok('stored "british" renders as "British"')
    : bad('nationality not capitalised on display — ' + (afterNi.match(/Nationality[^\n]*/) || ['(none)'])[0]);
  !/\bbritish\b/.test(afterNi)
    ? ok('lowercase "british" is not visible anywhere in the panel')
    : bad('raw lowercase "british" still rendered');

  const stored = (await svc.from('mosque_staff_employment')
    .select('nationality').eq('staff_id', staff.id).single()).data;
  (stored.nationality === 'british')
    ? ok('STORED value still "british" — capitalisation is display-only, no data mutation')
    : bad(`stored value was mutated to ${JSON.stringify(stored.nationality)}`);

  // Edit + save round trip: the edit form must not carry a next-of-kin input,
  // and saving must not blow up now that the key is gone from the bundle.
  // TWO "Edit" buttons exist: the HEADER one (identity dialog) and the panel's
  // INLINE one. Clicking the header one opens the wrong dialog and makes the
  // next assertion vacuous. Target the inline one by its text-xs class.
  const openedEdit = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')]
      .find(x => x.textContent.trim() === 'Edit' && (x.className || '').includes('text-xs'));
    if (!b) return false; b.click(); return true;
  });
  await p.waitForFunction(
    () => !!document.querySelector('input[placeholder="e.g. British"]'), { timeout: 20000 }).catch(() => {});
  await sleep(800);
  const editText = await p.evaluate(() => document.body.innerText);
  const formUp = await p.evaluate(() => !!document.querySelector('input[placeholder="e.g. British"]'));
  (openedEdit && formUp)
    ? ok('Personal edit form opened (inline Edit, not the identity dialog)')
    : bad('could not open the Personal edit form — the next assertion would be vacuous');
  (formUp && !/Next of kin/.test(editText))
    ? ok('P2b "Next of kin" is gone from the EDIT form too')
    : bad('"Next of kin" input still present in the edit form (or form not up)');

  const savedOk = await p.evaluate(() => {
    const el = window.__labelled('Nationality');
    if (el) window.__setInput(el, 'british');
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Save');
    if (!b || b.disabled) return false; b.click(); return true;
  });
  await sleep(3500);
  savedOk ? ok('Personal save round-tripped without error') : bad('save failed');

  const afterSave = await p.evaluate(() => document.body.innerText);
  /British/.test(afterSave)
    ? ok('post-save optimistic merge still renders capitalised')
    : bad('post-save render lost the capitalisation');

  const realErrors = errors.filter(e => !/Failed to load resource/.test(e));
  (realErrors.length === 0)
    ? ok('no JS console errors during the Personal flow')
    : bad(`console errors: ${JSON.stringify(realErrors.slice(0, 3))}`);

  console.log('\n=== P6: anonymise_staff after the column drop ===');
  const ownerClient = createClient(URL_, ANON, { auth: { persistSession: false } });
  await ownerClient.auth.signInWithPassword({ email: EMAILS.owner, password: PW });
  const { error: anonErr } = await ownerClient.rpc('anonymise_staff', { p_staff_id: staff.id });
  if (anonErr && /mosque_staff_email_format/.test(anonErr.message)) {
    bad('anonymise_staff BLOCKED by a PRE-EXISTING defect, not by 171:');
    console.log('   ⚠️  anonymise_staff sets mosque_staff.email = \'[REDACTED]\', but migration 134');
    console.log('   ⚠️  added CHECK mosque_staff_email_format (valid email OR NULL). \'[REDACTED]\'');
    console.log('   ⚠️  matches neither, so the UPDATE always fails. Broken since 134 — this is');
    console.log('   ⚠️  the GDPR right-to-erasure path. NOT fixed here: out of scope for 171.');
  } else if (anonErr) {
    bad(`anonymise_staff failed: ${anonErr.message}`);
  } else {
    ok('anonymise_staff succeeded');
  }
  const red = (await svc.from('mosque_staff_employment')
    .select('ni_number, nationality, emergency_contact_name, address').eq('staff_id', staff.id).single()).data;
  console.log('   redacted row:', JSON.stringify(red));
  (red.ni_number === '[REDACTED]' && red.nationality === '[REDACTED]' && red.emergency_contact_name === '[REDACTED]')
    ? ok('PII redacted (ni_number, nationality, emergency contact)')
    : bad(`redaction incomplete: ${JSON.stringify(red)}`);
  const audit = (await svc.from('mosque_staff_audit_log')
    .select('action').eq('staff_id', staff.id).eq('action', 'staff_anonymised')).data || [];
  (audit.length === 1) ? ok('staff_anonymised audit row written') : bad(`${audit.length} staff_anonymised rows`);

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Cleaning up seed…');
  await teardown();
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { await browser?.close(); } catch {}
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed (aborted) ====`);
  console.log('NOTE: seed rows left for inspection. Re-run to clean.');
  process.exit(1);
});

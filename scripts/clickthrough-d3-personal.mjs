// scripts/clickthrough-d3-personal.mjs
// D3 client verification — Personal panel NI reveal + blank-NI keep semantics.
// DEV ONLY. Drives the REAL UI (puppeteer-core → local dev :5173 → dev DB pbej)
// as the mosque OWNER, then probes the dev DB directly for the audit row and the
// stored ni_number. Tears down its own seed.
//
// Probe 1 — NI reveal: Personal panel shows the NI MASKED, "Reveal — logged"
//   swaps in the plaintext, and mosque_staff_audit_log gains EXACTLY ONE
//   'ni_number_viewed' row for this staff_id.
// Probe 2 — blank NI save: Edit → change phone, leave NI blank, Save → the
//   stored ni_number is UNCHANGED (blank means "keep", never "clear").
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
const PW = 'd3-Aa1!';
const EMAILS = { owner: 'd3-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));

const NI = 'QQ123456C';           // seeded plaintext
const MASKED = 'QQ•••••••C';      // what maskNi() must render
const OLD_PHONE = '07700 900111';
const NEW_PHONE = '07700 900222';

let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const bodyText = p => p.evaluate(() => document.body.innerText);
// Click the first element whose exact trimmed text matches (leaf-most wins).
const clickText = (p, txt) => p.evaluate((t) => {
  const els = [...document.querySelectorAll('button, a, span')].filter(e => (e.textContent || '').trim() === t);
  const el = els[els.length - 1];
  const target = el?.closest('button, a') || el;
  if (!target) return false;
  target.click(); return true;
}, txt);

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  const { data: mosques } = ids.length ? await svc.from('mosques').select('id').in('user_id', ids) : { data: [] };
  const mIds = (mosques || []).map(m => m.id);
  if (mIds.length) {
    const { data: staff } = await svc.from('mosque_staff').select('id').in('mosque_id', mIds);
    const sIds = (staff || []).map(s => s.id);
    if (sIds.length) {
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
async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  await svc.from('profiles').upsert({ id: data.user.id, name }, { onConflict: 'id' });
  return data.user.id;
}

let browser;
(async () => {
  console.log(`clickthrough-d3-personal: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding owner + mosque + staff + employment (ni_number, address, emergency contact)…');
  const ownerId = await mkUser(EMAILS.owner, 'D3 Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `d3-${ownerId.slice(0, 8)}`, name: 'D3 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: staff } = await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, name: 'D3 Teacher', role: 'Teacher', status: 'active',
    invite_status: 'not_invited', email: 'd3-teacher@amanah-verify.test', phone: OLD_PHONE,
  }).select().single();
  await svc.from('mosque_staff_employment').insert({
    staff_id: staff.id, mosque_id: mosque.id, ni_number: NI,
    address: '5 Old Road, Bradford', emergency_contact_name: 'Aisha Khan',
    emergency_contact_phone: '07700 900333', nationality: 'British',
  });
  console.log(`   staff_id=${staff.id}  seeded ni_number=${NI}  phone=${OLD_PHONE}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1500 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + `/staff/profile?staffId=${staff.id}&section=personal`, { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /D3 Teacher/.test(document.body.innerText), { timeout: 20000 });
  await sleep(800);

  // ---------- PROBE 1: NI reveal ----------
  console.log('\n=== PROBE 1: NI reveal path ===');

  // 1a. Before any reveal, the panel is behind the sensitive-bundle button and NI
  //     must NOT be on screen in any form.
  let t = await bodyText(p);
  console.log('--- panel text (pre-reveal) ---\n' + t.split('\n').filter(Boolean).slice(-14).join('\n'));
  (!t.includes(NI) && !t.includes(MASKED))
    ? ok('pre-reveal: neither plaintext nor masked NI on screen')
    : bad(`pre-reveal leaked NI: plaintext=${t.includes(NI)} masked=${t.includes(MASKED)}`);

  // 1b. Reveal the sensitive bundle → NI row should appear MASKED.
  await clickText(p, 'Reveal personal details — access is logged');
  await p.waitForFunction(() => /NI number/.test(document.body.innerText), { timeout: 15000 });
  await sleep(600);
  t = await bodyText(p);
  const niLine = t.split('\n').find(l => l.includes('NI number')) || '(NI number line not found)';
  const maskedIdx = t.indexOf('NI number');
  console.log('--- after sensitive reveal ---\n' + t.slice(maskedIdx, maskedIdx + 120).split('\n').filter(Boolean).join(' | '));
  (t.includes(MASKED) && !t.includes(NI))
    ? ok(`NI shows MASKED ${MASKED}, plaintext absent`)
    : bad(`expected masked ${MASKED} without plaintext — masked=${t.includes(MASKED)} plaintext=${t.includes(NI)} line="${niLine}"`);

  const auditBefore = await svc.from('mosque_staff_audit_log').select('action').eq('staff_id', staff.id).eq('action', 'ni_number_viewed');
  console.log('   ni_number_viewed rows BEFORE clicking Reveal — logged:', (auditBefore.data || []).length);
  (auditBefore.data || []).length === 0
    ? ok('no ni_number_viewed row yet (mask alone does not audit)')
    : bad(`expected 0 ni_number_viewed rows, got ${(auditBefore.data || []).length}`);

  await p.screenshot({ path: `${SHOT}/d3-personal-masked.png` });

  // 1c. Click the NI-specific "Reveal — logged" → plaintext + exactly one audit row.
  const clicked = await clickText(p, 'Reveal — logged');
  console.log('   clicked "Reveal — logged":', clicked);
  await p.waitForFunction((ni) => document.body.innerText.includes(ni), { timeout: 15000 }, NI).catch(() => {});
  await sleep(600);
  t = await bodyText(p);
  const revIdx = t.indexOf('NI number');
  console.log('--- after NI reveal ---\n' + t.slice(revIdx, revIdx + 120).split('\n').filter(Boolean).join(' | '));
  (t.includes(NI) && !t.includes(MASKED))
    ? ok(`plaintext NI ${NI} shown, mask replaced`)
    : bad(`expected plaintext ${NI} — plaintext=${t.includes(NI)} masked=${t.includes(MASKED)}`);

  const auditAfter = await svc.from('mosque_staff_audit_log')
    .select('id, action, actor_id, staff_id, mosque_id, details, created_at')
    .eq('staff_id', staff.id).eq('action', 'ni_number_viewed');
  console.log('   ni_number_viewed rows AFTER:', JSON.stringify(auditAfter.data, null, 2));
  (auditAfter.data || []).length === 1
    ? ok('EXACTLY ONE ni_number_viewed row')
    : bad(`expected exactly 1 ni_number_viewed row, got ${(auditAfter.data || []).length}`);
  ((auditAfter.data || [])[0]?.actor_id === ownerId)
    ? ok('audit row actor_id == owner')
    : bad(`actor_id mismatch: ${(auditAfter.data || [])[0]?.actor_id} != ${ownerId}`);

  await p.screenshot({ path: `${SHOT}/d3-personal-revealed.png` });

  // ---------- PROBE 2: blank NI save keeps the stored number ----------
  console.log('\n=== PROBE 2: blank NI save (keep semantics) ===');
  const beforeRow = (await svc.from('mosque_staff_employment')
    .select('ni_number, address, emergency_contact_name, emergency_contact_phone').eq('staff_id', staff.id).single()).data;
  console.log('   employment BEFORE save:', JSON.stringify(beforeRow));

  await clickText(p, 'Edit');
  await p.waitForFunction(() => /National Insurance number/.test(document.body.innerText), { timeout: 15000 });
  await sleep(500);

  // Confirm the NI input is BLANK (never pre-filled with the revealed value).
  const niInputState = await p.evaluate(() => {
    const lbl = [...document.querySelectorAll('label')].find(l => /National Insurance number/.test(l.textContent || ''));
    const el = lbl?.parentElement?.querySelector('input');
    return el ? { value: el.value, placeholder: el.placeholder } : null;
  });
  console.log('   NI input on entering Edit:', JSON.stringify(niInputState));
  (niInputState && niInputState.value === '')
    ? ok('NI field is BLANK on entering Edit (not pre-filled with the revealed value)')
    : bad(`NI field not blank: ${JSON.stringify(niInputState)}`);

  // Change the phone, leave NI untouched, Save.
  const typed = await p.evaluate((newPhone) => {
    const lbl = [...document.querySelectorAll('label')].find(l => /^Phone$/.test((l.textContent || '').trim()));
    const el = lbl?.parentElement?.querySelector('input');
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, newPhone);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }, NEW_PHONE);
  console.log('   phone field set to', NEW_PHONE, '→', typed);

  await clickText(p, 'Save');
  await p.waitForFunction(() => /Personal details updated/.test(document.body.innerText), { timeout: 20000 })
    .catch(() => console.log('   (no "Personal details updated" toast seen — checking DB anyway)'));
  await sleep(1200);

  const afterRow = (await svc.from('mosque_staff_employment')
    .select('ni_number, address, emergency_contact_name, emergency_contact_phone').eq('staff_id', staff.id).single()).data;
  const afterStaff = (await svc.from('mosque_staff').select('phone').eq('id', staff.id).single()).data;
  console.log('   employment AFTER save:', JSON.stringify(afterRow));
  console.log('   mosque_staff AFTER save:', JSON.stringify(afterStaff));

  afterRow?.ni_number === NI
    ? ok(`ni_number PRESERVED (${afterRow.ni_number}) — blank field did not clear it`)
    : bad(`ni_number changed/cleared: ${JSON.stringify(afterRow?.ni_number)} (expected ${NI})`);
  afterStaff?.phone === NEW_PHONE
    ? ok(`phone updated to ${afterStaff.phone}`)
    : bad(`phone not updated: ${JSON.stringify(afterStaff?.phone)} (expected ${NEW_PHONE})`);
  (afterRow?.address === beforeRow?.address && afterRow?.emergency_contact_name === beforeRow?.emergency_contact_name)
    ? ok('address + emergency contact round-tripped unchanged')
    : bad(`collateral change: ${JSON.stringify(afterRow)} vs ${JSON.stringify(beforeRow)}`);

  // The save must NOT have triggered another NI view audit.
  const auditFinal = await svc.from('mosque_staff_audit_log').select('action').eq('staff_id', staff.id).eq('action', 'ni_number_viewed');
  console.log('   ni_number_viewed rows after save:', (auditFinal.data || []).length);
  (auditFinal.data || []).length === 1
    ? ok('still exactly 1 ni_number_viewed row (save did not re-reveal)')
    : bad(`ni_number_viewed count drifted to ${(auditFinal.data || []).length}`);

  await p.screenshot({ path: `${SHOT}/d3-personal-saved.png` });

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

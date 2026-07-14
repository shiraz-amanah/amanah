// scripts/clickthrough-colour-split.mjs
// Verifies the Job-A colour split on the COMPLIANCE screen (StaffDirectory). DEV
// ONLY. Seeds a mosque + two staff (one DBS Verified, one DBS Expired), drives
// Chrome to the staff directory, and captures the ACTUAL rendered colours of:
//   - a DBS "Expired" badge  -> must be RED (rose), clearly not green
//   - a DBS "Verified" badge -> must be GREEN (success token == emerald today)
//   - the "Add staff" brand button -> must be GREEN (brand == emerald today)
// so the split reads at a glance: expired is distinguishable, while success-green
// and brand-green are DELIBERATELY identical today (two tokens, same value).
// Tears down its own seed.
import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY, ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
const STORAGE_KEY = `sb-${DEV}-auth-token`;
const APP = 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SHOT = '/private/tmp/claude-501/-Users-shirazahmed-Library-Mobile-Documents-com-apple-CloudDocs-Documents-amanah-project/590494b8-60b5-4f5d-81de-b31c7787153c/scratchpad';
const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const PW = 'coloursplit-Aa1!';
const EMAILS = { owner: 'coloursplit-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const days = n => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
// Expected Tailwind emerald / rose values (what success-*/rose-* must resolve to).
const EMERALD_50 = 'rgb(236, 253, 245)', EMERALD_600 = 'rgb(5, 150, 105)', EMERALD_700 = 'rgb(4, 120, 87)';

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
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
// Computed bg + text colour of the badge whose exact text === label.
async function badgeStyle(page, label) {
  return page.evaluate((label) => {
    const els = [...document.querySelectorAll('span, div')].filter(e => (e.textContent || '').trim() === label);
    for (const e of els) {
      const cs = getComputedStyle(e);
      if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        return { bg: cs.backgroundColor, color: cs.color };
      }
    }
    return null;
  }, label);
}

let browser;
(async () => {
  console.log(`clickthrough-colour-split: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding mosque + 2 staff (DBS verified / DBS expired)…');
  const ownerId = await mkUser(EMAILS.owner, 'ColourSplit Owner');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `coloursplit-${ownerId.slice(0, 8)}`, name: 'ColourSplit Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  await svc.from('mosque_staff').insert([
    { mosque_id: mosque.id, name: 'Aisha Rahman', role: 'Teacher', status: 'active', invite_status: 'active',
      dbs_required: true, dbs_level: 'enhanced', dbs_status: 'verified', dbs_expiry_date: days(365) },
    { mosque_id: mosque.id, name: 'Bilal Khan', role: 'Teacher', status: 'active', invite_status: 'active',
      dbs_required: true, dbs_level: 'enhanced', dbs_status: 'expired', dbs_expiry_date: days(-30) },
  ]);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await anon.auth.signInWithPassword({ email: EMAILS.owner, password: PW });

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1400, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess.session));
  await p.goto(APP + '/mosque-dashboard?tab=people&sub=staff', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Add staff/i.test(document.body.innerText) && /Aisha Rahman/.test(document.body.innerText), { timeout: 25000 });
  await sleep(800);
  await p.screenshot({ path: `${SHOT}/colour-split-staff-directory.png` });

  // --- Capture the three rendered colours ---
  const verified = await badgeStyle(p, 'Verified');
  const expired = await badgeStyle(p, 'Expired');
  const addBtn = await p.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Add staff/i.test(x.textContent));
    if (!b) return null; const cs = getComputedStyle(b); return { bg: cs.backgroundColor, color: cs.color };
  });
  console.log('  Verified DBS badge :', JSON.stringify(verified));
  console.log('  Expired  DBS badge :', JSON.stringify(expired));
  console.log('  "Add staff" button :', JSON.stringify(addBtn));

  // --- Assertions ---
  verified ? ok('Verified badge rendered') : bad('no Verified badge found');
  expired ? ok('Expired badge rendered') : bad('no Expired badge found');
  addBtn ? ok('Add staff brand button rendered') : bad('no Add staff button found');

  // success-* resolves to emerald (== today's brand): Verified badge is emerald-50/700.
  verified?.bg === EMERALD_50 ? ok(`Verified badge bg is success-green (${EMERALD_50}) — success-50 == emerald-50`) : bad(`Verified bg = ${verified?.bg}, expected ${EMERALD_50}`);
  verified?.color === EMERALD_700 ? ok(`Verified badge text is success-700 (${EMERALD_700})`) : bad(`Verified text = ${verified?.color}`);

  // Expired is RED, clearly not the green — the split still lets red read as red.
  (expired && expired.bg !== EMERALD_50 && /rgb\(25[0-9]|rgb\(255/.test(expired.bg))
    ? ok(`Expired badge bg is RED (${expired.bg}) — distinguishable from success-green`)
    : bad(`Expired bg = ${expired?.bg}, expected a red/rose tone`);

  // Brand button green == success-green today (DELIBERATE identical): both emerald.
  addBtn?.bg === EMERALD_600 ? ok(`Brand button bg is brand-green (${EMERALD_600}) — emerald-600`) : bad(`Add staff bg = ${addBtn?.bg}, expected ${EMERALD_600}`);
  console.log(`\n  DELIBERATE: success-green (Verified) and brand-green (Add staff) are the SAME emerald family today — two tokens, one value. Expired reads RED, distinct.`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: colour-split-staff-directory.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

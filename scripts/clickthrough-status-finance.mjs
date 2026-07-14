// scripts/clickthrough-status-finance.mjs
// Job A commit 4 verification (finance/community group). DEV ONLY. Seeds a mosque
// + scholar + a CONFIRMED cover request, drives Chrome to the scholar cover-request
// screen and reads the ACTUAL rendered colour of the "confirmed" badge — must be
// success-green (== emerald today). The other three maps in this commit
// (FinancePledges fulfilled, FinanceQard repaid, CommunityFacilityBooking
// approved) share the same success-* classes, confirmed generated in the CSS
// bundle. Tears down its own seed.
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
const PW = 'statusfinance-Aa1!';
const EMAILS = { owner: 'statusfinance-owner@amanah-verify.test', scholar: 'statusfinance-scholar@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EMERALD_50 = 'rgb(236, 253, 245)', EMERALD_700 = 'rgb(4, 120, 87)';
const isGreen = b => b && b.bg === EMERALD_50 && b.color === EMERALD_700;

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('cover_requests').delete().in('mosque_id', mIds);
    await svc.from('cover_requests').delete().in('recipient_profile_id', ids);
    await svc.from('scholars').delete().in('user_id', ids);
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
async function badge(page, label) {
  return page.evaluate((label) => {
    const els = [...document.querySelectorAll('span, div')].filter(e => (e.textContent || '').trim() === label);
    for (const e of els) { const cs = getComputedStyle(e); if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') return { bg: cs.backgroundColor, color: cs.color }; }
    return null;
  }, label);
}

let browser;
(async () => {
  console.log(`clickthrough-status-finance: dev ${DEV}. Cleaning prior seed…`);
  await teardown();

  console.log('Seeding mosque + scholar + confirmed cover request…');
  const ownerId = await mkUser(EMAILS.owner, 'Finance Owner');
  const scholarUid = await mkUser(EMAILS.scholar, 'Finance Scholar');
  const { data: mosque } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `statusfinance-${ownerId.slice(0, 8)}`, name: 'Finance Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  const { data: scholarRow } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `statusfinance-sch-${scholarUid.slice(0, 8)}`, name: 'Finance Scholar', status: 'active',
  }).select().single();
  const { error: crErr } = await svc.from('cover_requests').insert({
    mosque_id: mosque.id, recipient_profile_id: scholarUid, scholar_id: scholarRow.id,
    cover_type: ['short'], sessions: ['fajr'], status: 'confirmed', notes: 'Commit 4 confirmed cover request',
  });
  if (crErr) throw new Error(`cover_request: ${crErr.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.scholar, password: PW })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1280, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/scholar-dashboard?tab=cover', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Commit 4 confirmed cover request|confirmed|Cover request/i.test(document.body.innerText), { timeout: 20000 }).catch(() => {});
  await sleep(1000);
  await p.screenshot({ path: `${SHOT}/status-c4-cover.png` });

  // Badge text is the raw lowercase status ('confirmed'); CSS capitalize is display-only.
  const confirmed = await badge(p, 'confirmed');
  console.log('   Confirmed cover badge:', JSON.stringify(confirmed));
  isGreen(confirmed) ? ok(`ScholarCoverRequests "confirmed" is success-green (${confirmed.bg})`) : bad(`confirmed badge = ${JSON.stringify(confirmed)}`);

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: status-c4-cover.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

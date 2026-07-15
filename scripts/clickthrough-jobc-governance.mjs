// scripts/clickthrough-jobc-governance.mjs
// Job C (Governance cluster) representative verification — GovernanceActions status
// map (structurally identical to FinanceQard's verified STATUS map + shared by the
// paid/present/quorum success calls in this cluster). DEV ONLY. Seeds a mosque + 3
// actions and confirms the badge map renders: complete->success, in_progress->amber,
// overdue->rose.
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
const EMAILS = { owner: 'gov-owner@amanah-verify.test' };
const emailSet = new Set(Object.values(EMAILS));
let pass = 0, fail = 0;
const ok = m => { pass++; console.log('  ✅', m); }; const bad = m => { fail++; console.log('  ❌', m); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S50 = 'rgb(236, 253, 245)', S800 = 'rgb(6, 95, 70)', AMBER = 'rgb(180, 83, 9)', ROSE = 'rgb(190, 18, 60)';
const dISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) { await svc.from('governance_actions').delete().in('mosque_id', mIds); await svc.from('mosques').delete().in('id', mIds); }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

let browser;
(async () => {
  console.log(`clickthrough-jobc-governance: dev ${DEV}. Cleaning prior seed…`);
  await teardown();
  console.log('Seeding owner + mosque + 3 actions (complete/in_progress/overdue)…');
  const { data: u } = await svc.auth.admin.createUser({ email: EMAILS.owner, password: 'gov-Aa1!', email_confirm: true });
  await svc.from('profiles').upsert({ id: u.user.id, name: 'Gov Owner' }, { onConflict: 'id' });
  const { data: mosque } = await svc.from('mosques').insert({ user_id: u.user.id, slug: `gov-${u.user.id.slice(0, 8)}`, name: 'Gov Test Masjid', address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active' }).select().single();
  const { error } = await svc.from('governance_actions').insert([
    { mosque_id: mosque.id, description: 'Done task', status: 'complete' },
    { mosque_id: mosque.id, description: 'Ongoing task', status: 'in_progress', due_date: dISO(14) },
    { mosque_id: mosque.id, description: 'Late task', status: 'in_progress', due_date: dISO(-7) },
  ]);
  if (error) throw new Error(`actions: ${error.message}`);

  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const sess = (await anon.auth.signInWithPassword({ email: EMAILS.owner, password: 'gov-Aa1!' })).data.session;

  browser = await puppeteer.launch({ headless: 'new', executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await browser.newPage();
  await p.setViewport({ width: 1300, height: 1200 });
  await p.goto(APP + '/', { waitUntil: 'domcontentloaded' });
  await p.evaluate((k, v) => localStorage.setItem(k, v), STORAGE_KEY, JSON.stringify(sess));
  await p.goto(APP + '/mosque-dashboard?tab=governance&sub=actions', { waitUntil: 'networkidle2' });
  await p.waitForFunction(() => /Done task|Late task|action|Add action/i.test(document.body.innerText), { timeout: 20000 });
  await sleep(900);
  await p.screenshot({ path: `${SHOT}/jobc-governance-actions.png`, fullPage: true });

  // collect all badge-ish spans (small pill) by bg color
  const badges = await p.evaluate(() => [...document.querySelectorAll('span')].filter(s => { const cs = getComputedStyle(s); return cs.borderRadius.includes('9999') || parseFloat(cs.borderRadius) >= 8; }).map(s => ({ bg: getComputedStyle(s).backgroundColor, color: getComputedStyle(s).color, t: s.textContent.trim().slice(0, 16) })));
  const hasSuccess = badges.some(b => b.bg === S50 && b.color === S800);
  const hasAmber = badges.some(b => b.color === AMBER);
  const hasRose = badges.some(b => b.color === ROSE);
  hasSuccess ? ok(`"complete" badge is success-shade (bg-success-50 / text-success-800)`) : bad('no success badge found');
  hasAmber ? ok(`"in_progress" badge stays amber-700 — unchanged`) : bad('no amber badge found');
  hasRose ? ok(`"overdue" badge stays rose-700 — unchanged`) : bad('no rose badge found');

  await browser.close();
  console.log('\nTearing down seed…');
  await teardown();
  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  console.log('Screenshot: jobc-governance-actions.png');
  process.exit(fail ? 1 : 0);
})().catch(async (e) => { console.error('FATAL:', e.message); try { if (browser) await browser.close(); } catch {} try { await teardown(); } catch {} process.exit(1); });

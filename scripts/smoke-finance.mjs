// scripts/smoke-finance.mjs
//
// Session BC smoke — Islamic Finance (migration 109). Self-seeding via the DEV
// service role; dev-only. Verifies owner-only RLS across the 7 finance tables,
// the anon-safe Pledge Night RPCs (pledge_session_public + submit_pledge with a
// closed-session guard), payments/outstanding, and the Waqf trustee link.
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-finance-2026';
const SLUG = 'finance-smoke-mosque';
const EM = { owner: 'finance-smoke-owner@example.com', other: 'finance-smoke-other@example.com' };

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const ok = (l) => { results.push(true); console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const assert = (c, l) => (c ? ok(l) : bad(l));
const raw = (label, v) => console.log(`   ↳ ${label}: ${JSON.stringify(v)}`);

async function findU(e) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === e) || null; }
async function ensureU(e) { let u = await findU(e); if (!u) { const { data, error } = await svc.auth.admin.createUser({ email: e, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; } await svc.from('profiles').upsert({ id: u.id, email: e, name: e.split('@')[0] }, { onConflict: 'id' }); return u.id; }
async function signIn(e) { const c = anon(); const { error } = await c.auth.signInWithPassword({ email: e, password: PW }); if (error) throw new Error(`signIn ${e}: ${error.message}`); return c; }
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) {
    for (const t of ['finance_pledge_payments', 'finance_pledges', 'finance_pledge_sessions', 'finance_sadaqah', 'finance_waqf_assets', 'finance_campaigns', 'finance_qard_hasan', 'governance_committee_members']) {
      await svc.from(t).delete().eq('mosque_id', m.id);
    }
    await svc.from('mosques').delete().eq('id', m.id);
  }
  for (const e of Object.values(EM)) { const u = await findU(e); if (u) await svc.auth.admin.deleteUser(u.id); }
}

const ids = {};
async function seed() {
  ids.owner = await ensureU(EM.owner); ids.other = await ensureU(EM.other);
  const { data: m, error } = await svc.from('mosques').insert({ name: 'Finance Smoke Mosque', slug: SLUG, user_id: ids.owner, status: 'active', address: '1 Zakat St', city: 'Bradford', postcode: 'BD1 1AA' }).select('id').single();
  if (error) throw new Error(`seed mosque: ${error.message}`);
  ids.mosque = m.id;
  ids.trustee = (await svc.from('governance_committee_members').insert({ mosque_id: m.id, name: 'Trustee One', role: 'trustee' }).select('id').single()).data.id;
}

async function t1_campaigns() {
  const owner = await signIn(EM.owner);
  for (const [kind, name] of [['sadaqah_jariyah', 'Roof Fund'], ['waqf', 'Mosque Extension Waqf'], ['pledge', 'Ramadan Appeal']]) {
    const r = await owner.from('finance_campaigns').insert({ mosque_id: ids.mosque, kind, name, target_amount: 50000, deadline: '2026-12-31' }).select('id').single();
    if (!r.error) ids[`camp_${kind}`] = r.data.id; else bad(`T1 create ${kind} — ${r.error.message}`);
  }
  const mine = await owner.from('finance_campaigns').select('id').eq('mosque_id', ids.mosque);
  assert((mine.data || []).length === 3, `T1a owner creates + reads 3 campaigns (${mine.data?.length})`);
  const other = await signIn(EM.other);
  assert(((await other.from('finance_campaigns').select('id').eq('mosque_id', ids.mosque)).data || []).length === 0, `T1b non-owner sees 0 campaigns`);
}

async function t2_sadaqah() {
  const owner = await signIn(EM.owner);
  const a = await owner.from('finance_sadaqah').insert({ mosque_id: ids.mosque, donor_name: 'Anon Donor', amount: 100, purpose: 'General', gift_aid_eligible: false }).select('id').single();
  const b = await owner.from('finance_sadaqah').insert({ mosque_id: ids.mosque, campaign_id: ids.camp_sadaqah_jariyah, donor_name: 'Yusuf', donor_address: '2 Park Rd, BD1', amount: 250, gift_aid_eligible: true }).select('id').single();
  assert(!a.error && !b.error, `T2a owner records general + campaign donations${b.error ? ' — ' + b.error.message : ''}`);
  const giftAid = await owner.from('finance_sadaqah').select('amount').eq('mosque_id', ids.mosque).eq('gift_aid_eligible', true);
  const claimable = (giftAid.data || []).reduce((s, d) => s + Number(d.amount) * 0.25, 0);
  assert(claimable === 62.5, `T2b Gift Aid 25% uplift computes (£${claimable} on £250)`);
}

async function t3_waqf() {
  const owner = await signIn(EM.owner);
  const w = await owner.from('finance_waqf_assets').insert({ mosque_id: ids.mosque, name: 'Endowed Shop Unit', principal_amount: 100000, yield_generated: 4000, yield_distributed: 3550, trustee_committee_member_id: ids.trustee, donor_name: 'Hajj Ibrahim' }).select('*').single();
  if (w.error) { bad(`T3 waqf — ${w.error.message}`); return; }
  raw('waqf', { principal: w.data.principal_amount, yield_gen: w.data.yield_generated, yield_dist: w.data.yield_distributed });
  const available = Number(w.data.yield_generated) - Number(w.data.yield_distributed);
  assert(Number(w.data.principal_amount) === 100000 && available === 450 && w.data.trustee_committee_member_id === ids.trustee,
    `T3 waqf asset → principal protected (£100k), yield available £${available}, trustee linked`);
}

async function t4_pledgeNight() {
  const owner = await signIn(EM.owner);
  const s = await owner.from('finance_pledge_sessions').insert({ mosque_id: ids.mosque, campaign_id: ids.camp_pledge, name: 'Pledge Night' }).select('id').single();
  ids.session = s.data?.id;
  const closed = await owner.from('finance_pledge_sessions').insert({ mosque_id: ids.mosque, name: 'Closed', closed_at: new Date(Date.now() - 3600e3).toISOString() }).select('id').single();
  assert(!s.error && !closed.error, `T4a owner opens a Pledge Night session`);

  // anon submits a pledge to the OPEN session
  const sub = await anon().rpc('submit_pledge', { p_session_id: ids.session, p_donor_name: 'Aisha', p_amount: 500, p_email: 'aisha@example.com', p_gift_aid: true });
  assert(!sub.error && sub.data, `T4b anon submits a pledge → id${sub.error ? ' — ' + sub.error.message : ''}`);
  ids.pledge = sub.data;

  // public session view shows the running total
  const pub = await anon().rpc('pledge_session_public', { p_session_id: ids.session });
  raw('session public', (pub.data || [])[0]);
  const row = (pub.data || [])[0];
  assert(row && row.is_open === true && Number(row.pledged_total) === 500 && row.pledge_count === 1, `T4c pledge_session_public → open, total £${row?.pledged_total}, count ${row?.pledge_count}`);

  // closed session refuses; bad amount refuses
  const c = await anon().rpc('submit_pledge', { p_session_id: closed.data.id, p_donor_name: 'X', p_amount: 10, p_email: '', p_gift_aid: false });
  assert(!!c.error, `T4d submit to a closed session → refused (${c.error?.message?.slice(0, 30)})`);
  const z = await anon().rpc('submit_pledge', { p_session_id: ids.session, p_donor_name: 'X', p_amount: 0, p_email: '', p_gift_aid: false });
  assert(!!z.error, `T4e zero amount → refused`);
}

async function t5_pledgesPayments() {
  const owner = await signIn(EM.owner);
  const all = await owner.from('finance_pledges').select('id, amount_pledged, source').eq('mosque_id', ids.mosque);
  const nightPledge = (all.data || []).find((p) => p.id === ids.pledge);
  assert((all.data || []).length === 1 && nightPledge?.source === 'pledge_night', `T5a owner reads the pledge (source=${nightPledge?.source})`);
  // record a partial payment
  await owner.from('finance_pledge_payments').insert({ pledge_id: ids.pledge, mosque_id: ids.mosque, amount: 200 });
  const pays = await owner.from('finance_pledge_payments').select('amount').eq('pledge_id', ids.pledge);
  const paid = (pays.data || []).reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = 500 - paid;
  assert(paid === 200 && outstanding === 300, `T5b payment recorded → paid £${paid}, outstanding £${outstanding} (partial)`);
  // non-owner sees no payments
  const other = await signIn(EM.other);
  assert(((await other.from('finance_pledge_payments').select('id').eq('mosque_id', ids.mosque)).data || []).length === 0, `T5c non-owner sees 0 payments`);
}

async function t6_qard() {
  const owner = await signIn(EM.owner);
  const q = await owner.from('finance_qard_hasan').insert({ mosque_id: ids.mosque, recipient_name: 'Confidential', amount: 2000, repayment_schedule: '£200/month', amount_repaid: 400, status: 'active' }).select('id').single();
  assert(!q.error, `T6a owner records a Qard Hasan loan${q.error ? ' — ' + q.error.message : ''}`);
  const other = await signIn(EM.other);
  assert(((await other.from('finance_qard_hasan').select('id').eq('mosque_id', ids.mosque)).data || []).length === 0, `T6b non-owner sees 0 Qard Hasan (confidential)`);
}

async function t7_anon() {
  const a = anon();
  for (const t of ['finance_sadaqah', 'finance_waqf_assets', 'finance_pledges', 'finance_qard_hasan', 'finance_campaigns']) {
    const r = await a.from(t).select('*').eq('mosque_id', ids.mosque);
    assert(!!r.error || (r.data || []).length === 0, `T7 anon read ${t} → ${r.error ? 'denied' : (r.data || []).length + ' rows'}`);
  }
}

try {
  await teardown(); await seed();
  await t1_campaigns();
  await t2_sadaqah();
  await t3_waqf();
  await t4_pledgeNight();
  await t5_pledgesPayments();
  await t6_qard();
  await t7_anon();
} catch (err) { bad(`FATAL: ${err.message}`); } finally { await teardown(); }

const passed = results.filter(Boolean).length;
console.log('---'); console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

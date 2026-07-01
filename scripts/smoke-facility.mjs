// scripts/smoke-facility.mjs
//
// Session BA smoke — facility/hall booking (migration 105). Self-seeding via the
// DEV service role; dev-only (hard ref assert). Verifies the request/cancel RPCs,
// owner approval, the no-overlap EXCLUDE constraint (clash detection), member
// read isolation, and anon lockout.
//
// Run (AFTER 105 applied to dev): node scripts/smoke-facility.mjs
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-facility-2026';
const SLUG = 'facility-smoke-mosque';
const EM = { owner: 'facility-smoke-owner@example.com', m1: 'facility-smoke-m1@example.com', m2: 'facility-smoke-m2@example.com' };

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
    await svc.from('mosque_bookings').delete().eq('mosque_id', m.id);
    await svc.from('mosque_facilities').delete().eq('mosque_id', m.id);
    await svc.from('mosques').delete().eq('id', m.id);
  }
  for (const e of Object.values(EM)) { const u = await findU(e); if (u) await svc.auth.admin.deleteUser(u.id); }
}

const ids = {};
const H = (days, hour) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };

async function seed() {
  ids.owner = await ensureU(EM.owner); ids.m1 = await ensureU(EM.m1); ids.m2 = await ensureU(EM.m2);
  const { data: mo, error } = await svc.from('mosques').insert({ name: 'Facility Smoke Mosque', slug: SLUG, user_id: ids.owner, status: 'active', address: '1 Hall St', city: 'Bradford', postcode: 'BD1 1AA' }).select('id').single();
  if (error) throw new Error(`seed mosque: ${error.message}`);
  ids.mosque = mo.id;
  ids.facA = (await svc.from('mosque_facilities').insert({ mosque_id: mo.id, name: 'Main Hall', capacity: 200, hourly_rate: 20 }).select('id').single()).data.id;
  ids.facB = (await svc.from('mosque_facilities').insert({ mosque_id: mo.id, name: 'Meeting Room (free)' }).select('id').single()).data.id;
  ids.facInactive = (await svc.from('mosque_facilities').insert({ mosque_id: mo.id, name: 'Archived', active: false }).select('id').single()).data.id;
}

const req = (client, facility, startD, startH, endD, endH, purpose = 'Nikah') =>
  client.rpc('request_facility_booking', { p_facility_id: facility, p_purpose: purpose, p_notes: null, p_start: H(startD, startH), p_end: H(endD, endH), p_attendees: 80, p_name: 'Tester', p_email: 'delivered@resend.dev', p_phone: '' });
const approve = (client, id) => client.from('mosque_bookings').update({ status: 'approved', reviewed_by: ids.owner, reviewed_at: new Date().toISOString() }).eq('id', id).select();

async function t1_request() {
  const c = await signIn(EM.m1);
  const r = await req(c, ids.facA, 3, 10, 3, 13); // 3h × £20 = £60
  if (r.error) { bad(`T1 request errored — ${r.error.message}`); return; }
  ids.b1 = r.data;
  const { data: row } = await svc.from('mosque_bookings').select('*').eq('id', ids.b1).single();
  raw('booking', { mosque_id: row.mosque_id, facility_id: row.facility_id, requester: row.requester_profile_id, status: row.status, quoted_price: row.quoted_price });
  assert(row.status === 'pending' && row.mosque_id === ids.mosque && row.requester_profile_id === ids.m1 && Number(row.quoted_price) === 60,
    `T1 member request → pending, mosque derived, requester pinned, quoted_price=${row.quoted_price}`);
}

async function t2_readIsolation() {
  const c1 = await signIn(EM.m1);
  const mine = await c1.from('mosque_bookings').select('id').eq('id', ids.b1);
  assert(!mine.error && (mine.data || []).length === 1, `T2a requester reads own booking (${mine.data?.length} row)`);
  const c2 = await signIn(EM.m2);
  const other = await c2.from('mosque_bookings').select('id').eq('id', ids.b1);
  assert(!other.error && (other.data || []).length === 0, `T2b another member can't see it (${other.data?.length} rows)`);
}

async function t3_ownerApprove() {
  const owner = await signIn(EM.owner);
  const all = await owner.from('mosque_bookings').select('id').eq('mosque_id', ids.mosque);
  assert(!all.error && (all.data || []).length >= 1, `T3a owner sees all mosque bookings (${all.data?.length})`);
  const r = await approve(owner, ids.b1);
  assert(!r.error, `T3b owner approves booking${r.error ? ' — ' + r.error.message : ''}`);
}

async function t4_clash() {
  const m1 = await signIn(EM.m1);
  // Overlapping request on the SAME facility (11:00–14:00 overlaps approved 10:00–13:00).
  const r = await req(m1, ids.facA, 3, 11, 3, 14);
  assert(!r.error, `T4a overlapping request is allowed while pending${r.error ? ' — ' + r.error.message : ''}`);
  const owner = await signIn(EM.owner);
  const app = await approve(owner, r.data);
  raw('approve-clash error', app.error ? { code: app.error.code, msg: app.error.message.slice(0, 60) } : 'NO ERROR');
  assert(!!app.error && (app.error.code === '23P01' || /no_overlap|exclusion/i.test(app.error.message)),
    `T4b approving the overlap is BLOCKED by the exclusion constraint (${app.error?.code})`);
}

async function t5_backToBack() {
  const m1 = await signIn(EM.m1);
  const r = await req(m1, ids.facA, 3, 13, 3, 15); // starts exactly when b1 ends → no overlap
  const owner = await signIn(EM.owner);
  const app = await approve(owner, r.data);
  assert(!app.error, `T5 back-to-back booking (13:00 start = 13:00 end) approves fine${app.error ? ' — ' + app.error.message : ''}`);
}

async function t6_freeAndGuards() {
  const m1 = await signIn(EM.m1);
  const free = await req(m1, ids.facB, 4, 10, 4, 12);
  const { data: frow } = await svc.from('mosque_bookings').select('quoted_price').eq('id', free.data).single();
  assert(!free.error && frow.quoted_price === null, `T6a free facility → quoted_price null (${frow?.quoted_price})`);
  const past = await req(m1, ids.facA, -1, 10, -1, 12);
  assert(!!past.error, `T6b past start rejected (${past.error?.message?.slice(0, 40)})`);
  const bad2 = await m1.rpc('request_facility_booking', { p_facility_id: ids.facA, p_purpose: 'X', p_notes: null, p_start: H(3, 12), p_end: H(3, 10), p_attendees: 1, p_name: 'T', p_email: '', p_phone: '' });
  assert(!!bad2.error, `T6c end<=start rejected (${bad2.error?.message?.slice(0, 40)})`);
  const inactive = await req(m1, ids.facInactive, 3, 10, 3, 12);
  assert(!!inactive.error, `T6d inactive facility rejected (${inactive.error?.message?.slice(0, 40)})`);
}

async function t7_cancel() {
  const m2 = await signIn(EM.m2);
  const notMine = await m2.rpc('cancel_facility_booking', { p_id: ids.b1, p_note: null });
  assert(!!notMine.error, `T7a non-owner/non-requester cannot cancel (${notMine.error?.message?.slice(0, 40)})`);
  const m1 = await signIn(EM.m1);
  const mineCancel = await m1.rpc('cancel_facility_booking', { p_id: ids.b1, p_note: 'plans changed' });
  assert(!mineCancel.error && mineCancel.data?.status === 'cancelled', `T7b requester cancels own → ${mineCancel.data?.status}`);
}

async function t8_anon() {
  const a = anon();
  const rpc = await a.rpc('request_facility_booking', { p_facility_id: ids.facA, p_purpose: 'X', p_notes: null, p_start: H(3, 10), p_end: H(3, 12), p_attendees: 1, p_name: 'A', p_email: '', p_phone: '' });
  assert(!!rpc.error, `T8a anon can't call request_facility_booking (${rpc.error?.message?.slice(0, 40)})`);
  const read = await a.from('mosque_bookings').select('*').eq('mosque_id', ids.mosque);
  assert(!!read.error || (read.data || []).length === 0, `T8b anon can't read bookings (${read.error ? 'denied' : (read.data || []).length + ' rows'})`);
}

try {
  await teardown(); await seed();
  await t1_request();
  await t2_readIsolation();
  await t3_ownerApprove();
  await t4_clash();
  await t5_backToBack();
  await t6_freeAndGuards();
  await t7_cancel();
  await t8_anon();
} catch (err) { bad(`FATAL: ${err.message}`); } finally { await teardown(); }

const passed = results.filter(Boolean).length;
console.log('---'); console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

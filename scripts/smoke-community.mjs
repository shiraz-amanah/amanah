// scripts/smoke-community.mjs
//
// Session AZ smoke — community membership module (migration 101).
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Verifies the public QR check-in RPCs behave from the roles the browser uses:
//   * community_session_public   — anon can read one session's display fields
//   * community_check_in         — anon anonymous check-in; member (auth.uid())
//                                  resolution + dedup; caller-identity only (no
//                                  profile_id param → no impersonation); closed
//                                  session refused
//   * my_community_attendance /  — a signed-in member reads only their own slice
//     my_community_groups
//   * community_members          — anon cannot read the table (no anon policy)
//
// Run (from repo root, AFTER 101 is applied to dev): node scripts/smoke-community.mjs
// Exit: 0 if all pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-community-2026';
const SLUG = 'community-smoke-mosque';
const EM = {
  owner:  'community-smoke-owner@example.com',
  member: 'community-smoke-member@example.com',
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const ok  = (line) => { results.push(true);  console.log(`✅ ${line}`); };
const bad = (line) => { results.push(false); console.log(`❌ ${line}`); };
const assert = (cond, line) => (cond ? ok(line) : bad(line));
const raw = (label, v) => console.log(`   ↳ ${label}: ${JSON.stringify(v)}`);

async function findUserByEmail(email) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => u.email === email) || null;
}
async function ensureUser(email) {
  let u = await findUserByEmail(email);
  if (!u) {
    const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    u = data.user;
  }
  await svc.from('profiles').upsert({ id: u.id, email, name: email.split('@')[0] }, { onConflict: 'id' });
  return u.id;
}
async function signIn(email) {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) {
    const { data: sess } = await svc.from('community_sessions').select('id').eq('mosque_id', m.id);
    const sIds = (sess || []).map((s) => s.id);
    if (sIds.length) await svc.from('community_attendance').delete().in('session_id', sIds);
    const { data: grps } = await svc.from('community_groups').select('id').eq('mosque_id', m.id);
    const gIds = (grps || []).map((g) => g.id);
    if (gIds.length) await svc.from('community_group_members').delete().in('group_id', gIds);
    await svc.from('community_sessions').delete().eq('mosque_id', m.id);
    await svc.from('community_groups').delete().eq('mosque_id', m.id);
    await svc.from('community_members').delete().eq('mosque_id', m.id);
    await svc.from('mosques').delete().eq('id', m.id);
  }
  for (const email of Object.values(EM)) {
    const u = await findUserByEmail(email);
    if (u) await svc.auth.admin.deleteUser(u.id);
  }
}

const ids = {};

async function seed() {
  ids.owner = await ensureUser(EM.owner);
  ids.member = await ensureUser(EM.member);

  const { data: m, error: mErr } = await svc.from('mosques')
    .insert({ name: 'Community Smoke Mosque', slug: SLUG, user_id: ids.owner,
              status: 'active', address: '1 Smoke Lane', city: 'Bradford',
              postcode: 'BD1 1AA', lat: 53.795, lng: -1.759 })
    .select('id').single();
  if (mErr) throw new Error(`seed mosque: ${mErr.message}`);
  ids.mosque = m.id;

  // Open session (defaults: session_date=today, opened_at=now, closes_at=null)
  const { data: s, error: sErr } = await svc.from('community_sessions')
    .insert({ mosque_id: ids.mosque, name: "Jumu'ah (smoke)", created_by: ids.owner })
    .select('id').single();
  if (sErr) throw new Error(`seed session: ${sErr.message}`);
  ids.session = s.id;

  // Closed session (closes_at already in the past)
  const { data: sc, error: scErr } = await svc.from('community_sessions')
    .insert({ mosque_id: ids.mosque, name: 'Closed (smoke)', closed_at: new Date(Date.now() - 3600e3).toISOString() })
    .select('id').single();
  if (scErr) throw new Error(`seed closed session: ${scErr.message}`);
  ids.closedSession = sc.id;

  // Member linked to the member account
  const { data: cm, error: cmErr } = await svc.from('community_members')
    .insert({ mosque_id: ids.mosque, profile_id: ids.member, name: 'Smoke Member', status: 'active' })
    .select('id').single();
  if (cmErr) throw new Error(`seed member: ${cmErr.message}`);
  ids.member_row = cm.id;

  // Group + membership
  const { data: g, error: gErr } = await svc.from('community_groups')
    .insert({ mosque_id: ids.mosque, name: 'Brothers halaqa (smoke)' })
    .select('id').single();
  if (gErr) throw new Error(`seed group: ${gErr.message}`);
  ids.group = g.id;
  const { error: gmErr } = await svc.from('community_group_members')
    .insert({ group_id: ids.group, member_id: ids.member_row });
  if (gmErr) throw new Error(`seed group member: ${gmErr.message}`);
}

async function t1_sessionPublic() {
  const { data, error } = await anon().rpc('community_session_public', { p_session_id: ids.session });
  if (error) { bad(`T1 community_session_public (anon): errored — ${error.message}`); return; }
  raw('rows', data);
  const r = (data || [])[0];
  assert(r && r.mosque_name === 'Community Smoke Mosque' && r.is_open === true,
    `T1 anon reads open session → name="${r?.name}" mosque="${r?.mosque_name}" is_open=${r?.is_open}`);
}

async function t2_anonCheckIn() {
  const { data, error } = await anon().rpc('community_check_in',
    { p_session_id: ids.session, p_name: 'Anon One', p_phone: '07700900123', p_method: 'qr' });
  if (error) { bad(`T2 anon check-in: errored — ${error.message}`); return; }
  raw('rows', data);
  const r = (data || [])[0];
  assert(r && r.ok === true && r.first_time === true && r.already === false,
    `T2 anon first check-in → ok=${r?.ok} first_time=${r?.first_time} already=${r?.already}`);
  // The written row must be anonymous (member_id null) — anon cannot attach to a member.
  const { data: rows } = await svc.from('community_attendance')
    .select('member_id, name, phone, is_first_time').eq('session_id', ids.session).eq('phone', '07700900123');
  raw('db rows', rows);
  assert((rows || []).length === 1 && rows[0].member_id === null,
    `T2 written row is anonymous (member_id=${rows?.[0]?.member_id})`);
}

async function t3_anonSecondPhone() {
  const { data, error } = await anon().rpc('community_check_in',
    { p_session_id: ids.session, p_name: 'Anon Two', p_phone: '07700900123', p_method: 'qr' });
  if (error) { bad(`T3 anon repeat phone: errored — ${error.message}`); return; }
  raw('rows', data);
  const r = (data || [])[0];
  // Same phone seen → not first-time; but anon rows are NOT deduped (member_id null), so a new row lands.
  assert(r && r.ok === true && r.first_time === false && r.already === false,
    `T3 anon repeat same phone → first_time=${r?.first_time} already=${r?.already} (new anon row, no dedup)`);
  const { count } = await svc.from('community_attendance')
    .select('id', { count: 'exact', head: true }).eq('session_id', ids.session).eq('phone', '07700900123');
  assert(count === 2, `T3 two anon rows for the phone now exist (count=${count})`);
}

async function t4_anonCannotReadMembers() {
  const { data, error } = await anon().from('community_members').select('*');
  if (error) { ok(`T4 anon read community_members → rejected: ${error.message} (expected)`); return; }
  raw('rows', data);
  assert((data || []).length === 0, `T4 anon read community_members → ${data?.length ?? 0} rows (expected 0)`);
}

async function t5_memberCheckInAndDedup() {
  const c = await signIn(EM.member);
  const first = await c.rpc('community_check_in',
    { p_session_id: ids.session, p_name: '', p_phone: '', p_method: 'qr' });
  if (first.error) { bad(`T5 member check-in: errored — ${first.error.message}`); return; }
  raw('first', first.data);
  const r1 = (first.data || [])[0];
  assert(r1 && r1.ok === true && r1.first_time === true && r1.already === false,
    `T5a member first check-in (resolved from auth.uid()) → first_time=${r1?.first_time} already=${r1?.already}`);

  const second = await c.rpc('community_check_in',
    { p_session_id: ids.session, p_name: '', p_phone: '', p_method: 'geofence' });
  if (second.error) { bad(`T5 member re-check-in: errored — ${second.error.message}`); return; }
  raw('second', second.data);
  const r2 = (second.data || [])[0];
  assert(r2 && r2.ok === true && r2.already === true,
    `T5b member re-check-in (geofence after QR) → already=${r2?.already} (deduped, not double-counted)`);

  // Exactly one member row for this session.
  const { count } = await svc.from('community_attendance')
    .select('id', { count: 'exact', head: true }).eq('session_id', ids.session).eq('member_id', ids.member_row);
  assert(count === 1, `T5c exactly one member attendance row (count=${count})`);
}

async function t6_memberSelfReads() {
  const c = await signIn(EM.member);
  const att = await c.rpc('my_community_attendance');
  if (att.error) { bad(`T6 my_community_attendance: errored — ${att.error.message}`); return; }
  raw('attendance', att.data);
  const a = (att.data || [])[0];
  assert((att.data || []).length === 1 && a.session_name === "Jumu'ah (smoke)" && a.mosque_name === 'Community Smoke Mosque',
    `T6a member sees only own attendance → ${att.data?.length} row, session="${a?.session_name}"`);

  const grp = await c.rpc('my_community_groups');
  if (grp.error) { bad(`T6 my_community_groups: errored — ${grp.error.message}`); return; }
  raw('groups', grp.data);
  const gr = (grp.data || [])[0];
  assert((grp.data || []).length === 1 && gr.group_name === 'Brothers halaqa (smoke)',
    `T6b member sees own group → ${grp.data?.length} row, group="${gr?.group_name}"`);
}

async function t7_closedSessionRefused() {
  const { data, error } = await anon().rpc('community_check_in',
    { p_session_id: ids.closedSession, p_name: 'Latecomer', p_phone: '', p_method: 'qr' });
  if (error) { ok(`T7 anon check-in to closed session → refused: ${error.message} (expected)`); return; }
  raw('rows', data);
  bad(`T7 closed-session check-in was ALLOWED — expected refusal`);
}

// Geofence support (migration 102): community_current_session finds the open
// session for a mosque. Member-only (authenticated); anon denied.
async function t8_currentSession() {
  const anonRes = await anon().rpc('community_current_session', { p_mosque_id: ids.mosque });
  if (anonRes.error) ok(`T8a anon community_current_session → denied: ${anonRes.error.message} (expected)`);
  else bad(`T8a anon community_current_session was ALLOWED (${JSON.stringify(anonRes.data)}) — expected denial`);

  const c = await signIn(EM.member);
  const memRes = await c.rpc('community_current_session', { p_mosque_id: ids.mosque });
  if (memRes.error) { bad(`T8b member community_current_session errored — ${memRes.error.message}`); return; }
  raw('open session', memRes.data);
  const r = (memRes.data || [])[0];
  assert(r && r.id === ids.session, `T8b member finds the open session → id matches (${r?.name})`);
}

try {
  await teardown(); // clean any leftovers from a prior run
  await seed();
  await t1_sessionPublic();
  await t2_anonCheckIn();
  await t3_anonSecondPhone();
  await t4_anonCannotReadMembers();
  await t5_memberCheckInAndDedup();
  await t6_memberSelfReads();
  await t7_closedSessionRefused();
  await t8_currentSession();
} catch (err) {
  bad(`FATAL: ${err.message}`);
} finally {
  await teardown();
}

const passed = results.filter(Boolean).length;
console.log('---');
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

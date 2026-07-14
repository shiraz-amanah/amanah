// scripts/smoke-bridge144.mjs
// JWT-level verification for migration 144 (mosque_link_scholar_to_staff — the
// admin-initiated scholar -> mosque_staff bridge). DEV ONLY. Seeds real auth
// users + rows via service role, then drives the RPC through REAL per-user JWTs
// (anon key + signInWithPassword) so RLS + the SECURITY DEFINER gate are actually
// exercised. Idempotent: tears down its own seed at start and end. Never prints
// secrets.
//
// Proves: owner links an active claimed scholar -> ACTIVE mosque_staff row keyed
// on the scholar's OWN user_id (profile_id) + linked_scholar_id; the scholar then
// sees that row via the exact getMyStaffMembership query (Staff-read-own RLS);
// idempotent re-link; and the negatives (non-owner, unclaimed, inactive, and the
// profile_id-forgery boundary the RPC exists to close).
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL;           // .env non-VITE = pbej (dev)
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;     // .env SUPABASE_ANON_KEY = pbej anon
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
if (!SVC || !ANON) { console.error('Missing SVC or ANON key in .env'); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const PW = 'bridge144-verify-Aa1!';
const EMAILS = {
  owner:     'bridge144-owner@amanah-verify.test',
  bystander: 'bridge144-bystander@amanah-verify.test',   // owns a DIFFERENT mosque
  scholar:   'bridge144-scholar@amanah-verify.test',     // active, claimed
  inactive:  'bridge144-inactive@amanah-verify.test',    // claimed but status != active
};
const emailSet = new Set(Object.values(EMAILS));

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const assert = (cond, m) => (cond ? ok(m) : bad(m));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  // Unclaimed scholars have no auth user — clean them by slug prefix too.
  await svc.from('mosque_staff').delete().like('email', 'bridge144-%@amanah-verify.test');
  await svc.from('scholars').delete().like('slug', 'bridge144-%');
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) await svc.from('mosque_staff').delete().in('mosque_id', mIds);
    await svc.from('scholars').delete().in('user_id', ids);
    if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

async function mkUser(email, name) {
  const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  const id = data.user.id;
  const { error: pe } = await svc.from('profiles').upsert({ id, name }, { onConflict: 'id' });
  if (pe) throw new Error(`profile ${email}: ${pe.message}`);
  return id;
}
async function userClient(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}
// Mirrors auth.js getMyStaffMembership exactly.
async function myStaffMembership(client) {
  const { data } = await client
    .from('mosque_staff')
    .select('*, mosque:mosques(id, name, city, slug, status, prayer_times)')
    .eq('profile_id', (await client.auth.getUser()).data.user.id)
    .eq('invite_status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data || null;
}
const errMsg = (e) => (e?.message || '').toLowerCase();

(async () => {
  console.log(`smoke-bridge144: dev ${DEV}. Cleaning any prior seed…`);
  await teardown();

  // ---- SEED ----
  console.log('Seeding users + rows (service role)…');
  const ownerId    = await mkUser(EMAILS.owner, 'Bridge144 Owner');
  const bystanderId = await mkUser(EMAILS.bystander, 'Bridge144 Bystander');
  const scholarUid = await mkUser(EMAILS.scholar, 'Bridge144 Scholar');
  const inactiveUid = await mkUser(EMAILS.inactive, 'Bridge144 Inactive Scholar');

  const { data: mosque, error: me } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `bridge144-masjid-${ownerId.slice(0, 8)}`, name: 'Bridge144 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select().single();
  if (me) throw new Error(`mosque: ${me.message}`);

  // Active, claimed scholar (the happy path).
  const { data: scholarRow, error: se } = await svc.from('scholars').insert({
    user_id: scholarUid, slug: `bridge144-scholar-${scholarUid.slice(0, 8)}`, name: 'Bridge144 Scholar', status: 'active',
  }).select().single();
  if (se) throw new Error(`scholar: ${se.message}`);

  // Claimed but NOT active.
  const { data: inactiveRow, error: ie } = await svc.from('scholars').insert({
    user_id: inactiveUid, slug: `bridge144-inactive-${inactiveUid.slice(0, 8)}`, name: 'Bridge144 Inactive', status: 'pending_verification',
  }).select().single();
  if (ie) throw new Error(`inactive scholar: ${ie.message}`);

  // Unclaimed scholar — no user_id at all.
  const { data: unclaimedRow, error: ue } = await svc.from('scholars').insert({
    user_id: null, slug: `bridge144-unclaimed-x`, name: 'Bridge144 Unclaimed', status: 'active',
  }).select().single();
  if (ue) throw new Error(`unclaimed scholar: ${ue.message}`);

  const ownerC = await userClient(EMAILS.owner);
  const bystanderC = await userClient(EMAILS.bystander);
  const scholarC = await userClient(EMAILS.scholar);

  // ============ HAPPY PATH ============
  console.log('\nHAPPY PATH — owner links an active claimed scholar');
  const { data: linkRes, error: linkErr } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: scholarRow.id, p_role: 'Scholar',
  });
  assert(!linkErr && linkRes, `RPC returned ok${linkErr ? ' — ' + linkErr.message : ''}`);
  assert(linkRes?.already_linked === false, `already_linked = false on first link (${linkRes?.already_linked})`);
  assert(linkRes?.profile_id === scholarUid, `RPC set profile_id to the scholar's OWN user_id (forgery boundary)`);
  assert(linkRes?.linked_scholar_id === scholarRow.id, `RPC set linked_scholar_id provenance`);

  const { data: staffRow } = await svc.from('mosque_staff').select('*').eq('id', linkRes.staff_id).single();
  assert(staffRow?.profile_id === scholarUid, `row.profile_id = scholar user_id (${staffRow?.profile_id === scholarUid})`);
  assert(staffRow?.linked_scholar_id === scholarRow.id, `row.linked_scholar_id = scholar id`);
  assert(staffRow?.invite_status === 'active', `row.invite_status = active (${staffRow?.invite_status})`);
  assert(staffRow?.status === 'active', `row.status = active (${staffRow?.status})`);
  assert(staffRow?.mosque_id === mosque.id, `row.mosque_id = target mosque`);

  // ---- The scholar now resolves as staff via the EXACT getMyStaffMembership query ----
  console.log('\nROUTING KEY — scholar sees the membership via getMyStaffMembership RLS');
  const membership = await myStaffMembership(scholarC);
  assert(!!membership, `scholar's getMyStaffMembership returns a row (not null) — commit 2 will route on this`);
  assert(membership?.id === linkRes.staff_id, `membership is the linked row`);
  assert(membership?.mosque?.name === 'Bridge144 Test Masjid', `membership joins its mosque (${membership?.mosque?.name})`);

  // ============ IDEMPOTENCY ============
  console.log('\nIDEMPOTENCY — re-link does not duplicate');
  const { data: link2 } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: scholarRow.id, p_role: 'Scholar',
  });
  assert(link2?.already_linked === true, `second link reports already_linked = true (${link2?.already_linked})`);
  assert(link2?.staff_id === linkRes.staff_id, `same staff row reused (no new id)`);
  const { count: staffCount } = await svc.from('mosque_staff').select('*', { count: 'exact', head: true })
    .eq('mosque_id', mosque.id).eq('linked_scholar_id', scholarRow.id);
  assert(staffCount === 1, `exactly ONE staff row for this scholar+mosque (${staffCount})`);

  // ============ NEGATIVES ============
  console.log('\nNEGATIVES');
  // Non-owner (owns a different mosque) cannot link into this mosque.
  const { data: byRes, error: byErr } = await bystanderC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: scholarRow.id, p_role: 'Scholar',
  });
  assert(!byRes && byErr && errMsg(byErr).includes('not_mosque_owner'), `non-owner rejected: not_mosque_owner${byErr ? '' : ' — NO ERROR!'}`);

  // Unclaimed scholar (no account) cannot be linked.
  const { data: ucRes, error: ucErr } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: unclaimedRow.id, p_role: 'Scholar',
  });
  assert(!ucRes && ucErr && errMsg(ucErr).includes('scholar_unclaimed'), `unclaimed scholar rejected: scholar_unclaimed${ucErr ? '' : ' — NO ERROR!'}`);

  // Inactive scholar cannot be linked.
  const { data: inRes, error: inErr } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: mosque.id, p_scholar_id: inactiveRow.id, p_role: 'Scholar',
  });
  assert(!inRes && inErr && errMsg(inErr).includes('scholar_not_active'), `inactive scholar rejected: scholar_not_active${inErr ? '' : ' — NO ERROR!'}`);

  // Owner cannot link a scholar into a mosque they do NOT own (bystander's would-be target).
  const { data: byMosque } = await svc.from('mosques').insert({
    user_id: bystanderId, slug: `bridge144-other-${bystanderId.slice(0, 8)}`, name: 'Bridge144 Other Masjid',
    address: '2 Test St', city: 'Leeds', postcode: 'LS1 1AA', status: 'active',
  }).select().single();
  const { data: xRes, error: xErr } = await ownerC.rpc('mosque_link_scholar_to_staff', {
    p_mosque_id: byMosque.id, p_scholar_id: scholarRow.id, p_role: 'Scholar',
  });
  assert(!xRes && xErr && errMsg(xErr).includes('not_mosque_owner'), `owner cannot link into a mosque they don't own${xErr ? '' : ' — NO ERROR!'}`);

  // ---- CLEANUP ----
  console.log('\nTearing down seed…');
  await teardown();

  console.log(`\n==== RESULT: ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(async (e) => {
  console.error('FATAL:', e.message);
  try { await teardown(); } catch { /* best effort */ }
  process.exit(1);
});

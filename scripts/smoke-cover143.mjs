// scripts/smoke-cover143.mjs
// Option-A JWT-level verification for migration 143 (cover_requests re-key to
// recipient_profile_id). DEV ONLY. Seeds real auth users + rows via service
// role, then exercises RLS with REAL per-user JWTs (anon key + signInWithPassword)
// to prove the three cases + negatives. Idempotent: tears down its own seed at
// start and end. Never prints secrets.
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL;           // .env non-VITE = pbej (dev)
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;     // .env SUPABASE_ANON_KEY = pbej anon (verified)
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
if (!SVC || !ANON) { console.error('Missing SVC or ANON key in .env'); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const PW = 'cover143-verify-Aa1!';
const EMAILS = {
  owner:     'cover143-owner@amanah-verify.test',
  scholar:   'cover143-scholar@amanah-verify.test',
  staff:     'cover143-staff@amanah-verify.test',
  bystander: 'cover143-bystander@amanah-verify.test',
};
const emailSet = new Set(Object.values(EMAILS));

let pass = 0, fail = 0;
const ok  = (m) => { pass++; console.log('  ✅', m); };
const bad = (m) => { fail++; console.log('  ❌', m); };
const assert = (cond, m) => (cond ? ok(m) : bad(m));

async function teardown() {
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => emailSet.has(u.email)).map(u => u.id);
  if (!ids.length) return;
  const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
  const mIds = (mosques || []).map(m => m.id);
  await svc.from('cover_requests').delete().in('recipient_profile_id', ids);
  if (mIds.length) await svc.from('cover_requests').delete().in('mosque_id', mIds);
  await svc.from('mosque_staff').delete().in('profile_id', ids);
  await svc.from('scholars').delete().in('user_id', ids);
  await svc.from('notifications').delete().in('user_id', ids);
  if (mIds.length) await svc.from('mosques').delete().in('id', mIds);
  await svc.from('profiles').delete().in('id', ids);
  for (const id of ids) await svc.auth.admin.deleteUser(id);
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

(async () => {
  console.log(`smoke-cover143: dev ${DEV}. Cleaning any prior seed…`);
  await teardown();

  // ---- SEED ----
  console.log('Seeding users + rows (service role)…');
  const ownerId   = await mkUser(EMAILS.owner, 'Cover143 Owner');
  const scholarId = await mkUser(EMAILS.scholar, 'Cover143 Scholar');
  const staffId   = await mkUser(EMAILS.staff, 'Cover143 Staff');
  const byId      = await mkUser(EMAILS.bystander, 'Cover143 Bystander');

  const stamp = Date.now ? '' : ''; // Date.now unused; keep slugs static-unique via ids
  const { data: mosque, error: me } = await svc.from('mosques').insert({
    user_id: ownerId, slug: `cover143-masjid-${ownerId.slice(0, 8)}`, name: 'Cover143 Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA',
  }).select().single();
  if (me) throw new Error(`mosque: ${me.message}`);

  const { data: scholarRow, error: se } = await svc.from('scholars').insert({
    user_id: scholarId, slug: `cover143-scholar-${scholarId.slice(0, 8)}`, name: 'Cover143 Scholar', status: 'active',
  }).select().single();
  if (se) throw new Error(`scholar: ${se.message}`);

  const { error: mse } = await svc.from('mosque_staff').insert({
    mosque_id: mosque.id, profile_id: staffId, role: 'teacher',
  });
  if (mse) throw new Error(`mosque_staff: ${mse.message}`);

  // Sanity: the staff user has NO scholars row (the whole point of the case).
  const { count: staffScholarCount } = await svc.from('scholars').select('*', { count: 'exact', head: true }).eq('user_id', staffId);
  assert(staffScholarCount === 0, `staff user has NO scholars row (count=${staffScholarCount})`);

  const ownerC = await userClient(EMAILS.owner);
  const scholarC = await userClient(EMAILS.scholar);
  const staffC = await userClient(EMAILS.staff);
  const byC = await userClient(EMAILS.bystander);

  // ============ CASE 1 — MOSQUE INSERT (owner RLS) ============
  console.log('\nCASE 1 — mosque owner inserts cover requests');
  const { data: reqA, error: aErr } = await ownerC.from('cover_requests').insert({
    mosque_id: mosque.id, recipient_profile_id: scholarId, scholar_id: scholarRow.id,
    cover_type: ['short'], sessions: ['fajr'], notes: 'to scholar',
  }).select().single();
  assert(!aErr && reqA, `owner INSERT for SCHOLAR recipient allowed${aErr ? ' — ' + aErr.message : ''}`);

  const { data: reqB, error: bErr } = await ownerC.from('cover_requests').insert({
    mosque_id: mosque.id, recipient_profile_id: staffId, scholar_id: null,
    cover_type: ['weekly'], sessions: ['dhuhr'], notes: 'to staff-only',
  }).select().single();
  assert(!bErr && reqB, `owner INSERT for STAFF-ONLY recipient allowed (scholar_id null)${bErr ? ' — ' + bErr.message : ''}`);

  const { data: byIns, error: byInsErr } = await byC.from('cover_requests').insert({
    mosque_id: mosque.id, recipient_profile_id: scholarId, scholar_id: scholarRow.id,
    cover_type: ['short'], sessions: ['fajr'],
  }).select();
  assert((byInsErr || (byIns && byIns.length === 0)), `NON-owner INSERT denied by owner RLS${byInsErr ? ' (' + byInsErr.code + ')' : ''}`);

  // ---- INSERT-trigger notifications (both recipients) ----
  console.log('\nBOTH notification paths — INSERT trigger notifies the recipient');
  const notif = async (uid, reqId) => (await svc.from('notifications').select('id,type,title')
    .eq('user_id', uid).eq('type', 'cover_request').eq('data->>cover_request_id', reqId)).data || [];
  const nScholar = await notif(scholarId, reqA?.id);
  assert(nScholar.length === 1 && /New cover request/.test(nScholar[0].title), `SCHOLAR recipient notified on insert (${nScholar.length})`);
  const nStaff = await notif(staffId, reqB?.id);
  assert(nStaff.length === 1 && /New cover request/.test(nStaff[0].title), `STAFF-ONLY recipient notified on insert — proves re-keyed trigger (${nStaff.length})`);

  // ============ CASE 2 — SCHOLAR RECIPIENT (recipient RLS) ============
  console.log('\nCASE 2 — scholar recipient reads/accepts');
  const { data: scholarSees } = await scholarC.from('cover_requests').select('id,status,recipient_profile_id');
  assert(scholarSees?.length === 1 && scholarSees[0].id === reqA.id, `scholar SELECT sees ONLY own request (${scholarSees?.length})`);
  assert(!scholarSees?.some(r => r.id === reqB.id), 'scholar does NOT see the staff-only request');

  const { data: byfSees } = await byC.from('cover_requests').select('id');
  assert((byfSees?.length || 0) === 0, `bystander SELECT sees nothing (${byfSees?.length || 0})`);

  const { data: accUpd, error: accErr } = await scholarC.from('cover_requests')
    .update({ status: 'confirmed' }).eq('id', reqA.id).select();
  assert(!accErr && accUpd?.length === 1, `scholar UPDATE own request -> confirmed allowed${accErr ? ' — ' + accErr.message : ''}`);
  const { data: aAfter } = await svc.from('cover_requests').select('status').eq('id', reqA.id).single();
  assert(aAfter?.status === 'confirmed', `status persisted = confirmed (${aAfter?.status})`);

  const { data: crossUpd } = await scholarC.from('cover_requests')
    .update({ status: 'declined' }).eq('id', reqB.id).select();
  assert((crossUpd?.length || 0) === 0, `scholar CANNOT update someone else's request (${crossUpd?.length || 0} rows)`);

  const ownerNotif = (await svc.from('notifications').select('id,title')
    .eq('user_id', ownerId).eq('type', 'cover_request').eq('data->>cover_request_id', reqA.id)).data || [];
  assert(ownerNotif.length === 1 && /confirmed/.test(ownerNotif[0].title), `mosque owner notified of acceptance — status trigger (${ownerNotif.length})`);

  // ============ CASE 3 — STAFF-ONLY RECIPIENT (no scholars row) ============
  console.log('\nCASE 3 — staff-only recipient (NO scholars row) reads/declines');
  const { data: staffSees } = await staffC.from('cover_requests').select('id,status');
  assert(staffSees?.length === 1 && staffSees[0].id === reqB.id, `staff SELECT sees ONLY own request — recipient RLS works with no scholars row (${staffSees?.length})`);

  const { data: decUpd, error: decErr } = await staffC.from('cover_requests')
    .update({ status: 'declined' }).eq('id', reqB.id).select();
  assert(!decErr && decUpd?.length === 1, `staff UPDATE own request -> declined allowed${decErr ? ' — ' + decErr.message : ''}`);
  const { data: bAfter } = await svc.from('cover_requests').select('status').eq('id', reqB.id).single();
  assert(bAfter?.status === 'declined', `status persisted = declined (${bAfter?.status})`);

  const ownerNotifB = (await svc.from('notifications').select('id,title')
    .eq('user_id', ownerId).eq('type', 'cover_request').eq('data->>cover_request_id', reqB.id)).data || [];
  assert(ownerNotifB.length === 1 && /declined/.test(ownerNotifB[0].title), `mosque owner notified of staff decline (${ownerNotifB.length})`);

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

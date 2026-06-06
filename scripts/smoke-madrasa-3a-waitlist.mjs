// scripts/smoke-madrasa-3a-waitlist.mjs
//
// Madrasa Phase 3A smoke — the waiting-list DATA layer (migration 081).
// Phase A (parent RLS, signed-in clients): join → server-assigned position
// (queue-jump ignored), live partial-unique block, self-promote fence, re-join
// after decline. Phase B (RPC logic, service role + a parent for accept):
// capacity gate, single offer (no double-offer), 48h lazy expiry reaping,
// accept ownership + freshness, and the service_role-only harvest guard.
//
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Run: node scripts/smoke-madrasa-3a-waitlist.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-3a-2026';
const SLUG = 'madrasa3a-test-mosque';
const EM = {
  owner:   'madrasa3a-owner@example.com',
  teacher: 'madrasa3a-teacher@example.com',
  parentB: 'madrasa3a-parentb@example.com',
  parentC: 'madrasa3a-parentc@example.com',
  parentE: 'madrasa3a-parente@example.com',
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const ok  = (line) => { results.push(true);  console.log(`✅ ${line}`); };
const bad = (line) => { results.push(false); console.log(`❌ ${line}`); };
const assert = (cond, line) => (cond ? ok(line) : bad(line));

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
  const userIds = [];
  for (const email of Object.values(EM)) { const u = await findUserByEmail(email); if (u) userIds.push(u.id); }
  if (m) {
    await svc.from('madrasa_waitlist').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
    await svc.from('mosque_staff').delete().eq('mosque_id', m.id);
  }
  for (const uid of userIds) await svc.from('students').delete().eq('profile_id', uid);
  if (m) await svc.from('mosques').delete().eq('id', m.id);
  for (const uid of userIds) await svc.auth.admin.deleteUser(uid);
}

// read a single waitlist row (service role bypasses RLS)
async function wlRow(id) {
  const { data } = await svc.from('madrasa_waitlist').select('*').eq('id', id).maybeSingle();
  return data;
}

const ids = {};
try {
  console.log('— teardown (clean slate) —');
  await teardown();

  console.log('— seed —');
  ids.owner   = await ensureUser(EM.owner);
  ids.teacher = await ensureUser(EM.teacher);
  ids.parentB = await ensureUser(EM.parentB);
  ids.parentC = await ensureUser(EM.parentC);
  ids.parentE = await ensureUser(EM.parentE);

  const { data: mosque } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Madrasa 3a Mosque', address: '1 Test St', city: 'Testville',
    postcode: 'TS1 1ST', user_id: ids.owner, status: 'active',
  }).select().single();
  ids.mosque = mosque.id;

  const { data: staff } = await svc.from('mosque_staff').insert({
    profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Test Teacher', status: 'active',
  }).select().single();
  ids.staff = staff.id;

  // capacity 1 — one seat, so the waitlist actually gates.
  const { data: c1 } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class One', subject: 'quran',
    teacher_staff_id: ids.staff, status: 'active', capacity: 1,
  }).select().single();
  ids.c1 = c1.id;

  const { data: sB } = await svc.from('students').insert({ profile_id: ids.parentB, name: 'Child B' }).select().single();
  const { data: sC } = await svc.from('students').insert({ profile_id: ids.parentC, name: 'Child C' }).select().single();
  const { data: sE } = await svc.from('students').insert({ profile_id: ids.parentE, name: 'Child E' }).select().single();
  ids.sB = sB.id; ids.sC = sC.id; ids.sE = sE.id;

  // Child E fills the single seat (active enrolment) → class is full.
  await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: ids.sE, mosque_id: ids.mosque, status: 'active' });

  console.log('— Phase A: parent RLS (join / position / fence) —');
  const PB = await signIn(EM.parentB);
  const PC = await signIn(EM.parentC);

  // 1. parentB joins (no position) → server-assigns position 1.
  {
    const { data, error } = await PB.from('madrasa_waitlist')
      .insert({ class_id: ids.c1, student_id: ids.sB, mosque_id: ids.mosque, status: 'waiting' })
      .select().single();
    ids.wB = data?.id;
    assert(!error && data && data.position === 1, `parentB join → ${error ? error.message : 'position ' + data?.position + ' (expect 1)'}`);
  }

  // 2. parentC joins WITH position:1 (queue-jump attempt) → trigger overrides to 2.
  {
    const { data, error } = await PC.from('madrasa_waitlist')
      .insert({ class_id: ids.c1, student_id: ids.sC, mosque_id: ids.mosque, status: 'waiting', position: 1 })
      .select().single();
    ids.wC = data?.id;
    assert(!error && data && data.position === 2, `parentC queue-jump (sent position:1) → got ${error ? error.message : 'position ' + data?.position + ' (expect 2, appended)'}`);
  }

  // 3. live partial-unique — parentB joins child B again while live → 23505.
  {
    const { error } = await PB.from('madrasa_waitlist')
      .insert({ class_id: ids.c1, student_id: ids.sB, mosque_id: ids.mosque, status: 'waiting' });
    assert(error && error.code === '23505', `parentB double-join (live) → ${error ? 'blocked (' + error.code + ')' : 'ALLOWED (dup)'}`);
  }

  // 4. self-promote fence — parentB cannot move own row to 'offered'.
  {
    const { error } = await PB.from('madrasa_waitlist').update({ status: 'offered' }).eq('id', ids.wB).select();
    assert(!!error, `parentB self-promote to offered → ${error ? 'blocked (' + (error.code || error.message) + ')' : 'ALLOWED (fence breached)'}`);
  }

  // 5. re-join after decline — parentB declines own row (allowed), then re-joins (terminal row frees the unique).
  {
    const { error: dErr } = await PB.from('madrasa_waitlist').update({ status: 'declined' }).eq('id', ids.wB).select();
    const { data, error: jErr } = await PB.from('madrasa_waitlist')
      .insert({ class_id: ids.c1, student_id: ids.sB, mosque_id: ids.mosque, status: 'waiting' })
      .select().single();
    assert(!dErr && !jErr && !!data, `parentB decline→re-join → decline ${dErr ? dErr.message : 'ok'}, re-join ${jErr ? jErr.message : 'ok (pos ' + data?.position + ')'}`);
  }

  console.log('— Phase B: RPC offer / capacity / expiry / accept —');
  // Reset to a deterministic queue: childB pos1, childC pos2 (insert order sets position).
  await svc.from('madrasa_waitlist').delete().eq('mosque_id', ids.mosque);
  const { data: rB } = await svc.from('madrasa_waitlist').insert({ class_id: ids.c1, student_id: ids.sB, mosque_id: ids.mosque, status: 'waiting' }).select().single();
  const { data: rC } = await svc.from('madrasa_waitlist').insert({ class_id: ids.c1, student_id: ids.sC, mosque_id: ids.mosque, status: 'waiting' }).select().single();
  ids.wB = rB.id; ids.wC = rC.id;
  assert(rB.position === 1 && rC.position === 2, `deterministic queue → B pos ${rB.position} (exp 1), C pos ${rC.position} (exp 2)`);

  // 6. capacity gate — class full (childE active) → no offer.
  {
    const { data, error } = await svc.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    assert(!error && (data || []).length === 0, `make_next_offer while full → ${error ? error.message : (data || []).length + ' rows (expect 0)'}`);
  }

  // 7. free a seat → offers next waiting (childB, pos1), with resolved email + 48h window.
  {
    await svc.from('madrasa_enrollments').update({ status: 'withdrawn' }).eq('class_id', ids.c1).eq('student_id', ids.sE);
    const { data, error } = await svc.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    const row = (data || [])[0];
    const future = row && new Date(row.offer_expires_at).getTime() > Date.now();
    const tbl = await wlRow(ids.wB);
    assert(!error && row && row.student_id === ids.sB && row.parent_email === EM.parentB && future && tbl?.status === 'offered',
      `make_next_offer (seat free) → ${error ? error.message : `student ${row?.student_id === ids.sB ? '✓B' : row?.student_id}, email ${row?.parent_email === EM.parentB ? '✓' : row?.parent_email}, expires>now ${future}, row.status ${tbl?.status}`}`);
  }

  // 8. no double-offer — the outstanding offer consumes the seat.
  {
    const { data, error } = await svc.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    assert(!error && (data || []).length === 0, `make_next_offer again (offer outstanding) → ${error ? error.message : (data || []).length + ' rows (expect 0)'}`);
  }

  // 9. 48h lazy expiry — expire childB's offer, next call reaps it and offers childC.
  {
    await svc.from('madrasa_waitlist').update({ offer_expires_at: new Date(Date.now() - 3600_000).toISOString() }).eq('id', ids.wB);
    const { data, error } = await svc.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    const row = (data || [])[0];
    const bReaped = (await wlRow(ids.wB))?.status === 'expired';
    assert(!error && row && row.student_id === ids.sC && bReaped,
      `expiry reap + next offer → ${error ? error.message : `offered ${row?.student_id === ids.sC ? '✓C' : row?.student_id}, B reaped ${bReaped}`}`);
  }

  // 10. accept — wrong parent is rejected (ownership check).
  {
    const { error } = await PB.rpc('madrasa_waitlist_accept', { p_waitlist_id: ids.wC });
    assert(!!error, `parentB accepts childC offer → ${error ? 'blocked (' + (error.message || error.code) + ')' : 'ALLOWED (ownership breached)'}`);
  }

  // 11. accept — owning parent succeeds: enrolment created + row marked enrolled.
  {
    const { data: enrolId, error } = await PC.rpc('madrasa_waitlist_accept', { p_waitlist_id: ids.wC });
    const tbl = await wlRow(ids.wC);
    const { data: enr } = await svc.from('madrasa_enrollments').select('id,status').eq('class_id', ids.c1).eq('student_id', ids.sC).maybeSingle();
    assert(!error && !!enrolId && tbl?.status === 'enrolled' && enr?.status === 'active',
      `parentC accepts own offer → ${error ? error.message : `enrolId ${enrolId ? '✓' : 'none'}, row.status ${tbl?.status}, enrolment ${enr?.status}`}`);
  }

  // 12. accept — expired offer is refused (reaping is make_next_offer's job, not accept's).
  {
    await svc.from('madrasa_waitlist').update({ status: 'offered', offered_at: new Date().toISOString(), offer_expires_at: new Date(Date.now() - 3600_000).toISOString() }).eq('id', ids.wB);
    const { error } = await PB.rpc('madrasa_waitlist_accept', { p_waitlist_id: ids.wB });
    // and the canonical reaper then sweeps it to 'expired' on its next pass.
    await svc.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    const tbl = await wlRow(ids.wB);
    assert(!!error && tbl?.status === 'expired', `parentB accepts expired offer → ${error ? 'refused (' + (error.message || error.code) + ')' : 'ALLOWED'}, swept by reaper ${tbl?.status === 'expired'}`);
  }

  // 13. harvest guard — an authenticated (non-service) client cannot call make_next_offer.
  {
    const { data, error } = await PB.rpc('madrasa_waitlist_make_next_offer', { p_class: ids.c1 });
    assert(!!error || !(data && data.length), `parent rpc(make_next_offer) → ${error ? 'blocked (' + (error.code || error.message) + ')' : (data?.length ? 'LEAK ' + data.length + ' rows' : 'empty')}`);
  }
} catch (err) {
  bad(`unexpected error — ${err.message}`);
} finally {
  console.log('— teardown —');
  try { await teardown(); } catch (e) { console.log('teardown warning:', e.message); }
}

const passed = results.filter(Boolean).length;
console.log('---');
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length && results.length >= 13 ? 0 : 1);

// scripts/smoke-madrasa-2a-msg.mjs
//
// Madrasa Phase 2a-ii smoke — parent↔teacher messaging (migration 074).
// Validates against amanah-dev: the relaxed conversation_participants role CHECK
// ('teacher' accepted), the gated madrasa_class_teacher_user RPC, conversation
// dedup across the two directions, and a round-trip message.
//
// Self-seeding via the DEV service role; anon clients per role. Targets dev ONLY
// (hard ref assertion). Run: node scripts/smoke-madrasa-2a-msg.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2a-2026';
const SLUG = 'madrasa2amsg-test-mosque';
const EM = {
  owner:   'madrasa2amsg-owner@example.com',
  teacher: 'madrasa2amsg-teacher@example.com',
  parent1: 'madrasa2amsg-parent1@example.com',
  parent2: 'madrasa2amsg-parent2@example.com',
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
  // conversations created by our test users (cascade messages + participants)
  if (userIds.length) {
    const { data: convs } = await svc.from('conversations').select('id').in('created_by', userIds);
    for (const c of convs || []) await svc.from('conversations').delete().eq('id', c.id);
  }
  if (m) {
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
    await svc.from('mosque_staff').delete().eq('mosque_id', m.id);
  }
  for (const uid of userIds) await svc.from('students').delete().eq('profile_id', uid);
  if (m) await svc.from('mosques').delete().eq('id', m.id);
  for (const uid of userIds) await svc.auth.admin.deleteUser(uid);
}

const ids = {};
try {
  console.log('— teardown (clean slate) —');
  await teardown();

  console.log('— seed —');
  ids.owner = await ensureUser(EM.owner);
  ids.teacher = await ensureUser(EM.teacher);
  ids.parent1 = await ensureUser(EM.parent1);
  ids.parent2 = await ensureUser(EM.parent2);

  const { data: mosque, error: mErr } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Madrasa 2a-msg Mosque', address: '1 Test St', city: 'Testville',
    postcode: 'TS1 1ST', user_id: ids.owner, status: 'active',
  }).select().single();
  if (mErr) throw new Error(`seed mosque: ${mErr.message}`);
  ids.mosque = mosque.id;

  const { data: staff } = await svc.from('mosque_staff').insert({
    profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Test Teacher', status: 'active',
  }).select().single();
  ids.staff = staff.id;

  // T teaches BOTH classes; P1's child is enrolled only in C1.
  const { data: c1 } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: ids.staff, status: 'active',
  }).select().single();
  ids.c1 = c1.id;
  const { data: c2 } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class Two', subject: 'arabic', teacher_staff_id: ids.staff, status: 'active',
  }).select().single();
  ids.c2 = c2.id;

  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One' }).select().single();
  ids.s1 = s1.id;
  await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, status: 'active' });

  console.log('— assertions —');
  const P1 = await signIn(EM.parent1);
  const P2 = await signIn(EM.parent2);
  const OW = await signIn(EM.owner);
  const TE = await signIn(EM.teacher);

  // 1. enrolled parent resolves the teacher via the RPC
  let convId;
  {
    const { data: tUser, error } = await P1.rpc('madrasa_class_teacher_user', { p_class: ids.c1 });
    assert(!error && tUser === ids.teacher, `P1 rpc(C1) → ${error ? error.message : (tUser === ids.teacher ? 'teacher uid ✓' : 'wrong: ' + tUser)}`);
  }

  // 2. enrolled parent opens a thread (exercises the 'teacher' role CHECK)
  {
    const { data: tUser } = await P1.rpc('madrasa_class_teacher_user', { p_class: ids.c1 });
    const { data, error } = await P1.rpc('get_or_create_direct_conversation', { other_user_id: tUser, my_role: 'parent', their_role: 'teacher' });
    assert(!error && !!data, `P1 open thread (parent/teacher roles) → ${error ? error.message : 'conversation ' + String(data).slice(0, 8)}`);
    convId = data;
  }

  // 3. RPC gating — parent NOT enrolled in C2 gets null
  {
    const { data: tUser } = await P1.rpc('madrasa_class_teacher_user', { p_class: ids.c2 });
    assert(!tUser, `P1 rpc(C2 not enrolled) → ${tUser ? 'LEAK ' + tUser : 'null ✓'}`);
  }

  // 4. RPC gating — unrelated parent gets null for C1
  {
    const { data: tUser } = await P2.rpc('madrasa_class_teacher_user', { p_class: ids.c1 });
    assert(!tUser, `P2 (not enrolled) rpc(C1) → ${tUser ? 'LEAK ' + tUser : 'null ✓'}`);
  }

  // 5. owner path — owner resolves the teacher
  {
    const { data: tUser } = await OW.rpc('madrasa_class_teacher_user', { p_class: ids.c1 });
    assert(tUser === ids.teacher, `owner rpc(C1) → ${tUser === ids.teacher ? 'teacher uid ✓' : 'got ' + tUser}`);
  }

  // 6. dedup — teacher opening the thread with the parent returns the SAME conversation
  {
    const { data, error } = await TE.rpc('get_or_create_direct_conversation', { other_user_id: ids.parent1, my_role: 'teacher', their_role: 'parent' });
    assert(!error && data === convId, `teacher open thread → ${error ? error.message : (data === convId ? 'same conversation ✓ (dedup)' : 'NEW conversation: ' + String(data).slice(0, 8))}`);
  }

  // 7. round-trip message — parent sends, teacher reads
  {
    const { error: sErr } = await P1.from('messages').insert({ conversation_id: convId, sender_id: ids.parent1, body: 'Salaam, how is my child doing?' });
    const { data: seen, error: rErr } = await TE.from('messages').select('id, body, sender_id').eq('conversation_id', convId);
    assert(!sErr && !rErr && (seen?.length ?? 0) === 1 && seen[0].sender_id === ids.parent1,
      `parent sends → teacher reads → ${sErr || rErr ? (sErr || rErr).message : (seen?.length ?? 0) + ' message(s) visible'}`);
  }

  // 8. anon cannot call the RPC
  {
    const { data, error } = await anon().rpc('madrasa_class_teacher_user', { p_class: ids.c1 });
    assert(!!error || !data, `anon rpc(C1) → ${error ? 'blocked (' + (error.code || error.message) + ')' : (data ? 'LEAK ' + data : 'null')}`);
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
process.exit(passed === results.length && results.length >= 8 ? 0 : 1);

// scripts/smoke-madrasa-2a-announce.mjs
//
// Madrasa Phase 2a-i smoke — empirical RLS validation on madrasa_announcements
// (migration 073). Self-contained: seeds its own fixtures via the DEV service
// role, exercises the policies as each role with the anon key (the path the
// browser takes), then tears the fixtures down.
//
// Targets amanah-dev ONLY (hard project-ref assertion below — the .env /
// .env.local split-brain means VITE_* and SUPABASE_* point at different
// projects; we deliberately use the non-VITE SUPABASE_* keys, which are dev).
//
// Run: node scripts/smoke-madrasa-2a-announce.mjs   (from repo root)
// Exit: 0 if all assertions pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2a-2026';
const SLUG = 'madrasa2a-test-mosque';
const EM = {
  owner:   'madrasa2a-owner@example.com',
  teacher: 'madrasa2a-teacher@example.com',
  parent1: 'madrasa2a-parent1@example.com',
  parent2: 'madrasa2a-parent2@example.com',
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const ok  = (line) => { results.push(true);  console.log(`✅ ${line}`); };
const bad = (line) => { results.push(false); console.log(`❌ ${line}`); };
const assert = (cond, line) => (cond ? ok(line) : bad(line));

// ---- user helpers ------------------------------------------------------
async function findUserByEmail(email) {
  // dev is small — one page is plenty
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
  // make sure a profiles row exists (trigger normally does this; upsert is belt+braces)
  await svc.from('profiles').upsert({ id: u.id, email, name: email.split('@')[0] }, { onConflict: 'id' });
  return u.id;
}
async function signIn(email) {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}

// ---- teardown ----------------------------------------------------------
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) {
    await svc.from('madrasa_announcements').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
    await svc.from('mosque_staff').delete().eq('mosque_id', m.id);
  }
  for (const email of Object.values(EM)) {
    const u = await findUserByEmail(email);
    if (u) {
      await svc.from('students').delete().eq('profile_id', u.id);
    }
  }
  if (m) await svc.from('mosques').delete().eq('id', m.id);
  for (const email of Object.values(EM)) {
    const u = await findUserByEmail(email);
    if (u) await svc.auth.admin.deleteUser(u.id);
  }
}

// ---- main --------------------------------------------------------------
let ids = {};
try {
  console.log('— teardown (clean slate) —');
  await teardown();

  console.log('— seed —');
  ids.owner   = await ensureUser(EM.owner);
  ids.teacher = await ensureUser(EM.teacher);
  ids.parent1 = await ensureUser(EM.parent1);
  ids.parent2 = await ensureUser(EM.parent2);

  const { data: mosque, error: mErr } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Madrasa 2a Test Mosque', address: '1 Test St', city: 'Testville',
    postcode: 'TS1 1ST', user_id: ids.owner, status: 'active',
  }).select().single();
  if (mErr) throw new Error(`seed mosque: ${mErr.message}`);
  ids.mosque = mosque.id;

  const { data: staff, error: sErr } = await svc.from('mosque_staff').insert({
    profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Test Teacher', status: 'active',
  }).select().single();
  if (sErr) throw new Error(`seed staff: ${sErr.message}`);
  ids.staff = staff.id;

  const { data: c1, error: c1Err } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: ids.staff, status: 'active',
  }).select().single();
  if (c1Err) throw new Error(`seed C1: ${c1Err.message}`);
  ids.c1 = c1.id;

  const { data: c2, error: c2Err } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class Two (no teacher)', subject: 'arabic', teacher_staff_id: null, status: 'active',
  }).select().single();
  if (c2Err) throw new Error(`seed C2: ${c2Err.message}`);
  ids.c2 = c2.id;

  const { data: s1, error: s1Err } = await svc.from('students').insert({
    profile_id: ids.parent1, name: 'Child One',
  }).select().single();
  if (s1Err) throw new Error(`seed S1: ${s1Err.message}`);
  ids.s1 = s1.id;
  await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two' });

  const { error: enErr } = await svc.from('madrasa_enrollments').insert({
    class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, status: 'active',
  });
  if (enErr) throw new Error(`seed enrollment: ${enErr.message}`);

  console.log('— assertions —');

  // 1. anon reads nothing
  {
    const { data } = await anon().from('madrasa_announcements').select('*');
    assert(!data || data.length === 0, `anon read → ${data?.length ?? 0} rows (expect 0)`);
  }

  // 2. owner posts to C1
  const owner = await signIn(EM.owner);
  {
    const { data, error } = await owner.from('madrasa_announcements')
      .insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Owner notice', body: 'From the office' })
      .select().single();
    assert(!error && data, `owner insert (C1) → ${error ? error.message : 'ok'}`);
    if (data) ids.annOwner = data.id;
  }

  // 3. owner mosque_id spoof → blocked
  {
    const { error } = await owner.from('madrasa_announcements')
      .insert({ class_id: ids.c1, mosque_id: ids.parent1 /* bogus */, title: 'spoof', body: 'x' })
      .select().single();
    assert(!!error, `owner mosque_id spoof → ${error ? 'blocked (' + error.code + ')' : 'LEAK — inserted!'}`);
  }

  // 4. teacher posts to own class C1
  const teacher = await signIn(EM.teacher);
  {
    const { data, error } = await teacher.from('madrasa_announcements')
      .insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Teacher notice', body: 'Homework due Friday' })
      .select().single();
    assert(!error && data, `teacher insert (own C1) → ${error ? error.message : 'ok'}`);
    if (data) ids.annTeacher = data.id;
  }

  // 5. teacher posts to C2 (not their class) → blocked
  {
    const { error } = await teacher.from('madrasa_announcements')
      .insert({ class_id: ids.c2, mosque_id: ids.mosque, title: 'wrong class', body: 'x' })
      .select().single();
    assert(!!error, `teacher insert (C2 not theirs) → ${error ? 'blocked (' + error.code + ')' : 'LEAK — inserted!'}`);
  }

  // 6. parent1 (enrolled in C1) reads both notices
  {
    const c = await signIn(EM.parent1);
    const { data } = await c.from('madrasa_announcements').select('*').eq('class_id', ids.c1);
    assert((data?.length ?? 0) === 2, `parent1 (enrolled) read C1 → ${data?.length ?? 0} rows (expect 2)`);
  }

  // 7. parent2 (not enrolled) reads nothing
  {
    const c = await signIn(EM.parent2);
    const { data } = await c.from('madrasa_announcements').select('*');
    assert((data?.length ?? 0) === 0, `parent2 (not enrolled) read → ${data?.length ?? 0} rows (expect 0)`);
  }

  // 8. parent1 cannot post (no insert policy for parents)
  {
    const c = await signIn(EM.parent1);
    const { error } = await c.from('madrasa_announcements')
      .insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'parent', body: 'x' })
      .select().single();
    assert(!!error, `parent insert → ${error ? 'blocked (' + error.code + ')' : 'LEAK — inserted!'}`);
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

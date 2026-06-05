// scripts/smoke-madrasa-2b-homework.mjs
//
// Madrasa Phase 2b homework smoke — RLS on madrasa_homework +
// madrasa_homework_completions (migration 077). Self-seeding via the DEV service
// role; exercises each role with the anon key. Targets dev ONLY (ref assertion).
//
// Run: node scripts/smoke-madrasa-2b-homework.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2bhw-2026';
const SLUG = 'madrasa2bhw-test-mosque';
const EM = {
  owner:   'madrasa2bhw-owner@example.com',
  teacher: 'madrasa2bhw-teacher@example.com',
  parent1: 'madrasa2bhw-parent1@example.com',
  parent2: 'madrasa2bhw-parent2@example.com',
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
    await svc.from('madrasa_homework_completions').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_homework').delete().eq('mosque_id', m.id);
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

  const { data: mosque } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Madrasa 2b-hw Mosque', address: '1 Test St', city: 'Testville',
    postcode: 'TS1 1ST', user_id: ids.owner, status: 'active',
  }).select().single();
  ids.mosque = mosque.id;

  const { data: staff } = await svc.from('mosque_staff').insert({
    profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Test Teacher', status: 'active',
  }).select().single();
  ids.staff = staff.id;

  const { data: c1 } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: ids.staff, status: 'active',
  }).select().single();
  ids.c1 = c1.id;
  const { data: c2 } = await svc.from('madrasa_classes').insert({
    mosque_id: ids.mosque, name: 'Class Two (no teacher)', subject: 'arabic', teacher_staff_id: null, status: 'active',
  }).select().single();
  ids.c2 = c2.id;

  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One' }).select().single();
  ids.s1 = s1.id;
  await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two' });
  await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, status: 'active' });

  console.log('— assertions: homework —');

  // 1. anon read homework
  {
    const { data } = await anon().from('madrasa_homework').select('*');
    assert(!data || data.length === 0, `anon read homework → ${data?.length ?? 0} (expect 0)`);
  }

  // 2. owner create on C1
  const owner = await signIn(EM.owner);
  {
    const { data, error } = await owner.from('madrasa_homework')
      .insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Read Surah Al-Mulk', body: 'Pages 1-2', due_date: '2026-06-20' })
      .select().single();
    assert(!error && data, `owner create homework (C1) → ${error ? error.message : 'ok'}`);
    ids.hw = data?.id;
  }

  // 3. owner mosque_id spoof
  {
    const { error } = await owner.from('madrasa_homework')
      .insert({ class_id: ids.c1, mosque_id: ids.parent1, title: 'spoof', body: 'x' }).select().single();
    assert(!!error, `owner mosque_id spoof → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`);
  }

  // 4. teacher create on own C1
  const teacher = await signIn(EM.teacher);
  {
    const { error } = await teacher.from('madrasa_homework')
      .insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Memorise 3 ayahs', body: null }).select().single();
    assert(!error, `teacher create homework (own C1) → ${error ? error.message : 'ok'}`);
  }

  // 5. teacher create on C2 (not theirs)
  {
    const { error } = await teacher.from('madrasa_homework')
      .insert({ class_id: ids.c2, mosque_id: ids.mosque, title: 'wrong', body: 'x' }).select().single();
    assert(!!error, `teacher create homework (C2 not theirs) → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`);
  }

  // 6. parent1 (enrolled) reads both homework on C1
  {
    const c = await signIn(EM.parent1);
    const { data } = await c.from('madrasa_homework').select('*').eq('class_id', ids.c1);
    assert((data?.length ?? 0) === 2, `parent1 (enrolled) read C1 homework → ${data?.length ?? 0} (expect 2)`);
  }

  // 7. parent2 (not enrolled) reads 0
  {
    const c = await signIn(EM.parent2);
    const { data } = await c.from('madrasa_homework').select('*');
    assert((data?.length ?? 0) === 0, `parent2 (not enrolled) read homework → ${data?.length ?? 0} (expect 0)`);
  }

  console.log('— assertions: completions —');

  // 8. parent1 marks own child (S1) done
  {
    const c = await signIn(EM.parent1);
    const { error } = await c.from('madrasa_homework_completions')
      .insert({ homework_id: ids.hw, student_id: ids.s1, class_id: ids.c1, mosque_id: ids.mosque }).select().single();
    assert(!error, `parent1 mark S1 done → ${error ? error.message : 'ok'}`);
  }

  // 9. parent1 completion spoof — wrong class_id (doesn't match homework)
  {
    const c = await signIn(EM.parent1);
    const { error } = await c.from('madrasa_homework_completions')
      .insert({ homework_id: ids.hw, student_id: ids.s1, class_id: ids.c2, mosque_id: ids.mosque }).select().single();
    assert(!!error, `parent1 completion class spoof → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`);
  }

  // 10. parent2 cannot mark S1 (not their child)
  {
    const c = await signIn(EM.parent2);
    const { error } = await c.from('madrasa_homework_completions')
      .insert({ homework_id: ids.hw, student_id: ids.s1, class_id: ids.c1, mosque_id: ids.mosque }).select().single();
    assert(!!error, `parent2 mark someone else's child → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`);
  }

  // 11. teacher reads completions for own class
  {
    const c = await signIn(EM.teacher);
    const { data } = await c.from('madrasa_homework_completions').select('*').eq('class_id', ids.c1);
    assert((data?.length ?? 0) === 1 && data[0].student_id === ids.s1, `teacher read C1 completions → ${data?.length ?? 0} (expect 1: S1)`);
  }

  // 12. owner reads completions
  {
    const { data } = await owner.from('madrasa_homework_completions').select('*');
    assert((data?.length ?? 0) === 1, `owner read completions → ${data?.length ?? 0} (expect 1)`);
  }

  // 13. anon reads no completions
  {
    const { data } = await anon().from('madrasa_homework_completions').select('*');
    assert(!data || data.length === 0, `anon read completions → ${data?.length ?? 0} (expect 0)`);
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

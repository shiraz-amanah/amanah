// scripts/smoke-madrasa-2c-reports.mjs
//
// Madrasa Phase 2C smoke — madrasa_reports RLS + the publish lifecycle + the
// madrasa_build_report_summary RPC (migration 078). Self-seeding via the DEV
// service role; targets dev ONLY. Run: node scripts/smoke-madrasa-2c-reports.mjs

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2c-2026';
const SLUG = 'madrasa2c-test-mosque';
const EM = {
  owner:   'madrasa2c-owner@example.com',
  teacher: 'madrasa2c-teacher@example.com',
  parent1: 'madrasa2c-parent1@example.com',
  parent2: 'madrasa2c-parent2@example.com',
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const ok  = (l) => { results.push(true);  console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const assert = (c, l) => (c ? ok(l) : bad(l));

async function findUserByEmail(email) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => u.email === email) || null;
}
async function ensureUser(email) {
  let u = await findUserByEmail(email);
  if (!u) { const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; }
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
    for (const t of ['madrasa_reports', 'madrasa_homework_completions', 'madrasa_homework', 'madrasa_hifz_progress', 'madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes', 'mosque_staff']) {
      await svc.from(t).delete().eq('mosque_id', m.id);
    }
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

  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'Madrasa 2C Mosque', address: '1 St', city: 'T', postcode: 'TS1 1ST', user_id: ids.owner, status: 'active' }).select().single();
  ids.mosque = mosque.id;
  const { data: staff } = await svc.from('mosque_staff').insert({ profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'T', status: 'active' }).select().single();
  ids.staff = staff.id;
  const { data: c1 } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class One', subject: 'hifz', teacher_staff_id: ids.staff, status: 'active' }).select().single();
  ids.c1 = c1.id;
  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One' }).select().single();
  ids.s1 = s1.id;
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two' }).select().single();
  ids.s2 = s2.id;
  await svc.from('madrasa_enrollments').insert([
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, status: 'active' },
    { class_id: ids.c1, student_id: ids.s2, mosque_id: ids.mosque, status: 'active' },
  ]);
  // data for S1's summary: 2 present + 1 absent, 1 hifz entry, 1 homework + 1 completion
  await svc.from('madrasa_attendance').insert([
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-01', status: 'present' },
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-08', status: 'present' },
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-15', status: 'absent' },
  ]);
  await svc.from('madrasa_hifz_progress').insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, surah_number: 67, ayah_to: 12, lesson_type: 'sabaq', status: 'memorized', quality: 'good', session_date: '2026-05-15' });
  const { data: hw } = await svc.from('madrasa_homework').insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Task 1' }).select().single();
  await svc.from('madrasa_homework_completions').insert({ homework_id: hw.id, student_id: ids.s1, class_id: ids.c1, mosque_id: ids.mosque });

  console.log('— assertions —');

  // 1. anon read reports
  { const { data } = await anon().from('madrasa_reports').select('*'); assert(!data || data.length === 0, `anon read reports → ${data?.length ?? 0} (expect 0)`); }

  const teacher = await signIn(EM.teacher);
  const owner = await signIn(EM.owner);
  const p1 = await signIn(EM.parent1);
  const p2 = await signIn(EM.parent2);

  // 2. teacher build_summary → correct counts
  {
    const { data, error } = await teacher.rpc('madrasa_build_report_summary', { p_class: ids.c1, p_student: ids.s1 });
    const a = data?.attendance, h = data?.hifz, w = data?.homework;
    assert(!error && a?.present === 2 && a?.absent === 1 && h?.total_entries === 1 && h?.last_surah === 67 && w?.assigned === 1 && w?.completed === 1,
      `build_summary → ${error ? error.message : `att ${a?.present}/${a?.absent}, hifz surah ${h?.last_surah} (${h?.total_entries}), hw ${w?.completed}/${w?.assigned}`}`);
  }

  // 3. unauthorized caller (parent) → null
  { const { data } = await p1.rpc('madrasa_build_report_summary', { p_class: ids.c1, p_student: ids.s1 }); assert(data === null, `parent build_summary → ${data === null ? 'null ✓' : 'LEAK'}`); }

  // 4. teacher create draft report
  let reportId;
  {
    const { data, error } = await teacher.from('madrasa_reports')
      .insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, term: 'Summer 2026', teacher_comment: 'Strong term.', attendance_summary: { present: 2, absent: 1 }, hifz_summary: { last_surah: 67 }, homework_summary: { assigned: 1, completed: 1 } })
      .select().single();
    assert(!error && data && data.published_at === null, `teacher create draft → ${error ? error.message : 'ok (draft)'}`);
    reportId = data?.id;
  }

  // 5. parent can't see draft
  { const { data } = await p1.from('madrasa_reports').select('*'); assert((data?.length ?? 0) === 0, `parent1 read (draft) → ${data?.length ?? 0} (expect 0)`); }

  // 6. teacher publishes
  { const { error } = await teacher.from('madrasa_reports').update({ published_at: new Date().toISOString() }).eq('id', reportId); assert(!error, `teacher publish → ${error ? error.message : 'ok'}`); }

  // 7. parent1 now sees it
  { const { data } = await p1.from('madrasa_reports').select('*'); assert((data?.length ?? 0) === 1, `parent1 read (published) → ${data?.length ?? 0} (expect 1)`); }

  // 8. parent2 (other child) sees nothing
  { const { data } = await p2.from('madrasa_reports').select('*'); assert((data?.length ?? 0) === 0, `parent2 read → ${data?.length ?? 0} (expect 0)`); }

  // 9. teacher cannot unpublish (trigger)
  { const { error } = await teacher.from('madrasa_reports').update({ published_at: null }).eq('id', reportId); assert(!!error, `teacher unpublish → ${error ? 'blocked (' + (error.code || error.message) + ')' : 'LEAK — unpublished!'}`); }

  // 10. owner reads all (incl. published)
  { const { data } = await owner.from('madrasa_reports').select('*'); assert((data?.length ?? 0) >= 1, `owner read all → ${data?.length ?? 0} (expect ≥1)`); }

  // 11. teacher mosque_id spoof on create
  { const { error } = await teacher.from('madrasa_reports').insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.parent1, term: 'spoof' }).select().single(); assert(!!error, `mosque_id spoof → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`); }
} catch (err) {
  bad(`unexpected error — ${err.message}`);
} finally {
  console.log('— teardown —');
  try { await teardown(); } catch (e) { console.log('teardown warning:', e.message); }
}

const passed = results.filter(Boolean).length;
console.log('---');
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length && results.length >= 11 ? 0 : 1);

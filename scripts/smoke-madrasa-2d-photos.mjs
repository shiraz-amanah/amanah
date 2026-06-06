// scripts/smoke-madrasa-2d-photos.mjs
//
// Madrasa Phase 2D smoke — consent + photo RLS + the visible_to gating + the
// withdrawal flag trigger (migrations 079/080). Table/RLS layer only — actual
// storage bytes + signed URLs are a separate manual vercel dev/browser check.
// Self-seeding via the DEV service role; targets dev ONLY.
// Run: node scripts/smoke-madrasa-2d-photos.mjs

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2d-2026';
const SLUG = 'madrasa2d-test-mosque';
const EM = {
  owner:   'madrasa2d-owner@example.com',
  teacher: 'madrasa2d-teacher@example.com',
  parent1: 'madrasa2d-parent1@example.com',
  parent2: 'madrasa2d-parent2@example.com',
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
    for (const t of ['madrasa_photos', 'madrasa_photo_consent', 'madrasa_enrollments', 'madrasa_classes', 'mosque_staff']) {
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

  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'Madrasa 2D Mosque', address: '1 St', city: 'T', postcode: 'TS1 1ST', user_id: ids.owner, status: 'active' }).select().single();
  ids.mosque = mosque.id;
  const { data: staff } = await svc.from('mosque_staff').insert({ profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'T', status: 'active' }).select().single();
  ids.staff = staff.id;
  // C1 taught by T; C2 has no teacher (for the mosque-scoped consent read test)
  const { data: c1 } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: ids.staff, status: 'active' }).select().single();
  ids.c1 = c1.id;
  const { data: c2 } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class Two', subject: 'arabic', teacher_staff_id: null, status: 'active' }).select().single();
  ids.c2 = c2.id;
  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One' }).select().single();
  ids.s1 = s1.id;
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two' }).select().single();
  ids.s2 = s2.id;
  await svc.from('madrasa_enrollments').insert([
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, status: 'active' },
    { class_id: ids.c2, student_id: ids.s2, mosque_id: ids.mosque, status: 'active' },
  ]);

  console.log('— assertions: consent —');
  const owner = await signIn(EM.owner);
  const teacher = await signIn(EM.teacher);
  const p1 = await signIn(EM.parent1);
  const p2 = await signIn(EM.parent2);

  // 1. anon read consent
  { const { data } = await anon().from('madrasa_photo_consent').select('*'); assert(!data || data.length === 0, `anon read consent → ${data?.length ?? 0} (expect 0)`); }

  // 2. parent1 gives consent for own child
  { const { error } = await p1.from('madrasa_photo_consent').upsert({ student_id: ids.s1, mosque_id: ids.mosque, consent_given: true, consent_date: new Date().toISOString(), consent_given_by: ids.parent1 }, { onConflict: 'student_id,mosque_id' }); assert(!error, `parent1 give consent (S1) → ${error ? error.message : 'ok'}`); }

  // 3. parent2 cannot set consent for someone else's child
  { const { error } = await p2.from('madrasa_photo_consent').upsert({ student_id: ids.s1, mosque_id: ids.mosque, consent_given: true, consent_given_by: ids.parent2 }, { onConflict: 'student_id,mosque_id' }); assert(!!error, `parent2 set consent for S1 → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`); }

  // 4. parent2 gives consent for OWN child (S2) — for the teacher-scope test
  { const { error } = await p2.from('madrasa_photo_consent').upsert({ student_id: ids.s2, mosque_id: ids.mosque, consent_given: true, consent_date: new Date().toISOString(), consent_given_by: ids.parent2 }, { onConflict: 'student_id,mosque_id' }); assert(!error, `parent2 give consent (S2) → ${error ? error.message : 'ok'}`); }

  // 5. owner reads all consent for the mosque
  { const { data } = await owner.from('madrasa_photo_consent').select('*'); assert((data?.length ?? 0) === 2, `owner read consent → ${data?.length ?? 0} (expect 2)`); }

  // 6. teacher reads consent only for students they teach (S1 in C1, NOT S2 in C2)
  { const { data } = await teacher.from('madrasa_photo_consent').select('student_id'); const sids = (data || []).map((r) => r.student_id); assert(sids.length === 1 && sids[0] === ids.s1, `teacher read consent → [${sids.map((x) => x.slice(0, 4)).join(',')}] (expect only S1)`); }

  console.log('— assertions: photos —');

  // 7. anon read photos
  { const { data } = await anon().from('madrasa_photos').select('*'); assert(!data || data.length === 0, `anon read photos → ${data?.length ?? 0} (expect 0)`); }

  // 8. teacher inserts a photo row visible to S1 (storage bytes not exercised here)
  let photoId;
  { const { data, error } = await teacher.from('madrasa_photos').insert({ class_id: ids.c1, mosque_id: ids.mosque, storage_path: `${ids.mosque}/${ids.c1}/test.jpg`, caption: 'Session 1', visible_to: [ids.s1] }).select().single(); assert(!error && data, `teacher insert photo (visible_to=[S1]) → ${error ? error.message : 'ok'}`); photoId = data?.id; }

  // 9. parent1 (S1) sees the photo
  { const { data } = await p1.from('madrasa_photos').select('*'); assert((data?.length ?? 0) === 1, `parent1 read photos → ${data?.length ?? 0} (expect 1)`); }

  // 10. parent2 (S2, not in visible_to) sees nothing
  { const { data } = await p2.from('madrasa_photos').select('*'); assert((data?.length ?? 0) === 0, `parent2 read photos → ${data?.length ?? 0} (expect 0)`); }

  // 11. teacher photo mosque_id spoof
  { const { error } = await teacher.from('madrasa_photos').insert({ class_id: ids.c1, mosque_id: ids.parent1, storage_path: 'x/y/z.jpg', visible_to: [] }).select().single(); assert(!!error, `photo mosque_id spoof → ${error ? 'blocked (' + error.code + ')' : 'LEAK'}`); }

  // 12. parent1 WITHDRAWS consent → trigger flags the past photo (not deleted)
  {
    const { error } = await p1.from('madrasa_photo_consent').update({ consent_given: false, consent_date: null }).eq('student_id', ids.s1).eq('mosque_id', ids.mosque);
    const { data: ph } = await owner.from('madrasa_photos').select('flagged_for_review').eq('id', photoId).single();
    assert(!error && ph?.flagged_for_review === true, `withdraw consent → photo flagged_for_review = ${ph?.flagged_for_review} (expect true)`);
  }

  // 13. parent1 still sees the (flagged, not deleted) photo
  { const { data } = await p1.from('madrasa_photos').select('*'); assert((data?.length ?? 0) === 1, `parent1 read after withdrawal → ${data?.length ?? 0} (expect 1: past photo retained)`); }
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

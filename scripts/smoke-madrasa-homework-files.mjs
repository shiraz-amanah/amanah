// scripts/smoke-madrasa-homework-files.mjs
//
// Madrasa Fix 2 smoke — homework file uploads (migration 084). Unlike the other
// madrasa smokes this exercises STORAGE RLS with REAL uploads/downloads against
// the private madrasa-homework-uploads bucket (the gap that bit photos): teacher
// writes a resource, a parent writes only their own child's submission, cross-
// child + resource writes by a parent are denied, reads are gated, anon denied;
// plus the files jsonb columns.
//
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Run: node scripts/smoke-madrasa-homework-files.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const BUCKET = 'madrasa-homework-uploads';
const PW = 'smoke-hwf-2026';
const SLUG = 'madrasa-hwf-mosque';
const EM = { owner: 'hwf-owner@example.com', teacher: 'hwf-teacher@example.com', p1: 'hwf-p1@example.com', p2: 'hwf-p2@example.com' };

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const results = [];
const ok = (l) => { results.push(true); console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const assert = (c, l) => (c ? ok(l) : bad(l));
const buf = () => Buffer.from(`smoke ${Math.random().toString(36).slice(2)}`); // vary content by call index avoided; randomness only in body bytes

async function findUser(email) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === email) || null; }
async function ensureUser(email) {
  let u = await findUser(email);
  if (!u) { const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; }
  await svc.from('profiles').upsert({ id: u.id, email, name: email.split('@')[0] }, { onConflict: 'id' });
  return u.id;
}
async function signIn(email) { const c = anon(); const { error } = await c.auth.signInWithPassword({ email, password: PW }); if (error) throw new Error(`signIn ${email}: ${error.message}`); return c; }
const up = (client, path) => client.storage.from(BUCKET).upload(path, buf(), { contentType: 'text/plain', upsert: true });
const dl = (client, path) => client.storage.from(BUCKET).download(path);

const ids = {}; const created = [];
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  const userIds = [];
  for (const e of Object.values(EM)) { const u = await findUser(e); if (u) userIds.push(u.id); }
  if (created.length) await svc.storage.from(BUCKET).remove(created).catch(() => {});
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

try {
  console.log('— teardown (clean slate) —');
  await teardown();

  console.log('— seed —');
  ids.owner = await ensureUser(EM.owner); ids.teacher = await ensureUser(EM.teacher);
  ids.p1 = await ensureUser(EM.p1); ids.p2 = await ensureUser(EM.p2);
  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'HWF Mosque', address: '1 St', city: 'Town', postcode: 'TS1 1ST', user_id: ids.owner, status: 'active' }).select().single();
  ids.mosque = mosque.id;
  const { data: staff } = await svc.from('mosque_staff').insert({ profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Teacher', status: 'active' }).select().single();
  const { data: c1 } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: staff.id, status: 'active' }).select().single();
  ids.c1 = c1.id;
  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.p1, name: 'Child One' }).select().single();
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.p2, name: 'Child Two' }).select().single();
  ids.s1 = s1.id; ids.s2 = s2.id;
  for (const sid of [ids.s1, ids.s2]) await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: sid, mosque_id: ids.mosque, status: 'active' });
  const { data: hw } = await svc.from('madrasa_homework').insert({ class_id: ids.c1, mosque_id: ids.mosque, title: 'Read Surah Al-Fatihah' }).select().single();
  ids.hw = hw.id;

  const base = `${ids.mosque}/${ids.c1}/${ids.hw}`;
  const pRes = `${base}/_resource/teacher.txt`;
  const pS1 = `${base}/${ids.s1}/child1.txt`;
  const pS1b = `${base}/${ids.s1}/child1b.txt`;
  const pS2 = `${base}/${ids.s2}/child2.txt`;

  console.log('— assertions —');
  const T = await signIn(EM.teacher); const P1 = await signIn(EM.p1); const P2 = await signIn(EM.p2); const O = await signIn(EM.owner);

  // 1. teacher writes a resource file
  { const { error } = await up(T, pRes); if (!error) created.push(pRes); assert(!error, `teacher upload _resource → ${error ? error.message : 'ok'}`); }
  // 2. parent1 writes own child's submission
  { const { error } = await up(P1, pS1); if (!error) created.push(pS1); assert(!error, `parent1 upload own child submission → ${error ? error.message : 'ok'}`); }
  // 3. parent1 CANNOT write under child2's folder
  { const { error } = await up(P1, pS2); if (!error) created.push(pS2); assert(!!error, `parent1 upload child2 folder → ${error ? 'blocked' : 'ALLOWED (leak)'}`); }
  // 4. parent1 CANNOT write a resource file
  { const { error } = await up(P1, `${base}/_resource/parent.txt`); if (!error) created.push(`${base}/_resource/parent.txt`); assert(!!error, `parent1 upload _resource → ${error ? 'blocked' : 'ALLOWED (leak)'}`); }
  // 5. parent1 reads own submission + the teacher resource
  { const a = await dl(P1, pS1); const b = await dl(P1, pRes); assert(!a.error && !b.error, `parent1 read own submission + resource → submission ${a.error ? a.error.message : 'ok'}, resource ${b.error ? b.error.message : 'ok'}`); }
  // 6. parent2 CANNOT read child1's submission
  { const { error } = await dl(P2, pS1); assert(!!error, `parent2 read child1 submission → ${error ? 'blocked' : 'ALLOWED (leak)'}`); }
  // 7. owner reads any submission
  { const { error } = await dl(O, pS1); assert(!error, `owner read child1 submission → ${error ? error.message : 'ok'}`); }
  // 8. teacher reads child1 submission (manages the class)
  { const { error } = await dl(T, pS1); assert(!error, `teacher read child1 submission → ${error ? error.message : 'ok'}`); }
  // 9. anon cannot upload
  { const { error } = await up(anon(), pS1b); if (!error) created.push(pS1b); assert(!!error, `anon upload → ${error ? 'blocked' : 'ALLOWED (leak)'}`); }
  // 10. files jsonb columns round-trip
  {
    await svc.from('madrasa_homework').update({ files: [{ path: pRes, name: 'teacher.txt', size: 12 }] }).eq('id', ids.hw);
    await svc.from('madrasa_homework_completions').insert({ homework_id: ids.hw, student_id: ids.s1, class_id: ids.c1, mosque_id: ids.mosque, files: [{ path: pS1, name: 'child1.txt', size: 12 }] });
    const { data: h } = await svc.from('madrasa_homework').select('files').eq('id', ids.hw).single();
    const { data: comp } = await svc.from('madrasa_homework_completions').select('files').eq('homework_id', ids.hw).eq('student_id', ids.s1).single();
    assert(h?.files?.[0]?.name === 'teacher.txt' && comp?.files?.[0]?.name === 'child1.txt', `files jsonb round-trip → hw ${h?.files?.[0]?.name}, completion ${comp?.files?.[0]?.name}`);
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
process.exit(passed === results.length && results.length >= 10 ? 0 : 1);

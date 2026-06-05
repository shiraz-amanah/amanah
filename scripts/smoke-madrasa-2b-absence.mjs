// scripts/smoke-madrasa-2b-absence.mjs
//
// Madrasa Phase 2b smoke — the absence-notification DATA layer (migration 075).
// Tests the SECURITY DEFINER RPCs the serverless handler relies on, WITHOUT
// hitting Resend: selection (absent + un-notified only), consecutive-streak
// count (incl. reset after a present), parent email opt-in flag, claim dedup,
// and the service_role-only harvest guard.
//
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Run: node scripts/smoke-madrasa-2b-absence.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-2b-2026';
const SLUG = 'madrasa2b-test-mosque';
const D1 = '2026-05-01', D2 = '2026-05-08', D3 = '2026-05-15';
const EM = {
  owner:   'madrasa2b-owner@example.com',
  teacher: 'madrasa2b-teacher@example.com',
  parent1: 'madrasa2b-parent1@example.com',
  parent2: 'madrasa2b-parent2@example.com',
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
async function ensureUser(email, notifications) {
  let u = await findUserByEmail(email);
  if (!u) {
    const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    u = data.user;
  }
  const row = { id: u.id, email, name: email.split('@')[0] };
  if (notifications) row.notifications = notifications;
  await svc.from('profiles').upsert(row, { onConflict: 'id' });
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
    await svc.from('madrasa_attendance').delete().eq('mosque_id', m.id);
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
  ids.parent1 = await ensureUser(EM.parent1, { email: true, sms: false, whatsapp: false });   // opt-in
  ids.parent2 = await ensureUser(EM.parent2, { email: false, sms: false, whatsapp: false });  // opt-out

  const { data: mosque } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Madrasa 2b Mosque', address: '1 Test St', city: 'Testville',
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

  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One' }).select().single();
  ids.s1 = s1.id;
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two' }).select().single();
  ids.s2 = s2.id;
  for (const sid of [ids.s1, ids.s2]) {
    await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: sid, mosque_id: ids.mosque, status: 'active' });
  }

  // S1: absent, absent, absent  → streak 3 at D3
  // S2: absent, present, absent → streak 1 at D3 (reset after the present)
  const att = [
    { student_id: ids.s1, session_date: D1, status: 'absent' },
    { student_id: ids.s1, session_date: D2, status: 'absent' },
    { student_id: ids.s1, session_date: D3, status: 'absent' },
    { student_id: ids.s2, session_date: D1, status: 'absent' },
    { student_id: ids.s2, session_date: D2, status: 'present' },
    { student_id: ids.s2, session_date: D3, status: 'absent' },
  ].map((r) => ({ ...r, class_id: ids.c1, mosque_id: ids.mosque }));
  const { error: attErr } = await svc.from('madrasa_attendance').insert(att);
  if (attErr) throw new Error(`seed attendance: ${attErr.message}`);

  console.log('— assertions —');

  // 1–3. to_notify(C1, D3) → both absent rows, with streak + opt-in resolved
  let rows;
  {
    const { data, error } = await svc.rpc('madrasa_absences_to_notify', { p_class: ids.c1, p_session_date: D3 });
    rows = data || [];
    assert(!error && rows.length === 2, `to_notify(D3) → ${error ? error.message : rows.length + ' rows (expect 2)'}`);
    const r1 = rows.find((r) => r.student_id === ids.s1);
    const r2 = rows.find((r) => r.student_id === ids.s2);
    assert(r1 && r1.consecutive_count === 3 && r1.parent_email_opt_in === true && r1.parent_email === EM.parent1 && r1.owner_email === EM.owner,
      `S1 row → streak ${r1?.consecutive_count} (exp 3), opt_in ${r1?.parent_email_opt_in} (exp true), parent ${r1?.parent_email === EM.parent1 ? '✓' : r1?.parent_email}, owner ${r1?.owner_email === EM.owner ? '✓' : r1?.owner_email}`);
    assert(r2 && r2.consecutive_count === 1 && r2.parent_email_opt_in === false,
      `S2 row → streak ${r2?.consecutive_count} (exp 1, reset after present), opt_in ${r2?.parent_email_opt_in} (exp false)`);
  }

  // 4. claim dedup — first claim true, second false
  {
    const s1row = rows.find((r) => r.student_id === ids.s1);
    const { data: first } = await svc.rpc('madrasa_claim_absence_notification', { p_id: s1row.attendance_id });
    const { data: second } = await svc.rpc('madrasa_claim_absence_notification', { p_id: s1row.attendance_id });
    assert(first === true && second === false, `claim(S1@D3) → first ${first} (exp true), second ${second} (exp false)`);
  }

  // 5. after claiming S1, to_notify(D3) returns only S2
  {
    const { data } = await svc.rpc('madrasa_absences_to_notify', { p_class: ids.c1, p_session_date: D3 });
    const left = data || [];
    assert(left.length === 1 && left[0].student_id === ids.s2, `to_notify(D3) after claim → ${left.length} row (expect 1: S2 only)`);
  }

  // 6. consecutive helper directly — S1 at D2 was 2 in a row
  {
    const { data, error } = await svc.rpc('madrasa_consecutive_absences', { p_class: ids.c1, p_student: ids.s1, p_upto: D2 });
    assert(!error && data === 2, `consecutive(S1@D2) → ${error ? error.message : data} (expect 2)`);
  }

  // 7. harvest guard — an authenticated (non-service) client cannot call the RPC
  {
    const P1 = await signIn(EM.parent1);
    const { data, error } = await P1.rpc('madrasa_absences_to_notify', { p_class: ids.c1, p_session_date: D3 });
    assert(!!error || !(data && data.length), `parent rpc(to_notify) → ${error ? 'blocked (' + (error.code || error.message) + ')' : (data?.length ? 'LEAK ' + data.length + ' rows' : 'empty')}`);
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
process.exit(passed === results.length && results.length >= 7 ? 0 : 1);

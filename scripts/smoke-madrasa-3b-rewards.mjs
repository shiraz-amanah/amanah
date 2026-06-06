// scripts/smoke-madrasa-3b-rewards.mjs
//
// Madrasa Phase 3B smoke — rewards data layer (migration 083). Covers the brief's
// 7-point plan: positive award → email payload resolves; warning/concern → NO
// email payload; parent reads own child's rewards (all types); unrelated parent
// blocked (RLS); leaderboard = stars only; anon denied on the table; email RPC
// harvest-guarded. Plus the folded-in 3E export RPC (owner sees contact+
// attendance; teacher/other get 0 rows; anon denied).
//
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Run: node scripts/smoke-madrasa-3b-rewards.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-3b-2026';
const SLUG = 'madrasa3b-test-mosque';
const EM = {
  owner:   'madrasa3b-owner@example.com',
  teacher: 'madrasa3b-teacher@example.com',
  parent1: 'madrasa3b-parent1@example.com',
  parent2: 'madrasa3b-parent2@example.com',
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
async function ensureUser(email, notifications) {
  let u = await findUserByEmail(email);
  if (!u) { const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; }
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
    await svc.from('madrasa_rewards').delete().eq('mosque_id', m.id);
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
  ids.parent1 = await ensureUser(EM.parent1, { email: true });   // opt-in
  ids.parent2 = await ensureUser(EM.parent2);

  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'Rewards Mosque', address: '1 St', city: 'Town', postcode: 'TS1 1ST', user_id: ids.owner, status: 'active' }).select().single();
  ids.mosque = mosque.id;
  const { data: staff } = await svc.from('mosque_staff').insert({ profile_id: ids.teacher, mosque_id: ids.mosque, role: 'teacher', name: 'Test Teacher', status: 'active' }).select().single();
  ids.staff = staff.id;
  const { data: c1 } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class One', subject: 'quran', teacher_staff_id: ids.staff, status: 'active', capacity: 10 }).select().single();
  ids.c1 = c1.id;
  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.parent1, name: 'Child One', age: 8, relation: 'Son' }).select().single();
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.parent2, name: 'Child Two', age: 9 }).select().single();
  ids.s1 = s1.id; ids.s2 = s2.id;
  for (const sid of [ids.s1, ids.s2]) await svc.from('madrasa_enrollments').insert({ class_id: ids.c1, student_id: sid, mosque_id: ids.mosque, status: 'active' });
  // attendance for the export summary: S1 present×2, absent×1
  await svc.from('madrasa_attendance').insert([
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-01', status: 'present' },
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-08', status: 'present' },
    { class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, session_date: '2026-05-15', status: 'absent' },
  ]);

  console.log('— assertions —');
  const TEACHER = await signIn(EM.teacher);
  const P1 = await signIn(EM.parent1);
  const P2 = await signIn(EM.parent2);

  // 1. Teacher awards a star to S1 → row created; email RPC resolves the parent.
  let starId;
  {
    const { data, error } = await TEACHER.from('madrasa_rewards')
      .insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, type: 'star', note: 'Great tajweed', awarded_by: ids.teacher })
      .select().single();
    starId = data?.id;
    assert(!error && !!starId, `teacher awards star → ${error ? error.message : 'created'}`);
    const { data: ed } = await svc.rpc('madrasa_reward_email_data', { p_reward: starId });
    const row = (ed || [])[0];
    assert(row && row.parent_email === EM.parent1 && row.type === 'star' && row.parent_email_opt_in === true,
      `email payload (star) → ${row ? `parent ${row.parent_email === EM.parent1 ? '✓' : row.parent_email}, type ${row.type}, opt_in ${row.parent_email_opt_in}` : 'NONE'}`);
  }

  // 2. Teacher logs a warning → email RPC returns NO row (never emailed).
  {
    const { data: w } = await TEACHER.from('madrasa_rewards')
      .insert({ class_id: ids.c1, student_id: ids.s1, mosque_id: ids.mosque, type: 'warning', note: 'Disruptive', awarded_by: ids.teacher })
      .select().single();
    const { data: ed } = await svc.rpc('madrasa_reward_email_data', { p_reward: w.id });
    assert((ed || []).length === 0, `email payload (warning) → ${(ed || []).length} rows (expect 0, never emailed)`);
  }

  // 3. Parent reads own child's rewards — sees ALL types (star + warning).
  {
    const { data, error } = await P1.from('madrasa_rewards').select('type').eq('student_id', ids.s1);
    const types = (data || []).map((r) => r.type).sort();
    assert(!error && types.length === 2 && types.includes('star') && types.includes('warning'),
      `parent reads own child (all types) → ${error ? error.message : types.join(',')}`);
  }

  // 4. Unrelated parent (P2) cannot read S1's rewards (RLS).
  {
    const { data } = await P2.from('madrasa_rewards').select('id').eq('student_id', ids.s1);
    assert((data || []).length === 0, `unrelated parent reads S1 rewards → ${(data || []).length} rows (expect 0)`);
  }

  // 5. Leaderboard = positive types only. Give S2 two stars; warnings excluded.
  {
    await TEACHER.from('madrasa_rewards').insert([
      { class_id: ids.c1, student_id: ids.s2, mosque_id: ids.mosque, type: 'star', awarded_by: ids.teacher },
      { class_id: ids.c1, student_id: ids.s2, mosque_id: ids.mosque, type: 'star', awarded_by: ids.teacher },
    ]);
    // owner computes the leaderboard from positive rows only
    const { data } = await svc.from('madrasa_rewards').select('student_id,type').eq('class_id', ids.c1).in('type', ['star', 'merit', 'achievement']);
    const stars = {}; for (const r of (data || [])) stars[r.student_id] = (stars[r.student_id] || 0) + 1;
    assert(stars[ids.s2] === 2 && stars[ids.s1] === 1 && Object.values(stars).every((n) => n >= 1),
      `leaderboard stars-only → S2 ${stars[ids.s2]} (exp 2), S1 ${stars[ids.s1]} (exp 1, warning excluded)`);
  }

  // 6. Anon denied on the table.
  {
    const { data } = await anon().from('madrasa_rewards').select('id').limit(1);
    assert((data || []).length === 0, `anon select rewards → ${(data || []).length} rows (expect 0)`);
  }

  // 7. Harvest guard — authenticated caller cannot call the email RPC.
  {
    const { data, error } = await P1.rpc('madrasa_reward_email_data', { p_reward: starId });
    assert(!!error || !(data && data.length), `parent rpc(reward_email_data) → ${error ? 'blocked (' + (error.code || error.message) + ')' : (data?.length ? 'LEAK' : 'empty')}`);
  }

  // 8. Export RPC — owner sees student + parent contact + attendance totals.
  {
    const OWNER = await signIn(EM.owner);
    const { data, error } = await OWNER.rpc('madrasa_export_roster', { p_mosque: ids.mosque });
    const r1 = (data || []).find((r) => r.student_id === ids.s1);
    assert(!error && r1 && r1.parent_email === EM.parent1 && r1.present === 2 && r1.absent === 1 && r1.age === 8,
      `owner export_roster → ${error ? error.message : r1 ? `contact ${r1.parent_email === EM.parent1 ? '✓' : r1.parent_email}, present ${r1.present}/absent ${r1.absent}, age ${r1.age}` : 'no S1 row'}`);
  }

  // 9. Export RPC authz — teacher (not owner) and unrelated parent get 0 rows.
  {
    const { data: t } = await TEACHER.rpc('madrasa_export_roster', { p_mosque: ids.mosque });
    const { data: p } = await P2.rpc('madrasa_export_roster', { p_mosque: ids.mosque });
    assert((t || []).length === 0 && (p || []).length === 0, `export_roster authz → teacher ${(t || []).length}, other-parent ${(p || []).length} (both expect 0)`);
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
process.exit(passed === results.length && results.length >= 9 ? 0 : 1);

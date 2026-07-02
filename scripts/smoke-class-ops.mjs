// scripts/smoke-class-ops.mjs — Session BF P5. Self-seeding smoke for the AI
// per-class assistant (mode:'class_ops' in api/admin-brief.js). Invokes the REAL
// handler with a mock req/res against DEV + real Anthropic: owner/teacher auth,
// proactive brief, Q&A answer, and the auth failures. Targets dev ONLY.
// Run: node scripts/smoke-class-ops.mjs
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }
if (!process.env.ANTHROPIC_API_KEY) { console.error('No ANTHROPIC_API_KEY in .env'); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const { default: handler } = await import('../api/admin-brief.js');

const PW = 'smoke-classops-2026', SLUG = 'smoke-classops-mosque';
const EM = { owner: 'smoke-classops-owner@example.com', outsider: 'smoke-classops-outsider@example.com' };
const results = [];
const ok = (l) => { results.push(true); console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const mkRes = () => ({ code: 200, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(o) { this.body = o; return this; } });
const call = async (headers, body) => { const res = mkRes(); await handler({ method: 'POST', headers, body }, res); return res; };
const day = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
const today = new Date().toISOString().slice(0, 10);

async function findUser(e) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === e) || null; }
async function ensureUser(e) { let u = await findUser(e); if (!u) { const { data, error } = await svc.auth.admin.createUser({ email: e, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; } await svc.from('profiles').upsert({ id: u.id, email: e, name: e.split('@')[0] }, { onConflict: 'id' }); return u.id; }
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) { for (const t of ['madrasa_hifz_progress', 'madrasa_attendance', 'madrasa_enrollments', 'madrasa_classes', 'mosque_staff']) await svc.from(t).delete().eq('mosque_id', m.id); await svc.from('mosques').delete().eq('id', m.id); }
  for (const e of Object.values(EM)) { const u = await findUser(e); if (u) { await svc.from('students').delete().eq('profile_id', u.id); await svc.auth.admin.deleteUser(u.id); } }
}

try {
  await teardown();
  const owner = await ensureUser(EM.owner);
  await ensureUser(EM.outsider);
  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'ClassOps Mosque', address: '1 St', city: 'T', postcode: 'TS1 1ST', user_id: owner, status: 'active' }).select().single();
  const { data: staff } = await svc.from('mosque_staff').insert({ profile_id: owner, mosque_id: mosque.id, role: 'teacher', name: 'Teacher', status: 'active' }).select().single();
  const { data: c } = await svc.from('madrasa_classes').insert({ mosque_id: mosque.id, name: 'Hifz Group A', subject: 'hifz', teacher_staff_id: staff.id, status: 'active', capacity: 15 }).select().single();
  const { data: s1 } = await svc.from('students').insert({ profile_id: owner, name: 'Adam Khan', age: 9 }).select().single();
  const { data: s2 } = await svc.from('students').insert({ profile_id: owner, name: 'Yusuf Ali', age: 11 }).select().single();
  await svc.from('madrasa_enrollments').insert([
    { class_id: c.id, student_id: s1.id, mosque_id: mosque.id, status: 'active' },
    { class_id: c.id, student_id: s2.id, mosque_id: mosque.id, status: 'active' },
  ]);
  // Adam good attendance; Yusuf missed his last 4 (welfare flag). Adam most-recent hifz memorised (ready for next).
  const att = [];
  [7, 14, 21, 28, 35, 42, 49, 56].forEach((n, i) => {
    att.push({ class_id: c.id, student_id: s1.id, mosque_id: mosque.id, session_date: day(n), status: i === 3 ? 'absent' : 'present', marked_by: owner });
    att.push({ class_id: c.id, student_id: s2.id, mosque_id: mosque.id, session_date: day(n), status: i < 5 ? 'absent' : 'present', marked_by: owner });
  });
  att.push({ class_id: c.id, student_id: s1.id, mosque_id: mosque.id, session_date: today, status: 'present', marked_by: owner });
  att.push({ class_id: c.id, student_id: s2.id, mosque_id: mosque.id, session_date: today, status: 'absent', marked_by: owner });
  { const { error } = await svc.from('madrasa_attendance').upsert(att, { onConflict: 'class_id,student_id,session_date' }); if (error) throw new Error('attendance seed: ' + error.message); }
  await svc.from('madrasa_hifz_progress').insert([
    { class_id: c.id, student_id: s1.id, mosque_id: mosque.id, surah_number: 114, status: 'memorized', session_date: day(20), logged_by: owner },
    { class_id: c.id, student_id: s1.id, mosque_id: mosque.id, surah_number: 112, status: 'memorized', session_date: day(1), logged_by: owner },
  ]);

  const oc = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess } = await oc.auth.signInWithPassword({ email: EM.owner, password: PW });
  const auth = { authorization: `Bearer ${sess.session.access_token}` };

  const r1 = await call(auth, { mode: 'class_ops', classId: c.id });
  console.log('   brief:', JSON.stringify(r1.body?.brief || r1.body));
  (r1.code === 200 && r1.body?.ok && r1.body.brief?.length > 0) ? ok('owner proactive brief → 200 + non-empty brief') : bad(`brief → ${r1.code} ${JSON.stringify(r1.body)}`);
  (/yusuf/i.test(r1.body?.brief || '')) ? ok('brief flags the welfare student (Yusuf)') : bad(`brief missed welfare student: ${r1.body?.brief}`);

  const r2 = await call(auth, { mode: 'class_ops', classId: c.id, question: 'Which student has the lowest attendance?' });
  console.log('   answer:', JSON.stringify(r2.body?.answer || r2.body));
  (r2.code === 200 && r2.body?.ok && r2.body.answer?.length > 0) ? ok('owner Q&A → 200 + non-empty answer') : bad(`Q&A → ${r2.code} ${JSON.stringify(r2.body)}`);
  (/yusuf|33/i.test(r2.body?.answer || '')) ? ok('answer references the real low-attendance student/number') : bad(`answer off: ${r2.body?.answer}`);

  const r3 = await call({}, { mode: 'class_ops', classId: c.id });
  (r3.code === 401) ? ok('no token → 401') : bad(`no token → ${r3.code}`);
  const r4 = await call(auth, { mode: 'class_ops' });
  (r4.code === 400) ? ok('missing classId → 400') : bad(`missing classId → ${r4.code}`);

  const xc = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: xs } = await xc.auth.signInWithPassword({ email: EM.outsider, password: PW });
  const r5 = await call({ authorization: `Bearer ${xs.session.access_token}` }, { mode: 'class_ops', classId: c.id });
  (r5.code === 403) ? ok('non-owner/non-teacher → 403') : bad(`outsider → ${r5.code} ${JSON.stringify(r5.body)}`);
} catch (e) { bad(`unexpected — ${e.message}`); }
finally { try { await teardown(); } catch (e) { console.log('teardown warn', e.message); } }

const passed = results.filter(Boolean).length;
console.log('---');
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length && results.length >= 7 ? 0 : 1);

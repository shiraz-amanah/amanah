// scripts/smoke-madrasa-3a-counts.mjs
//
// Madrasa Phase 3A smoke — the public seat-count RPC (migration 082).
// Asserts madrasa_class_active_counts() returns correct aggregates (active
// enrolments + outstanding offers) per active class, is callable by ANON (the
// public browse), and counts across all families despite RLS (SECURITY DEFINER).
//
// Self-seeding via the DEV service role; targets dev ONLY (hard ref assertion).
// Run: node scripts/smoke-madrasa-3a-counts.mjs

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const SLUG = 'madrasa3a-counts-mosque';
const EM = { owner: 'madrasa3a-counts-owner@example.com', p1: 'madrasa3a-counts-p1@example.com', p2: 'madrasa3a-counts-p2@example.com' };

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

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
  if (!u) { const { data, error } = await svc.auth.admin.createUser({ email, password: 'smoke-082', email_confirm: true }); if (error) throw new Error(error.message); u = data.user; }
  await svc.from('profiles').upsert({ id: u.id, email, name: email.split('@')[0] }, { onConflict: 'id' });
  return u.id;
}
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  const userIds = [];
  for (const email of Object.values(EM)) { const u = await findUserByEmail(email); if (u) userIds.push(u.id); }
  if (m) {
    await svc.from('madrasa_waitlist').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
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
  ids.p1 = await ensureUser(EM.p1);
  ids.p2 = await ensureUser(EM.p2);

  const { data: mosque } = await svc.from('mosques').insert({ slug: SLUG, name: 'Counts Mosque', address: '1 St', city: 'Town', postcode: 'TS1 1ST', user_id: ids.owner, status: 'active' }).select().single();
  ids.mosque = mosque.id;
  // Class A: capacity 3 — will have 1 active + 1 offered. Class B: empty.
  const { data: cA } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class A', subject: 'quran', status: 'active', capacity: 3 }).select().single();
  const { data: cB } = await svc.from('madrasa_classes').insert({ mosque_id: ids.mosque, name: 'Class B', subject: 'quran', status: 'active' }).select().single();
  ids.cA = cA.id; ids.cB = cB.id;
  const { data: s1 } = await svc.from('students').insert({ profile_id: ids.p1, name: 'Child 1' }).select().single();
  const { data: s2 } = await svc.from('students').insert({ profile_id: ids.p2, name: 'Child 2' }).select().single();

  await svc.from('madrasa_enrollments').insert({ class_id: ids.cA, student_id: s1.id, mosque_id: ids.mosque, status: 'active' });
  // an outstanding offer holds a seat in Class A
  await svc.from('madrasa_waitlist').insert({ class_id: ids.cA, student_id: s2.id, mosque_id: ids.mosque, status: 'offered', offered_at: new Date().toISOString(), offer_expires_at: new Date(Date.now() + 36e5).toISOString() });

  console.log('— assertions —');

  // 1–3. service-role call → correct aggregates for Class A; Class B present with zeros.
  {
    const { data, error } = await svc.rpc('madrasa_class_active_counts');
    const rows = data || [];
    const a = rows.find((r) => r.class_id === ids.cA);
    const b = rows.find((r) => r.class_id === ids.cB);
    assert(!error && !!a, `rpc returns Class A → ${error ? error.message : a ? 'found' : 'missing'}`);
    assert(a && a.active_count === 1 && a.offered_count === 1, `Class A counts → active ${a?.active_count} (exp 1), offered ${a?.offered_count} (exp 1)`);
    assert(b && b.active_count === 0 && b.offered_count === 0, `Class B (empty) → active ${b?.active_count} (exp 0), offered ${b?.offered_count} (exp 0)`);
  }

  // 4–5. ANON (the public browse) can call it AND sees the cross-family counts (definer).
  {
    const { data, error } = await anon.rpc('madrasa_class_active_counts');
    const a = (data || []).find((r) => r.class_id === ids.cA);
    assert(!error && Array.isArray(data) && data.length >= 2, `anon rpc → ${error ? 'BLOCKED ' + (error.code || error.message) : (data?.length || 0) + ' rows'}`);
    assert(a && a.active_count === 1 && a.offered_count === 1, `anon sees Class A counts (definer crosses RLS) → active ${a?.active_count}, offered ${a?.offered_count}`);
  }

  // 6. archived/withdrawn don't inflate — withdraw the enrolment, expect active 0.
  {
    await svc.from('madrasa_enrollments').update({ status: 'withdrawn' }).eq('class_id', ids.cA).eq('student_id', s1.id);
    const { data } = await svc.rpc('madrasa_class_active_counts');
    const a = (data || []).find((r) => r.class_id === ids.cA);
    assert(a && a.active_count === 0 && a.offered_count === 1, `after withdraw → active ${a?.active_count} (exp 0), offered ${a?.offered_count} (exp 1)`);
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
process.exit(passed === results.length && results.length >= 6 ? 0 : 1);

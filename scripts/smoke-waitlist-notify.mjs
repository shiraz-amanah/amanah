// scripts/smoke-waitlist-notify.mjs
//
// Functional smoke for migration 113 (waiting-list notifications). Drives each
// DB touchpoint via the service role and asserts the right notification row lands
// for the right recipient. Self-seeding, dev-only (hard ref assert), FK-safe teardown.
// Run: node scripts/smoke-waitlist-notify.mjs

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev. Got ${URL}`); process.exit(1); }
const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

const EM = { owner: 'wlnotify-owner@example.com', pA: 'wlnotify-pa@example.com', pB: 'wlnotify-pb@example.com', pX: 'wlnotify-px@example.com' };
const SLUG = 'wlnotify-mosque';
const results = [];
const ok = (c, l) => { results.push(!!c); console.log(`${c ? '✅' : '❌'} ${l}`); };

async function findUser(e) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === e) || null; }
async function ensureUser(e, n) { let u = await findUser(e); if (!u) { const { data } = await svc.auth.admin.createUser({ email: e, password: 'wlnotify-2026', email_confirm: true }); u = data.user; } await svc.from('profiles').upsert({ id: u.id, email: e, name: n }, { onConflict: 'id' }); return u.id; }
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  const uids = []; for (const e of Object.values(EM)) { const u = await findUser(e); if (u) uids.push(u.id); }
  if (m) {
    await svc.from('madrasa_waitlist').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
  }
  for (const uid of uids) { await svc.from('notifications').delete().eq('user_id', uid); await svc.from('students').delete().eq('profile_id', uid); }
  if (m) await svc.from('mosques').delete().eq('id', m.id);
  for (const uid of uids) await svc.auth.admin.deleteUser(uid);
}
// most recent waitlist notification of a given kind for a user
async function notif(userId, kind) {
  const { data } = await svc.from('notifications').select('*').eq('user_id', userId).eq('type', 'waitlist').order('created_at', { ascending: false }).limit(20);
  return (data || []).find((n) => n.data?.kind === kind) || null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  console.log('— teardown + seed —');
  await teardown();
  const owner = await ensureUser(EM.owner, 'Owner');
  const pA = await ensureUser(EM.pA, 'Parent A');
  const pB = await ensureUser(EM.pB, 'Parent B');
  const pX = await ensureUser(EM.pX, 'Parent X');
  const { data: m } = await svc.from('mosques').insert({ slug: SLUG, name: 'WL Notify Mosque', address: '1 St', city: 'Town', postcode: 'T1 1TT', user_id: owner, status: 'active' }).select().single();
  const { data: c } = await svc.from('madrasa_classes').insert({ mosque_id: m.id, name: 'Notify Class', subject: 'quran', status: 'active', capacity: 2 }).select().single();
  const { data: sA } = await svc.from('students').insert({ profile_id: pA, name: 'Child A' }).select().single();
  const { data: sB } = await svc.from('students').insert({ profile_id: pB, name: 'Child B' }).select().single();
  const { data: sX } = await svc.from('students').insert({ profile_id: pX, name: 'Child X' }).select().single();

  // Touchpoint 1: join → owner 'request'
  const { data: wA } = await svc.from('madrasa_waitlist').insert({ class_id: c.id, student_id: sA.id, mosque_id: m.id, status: 'waiting' }).select().single();
  const { data: wB } = await svc.from('madrasa_waitlist').insert({ class_id: c.id, student_id: sB.id, mosque_id: m.id, status: 'waiting' }).select().single();
  await sleep(400);
  const n1 = await notif(owner, 'request');
  ok(n1 && n1.title === 'New waiting list request', `#1 join → owner 'request'${n1 ? ` ("${n1.body}")` : ' — MISSING (is 113 applied?)'}`);

  // Touchpoint 3: offer A → parent A 'offered'
  await svc.from('madrasa_waitlist').update({ status: 'offered', offered_at: new Date().toISOString(), offer_expires_at: new Date(Date.now() + 48 * 3600e3).toISOString() }).eq('id', wA.id);
  await sleep(400);
  ok(await notif(pA, 'offered'), `#3 offer → parent A 'offered'`);

  // Touchpoint 5 + 4: A accepted (offered→enrolled) → owner 'accepted' + B 'moved_up'
  await svc.from('madrasa_waitlist').update({ status: 'enrolled' }).eq('id', wA.id);
  await sleep(400);
  ok(await notif(owner, 'accepted'), `#5 accept → owner 'accepted'`);
  const n4 = await notif(pB, 'moved_up');
  ok(n4 && /#1/.test(n4.body), `#4 A left queue → parent B 'moved_up' to #1${n4 ? ` ("${n4.body}")` : ''}`);

  // Touchpoint 6: offer B then expire → owner 'expired'
  await svc.from('madrasa_waitlist').update({ status: 'offered', offer_expires_at: new Date(Date.now() + 48 * 3600e3).toISOString() }).eq('id', wB.id);
  await sleep(200);
  await svc.from('madrasa_waitlist').update({ status: 'expired' }).eq('id', wB.id);
  await sleep(400);
  ok(await notif(owner, 'expired'), `#6 offer expired → owner 'expired'`);

  // Touchpoint 2: active enrolment withdrawn on a class with a waiting row → owner 'place_opened'
  // seed a fresh waiting row (X) so the class has someone waiting, + an active enrolment to withdraw
  await svc.from('madrasa_waitlist').insert({ class_id: c.id, student_id: sX.id, mosque_id: m.id, status: 'waiting' });
  const { data: enr } = await svc.from('madrasa_enrollments').insert({ class_id: c.id, student_id: sB.id, mosque_id: m.id, status: 'active' }).select().single();
  await sleep(200);
  await svc.from('madrasa_enrollments').update({ status: 'withdrawn' }).eq('id', enr.id);
  await sleep(400);
  ok(await notif(owner, 'place_opened'), `#2 withdrawal → owner 'place_opened'`);

  // Guard: the core writes above all succeeded (a notify failure must never block them)
  const { data: wlRows } = await svc.from('madrasa_waitlist').select('id').eq('mosque_id', m.id);
  ok((wlRows || []).length >= 3, `core waitlist writes intact (${(wlRows || []).length} rows)`);
} catch (e) {
  ok(false, `exception: ${e.message}`);
} finally {
  console.log('— teardown —');
  try { await teardown(); } catch (e) { console.log('teardown warn:', e.message); }
}
const passed = results.filter(Boolean).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

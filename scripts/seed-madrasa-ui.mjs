// scripts/seed-madrasa-ui.mjs
//
// Idempotent DEV fixture for browser-verifying the Madrasah UI (Changes 1–3):
// one mosque owner, a class (capacity 12, assigned teacher), 3 enrolled students
// with a term fee (paid / partial / outstanding), and 2 waiting-list requests with
// parent contact. Prints the owner login + key IDs. Targets dev ONLY (ref assert).
//
// Run:  node scripts/seed-madrasa-ui.mjs
//       node scripts/seed-madrasa-ui.mjs --teardown   (remove the fixture)

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'madrasa-ui-2026';
const SLUG = 'madrasa-ui-mosque';
const EM = {
  owner:   'madrasa-ui-owner@example.com',
  teacher: 'madrasa-ui-teacher@example.com',
  parentW1: 'madrasa-ui-waitp1@example.com',
  parentW2: 'madrasa-ui-waitp2@example.com',
};

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUserByEmail(email) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return (data?.users || []).find((u) => u.email === email) || null;
}
async function ensureUser(email, name) {
  let u = await findUserByEmail(email);
  if (!u) {
    const { data, error } = await svc.auth.admin.createUser({ email, password: PW, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    u = data.user;
  }
  await svc.from('profiles').upsert({ id: u.id, email, name }, { onConflict: 'id' });
  return u.id;
}
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  const userIds = [];
  for (const email of Object.values(EM)) { const u = await findUserByEmail(email); if (u) userIds.push(u.id); }
  if (m) {
    await svc.from('madrasa_fee_records').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_fees').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_waitlist').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_enrollments').delete().eq('mosque_id', m.id);
    await svc.from('madrasa_classes').delete().eq('mosque_id', m.id);
    await svc.from('mosque_staff').delete().eq('mosque_id', m.id);
  }
  for (const uid of userIds) await svc.from('students').delete().eq('profile_id', uid);
  if (m) await svc.from('mosques').delete().eq('id', m.id);
  for (const uid of userIds) await svc.auth.admin.deleteUser(uid);
}

const teardownOnly = process.argv.includes('--teardown');

try {
  console.log('— teardown (clean slate) —');
  await teardown();
  if (teardownOnly) { console.log('done (teardown only).'); process.exit(0); }

  console.log('— seed —');
  const owner = await ensureUser(EM.owner, 'Owner Admin');
  const teacher = await ensureUser(EM.teacher, 'Ustadha Khadija');
  const pW1 = await ensureUser(EM.parentW1, 'Yusuf Patel');
  const pW2 = await ensureUser(EM.parentW2, 'Aisha Rahman');

  const { data: mosque } = await svc.from('mosques').insert({
    slug: SLUG, name: 'Al-Falah Community Mosque', address: '12 Test St', city: 'Bradford',
    postcode: 'BD1 1ST', user_id: owner, status: 'active',
  }).select().single();

  const { data: staff } = await svc.from('mosque_staff').insert({
    profile_id: teacher, mosque_id: mosque.id, role: 'teacher', name: 'Ustadha Khadija', status: 'active',
  }).select().single();

  const { data: cls } = await svc.from('madrasa_classes').insert({
    mosque_id: mosque.id, name: 'Beginners Qur’an', subject: 'quran', teacher_staff_id: staff.id,
    status: 'active', capacity: 12, term: 'Autumn 2026', room: 'Room 1',
    schedule: [{ day: 'Saturday', start: '10:00', end: '12:00' }],
  }).select().single();

  // 3 enrolled students (no parent needed for enrolment display)
  const enrolNames = ['Bilal Ahmed', 'Sumayya Khan', 'Idris Malik'];
  const enrolled = [];
  for (const name of enrolNames) {
    const { data: s } = await svc.from('students').insert({ name, age: 8 }).select().single();
    await svc.from('madrasa_enrollments').insert({ class_id: cls.id, student_id: s.id, mosque_id: mosque.id, status: 'active' });
    enrolled.push(s);
  }

  // Term fee + records: paid / partial / outstanding (so the tile shows a spread).
  const { data: fee } = await svc.from('madrasa_fees').insert({
    class_id: cls.id, mosque_id: mosque.id, fee_type: 'per_term', amount: 40,
    currency: 'GBP', term_label: 'Autumn 2026', due_date: '2026-09-30', grace_period_days: 7,
  }).select().single();
  const recStates = [
    { amount_paid: 40, status: 'paid', paid_at: new Date().toISOString() },
    { amount_paid: 20, status: 'partial' },
    { amount_paid: 0,  status: 'outstanding' },
  ];
  for (let i = 0; i < enrolled.length; i++) {
    await svc.from('madrasa_fee_records').insert({
      fee_id: fee.id, student_id: enrolled[i].id, mosque_id: mosque.id,
      amount_due: 40, ...recStates[i],
    });
  }

  // 2 waiting-list requests with parent contact (profile_id + emergency phone).
  const waitDefs = [
    { profile_id: pW1, name: 'Zayd Patel', phone: '07700 900111' },
    { profile_id: pW2, name: 'Maryam Rahman', phone: '07700 900222' },
  ];
  for (const w of waitDefs) {
    const { data: s } = await svc.from('students').insert({ profile_id: w.profile_id, name: w.name, age: 7, emergency_contact_phone: w.phone }).select().single();
    await svc.from('madrasa_waitlist').insert({ class_id: cls.id, student_id: s.id, mosque_id: mosque.id, status: 'waiting' });
  }

  console.log('---');
  console.log('OWNER_EMAIL=' + EM.owner);
  console.log('OWNER_PASSWORD=' + PW);
  console.log('MOSQUE_ID=' + mosque.id);
  console.log('MOSQUE_SLUG=' + SLUG);
  console.log('CLASS_ID=' + cls.id);
  console.log('done.');
} catch (err) {
  console.error('SEED FAILED:', err.message);
  process.exit(1);
}

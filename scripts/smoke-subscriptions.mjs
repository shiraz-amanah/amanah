// scripts/smoke-subscriptions.mjs
//
// Verifies the READ/RLS surfaces of Session BP recurring subscriptions against DEV,
// WITHOUT calling Stripe (the real Checkout flow needs the Vercel test key + a browser
// + the 4242 card — that's the manual runbook). Builds a self-contained fixture on the
// seed mosque: a parent (waitp1) → a child → a madrasa_subscriptions row (with a fake
// stripe id) → a madrasa_subscription_events row. Then checks migrations 123 + 124 RLS:
//   * madrasa_subscriptions: parent reads own, owner reads own, other parent + anon read
//     nothing, and a parent CANNOT write (service-role only).
//   * madrasa_subscription_events: parent reads own (via the sub), owner reads own,
//     other parent + anon read nothing.
// Cleans up. Reads the seed-madrasa-ui fixture.

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !URL.includes('pbejyukihhmybxxtheqq')) { console.error('SAFETY: not dev'); process.exit(1); }

const MOSQUE = '646dc448-5d24-4eaf-abd9-fe375c423a18';
const PW = 'madrasa-ui-2026';
const EM = { owner: 'madrasa-ui-owner@example.com', parent: 'madrasa-ui-waitp1@example.com', otherParent: 'madrasa-ui-waitp2@example.com' };

let fails = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); fails++; };

const svc = createClient(URL, SVC, { auth: { persistSession: false } });
const signIn = async (email) => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: PW });
  if (error) throw new Error(`sign-in ${email}: ${error.message}`);
  return c;
};

let studentId, subId, eventId;
try {
  const parentId = (await svc.from('profiles').select('id').eq('email', EM.parent).single()).data.id;
  const classId = (await svc.from('madrasa_classes').select('id').eq('mosque_id', MOSQUE).limit(1).single()).data?.id;
  if (!classId) { bad('no madrasa_classes row on the seed mosque'); throw new Error('no class'); }

  // fixture
  studentId = (await svc.from('students').insert({ name: 'Smoke Child (BP)', profile_id: parentId }).select().single()).data.id;
  subId = (await svc.from('madrasa_subscriptions').insert({
    mosque_id: MOSQUE, student_id: studentId, class_id: classId, parent_id: parentId,
    stripe_subscription_id: `sub_smoke_${Date.now()}`, stripe_customer_id: 'cus_smoke',
    cadence: 'monthly', status: 'active', amount_pence: 3000, fee_percent: 2.5,
  }).select().single()).data.id;
  eventId = (await svc.from('madrasa_subscription_events').insert({
    subscription_id: subId, event_type: 'payment_succeeded', stripe_event_id: `evt_smoke_${Date.now()}`,
  }).select().single()).data.id;
  console.log(`fixture: child ${studentId.slice(0, 8)}, sub ${subId.slice(0, 8)}, event ${eventId.slice(0, 8)}\n`);

  const parent = await signIn(EM.parent);
  const owner = await signIn(EM.owner);
  const otherParent = await signIn(EM.otherParent);
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });

  // 1) madrasa_subscriptions RLS (123)
  console.log('madrasa_subscriptions RLS (123):');
  const readSub = async (c) => (await c.from('madrasa_subscriptions').select('*').eq('id', subId).maybeSingle()).data;
  (await readSub(parent)) ? ok('parent reads own subscription') : bad('parent could not read own subscription');
  (await readSub(owner)) ? ok('mosque owner reads the subscription') : bad('owner could not read the subscription');
  (await readSub(otherParent)) == null ? ok('a different parent reads nothing') : bad('LEAK: other parent read the subscription');
  (await readSub(anon)) == null ? ok('anon reads nothing') : bad('LEAK: anon read the subscription');
  // no client write path — a parent INSERT must be rejected (service-role only)
  const { error: insErr } = await parent.from('madrasa_subscriptions').insert({
    mosque_id: MOSQUE, student_id: studentId, class_id: classId, parent_id: parentId, cadence: 'monthly', status: 'active', amount_pence: 1,
  });
  insErr ? ok('parent CANNOT insert a subscription (RLS write-blocked)') : bad('LEAK: parent inserted a subscription');

  // 2) madrasa_subscription_events RLS (124)
  console.log('madrasa_subscription_events RLS (124):');
  const readEvt = async (c) => (await c.from('madrasa_subscription_events').select('*').eq('id', eventId).maybeSingle()).data;
  (await readEvt(parent)) ? ok('parent reads own subscription event') : bad('parent could not read own event');
  (await readEvt(owner)) ? ok('mosque owner reads the event') : bad('owner could not read the event');
  (await readEvt(otherParent)) == null ? ok('a different parent reads nothing') : bad('LEAK: other parent read the event');
  (await readEvt(anon)) == null ? ok('anon reads nothing') : bad('LEAK: anon read the event');
} catch (e) {
  bad('threw: ' + e.message);
} finally {
  if (eventId) await svc.from('madrasa_subscription_events').delete().eq('id', eventId);
  // clean any stray parent-inserted rows from the write-block probe (should be none)
  await svc.from('madrasa_subscriptions').delete().eq('student_id', studentId).neq('id', subId || '00000000-0000-0000-0000-000000000000');
  if (subId) await svc.from('madrasa_subscriptions').delete().eq('id', subId);
  if (studentId) await svc.from('students').delete().eq('id', studentId);
  console.log('\ncleaned up fixture');
}

console.log(fails === 0 ? '\nALL PASS ✅' : `\n${fails} FAILED ❌`);
process.exit(fails === 0 ? 0 : 1);

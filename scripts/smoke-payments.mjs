// scripts/smoke-payments.mjs
//
// Verifies the READ/RLS surfaces of Session BO one-off payments against DEV,
// WITHOUT calling Stripe (the real Checkout flow needs the Vercel test key + a
// browser + the 4242 card — that's the manual runbook). Builds a self-contained
// fixture on the seed mosque: a parent (waitp1) → a child → a fee record (with a
// secret internal note) → a mosque_payments row. Then:
//   * get_my_children_fee_records (121): parent sees their child's fee, does NOT
//     see the internal `notes` column, and a DIFFERENT parent sees nothing.
//   * mosque_payments (120) RLS: parent reads own child's payment, mosque owner
//     reads it, a different parent + anon read nothing.
// Cleans up. Reads the seed-madrasa-ui fixture.

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !URL.includes('pbejyukihhmybxxtheqq')) { console.error('SAFETY: not dev'); process.exit(1); }

const MOSQUE = '646dc448-5d24-4eaf-abd9-fe375c423a18';
const PW = 'madrasa-ui-2026';
const EM = { owner: 'madrasa-ui-owner@example.com', parent: 'madrasa-ui-waitp1@example.com', otherParent: 'madrasa-ui-waitp2@example.com' };
const SECRET_NOTE = 'INTERNAL-hardship-do-not-show-parent';

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

let studentId, feeRecordId, paymentId;
try {
  const parentId = (await svc.from('profiles').select('id').eq('email', EM.parent).single()).data.id;
  const feeId = (await svc.from('madrasa_fees').select('id').eq('mosque_id', MOSQUE).limit(1).single()).data?.id;
  if (!feeId) { bad('no madrasa_fees row on the seed mosque to attach a fee record'); throw new Error('no fee'); }

  // fixture
  studentId = (await svc.from('students').insert({ name: 'Smoke Child (BO)', profile_id: parentId }).select().single()).data.id;
  feeRecordId = (await svc.from('madrasa_fee_records').insert({
    fee_id: feeId, student_id: studentId, mosque_id: MOSQUE,
    amount_due: 40, amount_paid: 0, status: 'outstanding', notes: SECRET_NOTE,
  }).select().single()).data.id;
  console.log(`fixture: child ${studentId.slice(0,8)}, fee_record ${feeRecordId.slice(0,8)}\n`);

  // 1) parent fee RPC (121)
  console.log('get_my_children_fee_records (121):');
  const parent = await signIn(EM.parent);
  const { data: rows, error: rpcErr } = await parent.rpc('get_my_children_fee_records');
  if (rpcErr) bad(`rpc errored: ${rpcErr.message}`);
  const mine = (rows || []).find((r) => r.id === feeRecordId);
  mine ? ok('parent sees their child\'s fee record') : bad('parent did NOT see their fee record');
  mine && Number(mine.amount_due) === 40 ? ok('amount_due correct (40)') : bad(`amount_due wrong: ${mine?.amount_due}`);
  mine && !('notes' in mine) ? ok('internal `notes` column NOT exposed') : bad('LEAK: notes present in RPC result');
  JSON.stringify(rows || []).includes(SECRET_NOTE) ? bad('LEAK: secret note string present') : ok('secret note string absent from payload');

  const otherParent = await signIn(EM.otherParent);
  const otherRows = (await otherParent.rpc('get_my_children_fee_records')).data || [];
  otherRows.find((r) => r.id === feeRecordId) ? bad('LEAK: other parent saw the fee record') : ok('a different parent sees nothing');

  // 2) mosque_payments RLS (120)
  console.log('mosque_payments RLS (120):');
  paymentId = (await svc.from('mosque_payments').insert({
    mosque_id: MOSQUE, student_id: studentId, fee_record_id: feeRecordId,
    amount_pence: 4000, fee_pence: 100, currency: 'gbp', status: 'pending', description: 'Smoke test',
  }).select().single()).data.id;

  const readPay = async (c) => (await c.from('mosque_payments').select('*').eq('id', paymentId).maybeSingle()).data;
  (await readPay(parent)) ? ok('parent reads their child\'s payment') : bad('parent could not read own child payment');
  (await readPay(await signIn(EM.owner))) ? ok('mosque owner reads the payment') : bad('owner could not read the payment');
  (await readPay(otherParent)) == null ? ok('a different parent reads nothing') : bad('LEAK: other parent read the payment');
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  (await readPay(anon)) == null ? ok('anon reads nothing') : bad('LEAK: anon read the payment');
} catch (e) {
  bad('threw: ' + e.message);
} finally {
  if (paymentId) await svc.from('mosque_payments').delete().eq('id', paymentId);
  if (feeRecordId) await svc.from('madrasa_fee_records').delete().eq('id', feeRecordId);
  if (studentId) await svc.from('students').delete().eq('id', studentId);
  console.log('\ncleaned up fixture');
}

console.log(fails === 0 ? '\nALL PASS ✅' : `\n${fails} FAILED ❌`);
process.exit(fails === 0 ? 0 : 1);

// scripts/smoke-stripe-connect.mjs
//
// Verifies migration 119 (mosque_stripe_accounts) RLS + the read/write path the
// Stripe Connect feature depends on, against DEV — WITHOUT calling Stripe (the
// real Express-onboarding flow needs the Vercel test key + a browser, and is the
// manual runbook in the closure). Proves:
//   * service-role WRITE (what api/stripe-connect.js does) succeeds
//   * the mosque OWNER reads their own row (getMosqueStripeAccount path)
//   * a different authenticated user reads NOTHING (owner-only RLS)
//   * anon reads NOTHING
//   * a status flip (webhook / onboarding-complete) is visible to the owner
// Cleans up the row at the end. Reads the seed-madrasa-ui fixture.

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !URL.includes('pbejyukihhmybxxtheqq')) { console.error('SAFETY: not dev'); process.exit(1); }

const MOSQUE = '646dc448-5d24-4eaf-abd9-fe375c423a18';
const PW = 'madrasa-ui-2026';
const EM = { owner: 'madrasa-ui-owner@example.com', other: 'madrasa-ui-teacher@example.com' };

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
const readRow = async (client) => {
  const { data } = await client.from('mosque_stripe_accounts').select('*').eq('mosque_id', MOSQUE).maybeSingle();
  return data;
};

try {
  // clean slate
  await svc.from('mosque_stripe_accounts').delete().eq('mosque_id', MOSQUE);

  // 1) service-role write (the create-account DB write)
  console.log('service-role write:');
  const { error: wErr } = await svc.from('mosque_stripe_accounts')
    .insert({ mosque_id: MOSQUE, stripe_account_id: 'acct_smoke_119', onboarding_complete: false });
  wErr ? bad(`insert failed: ${wErr.message}`) : ok('inserted mosque_stripe_accounts row');

  // 2) owner reads own row
  console.log('owner read (RLS):');
  const owner = await signIn(EM.owner);
  const oRow = await readRow(owner);
  oRow?.stripe_account_id === 'acct_smoke_119' ? ok('owner reads own row') : bad(`owner could not read own row (got ${JSON.stringify(oRow)})`);

  // 3) a different authenticated user reads nothing
  console.log('isolation (RLS):');
  const other = await signIn(EM.other);
  const xRow = await readRow(other);
  xRow == null ? ok('non-owner authenticated user reads nothing') : bad(`LEAK: non-owner read ${JSON.stringify(xRow)}`);

  // 4) anon reads nothing
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const aRow = await readRow(anon);
  aRow == null ? ok('anon reads nothing') : bad(`LEAK: anon read ${JSON.stringify(aRow)}`);

  // 5) status flip (webhook / onboarding-complete) visible to owner
  console.log('status sync:');
  await svc.from('mosque_stripe_accounts')
    .update({ onboarding_complete: true, charges_enabled: true, payouts_enabled: true, details_submitted: true })
    .eq('mosque_id', MOSQUE);
  const oRow2 = await readRow(owner);
  oRow2?.onboarding_complete === true && oRow2?.charges_enabled === true
    ? ok('owner sees onboarding_complete=true after service-role update')
    : bad(`owner did not see the flip (got ${JSON.stringify(oRow2)})`);
} catch (e) {
  bad('threw: ' + e.message);
} finally {
  await svc.from('mosque_stripe_accounts').delete().eq('mosque_id', MOSQUE);
  console.log('\ncleaned up: deleted the smoke row');
}

console.log(fails === 0 ? '\nALL PASS ✅' : `\n${fails} FAILED ❌`);
process.exit(fails === 0 ? 0 : 1);

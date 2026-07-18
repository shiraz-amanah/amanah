// scripts/smoke-parent-signup-gate.mjs
// Verifies the parent self-signup gate (migration 152 + Option A). DEV ONLY.
//
// Calls has_pending_enrolment through the ANON client — exactly how UserAuth's
// pre-auth signup gate calls it — and asserts:
//   * Path A (089): a mosque-enrolled child holding students.pending_parent_email
//     → true (this is the signal Path A's "Create your account" email relies on).
//   * Path B (090): a pending madrasa_enrollment_invites.parent_email → true.
//   * case-insensitive + trimmed match → true.
//   * a random / no-signal email → FALSE (the deferred marketplace signup, blocked).
//   * empty + a non-'pending' (completed/cancelled) invite → false.
// Anon-executability is itself part of the test (signup happens before auth).
// Idempotent: tears down its own seed at start and end. Never prints secrets.

import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');

const URL = process.env.SUPABASE_URL;
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const DEV = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }
if (!SVC || !ANON) { console.error('Missing SVC or ANON key in .env'); process.exit(1); }

const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const EMAIL_A = 'gate-pathA@amanah-verify.test';        // students.pending_parent_email
const EMAIL_B = 'gate-pathB@amanah-verify.test';        // pending enrolment invite
const EMAIL_DONE = 'gate-done@amanah-verify.test';      // completed invite (must NOT count)
const OWNER = 'gate-owner@amanah-verify.test';
const PW = 'gate-verify-Aa1!';

let pass = 0, fail = 0;
const assert = (cond, m) => cond ? (pass++, console.log('  ✅', m)) : (fail++, console.log('  ❌', m));

async function gate(email) {
  const { data, error } = await anon.rpc('has_pending_enrolment', { p_email: email });
  if (error) throw new Error(`rpc(${JSON.stringify(email)}): ${error.message}`);
  return data;
}

async function teardown() {
  await svc.from('students').delete().like('pending_parent_email', 'gate-%@amanah-verify.test');
  await svc.from('madrasa_enrollment_invites').delete().like('parent_email', 'gate-%@amanah-verify.test');
  const { data: { users } } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
  const ids = users.filter(u => u.email === OWNER).map(u => u.id);
  if (ids.length) {
    const { data: mosques } = await svc.from('mosques').select('id').in('user_id', ids);
    const mIds = (mosques || []).map(m => m.id);
    if (mIds.length) {
      await svc.from('madrasa_enrollment_invites').delete().in('mosque_id', mIds);
      await svc.from('mosques').delete().in('id', mIds);
    }
    await svc.from('profiles').delete().in('id', ids);
    for (const id of ids) await svc.auth.admin.deleteUser(id);
  }
}

async function main() {
  console.log('\n== smoke: parent self-signup gate (has_pending_enrolment, dev) ==\n');
  await teardown();

  // Path A — a mosque-enrolled child awaiting the parent's first sign-up.
  const { error: se } = await svc.from('students').insert({ name: 'Gate Test Child A', pending_parent_email: EMAIL_A });
  if (se) throw new Error(`seed student: ${se.message}`);

  // Path B — an owner + mosque + a PENDING enrolment invite, and a COMPLETED one.
  const { data: owner, error: oe } = await svc.auth.admin.createUser({ email: OWNER, password: PW, email_confirm: true });
  if (oe) throw new Error(`owner: ${oe.message}`);
  await svc.from('profiles').upsert({ id: owner.user.id, name: 'Gate Owner' }, { onConflict: 'id' });
  const { data: mosque, error: me } = await svc.from('mosques').insert({
    user_id: owner.user.id, slug: `gate-masjid-${owner.user.id.slice(0, 8)}`, name: 'Gate Test Masjid',
    address: '1 Test St', city: 'Bradford', postcode: 'BD1 1AA', status: 'active',
  }).select('id').single();
  if (me) throw new Error(`mosque: ${me.message}`);
  const { error: ie } = await svc.from('madrasa_enrollment_invites').insert([
    { mosque_id: mosque.id, parent_email: EMAIL_B, child_name: 'Gate Child B', status: 'pending' },
    { mosque_id: mosque.id, parent_email: EMAIL_DONE, child_name: 'Gate Child Done', status: 'completed' },
  ]);
  if (ie) throw new Error(`seed invites: ${ie.message}`);

  // ---- Assertions via the ANON client (the pre-auth gate path) ----
  assert(await gate(EMAIL_A) === true, `Path A (pending_parent_email) → allowed`);
  assert(await gate(EMAIL_B) === true, `Path B (pending enrolment invite) → allowed`);
  assert(await gate(EMAIL_A.toUpperCase()) === true, `case-insensitive match → allowed`);
  assert(await gate(`  ${EMAIL_A} `) === true, `trimmed match → allowed`);
  assert(await gate('gate-random-nobody@amanah-verify.test') === false, `random / no-signal → BLOCKED`);
  assert(await gate(EMAIL_DONE) === false, `completed invite (not 'pending') → BLOCKED`);
  assert(await gate('') === false, `empty email → BLOCKED`);
  assert(await gate(null) === false, `null email → BLOCKED`);

  await teardown();
  console.log(`\n${fail === 0 ? '✅ ALL PASS' : '❌ FAILURES'} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error('\n💥', e.message); try { await teardown(); } catch {} process.exit(1); });

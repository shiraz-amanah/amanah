// scripts/smoke-demo-request.mjs
//
// Session THEME-1 (Commit 2) smoke — demo_requests lead capture (migration 142).
// Targets dev ONLY (hard ref assertion). Uses the DEV service role for readback
// + cleanup, and the DEV anon key to exercise the PUBLIC insert path the browser
// (and the anon RLS policy) actually use.
//
// A probe proves the table EXISTS. This EXERCISES it — every check drives a real
// INSERT/SELECT/UPDATE/DELETE against the live DB and prints the RAW result, so
// the constraints and RLS posture are read back from the DB, not the file:
//   1. anon INSERT a valid lead            → succeeds (table + anon INSERT policy + INSERT RUNS)
//   2. service-role SELECT it back          → row persisted, status defaulted to 'new'
//   3. anon SELECT *                         → blocked (harvest guard: no anon read)
//   4. anon INSERT status='contacted'        → rejected (WITH CHECK status = 'new')
//   5. anon INSERT bad email                 → rejected (email-format CHECK, from live DB)
//   6. anon INSERT null mosque_name          → rejected (NOT NULL)
//   7. anon UPDATE / DELETE                   → blocked (anon has INSERT only)
//
// Run (from repo root, AFTER 142 is applied to dev): node scripts/smoke-demo-request.mjs
// Exit: 0 if all pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env'); // .env non-VITE SUPABASE_* = amanah-dev

const URL = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: SUPABASE_URL is not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });

const MARKER = 'demo-smoke';
const EMAIL = `${MARKER}-${Date.now()}@example.com`;

const results = [];
const ok = (line) => { results.push(true); console.log(`✅ ${line}`); };
const bad = (line) => { results.push(false); console.log(`❌ ${line}`); };
const assert = (cond, line) => (cond ? ok(line) : bad(line));
const raw = (label, v) => console.log(`   ↳ ${label}: ${JSON.stringify(v)}`);

async function cleanup() {
  await svc.from('demo_requests').delete().like('email', `${MARKER}-%@example.com`);
}

async function main() {
  console.log(`\n== demo_requests smoke (dev ${DEV_REF}) — test email ${EMAIL} ==\n`);
  await cleanup();

  // 1. anon INSERT a valid lead (no .select() → no representation read needed).
  const r1 = await anon.from('demo_requests').insert({
    name: 'Smoke Tester', mosque_name: 'Smoke Test Masjid', email: EMAIL,
    phone: '07000 000000', preferred_time: 'Morning',
  });
  raw('anon insert error', r1.error);
  assert(!r1.error, '1. anon can INSERT a valid lead (INSERT RUNS)');

  // 2. service-role readback — confirms it persisted + status defaulted to 'new'.
  const r2 = await svc.from('demo_requests').select('name,mosque_name,email,phone,preferred_time,status').eq('email', EMAIL);
  raw('service-role row', r2.data);
  const row = (r2.data || [])[0];
  assert(!r2.error && row && row.status === 'new' && row.mosque_name === 'Smoke Test Masjid',
    "2. row persisted with status defaulted to 'new'");

  // 3. anon SELECT — harvest guard: anon must not be able to read leads.
  const r3 = await anon.from('demo_requests').select('*').eq('email', EMAIL);
  raw('anon select error', r3.error);
  raw('anon select data', r3.data);
  assert(!!r3.error || (r3.data || []).length === 0, '3. anon CANNOT read leads (harvest guard)');

  // 4. WITH CHECK guard — anon cannot pre-set status to bury a lead.
  const r4 = await anon.from('demo_requests').insert({
    name: 'X', mosque_name: 'Y', email: `${MARKER}-status-${Date.now()}@example.com`, status: 'contacted',
  });
  raw('anon insert status=contacted error', r4.error);
  assert(!!r4.error, "4. anon INSERT with status='contacted' is REJECTED (WITH CHECK)");

  // 5. email-format CHECK — read back from the live DB via a rejected write.
  const r5 = await anon.from('demo_requests').insert({
    name: 'X', mosque_name: 'Y', email: 'not-an-email',
  });
  raw('anon insert bad-email error', r5.error);
  assert(!!r5.error, '5. anon INSERT with malformed email is REJECTED (email-format CHECK)');

  // 6. NOT NULL — mosque_name is required.
  const r6 = await anon.from('demo_requests').insert({
    name: 'X', email: `${MARKER}-nullmosque-${Date.now()}@example.com`,
  });
  raw('anon insert null-mosque error', r6.error);
  assert(!!r6.error, '6. anon INSERT with null mosque_name is REJECTED (NOT NULL)');

  // 7. anon UPDATE / DELETE — anon has INSERT only.
  const r7u = await anon.from('demo_requests').update({ status: 'closed' }).eq('email', EMAIL).select();
  raw('anon update error', r7u.error);
  raw('anon update data', r7u.data);
  const r7d = await anon.from('demo_requests').delete().eq('email', EMAIL).select();
  raw('anon delete error', r7d.error);
  raw('anon delete data', r7d.data);
  assert((!!r7u.error || (r7u.data || []).length === 0) && (!!r7d.error || (r7d.data || []).length === 0),
    '7. anon cannot UPDATE or DELETE leads');

  await cleanup();

  const passed = results.filter(Boolean).length;
  console.log(`\n== ${passed}/${results.length} passed ==\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => { console.error('smoke crashed:', e); process.exit(1); });

// scripts/smoke-l-rls.mjs
//
// Session L smoke step 6 — empirical RLS validation on dbs_orders.
// Anon key only (same path the browser takes); no service role.
//
// Three test cases:
//   1. anon                                — expect 0 rows (or auth error)
//   2. parent  (concept_shiz, no orders)   — expect 0 rows
//   3. candidate (yusuf-test, 3 orders)    — expect 3 rows, all own user_id,
//                                            ≥1 issued_with_disclosure, ≥2 cancelled
//
// Run: node scripts/smoke-l-rls.mjs   (from repo root)
// Exit: 0 if all three pass, 1 otherwise.

import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile();
} catch (err) {
  console.error('Could not load .env from cwd. Run from repo root.', err.message);
  process.exit(1);
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const PARENT_EMAIL = 'concept_shiz@hotmail.com';
const PARENT_PASSWORD = 'smoke-l-2026';
const CANDIDATE_EMAIL = 'yusuf-test@gmail.com';
const CANDIDATE_PASSWORD = 'smoke-l-2026';
const CANDIDATE_USER_ID = 'b10596d6-3259-4637-bf01-e13c3021ca85';
const TIMEOUT_MS = 10000;

const results = [];
function record(pass, line) {
  results.push({ pass, line });
  console.log(line);
}

function freshClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function withTimeout(promise, label) {
  let t;
  const timer = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(`${label} timed out after ${TIMEOUT_MS}ms`)), TIMEOUT_MS);
  });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

async function test1Anon() {
  const label = 'TEST 1 (anon)';
  try {
    const client = freshClient();
    const { data, error } = await withTimeout(
      client.from('dbs_orders').select('*'),
      label,
    );
    if (error) {
      record(true, `✅ ${label}: query rejected — ${error.message} (expected)`);
      return;
    }
    if (!data || data.length === 0) {
      record(true, `✅ ${label}: no rows returned (expected)`);
      return;
    }
    console.log('  leaked rows:', JSON.stringify(data, null, 2));
    record(false, `❌ ${label}: expected 0 rows, got ${data.length} — RLS allowing anon read!`);
  } catch (err) {
    record(false, `❌ ${label}: unexpected error — ${err.message}`);
  }
}

async function test2Parent() {
  const label = `TEST 2 (parent: ${PARENT_EMAIL})`;
  const client = freshClient();
  try {
    const { error: authErr } = await withTimeout(
      client.auth.signInWithPassword({ email: PARENT_EMAIL, password: PARENT_PASSWORD }),
      label + ' sign-in',
    );
    if (authErr) {
      record(false, `❌ ${label}: sign-in failed — ${authErr.message} (skipped query, marked fail)`);
      return;
    }
    const { data, error } = await withTimeout(
      client.from('dbs_orders').select('*'),
      label,
    );
    if (error) {
      record(false, `❌ ${label}: query errored — ${error.message}`);
      return;
    }
    if (!data || data.length === 0) {
      record(true, `✅ ${label}: 0 rows returned (expected, parent has no orders)`);
      return;
    }
    console.log('  leaked rows:', JSON.stringify(data, null, 2));
    record(false, `❌ ${label}: expected 0 rows, got ${data.length} — RLS leak across users!`);
  } catch (err) {
    record(false, `❌ ${label}: unexpected error — ${err.message}`);
  }
}

async function test3Candidate() {
  const label = `TEST 3 (candidate: ${CANDIDATE_EMAIL})`;
  const client = freshClient();
  try {
    const { error: authErr } = await withTimeout(
      client.auth.signInWithPassword({ email: CANDIDATE_EMAIL, password: CANDIDATE_PASSWORD }),
      label + ' sign-in',
    );
    if (authErr) {
      record(false, `❌ ${label}: sign-in failed — ${authErr.message} (skipped query, marked fail)`);
      return;
    }
    const { data, error } = await withTimeout(
      client
        .from('dbs_orders')
        .select('id, candidate_user_id, stage, payment_status, level')
        .order('created_at', { ascending: false }),
      label,
    );
    if (error) {
      record(false, `❌ ${label}: query errored — ${error.message}`);
      return;
    }
    const rows = data || [];
    if (rows.length !== 3) {
      console.log('  rows:', JSON.stringify(rows, null, 2));
      record(false, `❌ ${label}: expected 3 rows, got ${rows.length}`);
      return;
    }
    const foreign = rows.filter((r) => r.candidate_user_id !== CANDIDATE_USER_ID);
    if (foreign.length > 0) {
      console.log('  foreign rows:', JSON.stringify(foreign, null, 2));
      record(false, `❌ ${label}: ${foreign.length} row(s) have wrong candidate_user_id — RLS leak!`);
      return;
    }
    const iwd = rows.filter((r) => r.stage === 'issued_with_disclosure');
    const cancelled = rows.filter((r) => r.stage === 'cancelled');
    if (iwd.length < 1) {
      console.log('  rows:', JSON.stringify(rows, null, 2));
      record(false, `❌ ${label}: no issued_with_disclosure row found`);
      return;
    }
    if (cancelled.length < 2) {
      console.log('  rows:', JSON.stringify(rows, null, 2));
      record(false, `❌ ${label}: expected ≥2 cancelled rows, got ${cancelled.length}`);
      return;
    }
    record(
      true,
      `✅ ${label}: 3 rows returned, all with candidate_user_id=${CANDIDATE_USER_ID.slice(0, 8)}, includes ${iwd.length} issued_with_disclosure + ${cancelled.length} cancelled`,
    );
  } catch (err) {
    record(false, `❌ ${label}: unexpected error — ${err.message}`);
  }
}

await test1Anon();
await test2Parent();
await test3Candidate();

const passed = results.filter((r) => r.pass).length;
console.log('---');
console.log(`${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

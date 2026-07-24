// scripts/smoke-timelogs-dev.mjs
//
// Workforce Phase 2a smoke — the clock-in/out time-log path (mosque_time_logs,
// migration 085) that the rewritten Timesheets tab depends on, exercised UNDER
// RLS as the real mosque owner (the same calls auth.js makes). Also asserts the
// migration 187 guard from the client side: offboarded logs allowed (back-pay),
// anonymised logs rejected on INSERT and UPDATE. Self-seeding, dev-only.
//
// Run (AFTER 085 + 187 applied to dev): node scripts/smoke-timelogs-dev.mjs
import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, ANON = process.env.SUPABASE_ANON_KEY, SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !ANON || !SERVICE) { console.error('Missing dev SUPABASE_* keys in .env'); process.exit(1); }
if (!URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }

const PW = 'smoke-timelogs-2026';
const SLUG = 'timelogs-smoke-mosque';
const EM = { owner: 'timelogs-smoke-owner@example.com' };

const svc = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const ok = (l) => { results.push(true); console.log(`✅ ${l}`); };
const bad = (l) => { results.push(false); console.log(`❌ ${l}`); };
const assert = (c, l) => (c ? ok(l) : bad(l));
const raw = (label, v) => console.log(`   ↳ ${label}: ${JSON.stringify(v)}`);

const TIME_LOG_SELECT = '*, staff:mosque_staff(id, name, role)';
const H = (hoursAgo) => { const d = new Date(); d.setHours(d.getHours() - hoursAgo, 0, 0, 0); return d.toISOString(); };

async function findU(e) { const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 }); return (data?.users || []).find((u) => u.email === e) || null; }
async function ensureU(e) { let u = await findU(e); if (!u) { const { data, error } = await svc.auth.admin.createUser({ email: e, password: PW, email_confirm: true }); if (error) throw new Error(error.message); u = data.user; } await svc.from('profiles').upsert({ id: u.id, email: e, name: e.split('@')[0] }, { onConflict: 'id' }); return u.id; }
async function signIn(e) { const c = anon(); const { error } = await c.auth.signInWithPassword({ email: e, password: PW }); if (error) throw new Error(`signIn ${e}: ${error.message}`); return c; }

const ids = {};
async function teardown() {
  const { data: m } = await svc.from('mosques').select('id').eq('slug', SLUG).maybeSingle();
  if (m) await svc.from('mosques').delete().eq('id', m.id);   // cascades mosque_staff + mosque_time_logs
  const u = await findU(EM.owner); if (u) await svc.auth.admin.deleteUser(u.id);
}

async function seedStaff(mosqueId, name, patch = {}) {
  const { data, error } = await svc.from('mosque_staff')
    .insert({ mosque_id: mosqueId, name, email: `${name.replace(/\W+/g, '').toLowerCase()}@ts-smoke.test`, role: 'Teacher', status: 'active', invite_status: 'not_invited', ...patch })
    .select('id').single();
  if (error) throw new Error(`seedStaff ${name}: ${error.message}`);
  return data.id;
}

async function seed() {
  ids.owner = await ensureU(EM.owner);
  const { data: mo, error } = await svc.from('mosques')
    .insert({ name: 'Timelogs Smoke Mosque', slug: SLUG, user_id: ids.owner, status: 'active', address: '1 Clock St', city: 'Bradford', postcode: 'BD1 1AA' })
    .select('id').single();
  if (error) throw new Error(`seed mosque: ${error.message}`);
  ids.mosque = mo.id;
  ids.current    = await seedStaff(mo.id, 'TS Current');
  ids.offboarded = await seedStaff(mo.id, 'TS Offboarded', { status: 'offboarded', offboarded_at: new Date().toISOString() });
  ids.anonymised = await seedStaff(mo.id, 'TS Anonymised', { anonymised_at: new Date().toISOString() });
}

async function run() {
  await teardown();
  await seed();
  const owner = await signIn(EM.owner);

  // 1. Owner creates a clocked-out log for a CURRENT staff member; worked_hours
  //    is a generated column (3h shift − 30m break = 2.50).
  const ins = await owner.from('mosque_time_logs')
    .insert({ mosque_id: ids.mosque, staff_id: ids.current, clock_in: H(3), clock_out: H(0), break_minutes: 30 })
    .select(TIME_LOG_SELECT).single();
  raw('insert current', ins.error ? ins.error.message : { id: ins.data.id, worked_hours: ins.data.worked_hours, staff: ins.data.staff?.name });
  assert(!ins.error, 'owner creates a time log for current staff');
  assert(ins.data && Number(ins.data.worked_hours) === 2.5, 'worked_hours generated = 2.50 (3h − 30m break)');
  assert(ins.data?.staff?.name === 'TS Current', 'staff name embeds in the row');
  const logId = ins.data?.id;

  // 2. OFFBOARDED staff — 187 ALLOWS this (final-week back-pay).
  const off = await owner.from('mosque_time_logs')
    .insert({ mosque_id: ids.mosque, staff_id: ids.offboarded, clock_in: H(3), clock_out: H(0), break_minutes: 0 })
    .select('id').single();
  raw('insert offboarded', off.error ? off.error.message : off.data);
  assert(!off.error, 'offboarded-staff log ALLOWED (back-pay) — 187 differentiator');

  // 3. ANONYMISED staff — 187 REJECTS (GDPR-erased; no fresh activity).
  const anonIns = await owner.from('mosque_time_logs')
    .insert({ mosque_id: ids.mosque, staff_id: ids.anonymised, clock_in: H(3), clock_out: H(0), break_minutes: 0 })
    .select('id').single();
  raw('insert anonymised', anonIns.error ? `${anonIns.error.code} ${anonIns.error.message}` : anonIns.data);
  assert(!!anonIns.error, 'anonymised-staff log REJECTED on INSERT (187)');

  // 4. Approve → approved_at + approved_by (the owner) stamped.
  const appr = await owner.from('mosque_time_logs')
    .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: ids.owner })
    .eq('id', logId).select('status, approved_at, approved_by').single();
  raw('approve', appr.error ? appr.error.message : appr.data);
  assert(!appr.error && appr.data.status === 'approved' && appr.data.approved_by === ids.owner && !!appr.data.approved_at, 'approve stamps status + approved_by + approved_at');

  // 5. Reset back to pending clears the approval stamps.
  const reset = await owner.from('mosque_time_logs')
    .update({ status: 'pending', approved_at: null, approved_by: null })
    .eq('id', logId).select('status, approved_at, approved_by').single();
  assert(!reset.error && reset.data.status === 'pending' && !reset.data.approved_by && !reset.data.approved_at, 'reset to pending clears the approval stamps');

  // 6. Benign edit on a current-staff log — allowed; worked_hours recomputes
  //    (break 0 → full 3.00h).
  const edit = await owner.from('mosque_time_logs')
    .update({ break_minutes: 0 }).eq('id', logId).select('worked_hours').single();
  raw('edit break→0', edit.error ? edit.error.message : edit.data);
  assert(!edit.error && Number(edit.data.worked_hours) === 3, 'benign edit allowed; worked_hours recomputes to 3.00');

  // 7. Repoint an existing log to the ANONYMISED staff — 187 REJECTS (UPDATE).
  const repoint = await owner.from('mosque_time_logs')
    .update({ staff_id: ids.anonymised }).eq('id', logId).select('id').single();
  raw('repoint to anonymised', repoint.error ? `${repoint.error.code} ${repoint.error.message}` : repoint.data);
  assert(!!repoint.error, 'UPDATE repointing a log to anonymised staff REJECTED (187)');

  // 8. Range read returns the week's logs (what the tab loads).
  const list = await owner.from('mosque_time_logs').select(TIME_LOG_SELECT)
    .eq('mosque_id', ids.mosque).gte('clock_in', H(48)).lte('clock_in', H(-1))
    .order('clock_in', { ascending: false });
  raw('range read count', list.error ? list.error.message : list.data.length);
  assert(!list.error && list.data.length === 2, 'range read returns the 2 allowed logs (current + offboarded)');

  // 9. Delete — always permitted (the escape hatch).
  const del = await owner.from('mosque_time_logs').delete().eq('id', logId).select('id');
  assert(!del.error && del.data.length === 1, 'owner deletes a time log');
}

try {
  await run();
} catch (e) {
  bad(`FATAL: ${e.message}`);
} finally {
  await teardown();
  const passed = results.filter(Boolean).length;
  console.log(`\n=== ${passed}/${results.length} passed ===`);
  process.exit(results.every(Boolean) ? 0 : 1);
}

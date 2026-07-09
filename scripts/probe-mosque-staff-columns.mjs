// scripts/probe-mosque-staff-columns.mjs — RBAC-B pre-flight probe (read-only, dev ONLY).
import { createClient } from '@supabase/supabase-js';
process.loadEnvFile('.env');
const URL = process.env.SUPABASE_URL, SVC = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEV_REF = 'pbejyukihhmybxxtheqq';
if (!URL || !URL.includes(DEV_REF)) { console.error(`SAFETY: not dev (${DEV_REF}). Got ${URL}`); process.exit(1); }
const svc = createClient(URL, SVC, { auth: { persistSession: false, autoRefreshToken: false } });

async function dump(table) {
  const { data: rows, error } = await svc.from(table).select('*').limit(1);
  if (error) { console.log(`\n${table}: ERROR ${error.message}`); return; }
  const { count } = await svc.from(table).select('*', { count: 'exact', head: true });
  if (!rows || rows.length === 0) { console.log(`\n${table}: 0 rows — cannot infer columns from data (rows=${count})`); return; }
  const cols = Object.keys(rows[0]).sort();
  console.log(`\n${table} (${cols.length} cols, ${count} rows):`);
  for (const c of cols) console.log('  ' + c);
}

for (const t of ['mosque_staff', 'mosque_staff_employment', 'mosque_staff_training']) await dump(t);

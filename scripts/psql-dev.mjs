// scripts/psql-dev.mjs
// GUARDED DEV-ONLY migration runner, for FUTURE migration sessions. Applies SQL to
// (or probes) the amanah-dev Postgres via psql, refusing to run unless the connection
// string targets the dev project (ref pbejyukihhmybxxtheqq). Use this to automate the
// dev-apply + raw-probe loop instead of pasting into the SQL editor — set
// DEV_DATABASE_URL in .env (gitignored) first. It NEVER touches prod (no prod ref
// guard exists on purpose) and NEVER prints the connection string.
//
// Thin, SAFETY-GUARDED wrapper around psql for the DEV Supabase Postgres.
// Reads DEV_DATABASE_URL from .env, asserts it targets the dev project
// (ref pbejyukihhmybxxtheqq) BEFORE running anything, then forwards all args
// straight to psql (so `-f file.sql`, `-c "select ..."`, etc. all work).
//
//   node scripts/psql-dev.mjs -v ON_ERROR_STOP=1 -f migrations/122_....sql
//   node scripts/psql-dev.mjs -c "select ... from information_schema.columns ..."
//
// The connection string is a SECRET — it is never printed. Add it to .env
// (gitignored) as:  DEV_DATABASE_URL=postgresql://postgres:...@db.pbejyukihhmybxxtheqq.supabase.co:5432/postgres
import { spawnSync } from 'node:child_process';

process.loadEnvFile('.env');
const DEV_REF = 'pbejyukihhmybxxtheqq';
const URL = process.env.DEV_DATABASE_URL;

if (!URL) {
  console.error('SAFETY: DEV_DATABASE_URL is not set in .env. Add the amanah-dev Postgres URI and retry.');
  process.exit(1);
}
if (!URL.includes(DEV_REF)) {
  console.error(`SAFETY: DEV_DATABASE_URL does not target the dev project (${DEV_REF}). Refusing to run.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const r = spawnSync('psql', [URL, ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);

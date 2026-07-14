// scripts/pg-dev.mjs
// GUARDED DEV-ONLY Postgres runner (pure-JS `pg`, no psql/Homebrew needed).
// Reads DEV_DATABASE_URL from .env, asserts it targets the DEV project
// (ref pbejyukihhmybxxtheqq) and explicitly REFUSES the PROD ref
// (zgoyvztooyxqkcftwylr), then runs raw catalog probes / ad-hoc SQL / a
// migration file against DEV only.
//
// SECURITY: the connection string is a SECRET and is NEVER printed — not at
// startup, not in error output. On any failure we emit only a fixed message
// plus an error *code* (never the error object, never the client config,
// never the URL). Only the project REF (already public, in this file) is shown.
//
//   node scripts/pg-dev.mjs probe                 # raw FK + RLS probe of cover_requests
//   node scripts/pg-dev.mjs -c "select 1"         # ad-hoc SQL
//   node scripts/pg-dev.mjs -f migrations/143_x.sql   # apply a migration IN A TRANSACTION
import pg from 'pg';
import { readFileSync } from 'node:fs';

process.loadEnvFile('.env');
const DEV_REF = 'pbejyukihhmybxxtheqq';
const PROD_REF = 'zgoyvztooyxqkcftwylr';
const URL = process.env.DEV_DATABASE_URL;

if (!URL) {
  console.error('SAFETY: DEV_DATABASE_URL is not set in .env. Add the amanah-dev (pbej) Postgres URI and retry.');
  process.exit(1);
}
if (URL.includes(PROD_REF)) {
  console.error(`SAFETY: DEV_DATABASE_URL targets the PROD ref (${PROD_REF}). REFUSING. (URL not printed.)`);
  process.exit(1);
}
if (!URL.includes(DEV_REF)) {
  console.error(`SAFETY: DEV_DATABASE_URL does not target the dev project (${DEV_REF}). REFUSING. (URL not printed.)`);
  process.exit(1);
}
console.log(`pg-dev: connected target ref = ${DEV_REF} (dev). Connection string not printed.`);

const COVER_PROBE = `
-- FK constraints on cover_requests (raw)
select conname, pg_get_constraintdef(oid) as definition
  from pg_constraint
 where conrelid = 'public.cover_requests'::regclass and contype = 'f'
 order by conname;
`;
const COVER_POLICIES = `
-- Every RLS policy on cover_requests (raw text)
select policyname, cmd, permissive, roles,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policies pol
  join pg_policy  p2 on p2.polname = pol.policyname
  join pg_class   c  on c.oid = p2.polrelid and c.relname = 'cover_requests'
 where pol.tablename = 'cover_requests'
 order by policyname;
`;
const COVER_COLS = `
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'cover_requests'
 order by ordinal_position;
`;

const args = process.argv.slice(2);
const client = new pg.Client({ connectionString: URL });

async function run() {
  await client.connect();
  try {
    if (args[0] === 'probe') {
      for (const [label, sql] of [['COLUMNS', COVER_COLS], ['FOREIGN KEYS', COVER_PROBE], ['RLS POLICIES', COVER_POLICIES]]) {
        const r = await client.query(sql);
        console.log(`\n===== ${label} (${r.rowCount}) =====`);
        console.log(JSON.stringify(r.rows, null, 2));
      }
    } else if (args[0] === '-c') {
      const r = await client.query(args[1]);
      console.log(JSON.stringify(r.rows, null, 2));
    } else if (args[0] === '-f') {
      // The migration file owns its own transaction (begin;…commit;) so the exact
      // same SQL runs on dev here AND on prod in the SQL editor. Run it as-is.
      const sql = readFileSync(args[1], 'utf8');
      try {
        await client.query(sql);
        console.log(`Applied ${args[1]}.`);
      } catch (e) {
        try { await client.query('rollback'); } catch { /* no txn open */ }
        console.error(`APPLY FAILED — ROLLED BACK. code=${e.code || 'n/a'} — ${String(e.message || '').slice(0, 300)}`);
        process.exitCode = 1;
      }
    } else {
      console.error('usage: probe | -c "<sql>" | -f <file.sql>');
      process.exitCode = 1;
    }
  } finally {
    await client.end();
  }
}

run().catch((e) => {
  // Never print the error object or client config — only a code + fixed line.
  console.error(`pg-dev: connection/exec error. code=${e && e.code ? e.code : 'n/a'}. (URL never printed.)`);
  process.exit(1);
});

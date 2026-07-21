// READ-ONLY dev probes for migration 176. Applies nothing.
import pg from 'pg';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const DBURL = process.env.DEV_DATABASE_URL;
if (!DBURL || !DBURL.includes(DEV)) { console.error(`SAFETY: not dev (${DEV}).`); process.exit(1); }

const db = new pg.Client({ connectionString: DBURL });
await db.connect();

const q = async (label, sql) => {
  const r = await db.query(sql);
  console.log(`\n── ${label}`);
  console.table(r.rows);
};

await q('current function hash', `
  select p.proname, md5(p.prosrc) as hash, length(p.prosrc) as len
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_mosque_staff_list'`);

await q('pre-flight: rows with deleted_at', `
  select count(*)::int as rows_with_deleted_at
    from mosque_staff where deleted_at is not null`);

await q('grants', `
  select grantee, privilege_type from information_schema.routine_privileges
   where routine_schema = 'public' and routine_name = 'get_mosque_staff_list'
   order by grantee`);

await q('tab counts (pass = unchanged after apply)', `
  select
    count(*) filter (where offboarded_at is null and anonymised_at is null)::int as employees,
    count(*) filter (where offboarded_at is not null and anonymised_at is null)::int as former_staff,
    count(*) filter (where anonymised_at is not null)::int as erasure_register,
    count(*)::int as total
  from mosque_staff`);

await db.end();

// Apply migration 156 to DEV + raw probes. DEV ONLY (hard ref guard).
import { readFileSync } from 'node:fs';
import pg from 'pg';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const url = process.env.DEV_DATABASE_URL;
if (!url || !url.includes(DEV)) {
  console.error(`SAFETY: DEV_DATABASE_URL does not target dev (${DEV}). Aborting.`);
  process.exit(1);
}

const sql = readFileSync('migrations/156_staff_avatar_path.sql', 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  console.log('Connected:', (await client.query('select current_database() as db, current_user as usr')).rows[0]);

  console.log('\n--- applying 156 ---');
  await client.query(sql);
  console.log('applied OK');

  console.log('\n=== PROBE 1: information_schema.columns row for avatar_path ===');
  const c = await client.query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema='public' and table_name='mosque_staff'
        and column_name='avatar_path'`);
  console.log(JSON.stringify(c.rows, null, 2));

  console.log('\n=== PROBE 2: col_description comment on avatar_path ===');
  const d = await client.query(
    `select col_description('public.mosque_staff'::regclass, ordinal_position) as comment
       from information_schema.columns
      where table_schema='public' and table_name='mosque_staff'
        and column_name='avatar_path'`);
  console.log(JSON.stringify(d.rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(2);
} finally {
  await client.end();
}

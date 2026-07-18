// Apply migration 155 to DEV + raw structural probes. DEV ONLY (hard ref guard).
import { readFileSync } from 'node:fs';
import pg from 'pg';
process.loadEnvFile('.env');

const DEV = 'pbejyukihhmybxxtheqq';
const url = process.env.DEV_DATABASE_URL;
if (!url || !url.includes(DEV)) {
  console.error(`SAFETY: DEV_DATABASE_URL does not target dev (${DEV}). Aborting.`);
  process.exit(1);
}

const sql = readFileSync('migrations/155_staff_avatars_bucket.sql', 'utf8');
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  const who = await client.query('select current_database() as db, current_user as usr');
  console.log('Connected:', who.rows[0]);

  console.log('\n--- applying 155 ---');
  await client.query(sql);
  console.log('applied OK');

  console.log('\n=== PROBE 1: storage.buckets row for staff-avatars ===');
  const b = await client.query(
    `select id, name, public, file_size_limit, allowed_mime_types
       from storage.buckets where id = 'staff-avatars'`);
  console.log(JSON.stringify(b.rows, null, 2));

  console.log('\n=== PROBE 2: pg_policies for storage.objects (staff-avatars%) ===');
  const p = await client.query(
    `select policyname, cmd, roles, qual, with_check
       from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname like 'staff-avatars%'
      order by policyname`);
  console.log(JSON.stringify(p.rows, null, 2));
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(2);
} finally {
  await client.end();
}

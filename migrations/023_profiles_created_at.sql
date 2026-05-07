-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 5 fix)
--
-- Phase 5's listAllProfiles selects + orders by profiles.created_at.
-- The 010 TODO migration in this directory infers created_at from
-- frontend usage as part of its placeholder schema, but the actual
-- prod profiles table never had that column — caught by a 400 from
-- PostgREST when the All users tab loaded ("column profiles.created_at
-- does not exist").
--
-- This migration adds the column. NOT NULL + default now() means
-- existing rows backfill to the migration apply timestamp in a
-- single ALTER TABLE — no separate UPDATE needed. Pre-launch only
-- test users exist; their true signup timestamps are gone (not
-- preserved on auth.users either, since we never copied that
-- field over). Acceptable loss given the audience.
--
-- Apply order: 023 must run AFTER PostgREST has caught up to 022
-- (otherwise the schema cache hasn't seen profiles' new state).
-- After apply, run `notify pgrst, 'reload schema';` in the SQL
-- editor and hard-refresh the browser. Both required. The schema
-- cache trap has bitten this session multiple times — caching
-- here as a sanity reminder.

alter table profiles
  add column if not exists created_at timestamptz not null default now();

-- Sanity-check after applying:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_schema='public' and table_name='profiles'
--     and column_name='created_at';
--   → expect 1 row: timestamptz, now()
--
-- Then:
--   notify pgrst, 'reload schema';

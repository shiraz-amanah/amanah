-- STATUS: Verbatim (authoritative; not documentary like 001–014)
-- Already applied: dev only (manual mid-session fix on 28 May 2026,
--                   formalised by this migration). TBD on prod.
--
-- Restores the `on_auth_user_created` trigger on `auth.users` so
-- that `public.handle_new_user()` fires on every new signup and
-- inserts the matching `public.profiles` row.
--
-- Why this migration exists:
--   amanah-dev was schema-cloned from prod on 2026-05-12 using
--   `pg_dump --schema-only --no-owner --no-acl --schema=public`.
--   `--schema=public` filters to objects in the public schema —
--   which captured `public.handle_new_user()` (the function) but
--   excluded the trigger that calls it, because the trigger lives
--   on `auth.users`, in the `auth` schema. Result in dev: function
--   orphan, no trigger to invoke it. supabase.auth.signUp creates
--   auth.users rows but never public.profiles rows, and any
--   feature with a `profile_id` FK then breaks at insert.
--
--   Surfaced when Session M Part B Day 1 staff signup created an
--   auth.users row but no profiles row, and accept_staff_invite's
--   mosque_staff INSERT hit the profile_id → profiles(id) FK.
--   Manual `create trigger` in dev mid-session unblocked the
--   re-test; this migration lands the same statement as a
--   versioned artefact.
--
-- Idempotency: `drop trigger if exists … create trigger …` is
-- safe regardless of starting state.
--
-- Apply-to-prod gate (CRITICAL — do not skip):
--   1) Probe prod's trigger state first:
--        select tgname, pg_get_triggerdef(oid)
--          from pg_trigger
--         where tgname = 'on_auth_user_created'
--           and tgrelid = 'auth.users'::regclass;
--   2a) If one row with the expected definition: prod is fine; this
--       migration is a no-op (drop + identical create). Safe to
--       apply.
--   2b) If zero rows: prod is missing the trigger too — every
--       signup in prod has been silently skipping profile creation
--       (or something else has been creating profiles). Before
--       applying, run:
--         select id from auth.users u
--          where not exists
--            (select 1 from public.profiles p where p.id = u.id);
--       Backfill those orphans, THEN apply this migration.
--   2c) If one row with DIFFERENT definition: investigate the
--       drift before applying — the current prod definition may
--       be intentional.

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

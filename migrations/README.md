# migrations/

Source of truth for the Supabase schema. Files are applied in canonical
order to take a fresh project from zero to current production schema.

## Naming

`NNN_description.sql` — `NNN` is sequential within this directory and is
the canonical apply order. The original deployment date lives in each
file's header comment, not the filename, so re-numbering doesn't churn
filenames.

## Status legend

- **Verbatim** — exact SQL as applied. Re-applying produces the same
  schema as production.
- **Reconstructed from code** — SQL inferred from frontend usage in
  `src/auth.js` and component code. Column names are confirmable;
  exact types, defaults, RLS expressions, and function bodies may
  differ from production. **Verify against `pg_dump --schema-only -t <table>`
  before applying to a fresh project.**
- **TODO** — schema exists in production but predates this directory.
  Run `pg_dump --schema-only -t <table>` against the production
  Supabase project and paste the result into the file, replacing the
  inferred-columns comment block.

## File index

| #   | File                                   | Status              | Originally applied | Source                          |
|-----|----------------------------------------|---------------------|--------------------|---------------------------------|
| 001 | `001_scholars_table.sql`               | TODO                | Pre-Session-A      | inferred from `auth.js`         |
| 002 | `002_saves_table.sql`                  | Reconstructed       | Pre-Session-A      | inferred from `auth.js`         |
| 003 | `003_saves_allow_mosque.sql`           | Verbatim            | 2 May 2026         | NOTES.md Session B              |
| 004 | `004_messages_schema.sql`              | Reconstructed       | 4 May 2026         | NOTES.md Session D + code       |
| 005 | `005_messages_profile_fks.sql`         | Reconstructed       | 4 May 2026         | NOTES.md Session D + embed names |
| 006 | `006_profiles_open_authed_select.sql`  | Reconstructed       | 4 May 2026         | NOTES.md Session D              |
| 007 | `007_bookings_meeting_url.sql`         | Verbatim            | 5 May 2026         | NOTES.md Session E              |
| 008 | `008_bookings_table_TODO.sql`          | TODO                | Pre-Session-A      | inferred from `auth.js`         |
| 009 | `009_donations_table_TODO.sql`         | TODO                | Pre-Session-C      | inferred from `auth.js`         |
| 010 | `010_profiles_table_TODO.sql`          | TODO                | Project bootstrap  | inferred from `auth.js`         |
| 011 | `011_students_table_TODO.sql`          | TODO                | Pre-Session-A      | inferred from `auth.js`         |
| 012 | `012_reviews.sql`                      | Verbatim            | 6 May 2026         | NOTES.md Session H              |
| 013 | `013_reviews_seed.sql`                 | Verbatim            | 6 May 2026         | NOTES.md Session H              |
| 014 | `014_scholar_dashboard_rls.sql`        | Verbatim            | 7 May 2026         | NOTES.md Session I              |
| 015 | `015_scholar_applications.sql`         | Verbatim            | 7 May 2026         | NOTES.md Session J              |
| 016 | `016_scholars_self_select.sql`         | Verbatim            | 7 May 2026         | NOTES.md Session J follow-up    |
| 017 | `017_profiles_role.sql`                | Verbatim            | TBD (Session K-1)  | NOTES.md Session K Phase 1      |
| 018 | `018_seed_admins.sql`                  | Verbatim            | TBD (Session K-1)  | NOTES.md Session K Phase 1      |
| 019 | `019_scholar_applications_admin_rls.sql` | Verbatim          | TBD (Session K-2)  | NOTES.md Session K Phase 2      |
| 020 | `020_scholars_admin_rls.sql`           | Superseded by 028   | TBD (Session K-2)  | NOTES.md Session K Phase 2 → See 028 |
| 021 | `021_reviews_admin_rls.sql`            | Superseded by 028   | TBD (Session K-3)  | NOTES.md Session K Phase 3 → See 028 |
| 022 | `022_profiles_admin_rls.sql`           | Verbatim            | TBD (Session K-5)  | NOTES.md Session K Phase 5      |
| 023 | `023_profiles_created_at.sql`          | Verbatim            | TBD (Session K-5)  | NOTES.md Session K Phase 5      |
| 024 | `024_mosques_table.sql`                | Verbatim            | TBD (Session K-6a) | NOTES.md Session K Phase 6a     |
| 025 | `025_mosque_applications.sql`          | Verbatim            | TBD (Session K-6a) | NOTES.md Session K Phase 6a     |
| 026 | `026_seed_mosques.sql`                 | Verbatim            | TBD (Session K-6a) | NOTES.md Session K Phase 6a     |
| 027 | `027_mosque_applications_geocode_facilities.sql` | Verbatim  | TBD (Session K-6b) | NOTES.md Session K Phase 6b     |
| 028 | `028_flags_and_admin_rls.sql`          | Verbatim            | 8 May 2026         | Phase 7 flags table + RLS + indexes; restores admin RLS on scholars (originally 020) and reviews (originally 021); adds admin UPDATE on messages. |
| 029 | `029_dbs_orders_and_drop_rtw.sql`      | Verbatim            | TBD (Session L)    | Session L; drops `scholars.rtw_verified` (scholars are independent contractors); creates `dbs_orders` table + RLS + partial-unique active-order index. |
| 030 | `030_mosque_staff.sql`                 | Verbatim (authoritative) | 28 May 2026   | Session M Part B Day 1; creates `mosque_staff` + `mosque_staff_invites` tables, 11 RLS policies, and the `validate_staff_invite` + `accept_staff_invite` SECURITY DEFINER RPCs. First post-pg_dump-split migration: authoritative source-of-truth, not documentary. |
| 031 | `031_revoke_anon_on_mosque_staff.sql`  | Verbatim (authoritative) | 28 May 2026   | Session M Part B Day 1 hot-fix. REVOKEs anon's direct privileges on `mosque_staff` + `mosque_staff_invites`. Dev's default_privileges are intact and grant ALL to {anon, authenticated} on every new public table; for these two tables the security model wants anon to have zero direct access (validate_staff_invite SECURITY DEFINER function is the only legitimate anon path). |
| 032 | `032_on_auth_user_created_trigger.sql` | Verbatim (authoritative) | 28 May 2026   | Session M Part B Day 1 root-cause-#1 fix. Idempotent `drop trigger if exists` + `create trigger on_auth_user_created` on `auth.users` to invoke `public.handle_new_user()`. The trigger was filtered out of amanah-dev's 2026-05-12 schema clone (`pg_dump --schema=public` excluded auth-schema triggers). Apply to prod only after probing prod's existing trigger state. |
| 033 | `033_fix_accept_staff_invite_ambiguity.sql` | Verbatim (authoritative) | 28 May 2026 | Session M Part B Day 1 root-cause-#2 fix. `create or replace function` on `accept_staff_invite` — adds `#variable_conflict use_column` pragma AND table-qualifies the idempotency-check WHERE clause (`mosque_staff.profile_id` / `mosque_staff.mosque_id`). Belt-and-braces against the OUT-param-shadows-column bug, structural even if the pragma fails to parse. |

## Workflow

For now: apply manually via the Supabase SQL editor in numerical order.

When dev/prod are split (parked item in NOTES.md — currently the same
project serves both), this directory becomes the input to Supabase CLI
/ `dbmate` / similar.

## Applying to a fresh project (future state)

Until the TODO files are filled in via `pg_dump`, this directory is
**not yet sufficient** to bootstrap a fresh project. Resolving the
TODOs is a prerequisite for the dev/prod split.

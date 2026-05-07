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

## Workflow

For now: apply manually via the Supabase SQL editor in numerical order.

When dev/prod are split (parked item in NOTES.md — currently the same
project serves both), this directory becomes the input to Supabase CLI
/ `dbmate` / similar.

## Applying to a fresh project (future state)

Until the TODO files are filled in via `pg_dump`, this directory is
**not yet sufficient** to bootstrap a fresh project. Resolving the
TODOs is a prerequisite for the dev/prod split.

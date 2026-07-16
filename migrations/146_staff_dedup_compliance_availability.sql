-- 146_staff_dedup_compliance_availability.sql
-- ====================================================================
-- Session RBAC-E Part 1 — Commit 1 (schema only). Three groups of change
-- to public.mosque_staff:
--   1a. Case-insensitive dedup guard on (mosque_id, email).
--   1b. Compliance-role columns (First Aider, Paediatric First Aider,
--       Fire Marshal, DSL, SENCO, Prevent Duty) — admin-set only.
--   1c. Availability columns (availability_days[] + availability_notes),
--       replacing the wizard's hours_per_week capture (UI-side, later commit).
--
-- EMAIL INVARIANT (055): this migration NEVER modifies an email value or its
-- casing, and NEVER touches accept_staff_invite / the onboarding approve chain.
-- 1a only ADDS a uniqueness guard over lower(email); it does not rewrite data.
-- A later accept_staff_invite still matches lower(email) and LINKS not INSERTs.
--
-- NOTE on 1a mechanism: a UNIQUE *table constraint* cannot be expression-based
-- (lower(email)) nor marked NOT VALID in Postgres — so the guard is expressed
-- as a UNIQUE INDEX, which supports both the lower() expression and
-- NULLS NOT DISTINCT. Same guarantee as the requested constraint; the table is
-- tiny so no CONCURRENTLY / NOT-VALID staging is needed.
-- Pre-checked clean on dev: 0 non-null (mosque_id, lower(email)) dups and 0
-- mosques with >1 NULL-email row. RE-PROBE PROD before applying there.
--
-- NULLS NOT DISTINCT is deliberate: at most one NULL-email staff row per mosque.
-- ====================================================================

begin;

-- 1a. Case-insensitive, NULL-collapsing dedup guard.
create unique index if not exists mosque_staff_mosque_email_unique
  on public.mosque_staff (mosque_id, lower(email)) nulls not distinct;

-- 1b. Compliance-role columns. All admin-set; defaults keep existing rows valid.
alter table public.mosque_staff
  add column if not exists is_first_aider                 boolean default false,
  add column if not exists first_aider_cert_expiry        date,
  add column if not exists first_aider_cert_ref           text,

  add column if not exists is_paediatric_first_aider      boolean default false,
  add column if not exists paediatric_first_aider_cert_expiry date,
  add column if not exists paediatric_first_aider_cert_ref    text,

  add column if not exists is_fire_marshal                boolean default false,
  add column if not exists fire_marshal_cert_expiry       date,
  add column if not exists fire_marshal_cert_ref          text,

  add column if not exists is_dsl                         boolean default false,
  add column if not exists dsl_cert_expiry                date,
  add column if not exists dsl_cert_ref                   text,

  add column if not exists is_senco                       boolean default false,
  add column if not exists senco_cert_expiry              date,
  add column if not exists senco_cert_ref                 text,

  add column if not exists prevent_duty_trained           boolean default false,
  add column if not exists prevent_duty_trained_date      date,
  add column if not exists prevent_duty_cert_ref          text;

-- 1c. Availability (replaces hours_per_week capture in the wizard/UI, later commit).
alter table public.mosque_staff
  add column if not exists availability_days  text[] default '{}',
  add column if not exists availability_notes text;

commit;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST:
--   1. Dev: node scripts/pg-dev.mjs -f migrations/146_...sql
--   2. Probe every new column + the unique index exist on the LIVE db.
--   3. Before prod: re-run the two dedup probes against prod; only apply if clean.

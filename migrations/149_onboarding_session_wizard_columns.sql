-- 149_onboarding_session_wizard_columns.sql
-- ====================================================================
-- Session RBAC-E Part 1 — Commit 3. New typed columns on the onboarding
-- session backing the redesigned 8-step remote wizard.
--
--   medical_questionnaire  jsonb    — STEP 5. Art.9 SPECIAL-CATEGORY data.
--                                     Session-only; NEVER auto-promoted to
--                                     mosque_staff (approve leaves it here).
--   safer_recruitment_declared bool — STEP 3 legal attestation.
--   dbs_consent_given          bool — STEP 3 DBS-submission consent.
--   address_history        jsonb    — STEP 3, array of {address, from, to}
--                                     covering 5 years (DBS requirement).
--   availability_days      text[]   — STEP 4, mirrors mosque_staff (146) for a
--                                     clean column→column promotion on approve.
--   availability_notes     text     — STEP 4, per-day time ranges (human text).
--   contract_signed        bool     — STEP 8 signed flag (signatory name +
--   contract_signed_at     tstz       timestamp live inside the contract jsonb).
--
-- Migration 150 reworks the RPCs (save_onboarding_step mapping, a new
-- sign_onboarding_contract, get_onboarding_session_by_token return set, and
-- approve availability promotion) — apply 149 BEFORE 150.
--
-- 055 email invariant: untouched — no email column read or written.
-- ====================================================================

begin;

alter table public.mosque_staff_onboarding_sessions
  add column if not exists medical_questionnaire      jsonb,
  add column if not exists safer_recruitment_declared boolean default false,
  add column if not exists dbs_consent_given          boolean default false,
  add column if not exists address_history            jsonb,
  add column if not exists availability_days          text[] default '{}',
  add column if not exists availability_notes         text,
  add column if not exists contract_signed            boolean default false,
  add column if not exists contract_signed_at         timestamptz;

commit;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST:
--   1. Dev: node scripts/pg-dev.mjs -f migrations/149_...sql
--   2. Probe all 8 columns exist with correct types/defaults.
--   3. Apply 149 BEFORE 150 (150's RPCs reference these columns).

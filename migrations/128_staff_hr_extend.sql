-- 128_staff_hr_extend.sql
-- ====================================================================
-- Session RBAC-B — extend the HR record for the People-tab rebuild.
-- Build ON mosque_staff (Option 1): mosque_staff = directory/badges,
-- mosque_staff_employment (060/065) = owner-only sensitive PII/pay.
-- mosque_employees (125/127) is UNTOUCHED — RBAC permissions overlay only.
-- New sensitive fields land on mosque_staff_employment (owner-only RLS),
-- NOT mosque_staff, so salary/PII never reach list queries or the client
-- except via the SECURITY DEFINER RPCs in 129 (with audit logging).
-- Existing FKs (madrasa teacher -> mosque_staff) are unchanged.
--
-- REUSES (no new column): date_of_birth -> existing `dob`;
-- scholar_profile_id -> existing `linked_scholar_id`.
-- ====================================================================

-- 1) Directory / badge / lifecycle fields -> mosque_staff (broadly readable)
alter table public.mosque_staff
  add column if not exists department               text,
  add column if not exists job_title                text,
  add column if not exists employment_type          text
    check (employment_type in (
      'employed_full_time','employed_part_time',
      'self_employed','volunteer','contractor')),
  add column if not exists dbs_level                 text
    check (dbs_level in (
      'none','basic','standard','enhanced','enhanced_barred')),
  add column if not exists dbs_required              boolean default true,
  add column if not exists annual_leave_days         integer default 28,
  add column if not exists leave_balance_days        numeric default 28,
  add column if not exists listed_on_marketplace     boolean default false,
  add column if not exists show_dbs_badge_publicly   boolean default false,
  add column if not exists onboarding_completed_at   timestamptz,
  add column if not exists onboarding_method         text
    check (onboarding_method in ('remote_invite','in_house')),
  add column if not exists offboarding_reason        text,
  add column if not exists offboarding_completed_at  timestamptz,
  add column if not exists deleted_at                timestamptz;

-- 2) Sensitive PII / pay / identity-verification -> mosque_staff_employment
--    (owner+admin-only RLS from 060 — inherited by these columns)
alter table public.mosque_staff_employment
  add column if not exists salary_pence         integer,
  add column if not exists next_of_kin          text,
  add column if not exists nationality          text,
  add column if not exists notice_period_days   integer,
  add column if not exists probation_end_date   date,
  add column if not exists pension_enrolled     boolean default false,
  add column if not exists rtw_country          text default 'GB',
  add column if not exists rtw_verified         boolean default false,
  add column if not exists rtw_verified_by      uuid references public.profiles(id),
  add column if not exists rtw_verified_at      timestamptz,
  add column if not exists rtw_storage_path     text,
  add column if not exists dbs_storage_path     text,
  add column if not exists reference_1_name     text,
  add column if not exists reference_1_email    text,
  add column if not exists reference_1_received boolean default false,
  add column if not exists reference_2_name     text,
  add column if not exists reference_2_email    text,
  add column if not exists reference_2_received boolean default false;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run this file in the Supabase SQL editor (dev), then prod.
--   2. Probe (RAW rows — don't trust the Success banner):
--        select column_name, data_type, is_nullable
--          from information_schema.columns
--          where table_name = 'mosque_staff' order by ordinal_position;
--        select column_name, data_type, is_nullable
--          from information_schema.columns
--          where table_name = 'mosque_staff_employment' order by ordinal_position;
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================

-- 060_mosque_staff_employment.sql
-- ====================================================================
-- Session W — HR / payroll employment records, one row per staff member.
--
-- Separate table (not columns on mosque_staff) because this is the most
-- sensitive staff data: NI number, DOB, home address, emergency contact,
-- and BANK DETAILS. It must be readable ONLY by the mosque owner (and
-- platform admins for support) — NEVER by the staff member themselves,
-- NEVER public. mosque_staff stays broadly readable (directory, public
-- listing) so the sensitive payroll fields live behind their own RLS here.
--
-- Also adds the staff onboarding wizard columns to mosque_staff (the
-- wizard writes mosque_staff + this table together).
-- ====================================================================

create table if not exists public.mosque_staff_employment (
  id                       uuid primary key default gen_random_uuid(),
  staff_id                 uuid not null unique
                             references public.mosque_staff(id) on delete cascade,
  mosque_id                uuid not null
                             references public.mosques(id) on delete cascade,

  -- Personal
  ni_number                text,
  dob                      date,
  address                  text,
  emergency_contact_name   text,
  emergency_contact_phone  text,

  -- Bank (highest sensitivity — owner-only, never staff-readable)
  bank_account_name        text,
  bank_sort_code           text,   -- text: preserve leading zeros
  bank_account_number      text,   -- text: preserve leading zeros

  -- Employment terms
  contract_type            text,   -- e.g. permanent / fixed_term / casual / volunteer
  hours_per_week           numeric,
  salary_rate              text,   -- free text: "£28,000/yr" or "£15/hr"

  -- Tax / P46
  p46_statement            char(1) check (p46_statement in ('A', 'B', 'C')),
  student_loan             boolean not null default false,
  student_loan_plan        text,   -- '1' / '2' / '4' (null if no loan)

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists mosque_staff_employment_mosque_idx
  on public.mosque_staff_employment(mosque_id);

alter table public.mosque_staff_employment enable row level security;

-- Owner (and platform admin) full CRUD. No staff-self policy by design:
-- the staff member must NOT be able to read their own bank details via API.
create policy "Owner manage employment records"
  on public.mosque_staff_employment for all
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
  );

revoke all on public.mosque_staff_employment from anon;

-- ====================================================================
-- Staff onboarding wizard columns on mosque_staff.
-- ====================================================================
alter table public.mosque_staff
  add column if not exists wizard_status text not null default 'not_started'
    check (wizard_status in ('not_started', 'in_progress', 'completed')),
  add column if not exists wizard_token text,
  add column if not exists wizard_token_expires_at timestamptz;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run this file in the Supabase SQL editor.
--   2. Probe (read RAW rows, don't trust the Success banner):
--        \d public.mosque_staff_employment
--        select polname, cmd from pg_policies
--          where tablename = 'mosque_staff_employment';
--        select column_name from information_schema.columns
--          where table_name = 'mosque_staff'
--            and column_name like 'wizard%';
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

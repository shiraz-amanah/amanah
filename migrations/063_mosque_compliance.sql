-- 063_mosque_compliance.sql
-- ====================================================================
-- Session W — Compliance tab + the unified document store.
--
--   mosque_compliance  — 1/mosque: charity, GDPR, H&S, financial, madrasah
--                        scalar fields + jsonb lists (trustees, breach log…)
--   mosque_documents   — UNIFIED uploadable+expiring documents across HR /
--                        Safeguarding / Compliance. The Document Expiry
--                        dashboard reads THIS one table (indexed on
--                        expiry_date) instead of UNION-ing six tables.
--                        DBS/RTW expiry on mosque_staff is merged in app-side.
--
-- Both owner-only (+ is_admin). mosque_documents holds DBS/RTW/safeguarding
-- files, so it is NEVER staff-readable, NEVER public — same posture as the
-- mosque-hr-docs bucket the file bytes live in (migration 064).
-- ====================================================================

create table if not exists public.mosque_compliance (
  mosque_id              uuid primary key references public.mosques(id) on delete cascade,

  -- Charity Commission
  charity_number         text,
  annual_return_due      date,
  last_accounts_date     date,
  trustees               jsonb not null default '[]',  -- [{ name, role, appointed }]
  conflicts_register     jsonb not null default '[]',

  -- GDPR / Data protection
  dpo_name               text,
  dpo_contact            text,
  privacy_policy_review  date,
  data_retention_review  date,
  breach_log             jsonb not null default '[]',  -- [{ date, nature, reported_ico }]
  sar_log                jsonb not null default '[]',  -- subject access requests

  -- Health & Safety (certs/insurance with expiry go in mosque_documents;
  -- these are the non-document scalars)
  first_aid_locations    text,

  -- Financial
  vat_number             text,
  gift_aid_reference     text,
  last_gift_aid_claim    date,

  -- Madrasah / education
  ofsted_registration    text,
  ofsted_last_inspection date,
  ofsted_outcome         text,

  updated_at             timestamptz not null default now()
);

alter table public.mosque_compliance enable row level security;

create policy "Owner manage compliance"
  on public.mosque_compliance for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

revoke all on public.mosque_compliance from anon;

-- --------------------------------------------------------------------
-- Unified document store (powers the Document Expiry dashboard)
-- --------------------------------------------------------------------
create table if not exists public.mosque_documents (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  category    text not null
                check (category in ('insurance', 'dbs', 'rtw', 'training',
                                    'policy', 'certificate', 'charity', 'other')),
  label       text not null,            -- e.g. "Public liability insurance"
  provider    text,                     -- e.g. insurer / awarding body
  issue_date  date,
  expiry_date date,                     -- null = non-expiring (informational)
  file_path   text,                     -- key in mosque-hr-docs bucket
  staff_id    uuid references public.mosque_staff(id) on delete set null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists mosque_documents_mosque_idx  on public.mosque_documents(mosque_id);
create index if not exists mosque_documents_expiry_idx   on public.mosque_documents(expiry_date);

alter table public.mosque_documents enable row level security;

create policy "Owner manage documents"
  on public.mosque_documents for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

revoke all on public.mosque_documents from anon;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.mosque_documents
--        select indexname from pg_indexes where tablename = 'mosque_documents';
--        select polname, cmd from pg_policies
--          where tablename in ('mosque_compliance', 'mosque_documents');
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

-- 062_mosque_safeguarding.sql
-- ====================================================================
-- Session W — Safeguarding tab. Heterogeneous data, so modelled as a small
-- set of tables rather than one jsonb blob:
--   mosque_safeguarding_settings   — 1/mosque: DSL + deputy, contacts, review dates
--   mosque_staff_training          — per staff: training log + renewals
--   mosque_safeguarding_incidents  — incident log (HIGHEST sensitivity)
--   mosque_safer_recruitment       — per staff: 6-point checklist
--
-- Policy / contact DOCUMENTS (uploads with expiry) live in the unified
-- mosque_documents table (migration 063) so the Document Expiry dashboard
-- is a single query.
--
-- All tables owner-only (+ is_admin for support). Incidents and the whole
-- safeguarding surface must NEVER be public and NEVER readable by staff.
-- ====================================================================

-- --------------------------------------------------------------------
-- Per-mosque safeguarding settings (DSL, deputy, contacts, review dates)
-- --------------------------------------------------------------------
create table if not exists public.mosque_safeguarding_settings (
  mosque_id            uuid primary key references public.mosques(id) on delete cascade,
  dsl_staff_id         uuid references public.mosque_staff(id) on delete set null,
  deputy_dsl_staff_id  uuid references public.mosque_staff(id) on delete set null,
  dsl_contact          text,
  dsl_last_training    date,
  dsl_next_training    date,
  -- external contacts (LADO, children's services, police, NSPCC, local):
  --   [{ label, name, phone, email }]
  contacts             jsonb not null default '[]',
  -- policy review due dates, e.g. { safeguarding: '2026-09-01', prevent: ... }
  policy_review_dates  jsonb not null default '{}',
  updated_at           timestamptz not null default now()
);

-- --------------------------------------------------------------------
-- Training log (per staff member)
-- --------------------------------------------------------------------
create table if not exists public.mosque_staff_training (
  id              uuid primary key default gen_random_uuid(),
  mosque_id       uuid not null references public.mosques(id) on delete cascade,
  staff_id        uuid not null references public.mosque_staff(id) on delete cascade,
  training_type   text not null,   -- basic / level_1 / level_2 / dsl / prevent / first_aid
  completion_date date,
  renewal_due     date,
  certificate_path text,           -- key in mosque-hr-docs bucket
  created_at      timestamptz not null default now()
);
create index if not exists mosque_staff_training_mosque_idx on public.mosque_staff_training(mosque_id);
create index if not exists mosque_staff_training_staff_idx  on public.mosque_staff_training(staff_id);

-- --------------------------------------------------------------------
-- Incident log (HIGHEST sensitivity)
-- --------------------------------------------------------------------
create table if not exists public.mosque_safeguarding_incidents (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id) on delete cascade,
  incident_date date,
  staff_involved text,             -- free text (may name non-staff)
  nature        text,
  action_taken  text,
  outcome       text,
  status        text not null default 'open'
                  check (status in ('open', 'under_review', 'closed', 'referred')),
  referred_to   text check (referred_to in ('lado', 'police', 'social_services', 'none')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists mosque_safeguarding_incidents_mosque_idx on public.mosque_safeguarding_incidents(mosque_id);

-- --------------------------------------------------------------------
-- Safer recruitment checklist (per staff member)
-- --------------------------------------------------------------------
create table if not exists public.mosque_safer_recruitment (
  staff_id            uuid primary key references public.mosque_staff(id) on delete cascade,
  mosque_id           uuid not null references public.mosques(id) on delete cascade,
  dbs_received        boolean not null default false,
  references_obtained boolean not null default false,
  id_verified         boolean not null default false,
  interview_conducted boolean not null default false,
  induction_completed boolean not null default false,
  probation_set       boolean not null default false,
  updated_at          timestamptz not null default now()
);
create index if not exists mosque_safer_recruitment_mosque_idx on public.mosque_safer_recruitment(mosque_id);

-- --------------------------------------------------------------------
-- RLS: owner-only (+ is_admin). No staff-self, no anon, no public.
-- --------------------------------------------------------------------
alter table public.mosque_safeguarding_settings  enable row level security;
alter table public.mosque_staff_training          enable row level security;
alter table public.mosque_safeguarding_incidents  enable row level security;
alter table public.mosque_safer_recruitment       enable row level security;

create policy "Owner manage safeguarding settings"
  on public.mosque_safeguarding_settings for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

create policy "Owner manage staff training"
  on public.mosque_staff_training for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

create policy "Owner manage safeguarding incidents"
  on public.mosque_safeguarding_incidents for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

create policy "Owner manage safer recruitment"
  on public.mosque_safer_recruitment for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

revoke all on public.mosque_safeguarding_settings from anon;
revoke all on public.mosque_staff_training         from anon;
revoke all on public.mosque_safeguarding_incidents from anon;
revoke all on public.mosque_safer_recruitment      from anon;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in Supabase SQL editor.
--   2. Probe (RAW rows) — confirm RLS leaves incidents owner-only:
--        select tablename, polname, cmd from pg_policies
--          where tablename like 'mosque_safe%' or tablename = 'mosque_staff_training'
--          order by tablename;
--      As an anon/other-user session: select from mosque_safeguarding_incidents
--      must return 0 rows.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

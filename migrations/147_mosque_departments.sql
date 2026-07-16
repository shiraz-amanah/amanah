-- 147_mosque_departments.sql
-- ====================================================================
-- Session RBAC-E Part 1 — Commit 1. A per-mosque department list, backing the
-- Add-Staff-modal / wizard department dropdown (replacing free-text department).
-- Default set (Teaching, Administration, Maintenance, Governance, Finance,
-- Safeguarding, Volunteers) is seeded APPLICATION-SIDE on first use (lazy
-- insert-if-empty for the mosque_id) — NOT a trigger — so seeding stays visible
-- and testable in the app layer.
--
-- The (mosque_id, lower(name)) unique index is added so that lazy seeding and
-- the inline "+ Add department" action are idempotent / race-safe (no dup
-- "Teaching" rows). Flagged as a small addition beyond the literal spec; trivial
-- to drop if unwanted.
--
-- RLS: owner (mosques.user_id = auth.uid()) full CRUD, matching migration 133's
-- ownership pattern. No anon access.
-- ====================================================================

begin;

create table if not exists public.mosque_departments (
  id         uuid primary key default gen_random_uuid(),
  mosque_id  uuid not null references public.mosques(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

create index if not exists mosque_departments_mosque_idx
  on public.mosque_departments(mosque_id);

-- Idempotent seeding / inline-add guard (case-insensitive).
create unique index if not exists mosque_departments_mosque_name_unique
  on public.mosque_departments (mosque_id, lower(name));

alter table public.mosque_departments enable row level security;
revoke all on public.mosque_departments from anon;

drop policy if exists "Owner manages departments" on public.mosque_departments;
create policy "Owner manages departments"
  on public.mosque_departments for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

commit;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST:
--   1. Dev: node scripts/pg-dev.mjs -f migrations/147_...sql
--   2. Probe: to_regclass('public.mosque_departments') is not null; RLS enabled;
--      the two indexes exist.

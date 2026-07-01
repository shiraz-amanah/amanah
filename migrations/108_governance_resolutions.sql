-- 108_governance_resolutions.sql
-- ====================================================================
-- Governance resolutions (Session BB P4b) — formal decisions logged separately,
-- searchable. Deferred from P2; pairs with the AI minute extraction (which
-- surfaces decisions/resolutions from raw notes). Owner-only, like the rest of
-- the governance module (106).
--
-- Dev first, probe, then prod.
-- ====================================================================

create table if not exists public.governance_resolutions (
  id               uuid primary key default gen_random_uuid(),
  mosque_id        uuid not null references public.mosques(id) on delete cascade,
  meeting_id       uuid references public.governance_meetings(id) on delete set null,  -- null = standalone
  title            text,
  resolution_text  text not null,
  resolution_date  date,
  created_at       timestamptz not null default now()
);
create index if not exists gov_resolutions_mosque_idx  on public.governance_resolutions(mosque_id, resolution_date desc);
create index if not exists gov_resolutions_meeting_idx on public.governance_resolutions(meeting_id);

alter table public.governance_resolutions enable row level security;

drop policy if exists "Owner manage governance_resolutions" on public.governance_resolutions;
create policy "Owner manage governance_resolutions" on public.governance_resolutions
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select relrowsecurity from pg_class where relname='governance_resolutions';           -- t
--      select polname from pg_policies where tablename='governance_resolutions';             -- 1 row
--      select column_name from information_schema.columns where table_name='governance_resolutions';
--        -- id, mosque_id, meeting_id, title, resolution_text, resolution_date, created_at
--   3. Functional (as owner): insert a resolution → reads back; non-owner → 0 rows.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

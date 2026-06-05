-- 061_cover_requests.sql
-- ====================================================================
-- Session W — structured cover requests, replacing the free-text message
-- thread that MosqueSubstituteFinder used to open. A mosque admin sends a
-- scholar a structured request (cover type, sessions, date range, notes);
-- the scholar accepts/declines. On accept the app adds a temp staff record
-- (app-side, via the existing mosque_staff temp path).
-- ====================================================================

create table if not exists public.cover_requests (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id)  on delete cascade,
  scholar_id  uuid not null references public.scholars(id) on delete cascade,

  -- text[] so the admin can tick several boxes:
  --   cover_type: short / weekly / monthly / long_term / event / jumuah / ramadan / custom
  --   sessions:   fajr / dhuhr / asr / maghrib / isha / jumuah / taraweeh / classes / all
  cover_type  text[] not null default '{}',
  sessions    text[] not null default '{}',

  date_from   date,
  date_to     date,
  notes       text,

  status      text not null default 'requested'
                check (status in ('requested', 'confirmed', 'declined')),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cover_requests_mosque_idx  on public.cover_requests(mosque_id);
create index if not exists cover_requests_scholar_idx on public.cover_requests(scholar_id);

alter table public.cover_requests enable row level security;

-- Mosque owner: full CRUD on requests for their own mosque(s).
create policy "Owner manage cover requests"
  on public.cover_requests for all
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    or public.is_admin()
  );

-- Scholar recipient: read requests addressed to them.
create policy "Scholar read own cover requests"
  on public.cover_requests for select
  to authenticated
  using (
    scholar_id in (select id from public.scholars where user_id = auth.uid())
  );

-- Scholar recipient: update ONLY the status (accept/decline). Postgres RLS
-- can't restrict to specific columns, so the WITH CHECK keeps the row bound
-- to their own scholar_id; the app only sends a status patch.
create policy "Scholar respond to cover requests"
  on public.cover_requests for update
  to authenticated
  using (
    scholar_id in (select id from public.scholars where user_id = auth.uid())
  )
  with check (
    scholar_id in (select id from public.scholars where user_id = auth.uid())
  );

revoke all on public.cover_requests from anon;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.cover_requests
--        select polname, cmd from pg_policies where tablename = 'cover_requests';
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

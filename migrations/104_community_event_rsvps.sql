-- 104_community_event_rsvps.sql
-- ====================================================================
-- Event RSVP (Session AZ, parked item 4). A community member RSVPs Yes/No/Maybe
-- to a mosque event from their Community tab; the mosque owner sees per-event
-- counts on the Events tab. One row per (event, member); upsert on re-RSVP.
--
-- No RPC needed: RLS scopes reads (member → own; owner → their events' RSVPs),
-- so client counts come from an ordinary select. Dev first, probe, then prod.
-- ====================================================================

create table if not exists public.community_event_rsvps (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.mosque_events(id) on delete cascade,
  profile_id  uuid not null references public.profiles(id)      on delete cascade,
  response    text not null check (response in ('yes','no','maybe')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (event_id, profile_id)
);
create index if not exists community_event_rsvps_event_idx   on public.community_event_rsvps(event_id);
create index if not exists community_event_rsvps_profile_idx on public.community_event_rsvps(profile_id);

alter table public.community_event_rsvps enable row level security;

-- Member manages their OWN RSVP (insert/update/delete/select where it's theirs).
drop policy if exists "Member manages own rsvp" on public.community_event_rsvps;
create policy "Member manages own rsvp" on public.community_event_rsvps
  for all to authenticated
  using      (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Mosque owner READS all RSVPs for their own events (for the counts).
drop policy if exists "Owner reads event rsvps" on public.community_event_rsvps;
create policy "Owner reads event rsvps" on public.community_event_rsvps
  for select to authenticated
  using (event_id in (
    select e.id from public.mosque_events e
    join public.mosques m on m.id = e.mosque_id
    where m.user_id = auth.uid()));

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select relname, relrowsecurity from pg_class where relname='community_event_rsvps';   -- t
--      select tablename, polname, cmd from pg_policies where tablename='community_event_rsvps'; -- 2 rows
--      select column_name from information_schema.columns where table_name='community_event_rsvps';
--        -- id, event_id, profile_id, response, created_at, updated_at
--   3. Functional (as a member, against a real event id):
--      -- member upserts own rsvp:
--      insert into community_event_rsvps (event_id, profile_id, response)
--        values ('<event>', auth.uid(), 'yes')
--        on conflict (event_id, profile_id) do update set response=excluded.response, updated_at=now();
--      -- member reads back 1 row; another member's rsvp is NOT visible to them.
--      -- owner: select response, count(*) from community_event_rsvps
--      --   where event_id='<their event>' group by response;   -> counts
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

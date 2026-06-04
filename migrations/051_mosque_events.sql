-- 051_mosque_events.sql — Session U Day 1
--
-- Mosque events. Surface on the mosque public profile (next 5) and the Amanah
-- homepage (next 10 across all ACTIVE mosques). `time` is free text ("18:30")
-- since there's no time-of-day type need; `date` is a real date for ordering +
-- the "next 30 days" homepage window. Indexed on date (homepage ordering) and
-- mosque_id (profile lookups).

create table if not exists public.mosque_events (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  title       text not null,
  description text,
  date        date not null,
  time        text,
  type        text not null check (type in ('prayer','lecture','class','community','other')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists mosque_events_date_idx   on public.mosque_events(date);
create index if not exists mosque_events_mosque_idx  on public.mosque_events(mosque_id);

alter table public.mosque_events enable row level security;

-- Public read — but ONLY events of an ACTIVE mosque (enforces the brief's
-- "only verified mosques' events shown" at the data layer, not just the query).
create policy mosque_events_public_read on public.mosque_events
  for select to anon, authenticated
  using (exists (select 1 from public.mosques m where m.id = mosque_id and m.status = 'active'));

-- Owner CRUD (covers select too, so an owner sees their events even before the
-- mosque is active / published).
create policy mosque_events_owner_all on public.mosque_events
  for all to authenticated
  using      (exists (select 1 from public.mosques m where m.id = mosque_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mosques m where m.id = mosque_id and m.user_id = auth.uid()));

-- APPLY CHECKLIST: run -> NOTIFY pgrst, 'reload schema'; -> probe pg_policies
--   (expect 2 policies) + the two indexes -> hard refresh.

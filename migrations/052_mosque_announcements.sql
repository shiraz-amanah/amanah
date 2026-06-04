-- 052_mosque_announcements.sql — Session U Day 1
--
-- Mosque announcements. Shown on the mosque public profile only (NOT the
-- homepage), pinned ones first. Same active-mosque public-read + owner-CRUD
-- RLS shape as mosque_events.

create table if not exists public.mosque_announcements (
  id         uuid primary key default gen_random_uuid(),
  mosque_id  uuid not null references public.mosques(id) on delete cascade,
  title      text not null,
  body       text,
  pinned     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists mosque_announcements_mosque_idx on public.mosque_announcements(mosque_id);

alter table public.mosque_announcements enable row level security;

create policy mosque_announcements_public_read on public.mosque_announcements
  for select to anon, authenticated
  using (exists (select 1 from public.mosques m where m.id = mosque_id and m.status = 'active'));

create policy mosque_announcements_owner_all on public.mosque_announcements
  for all to authenticated
  using      (exists (select 1 from public.mosques m where m.id = mosque_id and m.user_id = auth.uid()))
  with check (exists (select 1 from public.mosques m where m.id = mosque_id and m.user_id = auth.uid()));

-- APPLY CHECKLIST: run -> NOTIFY pgrst, 'reload schema'; -> probe pg_policies
--   (expect 2 policies) -> hard refresh.

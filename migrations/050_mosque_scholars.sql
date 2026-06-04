-- 050_mosque_scholars.sql — Session U Day 1
--
-- Junction table linking mosques to verified scholars on Amanah. A linked
-- scholar appears on the mosque's public profile. Composite PK prevents
-- duplicate links; both FKs cascade on delete so removing a mosque or scholar
-- cleans up its links.

create table if not exists public.mosque_scholars (
  mosque_id  uuid not null references public.mosques(id)  on delete cascade,
  scholar_id uuid not null references public.scholars(id) on delete cascade,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (mosque_id, scholar_id)
);

alter table public.mosque_scholars enable row level security;

-- Public read — the unauthenticated public profile lists linked scholars.
create policy mosque_scholars_public_read on public.mosque_scholars
  for select to anon, authenticated
  using (true);

-- Link: caller must OWN the mosque AND the scholar must be active
-- (enforces the brief's "scholar must be verified/active before linking").
create policy mosque_scholars_owner_insert on public.mosque_scholars
  for insert to authenticated
  with check (
    exists (select 1 from public.mosques  m where m.id = mosque_id  and m.user_id = auth.uid())
    and exists (select 1 from public.scholars s where s.id = scholar_id and s.status  = 'active')
  );

-- Unlink: caller must own the mosque.
create policy mosque_scholars_owner_delete on public.mosque_scholars
  for delete to authenticated
  using (exists (select 1 from public.mosques m where m.id = mosque_id and m.user_id = auth.uid()));

-- APPLY CHECKLIST: run -> NOTIFY pgrst, 'reload schema'; -> probe pg_policies
--   (expect 3 policies on mosque_scholars) -> hard refresh.

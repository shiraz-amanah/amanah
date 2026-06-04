-- 056_mosque_rotas.sql — Session U Day 2 (rotas + public team)
--
-- Two concerns for this chunk: (1) the mosque_rotas table below, and (2) the
-- get_mosque_team SECURITY DEFINER function at the end (safe-shape public read
-- for the Our Team section, since mosque_staff has no anon RLS).
--
-- Weekly prayer/teaching rota per mosque. One row per (mosque, week) — slots is
-- a jsonb map { "<day>": { "<slot>": "<staff_id>" } }, e.g.
--   { "monday": { "fajr": "uuid", "jumuah": "uuid" }, ... }
-- staff_ids reference mosque_staff but are stored loosely in jsonb (no FK) so a
-- staff archive/delete doesn't cascade-corrupt a saved rota; the UI resolves
-- ids to names and tolerates unknown ids.

create table if not exists public.mosque_rotas (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  week_start  date not null,
  slots       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (mosque_id, week_start)
);

create index if not exists mosque_rotas_mosque_idx on public.mosque_rotas(mosque_id);

alter table public.mosque_rotas enable row level security;

-- Mosque admins: full CRUD on their own mosque's rotas.
create policy "Mosque admins manage own rotas"
  on public.mosque_rotas for all
  to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Linked staff can read their mosque's rotas (so a future staff dashboard can
-- show "my rota"). Read-only — only admins edit.
create policy "Staff read own-mosque rotas"
  on public.mosque_rotas for select
  to authenticated
  using (mosque_id in (select mosque_id from public.mosque_staff where profile_id = auth.uid()));

create or replace function public.touch_mosque_rotas_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_rotas_touch_updated_at
  before update on public.mosque_rotas
  for each row execute function public.touch_mosque_rotas_updated_at();

-- ====================================================================
-- get_mosque_team — anon-callable, SAFE-SHAPE public team for the Our Team
-- section. mosque_staff RLS (030) has no anon read, and a blanket public-read
-- policy would leak staff email/phone/DBS cert (RLS is row-level, not
-- column-level). This definer function returns ONLY display columns, for
-- non-archived staff of ACTIVE mosques, excluding ended temp cover. Mirrors
-- the validate_staff_invite safe-shape pattern.
-- ====================================================================
create or replace function public.get_mosque_team(p_mosque_id uuid)
returns table (
  id uuid, name text, role text, photo_url text,
  staff_type text, start_date date, end_date date
)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.name, s.role, s.photo_url, s.staff_type, s.start_date, s.end_date
    from public.mosque_staff s
    join public.mosques m on m.id = s.mosque_id
   where s.mosque_id = p_mosque_id
     and m.status = 'active'
     and s.archived = false
     and (s.staff_type <> 'temporary' or s.end_date is null or s.end_date >= current_date)
   order by (s.staff_type = 'temporary'), s.start_date nulls last;
$$;

revoke all on function public.get_mosque_team(uuid) from public;
grant execute on function public.get_mosque_team(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run -> NOTIFY included -> probe pg_policies (2 on
-- mosque_rotas) + \d mosque_rotas + that get_mosque_team(<active mosque>) returns
-- safe columns only (NO email/phone/dbs) -> hard refresh.

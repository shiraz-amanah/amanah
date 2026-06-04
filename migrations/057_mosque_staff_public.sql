-- 057_mosque_staff_public.sql — Session V (chunk 1: public Staff tab)
--
-- Adds public-display fields to mosque_staff and makes the Our Team section
-- OPT-IN: get_mosque_team now returns only show_on_profile = true staff (it
-- previously returned all non-archived). After this migration, existing staff
-- are hidden from the public profile until an admin toggles them on in the new
-- public "Staff" tab — intended behaviour.
--
-- (Session V renumber: the brief had 057=timesheets; timesheets move to 058
-- since this columns+RPC change ships in chunk 1.)

alter table public.mosque_staff
  add column if not exists show_on_profile boolean not null default false,
  add column if not exists bio             text,
  add column if not exists speciality      text;

-- get_mosque_team: signature changes (adds bio + speciality to the return), so
-- DROP + CREATE — `create or replace` can't change a function's return type.
drop function if exists public.get_mosque_team(uuid);

create function public.get_mosque_team(p_mosque_id uuid)
returns table (
  id uuid, name text, role text, photo_url text,
  staff_type text, start_date date, end_date date, bio text, speciality text
)
language sql
security definer
stable
set search_path = public
as $$
  select s.id, s.name, s.role, s.photo_url, s.staff_type, s.start_date, s.end_date, s.bio, s.speciality
    from public.mosque_staff s
    join public.mosques m on m.id = s.mosque_id
   where s.mosque_id = p_mosque_id
     and m.status = 'active'
     and s.archived = false
     and s.show_on_profile = true
     and (s.staff_type <> 'temporary' or s.end_date is null or s.end_date >= current_date)
   order by (s.staff_type = 'temporary'), s.start_date nulls last;
$$;

revoke all on function public.get_mosque_team(uuid) from public;
grant execute on function public.get_mosque_team(uuid) to anon, authenticated;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run -> NOTIFY included -> probe the 3 new columns on
-- mosque_staff + that get_mosque_team(<active mosque>) returns ONLY
-- show_on_profile=true rows with no PII -> hard refresh.

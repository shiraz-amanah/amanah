-- 092_madrasa_student_emergency_contact.sql
-- ====================================================================
-- Add an emergency contact to the student record and let the mosque admin edit
-- it from the student profile.
--
-- Two nullable columns on students (no backfill — existing rows stay null, shown
-- as "Not recorded" until set). The 091 admin-update RPC is REPLACED with an
-- extended signature that also writes the two fields. The two new params default
-- to null so a pre-deploy client (6 args) still resolves; the old 6-arg function
-- is DROPPED first so there's no overload ambiguity for PostgREST.
-- ====================================================================

alter table public.students add column if not exists emergency_contact_name  text;
alter table public.students add column if not exists emergency_contact_phone text;

-- Replace the 091 RPC (different arity → drop then create, not create-or-replace).
drop function if exists public.madrasa_admin_update_student(uuid, uuid, text, date, text, text);

create or replace function public.madrasa_admin_update_student(
  p_student         uuid,
  p_mosque          uuid,
  p_name            text,
  p_dob             date,
  p_gender          text,
  p_relation        text,
  p_emergency_name  text default null,
  p_emergency_phone text default null
) returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  -- Authz: caller owns the mosque AND the student is enrolled there (091 model).
  if not exists (
    select 1 from public.mosques m where m.id = p_mosque and m.user_id = auth.uid()
  ) then
    raise exception 'not authorised for this mosque';
  end if;
  if not exists (
    select 1 from public.madrasa_enrollments e where e.student_id = p_student and e.mosque_id = p_mosque
  ) then
    raise exception 'student is not enrolled at this mosque';
  end if;

  update public.students s
     set name                    = coalesce(nullif(trim(p_name), ''), s.name),
         dob                     = p_dob,
         gender                  = nullif(trim(p_gender), ''),
         relation                = nullif(trim(p_relation), ''),
         age                     = case when p_dob is not null then extract(year from age(p_dob))::int else s.age end,
         emergency_contact_name  = nullif(trim(p_emergency_name), ''),
         emergency_contact_phone = nullif(trim(p_emergency_phone), '')
   where s.id = p_student
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text) from public, anon, authenticated;
grant execute on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select column_name from information_schema.columns
--          where table_name='students' and column_name like 'emergency%';   -- 2 rows
--        select proname, pronargs, prosecdef from pg_proc
--          where proname = 'madrasa_admin_update_student';                   -- pronargs=8, prosecdef=t, ONE row
--        select has_function_privilege('anon',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text)','execute');   -- f
--        select has_function_privilege('authenticated',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text)','execute');   -- t
--      As the mosque owner: update an enrolled student with emergency fields → row returned, fields set.
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

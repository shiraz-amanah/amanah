-- 091_madrasa_admin_update_student.sql
-- ====================================================================
-- Let a mosque admin edit an enrolled student's core details (name, DOB,
-- gender, relation) from the Madrasah Students directory.
--
-- WHY AN RPC: students rows are parent-owned (RLS write = profile_id =
-- auth.uid()). The mosque admin only has SELECT on enrolled students (068/069),
-- so a direct UPDATE is denied. This SECURITY DEFINER function performs the
-- update after authorising the caller as the mosque owner who has that student
-- enrolled — mirroring 089's madrasa_admin_enrol_student authz model. Name is
-- never blanked; DOB drives a recomputed age (kept if DOB is left unset).
-- ====================================================================

create or replace function public.madrasa_admin_update_student(
  p_student  uuid,
  p_mosque   uuid,
  p_name     text,
  p_dob      date,
  p_gender   text,
  p_relation text
) returns public.students
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.students;
begin
  -- Authz: caller owns the mosque AND the student is enrolled there.
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
     set name     = coalesce(nullif(trim(p_name), ''), s.name),
         dob      = p_dob,
         gender   = nullif(trim(p_gender), ''),
         relation = nullif(trim(p_relation), ''),
         age      = case when p_dob is not null then extract(year from age(p_dob))::int else s.age end
   where s.id = p_student
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text) from public, anon, authenticated;
grant execute on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select proname, prosecdef from pg_proc where proname = 'madrasa_admin_update_student'; -- prosecdef = t
--        select has_function_privilege('anon',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text)','execute');      -- f
--        select has_function_privilege('authenticated',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text)','execute');      -- t
--      As the mosque owner: update one of your enrolled students → row returned, fields changed.
--      As a different authed user: same call → 'not authorised for this mosque'.
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

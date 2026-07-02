-- 110_madrasa_student_photo.sql
-- ====================================================================
-- Let a mosque admin set a student's profile photo (avatar) from the student
-- profile page. Two parts:
--   1. students.photo_url — stores the OBJECT PATH in the PRIVATE, consent-gated
--      mosque-madrasa-photos bucket (080), NOT a public URL. Child face photos
--      must never be publicly reachable (safeguarding), so the avatar is served
--      via short-lived signed URLs minted at render time, exactly like class
--      photos. Path convention: {mosque_id}/{class_id}/avatar-… so the existing
--      080 storage RLS (madrasa_can_manage_photo_path) already covers owner +
--      class-teacher writes/reads with NO new storage policy.
--   2. madrasa_admin_update_student — extended from 8 → 9 args to also write
--      photo_url. Uses coalesce(p_photo_url, s.photo_url) so a normal
--      name/details edit (which passes no photo) never wipes an existing avatar;
--      only an explicit upload sets it. Owner-only authz unchanged (091/092).
-- Old 8-arg function is DROPPED first so PostgREST has no overload ambiguity.
-- ====================================================================

alter table public.students add column if not exists photo_url text;

drop function if exists public.madrasa_admin_update_student(uuid, uuid, text, date, text, text, text, text);

create or replace function public.madrasa_admin_update_student(
  p_student         uuid,
  p_mosque          uuid,
  p_name            text,
  p_dob             date,
  p_gender          text,
  p_relation        text,
  p_emergency_name  text default null,
  p_emergency_phone text default null,
  p_photo_url       text default null
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
         emergency_contact_phone = nullif(trim(p_emergency_phone), ''),
         photo_url               = coalesce(p_photo_url, s.photo_url)  -- null = leave unchanged
   where s.id = p_student
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select column_name from information_schema.columns
--          where table_name = 'students' and column_name = 'photo_url';       -- 1 row
--        select oid::regprocedure from pg_proc
--          where proname = 'madrasa_admin_update_student';                     -- exactly the 9-arg sig
--        select has_function_privilege('anon',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text,text)','execute');  -- f
--        select has_function_privilege('authenticated',
--          'public.madrasa_admin_update_student(uuid,uuid,text,date,text,text,text,text,text)','execute');  -- t
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

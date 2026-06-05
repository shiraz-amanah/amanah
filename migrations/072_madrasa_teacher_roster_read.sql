-- 072_madrasa_teacher_roster_read.sql
-- ====================================================================
-- Madrasa Phase 1e — teacher roster read. To mark attendance / log Hifz from
-- the teacher portal, a class teacher must read their class's roster:
--   - madrasa_enrollments for their classes
--   - the enrolled students' names
-- 068 only granted owner + parent reads on these, so the teacher portal would
-- show an empty roster. This adds teacher SELECT policies, recursion-safe via
-- SECURITY DEFINER helpers (the 068/069 lesson): the helpers read the join
-- chain WITHOUT RLS, so the students↔enrollments cycle can't re-enter.
-- ====================================================================

-- Caller teaches a class the student is enrolled in.
create or replace function public.madrasa_teacher_can_see_student(p_student uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_enrollments e
    join public.madrasa_classes c on c.id = e.class_id
    join public.mosque_staff   s on s.id = c.teacher_staff_id
    where e.student_id = p_student and s.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_teacher_can_see_student(uuid) from public;
grant execute on function public.madrasa_teacher_can_see_student(uuid) to authenticated;

-- Teacher reads enrollments for classes they teach (the roster). Uses the
-- existing madrasa_is_class_teacher helper (070).
create policy "Teacher read class enrollments"
  on public.madrasa_enrollments for select to authenticated
  using (public.madrasa_is_class_teacher(class_id));

-- Teacher reads students enrolled in their classes (names for the roster).
create policy "Teacher read enrolled students"
  on public.students for select to authenticated
  using (public.madrasa_teacher_can_see_student(id));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe:
--        select proname, prosecdef from pg_proc where proname = 'madrasa_teacher_can_see_student';
--        select polname from pg_policies
--          where (tablename='madrasa_enrollments' and polname='Teacher read class enrollments')
--             or (tablename='students' and polname='Teacher read enrolled students');
--   3. Re-run the 1e smoke — teacher reads roster + enrolled student names.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

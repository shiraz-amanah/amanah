-- 069_madrasa_rls_recursion_fix.sql
-- ====================================================================
-- Fix for an infinite-recursion in the 068 policies (caught by the Phase 1a
-- dev smoke — parent enrollment returned 500):
--   students."Owner read enrolled students"  → queries madrasa_enrollments
--   madrasa_enrollments parent policies       → query students
-- Evaluating either triggers the other's RLS → Postgres "infinite recursion
-- detected in policy for relation".
--
-- Break the cycle with a SECURITY DEFINER helper that reads madrasa_enrollments
-- WITHOUT RLS, and use it in the students policy. The enrollments policies that
-- read `students where profile_id = auth.uid()` then no longer recurse, because
-- the only students policy that referenced enrollments now goes through the
-- definer function (no RLS re-entry).
-- ====================================================================

create or replace function public.madrasa_owner_can_see_student(p_student uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_enrollments e
    join public.mosques m on m.id = e.mosque_id
    where e.student_id = p_student
      and m.user_id = auth.uid()
  );
$$;

revoke all on function public.madrasa_owner_can_see_student(uuid) from public;
grant execute on function public.madrasa_owner_can_see_student(uuid) to authenticated;

-- Recreate the students relax policy to use the definer function.
drop policy if exists "Owner read enrolled students" on public.students;
create policy "Owner read enrolled students"
  on public.students for select to authenticated
  using (public.is_admin() or public.madrasa_owner_can_see_student(id));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe:
--        select proname, prosecdef from pg_proc
--          where proname = 'madrasa_owner_can_see_student';   -- prosecdef = true
--        select polname from pg_policies
--          where tablename = 'students' and polname = 'Owner read enrolled students';
--   3. Re-run the Phase 1a smoke — parent enrol + roster reads should pass.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

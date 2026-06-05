-- 070_madrasa_attendance.sql
-- ====================================================================
-- Madrasa Phase 1c — per-session attendance. One row per (class, student,
-- session_date). Marked by the mosque admin OR the class's teacher; readable
-- by the child's parent (for 1e viewing). mosque_id is denormalized and forced
-- to match the class so it can't be spoofed.
--
-- Teacher access goes through a SECURITY DEFINER helper (the 068/069 lesson:
-- cross-table policy subqueries that re-enter RLS can recurse). The teacher
-- check reads madrasa_classes + mosque_staff WITHOUT RLS.
-- ====================================================================

create or replace function public.madrasa_is_class_teacher(p_class uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_classes c
    join public.mosque_staff s on s.id = c.teacher_staff_id
    where c.id = p_class and s.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_is_class_teacher(uuid) from public;
grant execute on function public.madrasa_is_class_teacher(uuid) to authenticated;

create table if not exists public.madrasa_attendance (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id   uuid not null references public.students(id)        on delete cascade,
  mosque_id    uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  session_date date not null,
  status       text not null default 'present'
                 check (status in ('present', 'absent', 'late', 'excused')),
  notes        text,
  marked_by    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists madrasa_attendance_uniq        on public.madrasa_attendance(class_id, student_id, session_date);
create index        if not exists madrasa_attendance_class_idx    on public.madrasa_attendance(class_id, session_date);
create index        if not exists madrasa_attendance_student_idx  on public.madrasa_attendance(student_id);
create index        if not exists madrasa_attendance_mosque_idx   on public.madrasa_attendance(mosque_id);

alter table public.madrasa_attendance enable row level security;

-- Owner (+admin): manage attendance for own-mosque classes; mosque_id forced
-- to match the class.
create policy "Owner manage attendance"
  on public.madrasa_attendance for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Class teacher: manage attendance for their own classes (definer helper).
create policy "Teacher manage class attendance"
  on public.madrasa_attendance for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Parent: read attendance for their own children (1e viewing).
create policy "Parent read child attendance"
  on public.madrasa_attendance for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_attendance
--        select proname, prosecdef from pg_proc where proname = 'madrasa_is_class_teacher';
--        select polname, cmd from pg_policies where tablename = 'madrasa_attendance';
--      As anon: select from madrasa_attendance → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

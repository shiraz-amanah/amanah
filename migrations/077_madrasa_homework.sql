-- 077_madrasa_homework.sql
-- ====================================================================
-- Madrasa Phase 2b — homework / tasks. A teacher (or mosque admin) sets a task
-- for a whole class; PARENTS mark their own child as done. Two tables:
--
--   madrasa_homework            — the class-level task (mirrors 073 announcements
--                                 for write/read RLS).
--   madrasa_homework_completions — per (homework, student) done-state, owned by
--                                 the parent. Presence of a row = done.
--
-- mosque_id (+ class_id on completions) is denormalized and forced to match the
-- task in every WITH CHECK (the 070/073 shape). Cross-table checks reuse the
-- existing SECURITY DEFINER helpers (madrasa_is_class_teacher 070,
-- madrasa_parent_can_see_class 073) so nothing re-enters RLS — the 068/069 lesson.
-- ====================================================================

-- --------------------------------------------------------------------
-- madrasa_homework  (class-level task)
-- --------------------------------------------------------------------
create table if not exists public.madrasa_homework (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references public.madrasa_classes(id) on delete cascade,
  mosque_id         uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  author_profile_id uuid references public.profiles(id) on delete set null,
  title             text not null,
  body              text,
  due_date          date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists madrasa_homework_class_idx  on public.madrasa_homework(class_id, created_at desc);
create index if not exists madrasa_homework_mosque_idx on public.madrasa_homework(mosque_id);

alter table public.madrasa_homework enable row level security;

create policy "Owner manage homework"
  on public.madrasa_homework for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Teacher manage class homework"
  on public.madrasa_homework for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Parent read class homework"
  on public.madrasa_homework for select to authenticated
  using (public.madrasa_parent_can_see_class(class_id));

-- --------------------------------------------------------------------
-- madrasa_homework_completions  (per student; parent-owned)
-- --------------------------------------------------------------------
create table if not exists public.madrasa_homework_completions (
  id           uuid primary key default gen_random_uuid(),
  homework_id  uuid not null references public.madrasa_homework(id) on delete cascade,
  student_id   uuid not null references public.students(id)         on delete cascade,
  class_id     uuid not null references public.madrasa_classes(id)  on delete cascade,  -- denormalized for RLS
  mosque_id    uuid not null references public.mosques(id)          on delete cascade,  -- denormalized for RLS
  completed_at timestamptz not null default now(),
  marked_by    uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index if not exists madrasa_homework_completions_uniq        on public.madrasa_homework_completions(homework_id, student_id);
create index        if not exists madrasa_homework_completions_class_idx    on public.madrasa_homework_completions(class_id);
create index        if not exists madrasa_homework_completions_student_idx  on public.madrasa_homework_completions(student_id);

alter table public.madrasa_homework_completions enable row level security;

-- Parent: manage completions for their OWN children, with class_id + mosque_id
-- forced to match the homework (so they can't be spoofed).
create policy "Parent manage own-child completion"
  on public.madrasa_homework_completions for all to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()))
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    and class_id  = (select class_id  from public.madrasa_homework where id = homework_id)
    and mosque_id = (select mosque_id from public.madrasa_homework where id = homework_id)
  );

-- Owner (+admin): read completions for their own mosque's classes.
create policy "Owner read completions"
  on public.madrasa_homework_completions for select to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Class teacher: read completions for their classes (definer helper).
create policy "Teacher read class completions"
  on public.madrasa_homework_completions for select to authenticated
  using (public.madrasa_is_class_teacher(class_id));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_homework
--        \d public.madrasa_homework_completions
--        select tablename, polname, cmd from pg_policies
--          where tablename in ('madrasa_homework','madrasa_homework_completions')
--          order by tablename;
--      As anon: select from each → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

-- 068_madrasa_classes_enrollments.sql
-- ====================================================================
-- Madrasa Phase 1a/1b — classes + enrollments. Students reuse the existing
-- parent-owned `students` table; an enrollment links a student to a class.
-- Registration is PARENT-INITIATED (parents own their student rows), and the
-- mosque admin manages classes + views rosters. This migration also relaxes
-- `students` so a mosque owner can read students ENROLLED in their classes.
--
-- (Covers the 1a admin-class-management + 1b parent-enrollment data model in
-- one apply; attendance/Hifz land in their own later migrations.)
-- ====================================================================

-- --------------------------------------------------------------------
-- madrasa_classes
-- --------------------------------------------------------------------
create table if not exists public.madrasa_classes (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  name        text not null,
  subject     text not null default 'quran'
                check (subject in ('quran', 'hifz', 'arabic', 'islamic_studies', 'other')),
  teacher_staff_id uuid references public.mosque_staff(id) on delete set null,
  schedule    jsonb not null default '[]',   -- [{ day, start, end }]
  term        text,
  capacity    integer,
  room        text,
  status      text not null default 'active' check (status in ('active', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists madrasa_classes_mosque_idx on public.madrasa_classes(mosque_id);

alter table public.madrasa_classes enable row level security;

create policy "Owner manage madrasa classes"
  on public.madrasa_classes for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Active classes are readable (parents browse to enrol; mosques are public).
create policy "Read active madrasa classes"
  on public.madrasa_classes for select to anon, authenticated
  using (status = 'active');

-- --------------------------------------------------------------------
-- madrasa_enrollments  (student ↔ class)
-- --------------------------------------------------------------------
create table if not exists public.madrasa_enrollments (
  id          uuid primary key default gen_random_uuid(),
  class_id    uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id  uuid not null references public.students(id)        on delete cascade,
  mosque_id   uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  status      text not null default 'active' check (status in ('active', 'withdrawn')),
  enrolled_at timestamptz not null default now()
);
create unique index if not exists madrasa_enrollments_uniq      on public.madrasa_enrollments(class_id, student_id);
create index        if not exists madrasa_enrollments_mosque_idx  on public.madrasa_enrollments(mosque_id);
create index        if not exists madrasa_enrollments_student_idx on public.madrasa_enrollments(student_id);

alter table public.madrasa_enrollments enable row level security;

-- Owner (+admin): manage enrollments for their mosque's classes.
create policy "Owner manage enrollments"
  on public.madrasa_enrollments for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Parent: read/update enrollments for their OWN children.
create policy "Parent read own-child enrollments"
  on public.madrasa_enrollments for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

create policy "Parent update own-child enrollment"
  on public.madrasa_enrollments for update to authenticated
  using      (student_id in (select id from public.students where profile_id = auth.uid()))
  with check (student_id in (select id from public.students where profile_id = auth.uid()));

-- Parent: enrol their own child into an ACTIVE class, with mosque_id forced to
-- match the class (so it can't be spoofed).
create policy "Parent enrol own child"
  on public.madrasa_enrollments for insert to authenticated
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    and class_id in (select id from public.madrasa_classes where status = 'active')
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- --------------------------------------------------------------------
-- Relax students: mosque owner reads students enrolled in their classes
-- (class rosters). The parent-owned base policy is untouched; this ADDS a
-- second SELECT path. Teacher read arrives with the teacher portal (1e).
-- --------------------------------------------------------------------
create policy "Owner read enrolled students"
  on public.students for select to authenticated
  using (
    public.is_admin()
    or id in (
      select e.student_id from public.madrasa_enrollments e
      where e.mosque_id in (select id from public.mosques where user_id = auth.uid())
    )
  );

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_classes
--        \d public.madrasa_enrollments
--        select tablename, polname, cmd from pg_policies
--          where tablename in ('madrasa_classes','madrasa_enrollments')
--             or (tablename='students' and polname='Owner read enrolled students')
--          order by tablename;
--      As anon: select from madrasa_enrollments → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

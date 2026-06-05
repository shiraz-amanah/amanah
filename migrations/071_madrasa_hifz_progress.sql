-- 071_madrasa_hifz_progress.sql
-- ====================================================================
-- Madrasa Phase 1d — Qur'an / Hifz tracker. A LOG of memorization entries per
-- student (a timeline), logged by the mosque admin OR the class's teacher;
-- readable by the child's parent (1e). Each entry records a surah + ayah range,
-- the lesson type (sabaq new / sabqi recent revision / manzil old revision),
-- a status, an optional quality grade, and a session date.
--
-- Same RLS shape as 070 (attendance), reusing the madrasa_is_class_teacher
-- SECURITY DEFINER helper — owner/teacher manage, parent reads, mosque_id
-- forced to match the class.
-- ====================================================================

create table if not exists public.madrasa_hifz_progress (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id    uuid not null references public.students(id)        on delete cascade,
  mosque_id     uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  surah_number  integer not null check (surah_number between 1 and 114),
  ayah_from     integer check (ayah_from >= 1),
  ayah_to       integer check (ayah_to >= 1),
  lesson_type   text not null default 'sabaq'
                  check (lesson_type in ('sabaq', 'sabqi', 'manzil', 'other')),
  status        text not null default 'in_progress'
                  check (status in ('in_progress', 'memorized', 'revising')),
  quality       text check (quality in ('excellent', 'good', 'fair', 'needs_work')),
  session_date  date not null,
  notes         text,
  logged_by     uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- A log (no unique constraint): multiple entries per student/session are fine.
create index if not exists madrasa_hifz_student_idx on public.madrasa_hifz_progress(student_id, session_date desc);
create index if not exists madrasa_hifz_class_idx   on public.madrasa_hifz_progress(class_id);
create index if not exists madrasa_hifz_mosque_idx  on public.madrasa_hifz_progress(mosque_id);

alter table public.madrasa_hifz_progress enable row level security;

create policy "Owner manage hifz"
  on public.madrasa_hifz_progress for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Teacher manage class hifz"
  on public.madrasa_hifz_progress for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Parent read child hifz"
  on public.madrasa_hifz_progress for select to authenticated
  using (student_id in (select id from public.students where profile_id = auth.uid()));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_hifz_progress
--        select polname, cmd from pg_policies where tablename = 'madrasa_hifz_progress';
--      As anon: select from madrasa_hifz_progress → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

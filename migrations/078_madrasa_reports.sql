-- 078_madrasa_reports.sql
-- ====================================================================
-- Madrasa Phase 2C — termly progress reports. A teacher/admin writes a per
-- (student, term) report whose attendance / Hifz / homework summaries are
-- auto-populated from the existing Phase 1/2 data; saving it as a draft keeps
-- published_at NULL; publishing stamps published_at and makes it visible to the
-- parent (who can read ONLY their own child's PUBLISHED reports).
--
-- mosque_id is denormalized + forced to match the class in every WITH CHECK
-- (070/073 shape). Cross-table checks reuse the existing SECURITY DEFINER
-- helpers (madrasa_is_class_teacher 070); the parent-owns-student check is the
-- module's proven `student_id in (select … students where profile_id=auth.uid())`
-- idiom — non-recursive (students has no policy referencing this table).
-- ====================================================================

create table if not exists public.madrasa_reports (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.madrasa_classes(id) on delete cascade,
  student_id         uuid not null references public.students(id)        on delete cascade,
  mosque_id          uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  term               text not null,
  teacher_comment    text,
  attendance_summary jsonb not null default '{}',
  hifz_summary       jsonb not null default '{}',
  homework_summary   jsonb not null default '{}',
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz   -- NULL = draft
);
create index if not exists madrasa_reports_class_idx   on public.madrasa_reports(class_id);
create index if not exists madrasa_reports_student_idx on public.madrasa_reports(student_id);
create index if not exists madrasa_reports_mosque_idx  on public.madrasa_reports(mosque_id);

alter table public.madrasa_reports enable row level security;

create policy "Owner manage reports"
  on public.madrasa_reports for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Teacher manage class reports"
  on public.madrasa_reports for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Parent: read own child's PUBLISHED reports only.
create policy "Parent read published child reports"
  on public.madrasa_reports for select to authenticated
  using (
    published_at is not null
    and student_id in (select id from public.students where profile_id = auth.uid())
  );

-- Once published, a report cannot be unpublished except by a platform admin
-- (parents may already have downloaded it). Enforced in the DB, not just the UI.
create or replace function public.madrasa_reports_guard_unpublish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.published_at is not null and new.published_at is null and not public.is_admin() then
    raise exception 'Published reports cannot be unpublished';
  end if;
  return new;
end;
$$;
drop trigger if exists madrasa_reports_no_unpublish on public.madrasa_reports;
create trigger madrasa_reports_no_unpublish
  before update on public.madrasa_reports
  for each row execute function public.madrasa_reports_guard_unpublish();

-- Auto-populate the three summaries from existing data. SECURITY DEFINER so it
-- can aggregate across attendance/hifz/homework without per-table RLS, but it
-- authorizes the caller internally (must manage the class) and returns only
-- counts for one (class, student) — so it's safe to grant to authenticated
-- (a non-manager, incl. anon with no auth.uid(), gets NULL).
create or replace function public.madrasa_build_report_summary(p_class uuid, p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_att jsonb; v_hifz jsonb; v_hw jsonb;
begin
  if not (
    public.madrasa_is_class_teacher(p_class)
    or exists (select 1 from public.madrasa_classes c join public.mosques m on m.id = c.mosque_id
                 where c.id = p_class and m.user_id = auth.uid())
    or public.is_admin()
  ) then
    return null;
  end if;

  select jsonb_build_object(
    'present', count(*) filter (where status = 'present'),
    'absent',  count(*) filter (where status = 'absent'),
    'late',    count(*) filter (where status = 'late'),
    'excused', count(*) filter (where status = 'excused'),
    'total',   count(*)
  ) into v_att
  from public.madrasa_attendance where class_id = p_class and student_id = p_student;

  select jsonb_build_object(
    'total_entries', (select count(*) from public.madrasa_hifz_progress where class_id = p_class and student_id = p_student),
    'last_surah',    (select surah_number from public.madrasa_hifz_progress where class_id = p_class and student_id = p_student order by session_date desc, created_at desc limit 1),
    'last_ayah',     (select ayah_to       from public.madrasa_hifz_progress where class_id = p_class and student_id = p_student order by session_date desc, created_at desc limit 1),
    'latest_quality',(select quality       from public.madrasa_hifz_progress where class_id = p_class and student_id = p_student and quality is not null order by session_date desc, created_at desc limit 1)
  ) into v_hifz;

  select jsonb_build_object(
    'assigned',  (select count(*) from public.madrasa_homework where class_id = p_class),
    'completed', (select count(*) from public.madrasa_homework_completions where class_id = p_class and student_id = p_student)
  ) into v_hw;

  return jsonb_build_object('attendance', v_att, 'hifz', v_hifz, 'homework', v_hw);
end;
$$;
revoke all on function public.madrasa_build_report_summary(uuid, uuid) from public;
grant execute on function public.madrasa_build_report_summary(uuid, uuid) to authenticated;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_reports
--        select polname, cmd from pg_policies where tablename = 'madrasa_reports';
--        select tgname from pg_trigger where tgrelid = 'public.madrasa_reports'::regclass;
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_build_report_summary','madrasa_reports_guard_unpublish');
--      As anon: select from madrasa_reports → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

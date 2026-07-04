-- 117_madrasa_attendance_mode.sql
-- Improvement 3 — a real three-way "Attendance mode" on enrolments
-- (In-person / Remote / Hybrid), replacing the binary attends_remotely toggle at
-- the UI level. A single boolean can only hold two states, so the persistent
-- 3-way label needs its own column.
--
-- attends_remotely is KEPT as a synced, derived flag (= attendance_mode is not
-- 'in_person') via a BEFORE trigger, so:
--   - Remote AND Hybrid both land in the REMOTE section of the Today-tab register
--     (attends_remotely = true), matching the student-card spec.
--   - Every existing consumer of attends_remotely (register split, the
--     madrasa_live_lesson_started notification handler) keeps working unchanged.
-- The two columns can never drift because the trigger fires on every write.

-- 1) The new 3-way column. Defaults to in_person so existing rows are safe.
alter table public.madrasa_enrollments
  add column if not exists attendance_mode text not null default 'in_person'
    check (attendance_mode in ('in_person', 'remote', 'hybrid'));

-- 2) Backfill from the existing boolean: any current remote student → 'remote'.
--    (Hybrid can't be inferred from a boolean, so pre-existing remote rows all
--    become 'remote'; admins can re-label to Hybrid from the student card.)
update public.madrasa_enrollments
   set attendance_mode = 'remote'
 where attends_remotely = true
   and attendance_mode = 'in_person';

-- 3) Keep attends_remotely in lockstep with attendance_mode on every insert/update.
create or replace function public.madrasa_sync_attends_remotely()
returns trigger
language plpgsql
as $$
begin
  new.attends_remotely := (new.attendance_mode is distinct from 'in_person');
  return new;
end;
$$;

drop trigger if exists madrasa_enrollments_sync_remote on public.madrasa_enrollments;
create trigger madrasa_enrollments_sync_remote
  before insert or update on public.madrasa_enrollments
  for each row execute function public.madrasa_sync_attends_remotely();

-- Probe (paste the raw rows):
--   select attendance_mode, attends_remotely, count(*)
--     from public.madrasa_enrollments
--    group by 1, 2 order by 1, 2;
--   -- expect: every attendance_mode<>'in_person' row has attends_remotely=true,
--   --         every 'in_person' row has attends_remotely=false.

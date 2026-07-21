-- 181_workforce_clash_constraints.sql — Workforce/Timetable rebuild, PHASE 1
-- ============================================================================
-- DB-enforced clash detection — the hard guarantee, same family as the facility
-- booking EXCLUDE (105). Two constraints, both on tables created empty/backfilled
-- in 180:
--   1. mosque_shifts        — no staff member in two overlapping shifts.
--   2. madrasa_class_schedule — no teacher in two overlapping class sessions
--      (same weekday, overlapping time). teacher_staff_id NULL rows are exempt
--      (EXCLUDE ignores NULL key columns) — a class with no teacher can't clash.
--
-- These ENFORCE; they don't repair. If existing data already violates a
-- constraint, ADD CONSTRAINT fails. mosque_shifts is empty so it can't. But the
-- 180 backfill put real rows in madrasa_class_schedule, so a genuine prod
-- teacher double-booking would block this migration — which is the point: run
-- the pre-flight (checklist step 0) FIRST; a hit is a real scheduling conflict
-- to resolve (reschedule the class), not a migration to force through.
--
-- Ranges:
--   * shifts are DATED → tsrange(shift_date + start_time, shift_date + end_time).
--     date + time = timestamp; the operator + the tsrange ctor are IMMUTABLE, so
--     the expression is index-legal. tsrange is built-in → guaranteed gist.
--   * class sessions are RECURRING weekday + time-of-day, no date. Modeled as
--     int4range over MINUTES-SINCE-MIDNIGHT — a BUILT-IN range with guaranteed
--     gist support and no new type object. This assumes MINUTE granularity,
--     which matches the data (HH:MM time inputs); seconds, if ever entered,
--     collapse to the minute. `extract(... from time)` is immutable.
--   * bounds '[)' — back-to-back (one ends exactly as the next starts) is NOT a
--     clash.
-- btree_gist is required for the `=` columns (uuid/smallint) inside a gist
-- EXCLUDE; it is already installed on dev + prod (105 relies on it) — guarded
-- below regardless.
-- ============================================================================

create extension if not exists btree_gist;

-- 1. No staff member double-booked across overlapping shifts (same day).
alter table public.mosque_shifts
  add constraint mosque_shifts_no_staff_overlap
  exclude using gist (
    staff_id with =,
    tsrange(shift_date + start_time, shift_date + end_time, '[)') with &&
  );

-- 2. No teacher double-booked across overlapping class sessions (same weekday).
alter table public.madrasa_class_schedule
  add constraint madrasa_class_schedule_no_teacher_overlap
  exclude using gist (
    teacher_staff_id with =,
    day_of_week with =,
    int4range(
      (extract(hour from start_time) * 60 + extract(minute from start_time))::int,
      (extract(hour from end_time)   * 60 + extract(minute from end_time))::int,
      '[)'
    ) with &&
  );

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first — apply + deliberate-clash rejection test, then
-- prod through Shiraz):
--
-- 0. PRE-FLIGHT STOP (run BEFORE applying, on the target DB). Existing teacher
--    double-bookings in the backfilled schedule would make constraint #2 fail
--    to attach. Expect 0 rows; a hit STOPS the apply (resolve the real clash
--    first). mosque_shifts is empty, so #1 needs no pre-flight.
--      select a.teacher_staff_id, a.day_of_week,
--             a.class_id ca, a.start_time a_s, a.end_time a_e,
--             b.class_id cb, b.start_time b_s, b.end_time b_e
--        from public.madrasa_class_schedule a
--        join public.madrasa_class_schedule b
--          on a.teacher_staff_id = b.teacher_staff_id
--         and a.day_of_week = b.day_of_week
--         and a.id < b.id
--         and a.start_time < b.end_time and b.start_time < a.end_time;   -- 0 rows
--
-- 1. Apply this file.
--
-- 2. Both constraints attached (expect 2 rows):
--      select conname from pg_constraint
--       where conname in ('mosque_shifts_no_staff_overlap',
--                         'madrasa_class_schedule_no_teacher_overlap');
--
-- 3. REJECTION PROOF (constraint actually blocks a clash). Run in a transaction
--    and ROLLBACK so nothing persists — the SECOND insert must raise SQLSTATE
--    23P01 (exclusion_violation):
--      begin;
--      insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--        select mosque_id, id, date '2999-01-01', time '09:00', time '11:00'
--          from public.mosque_staff limit 1;
--      insert into public.mosque_shifts (mosque_id, staff_id, shift_date, start_time, end_time)
--        select mosque_id, id, date '2999-01-01', time '10:00', time '12:00'  -- overlaps → 23P01
--          from public.mosque_staff limit 1;
--      rollback;   -- expect: ERROR 23P01 on the 2nd insert, then rolled back
--
-- 4. NOTIFY included. No function objects here → no md5 hash to match.
-- ============================================================================

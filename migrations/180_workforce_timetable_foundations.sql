-- 180_workforce_timetable_foundations.sql — Workforce/Timetable rebuild, PHASE 0
-- ============================================================================
-- Normalized foundations for the Workforce redesign. PURE DDL + one backfill.
-- NO constraints that enforce clash detection here — the EXCLUDE constraints
-- (shifts + class sessions) are PHASE 1, deliberately. This migration only
-- creates the typed tables those constraints will need, and moves the class
-- timetable off untyped jsonb.
--
-- Decisions locked before writing (see session notes):
--   * mosque_rotas: CLEAN SWAP, no backfill. Prod holds 2 stale single-day
--     prayer-slot rows from the dead RotaBuilder write path (both pre-9-Jul
--     RBAC-B), 0 rows in the live admin shift shape. They are residue, left
--     UNTOUCHED here; mosque_rotas is deprecated in Phase 4.
--   * classes: OPTION A — normalize the schedule jsonb into real rows
--     (madrasa_class_schedule) so teacher/room double-booking can be a DB
--     constraint in Phase 1, not a bypassable RPC check.
--
-- Naming: madrasa_class_schedule (rows = a class's normalized weekly schedule).
-- Named to sit clear of madrasa_sessions (088 — dated live-lesson Daily.co
-- rooms), a different concept. UI copy may still call a row a "session".
--
-- Overlaps — direction LOCKED, executed in Phase 1 (not here):
--   * academic_terms is the single source of truth for TERMS. It is created
--     EMPTY here (classes have no term link today, so nothing is lost).
--     mosques.academic_calendar (094, jsonb incl. type:'term') keeps
--     holidays/exams/deadlines; Phase 1 migrates its type:'term' entries into
--     academic_terms and drops 'term' from that editor.
--   * madrasa_classes.term (068, free-text) stays; term_id is the normalized
--     path. The free-text column is reconciled in Phase 1/4.
--
-- Day encoding: day_of_week smallint, 0=Monday … 6=Sunday (Monday-first, to
-- match the app's mondayOf week logic). Backfill maps day NAMES to this.
-- ============================================================================

-- ── A. Shared updated_at trigger ────────────────────────────────────────────
-- No generic one exists in the schema (056/etc. each defined their own). One
-- shared function for the three new tables; new name, no collision.
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- ── B. mosque_shifts — normalized replacement for mosque_rotas.slots ─────────
-- One row per shift. Dated (shift_date + start/end time), so the Phase 1
-- EXCLUDE (no staff member in two overlapping shifts) is the exact 105 pattern
-- over tsrange(shift_date+start, shift_date+end).
create table if not exists public.mosque_shifts (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id)      on delete cascade,
  staff_id    uuid not null references public.mosque_staff(id) on delete cascade,
  shift_date  date not null,
  start_time  time not null,
  end_time    time not null,
  role        text,
  notes       text,
  created_by  uuid default auth.uid(),   -- actor id (no FK — audit-actor pattern)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint mosque_shifts_time_order check (end_time > start_time)
);
create index if not exists mosque_shifts_mosque_idx      on public.mosque_shifts(mosque_id);
create index if not exists mosque_shifts_staff_date_idx  on public.mosque_shifts(staff_id, shift_date);

alter table public.mosque_shifts enable row level security;

-- Staff-domain RLS, mirroring the modern HR tables (129): owner manages,
-- employee reads OWN shifts only (correct for "My Rota" — not the whole team),
-- platform admin reads all.
create policy "Owner manages shifts" on public.mosque_shifts
  for all to authenticated
  using      (staff_id in (select id from public.mosque_staff where mosque_id in
                (select id from public.mosques where user_id = auth.uid())))
  with check (staff_id in (select id from public.mosque_staff where mosque_id in
                (select id from public.mosques where user_id = auth.uid())));
create policy "Employee reads own shifts" on public.mosque_shifts
  for select to authenticated
  using (staff_id in (select id from public.mosque_staff where profile_id = auth.uid()));
create policy "Admin reads all shifts" on public.mosque_shifts
  for select to authenticated using (public.is_admin());

create trigger mosque_shifts_touch_updated_at
  before update on public.mosque_shifts
  for each row execute function public.tg_touch_updated_at();

-- ── C. academic_terms — mosque-scoped, normalized (FK target for classes) ────
create table if not exists public.academic_terms (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint academic_terms_date_order check (end_date >= start_date)
);
create unique index if not exists academic_terms_mosque_name_uniq on public.academic_terms(mosque_id, lower(name));
create index        if not exists academic_terms_mosque_idx       on public.academic_terms(mosque_id);

alter table public.academic_terms enable row level security;

-- Owner/admin manage; parents/anon read terms of ACTIVE mosques (parity with
-- the academic_calendar's public-read intent — term dates are parent-facing).
create policy "Owner manages academic terms" on public.academic_terms
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());
create policy "Read terms of active mosques" on public.academic_terms
  for select to anon, authenticated
  using (mosque_id in (select id from public.mosques where status = 'active'));

create trigger academic_terms_touch_updated_at
  before update on public.academic_terms
  for each row execute function public.tg_touch_updated_at();

-- ── D. madrasa_classes.term_id — nullable link to academic_terms ────────────
-- Nullable: classes without a term behave exactly as today. Free-text `term`
-- (068) is left in place; reconciliation is Phase 1/4.
alter table public.madrasa_classes
  add column if not exists term_id uuid references public.academic_terms(id) on delete set null;
create index if not exists madrasa_classes_term_idx on public.madrasa_classes(term_id);

-- ── E. madrasa_class_schedule — normalized class schedule ───────────────────
-- One row per recurring weekly session. teacher_staff_id + room are DENORMALIZED
-- from the class: teacher is needed ON THE ROW for the Phase 1 teacher-clash
-- EXCLUDE (constraints can't span a join) and also enables per-session
-- co-teaching later; mosque_id is denormalized for RLS (068 enrollments do the
-- same). The unique index is the natural key AND makes the backfill idempotent.
create table if not exists public.madrasa_class_schedule (
  id               uuid primary key default gen_random_uuid(),
  mosque_id        uuid not null references public.mosques(id)          on delete cascade,
  class_id         uuid not null references public.madrasa_classes(id)  on delete cascade,
  teacher_staff_id uuid references public.mosque_staff(id)             on delete set null,
  day_of_week      smallint not null,
  start_time       time not null,
  end_time         time not null,
  room             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint madrasa_class_schedule_dow    check (day_of_week between 0 and 6),
  constraint madrasa_class_schedule_time_order check (end_time > start_time)
);
create unique index if not exists madrasa_class_schedule_natural_uniq
  on public.madrasa_class_schedule(class_id, day_of_week, start_time, end_time);
create index if not exists madrasa_class_schedule_mosque_idx  on public.madrasa_class_schedule(mosque_id);
create index if not exists madrasa_class_schedule_class_idx   on public.madrasa_class_schedule(class_id);
create index if not exists madrasa_class_schedule_teacher_idx on public.madrasa_class_schedule(teacher_staff_id);

alter table public.madrasa_class_schedule enable row level security;

-- Mirror madrasa_classes (068): owner/admin manage; sessions of ACTIVE classes
-- are publicly readable (parents browse the timetable to enrol).
create policy "Owner manages class schedule" on public.madrasa_class_schedule
  for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());
create policy "Read schedule of active classes" on public.madrasa_class_schedule
  for select to anon, authenticated
  using (class_id in (select id from public.madrasa_classes where status = 'active'));

create trigger madrasa_class_schedule_touch_updated_at
  before update on public.madrasa_class_schedule
  for each row execute function public.tg_touch_updated_at();

-- ── F. BACKFILL: madrasa_classes.schedule jsonb → madrasa_class_schedule ─────
-- Each { day, start, end } element becomes one row. Day NAME → 0..6 via the
-- first three letters (tolerates "Monday" and legacy "Mon"). day_of_week is
-- NOT NULL, so an UNMAPPABLE day makes the INSERT FAIL LOUDLY rather than drop
-- a session silently. Run the pre-flight probe (checklist below) FIRST so a
-- malformed prod row is caught before apply, not mid-migration.
-- ON CONFLICT DO NOTHING makes this re-runnable and collapses any accidental
-- intra-class duplicate (day,start,end) element to a single session.
insert into public.madrasa_class_schedule
  (mosque_id, class_id, teacher_staff_id, day_of_week, start_time, end_time, room)
select
  c.mosque_id,
  c.id,
  c.teacher_staff_id,
  case lower(left(trim(e->>'day'), 3))
    when 'mon' then 0 when 'tue' then 1 when 'wed' then 2 when 'thu' then 3
    when 'fri' then 4 when 'sat' then 5 when 'sun' then 6
  end as day_of_week,
  (e->>'start')::time,
  (e->>'end')::time,
  c.room
from public.madrasa_classes c
cross join lateral jsonb_array_elements(c.schedule) e
where jsonb_typeof(c.schedule) = 'array'
  and jsonb_array_length(c.schedule) > 0
on conflict (class_id, day_of_week, start_time, end_time) do nothing;

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first, verify, then prod through Shiraz, verify, hash):
--
-- 0. PRE-FLIGHT (run BEFORE applying, on the target DB — catches data that
--    would make the backfill fail; expect 0 rows on both):
--      select c.id, e->>'day' d, e->>'start' s, e->>'end' en
--        from public.madrasa_classes c
--        cross join lateral jsonb_array_elements(c.schedule) e
--       where lower(left(trim(e->>'day'),3)) not in ('mon','tue','wed','thu','fri','sat','sun')
--          or coalesce(e->>'start','') = '' or coalesce(e->>'end','') = ''
--          or (e->>'end')::time <= (e->>'start')::time;
--
-- 1. Apply this file.
--
-- 2. STRUCTURE probes (expect the rows noted):
--      -- 3 new tables exist
--      select table_name from information_schema.tables
--        where table_schema='public'
--          and table_name in ('mosque_shifts','academic_terms','madrasa_class_schedule');   -- 3 rows
--      -- term_id added
--      select column_name from information_schema.columns
--        where table_name='madrasa_classes' and column_name='term_id';                       -- 1 row
--      -- RLS policy counts: mosque_shifts 3, academic_terms 2, madrasa_class_schedule 2
--      select tablename, count(*) from pg_policies
--        where tablename in ('mosque_shifts','academic_terms','madrasa_class_schedule')
--        group by tablename order by tablename;
--
-- 3. BACKFILL VERIFICATION — every jsonb session lands as exactly one row,
--    counts match, nothing lost or duplicated:
--
--    (a) Global count: sessions == DISTINCT jsonb schedule tuples.
--      with elems as (
--        select distinct c.id class_id,
--               lower(left(trim(e->>'day'),3)) d, (e->>'start')::time s, (e->>'end')::time en
--          from public.madrasa_classes c
--          cross join lateral jsonb_array_elements(c.schedule) e
--         where jsonb_typeof(c.schedule)='array')
--      select (select count(*) from elems)                     as distinct_jsonb_sessions,
--             (select count(*) from public.madrasa_class_schedule) as session_rows;   -- must be EQUAL
--             -- dev expectation: 2 and 2.
--
--    (b) Per-class parity + duplicate exposure (raw element count vs distinct
--        vs rows). raw>distinct flags a class that had duplicate schedule
--        entries (collapsed, not lost — visible, not silent). rows must equal
--        distinct for every class:
--      select c.id,
--             jsonb_array_length(c.schedule)                             as raw_elems,
--             count(distinct (lower(left(trim(e->>'day'),3)), (e->>'start')::time, (e->>'end')::time)) as distinct_elems,
--             (select count(*) from public.madrasa_class_schedule s where s.class_id=c.id) as rows
--        from public.madrasa_classes c
--        cross join lateral jsonb_array_elements(c.schedule) e
--       where jsonb_typeof(c.schedule)='array' and jsonb_array_length(c.schedule)>0
--       group by c.id
--      having (select count(*) from public.madrasa_class_schedule s where s.class_id=c.id)
--             <> count(distinct (lower(left(trim(e->>'day'),3)), (e->>'start')::time, (e->>'end')::time));
--      -- MUST return 0 rows (no class where rows != distinct elements).
--
--    (c) Fidelity spot-check: day/time/teacher/room round-trip per session.
--      select s.class_id, s.day_of_week, s.start_time, s.end_time, s.room, s.teacher_staff_id
--        from public.madrasa_class_schedule s order by s.class_id, s.day_of_week;
--
-- 4. NOTIFY included above. Hard-refresh PostgREST if probing via the API.
--
-- 5. HASH: the only function here is the trigger tg_touch_updated_at. After dev
--    apply, record md5(prosrc) and match it on prod:
--      select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--        where n.nspname='public' and p.proname='tg_touch_updated_at';
-- ============================================================================

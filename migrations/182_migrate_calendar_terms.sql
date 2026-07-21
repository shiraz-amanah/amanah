-- 182_migrate_calendar_terms.sql — Workforce/Timetable rebuild, PHASE 1
-- ============================================================================
-- Term-migration per the locked direction: academic_terms is the single source
-- of truth for terms. This moves existing mosques.academic_calendar (094)
-- entries of type='term' INTO academic_terms. INSERT ONLY — it does NOT strip
-- the calendar (that is 183, gated on the app deploy that stops the calendar
-- editor treating 'term' as authoritative; stripping earlier would race the
-- still-live editor re-adding terms).
--
-- Idempotent: ON CONFLICT on the (mosque_id, lower(name)) unique index (180) →
-- re-run is a no-op, and two calendar entries with the same term name for one
-- mosque collapse to one row (parity check accounts for this).
--
-- Dev is a NO-OP (0 mosques have academic_calendar set) — it proves clean
-- execution; prod is where real terms move. Hence the prod pre-flight STOP.
-- ============================================================================

insert into public.academic_terms (mosque_id, name, start_date, end_date)
select m.id,
       e->>'name',
       (e->>'start_date')::date,
       (e->>'end_date')::date
  from public.mosques m
  cross join lateral jsonb_array_elements(m.academic_calendar) e
 where m.academic_calendar is not null
   and jsonb_typeof(m.academic_calendar) = 'array'
   and e->>'type' = 'term'
on conflict (mosque_id, lower(name)) do nothing;

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first, then prod through Shiraz):
--
-- 0. PRE-FLIGHT STOP (run BEFORE applying, on the target DB). Malformed term
--    entries would fail the ::date casts or the date-order CHECK (180). Expect
--    0 rows; a hit STOPS the apply (fix the calendar entry first):
--      select m.id, e->>'name' nm, e->>'start_date' sd, e->>'end_date' ed
--        from public.mosques m
--        cross join lateral jsonb_array_elements(m.academic_calendar) e
--       where m.academic_calendar is not null and e->>'type' = 'term'
--         and (coalesce(e->>'name','') = '' or coalesce(e->>'start_date','') = ''
--              or coalesce(e->>'end_date','') = ''
--              or (e->>'end_date')::date < (e->>'start_date')::date);   -- 0 rows
--
-- 1. Apply this file.
--
-- 2. PARITY — distinct calendar terms == academic_terms rows. Valid because
--    academic_terms was created empty (180) and term CRUD is not live yet, so
--    every row here came from the calendar. (dev: 0 == 0.)
--      with cal as (
--        select distinct m.id mosque_id, lower(e->>'name') nm
--          from public.mosques m
--          cross join lateral jsonb_array_elements(m.academic_calendar) e
--         where m.academic_calendar is not null and e->>'type' = 'term')
--      select (select count(*) from cal)                       as distinct_calendar_terms,
--             (select count(*) from public.academic_terms)     as academic_terms_rows;  -- EQUAL
--
-- 3. SPOT-CHECK the migrated rows:
--      select mosque_id, name, start_date, end_date from public.academic_terms
--        order by mosque_id, start_date;
--
-- 4. NOTIFY included. No function objects → no hash.
--
-- NOTE: the calendar still HOLDS its term entries after this — that is
-- intentional. 183 strips them, but only AFTER the app deploy removes 'term'
-- from the calendar editor and repoints term display to academic_terms.
-- ============================================================================

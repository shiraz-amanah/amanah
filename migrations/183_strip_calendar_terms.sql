-- 183_strip_calendar_terms.sql — Workforce/Timetable rebuild, PHASE 1 (GATED)
-- ============================================================================
-- Final step of the term-migration: remove type='term' entries from
-- mosques.academic_calendar, so terms live ONLY in academic_terms and the
-- parent-facing calendar no longer double-shows them. The calendar keeps
-- holiday / exam / report_deadline events untouched.
--
-- ⚠️ GATED — DO NOT APPLY until the Phase 1 app deploy is LIVE, specifically:
--     (a) the MadrasaAcademicCalendar editor no longer offers 'term' as a type
--         (so it cannot re-add a term entry after the strip), AND
--     (b) term display has been repointed to academic_terms (so stripping the
--         calendar's term entries removes no visible information).
-- Applying before (a) races the live editor; before (b) blanks the term display
-- until the app catches up. 182 (insert) must also be prod-verified first.
--
-- Idempotent: only touches calendars that still contain a term entry; re-run is
-- a no-op. Empty-after-strip calendars become '[]' (not null) — the app already
-- treats a non-array as [], so either is safe; '[]' reads as "managed, no
-- events left" rather than "never configured".
-- ============================================================================

update public.mosques m
   set academic_calendar = coalesce(
         (select jsonb_agg(e)
            from jsonb_array_elements(m.academic_calendar) e
           where e->>'type' <> 'term'),
         '[]'::jsonb)
 where m.academic_calendar is not null
   and jsonb_typeof(m.academic_calendar) = 'array'
   and exists (select 1 from jsonb_array_elements(m.academic_calendar) e
                where e->>'type' = 'term');

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first, then prod through Shiraz — AFTER app deploy):
--
-- 1. Apply this file.
--
-- 2. VERIFY no term entries remain in any calendar (expect 0):
--      select count(*)::int as remaining_calendar_terms
--        from public.mosques m
--        cross join lateral jsonb_array_elements(m.academic_calendar) e
--       where m.academic_calendar is not null and e->>'type' = 'term';
--
-- 3. VERIFY non-term events preserved — the calendar still holds its
--    holiday/exam/report_deadline entries (compare against a count taken before
--    the strip; the strip must not have dropped any non-term event):
--      select e->>'type' as type, count(*)::int n
--        from public.mosques m
--        cross join lateral jsonb_array_elements(m.academic_calendar) e
--       where m.academic_calendar is not null group by 1 order by 1;
--
-- 4. NOTIFY included. No function objects → no hash.
-- ============================================================================

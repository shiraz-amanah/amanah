-- 094_mosque_academic_calendar.sql
-- ====================================================================
-- Madrasah academic calendar — term dates, half-terms, holidays, exam periods
-- and report deadlines for the academic year. A single jsonb column on mosques
-- (an array of events); no separate table needed.
--
-- Shape (client-managed): academic_calendar = [
--   { name: text, start_date: 'YYYY-MM-DD', end_date: 'YYYY-MM-DD',
--     type: 'term' | 'holiday' | 'exam' | 'report_deadline' }
-- ]
-- end_date may equal start_date for single-day events (e.g. Eid, a deadline).
--
-- Reads ride on the existing mosques RLS (public-read on active mosques → parents
-- see term/holiday dates on the public profile; owner-write via the whitelisted
-- updateMosqueProfile, which 094's app code extends to include this column).
-- The timetable feature needs NO schema change — madrasa_classes.schedule
-- (068, jsonb [{day,start,end}]) already holds session times.
-- ====================================================================

alter table public.mosques add column if not exists academic_calendar jsonb;  -- [{name,start_date,end_date,type}]

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW row):
--        select column_name from information_schema.columns
--          where table_name='mosques' and column_name='academic_calendar';   -- 1 row
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

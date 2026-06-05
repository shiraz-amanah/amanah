-- 067_mosque_staff_portal_access.sql
-- ====================================================================
-- Session W — staff portal access level, set by the mosque admin when they
-- APPROVE a completed onboarding (before sending the Amanah invite). Gates
-- which tabs the staff member sees in their portal.
--
--   rota                       → Dashboard + My Rota
--   rota_timesheets            → + My Timesheets
--   rota_timesheets_messages   → + Messages
--   full                       → + My Profile (everything)
--
-- NULL = legacy / not-yet-approved; the portal treats NULL as "full" so
-- existing active staff are unaffected. Inherits mosque_staff RLS (owner
-- updates; staff read their own row, so the portal can read its own level).
-- ====================================================================

alter table public.mosque_staff
  add column if not exists portal_access text
    check (portal_access in ('rota', 'rota_timesheets', 'rota_timesheets_messages', 'full'));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        select column_name, data_type from information_schema.columns
--          where table_name = 'mosque_staff' and column_name = 'portal_access';
--      and confirm the CHECK:
--        select conname from pg_constraint
--          where conrelid = 'public.mosque_staff'::regclass
--            and conname like '%portal_access%';
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

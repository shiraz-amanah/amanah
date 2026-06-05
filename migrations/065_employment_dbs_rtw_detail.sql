-- 065_employment_dbs_rtw_detail.sql
-- ====================================================================
-- Session W — DBS + RTW detail fields for the onboarding wizard and the
-- HR tab. These are identity-document fields (ID numbers, share codes,
-- uCheck references) — sensitive PII — so they live on the OWNER-ONLY
-- mosque_staff_employment table (060), NOT on the broadly-readable
-- mosque_staff. The lightweight status fields used for badges/alerts
-- (dbs_status, dbs_expiry_date) stay on mosque_staff; this is the
-- private detail behind them.
--
-- Document FILES (the actual certificate/RTW PDF) live in the private
-- mosque-hr-docs bucket (064) and are tracked in mosque_documents (063);
-- these columns are the structured metadata.
-- ====================================================================

alter table public.mosque_staff_employment
  -- DBS detail
  add column if not exists dbs_check_type          text,  -- basic / standard / enhanced / enhanced_barred
  add column if not exists dbs_workforce_type       text,  -- child / adult / other
  add column if not exists dbs_id_document_type      text,
  add column if not exists dbs_id_document_number    text,
  add column if not exists dbs_ucheck_reference      text,
  add column if not exists dbs_certificate_number    text,
  add column if not exists dbs_result_date           date,
  add column if not exists dbs_checked_by            text,
  -- RTW detail
  add column if not exists rtw_check_type            text,  -- manual / share_code / online
  add column if not exists rtw_document_type         text,
  add column if not exists rtw_document_number       text,
  add column if not exists rtw_share_code            text,
  add column if not exists rtw_check_date            date,
  add column if not exists rtw_expiry_date           date,
  add column if not exists rtw_checked_by            text;

-- No RLS change: mosque_staff_employment is already owner+admin only
-- (060), with no staff-self and no anon access. These columns inherit it.

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        select column_name from information_schema.columns
--          where table_name = 'mosque_staff_employment'
--            and (column_name like 'dbs_%' or column_name like 'rtw_%')
--          order by column_name;
--      (expect the 15 new columns)
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

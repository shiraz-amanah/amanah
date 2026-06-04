-- 049_mosque_profile_fields.sql — Session U Day 1
--
-- Additive profile columns on public.mosques. Everything else the Session U
-- brief listed ALREADY EXISTS and is reused (verified against the live schema):
--   about         -> existing `description` (text)
--   prayer_times  -> already jsonb
--   jumuah_time   -> already text
--   phone         -> already text
--   address       -> already text (editable)
--   facilities    -> already text[] (kept as text[] of enabled keys, per Q1;
--                    NOT converted to jsonb)
--   photo_url     -> existing single image, kept as the hero image
--
-- Only the genuinely-missing fields are added here. ADD COLUMN IF NOT EXISTS
-- throughout so this is safe to re-run and tolerant of dev/prod drift.

alter table public.mosques
  add column if not exists jumuah_language text,
  add column if not exists donation_url    text,
  add column if not exists website_url     text,
  add column if not exists logo_url        text,
  add column if not exists photos          text[] not null default '{}';

-- APPLY CHECKLIST (dev first, then prod via SQL editor):
--   1. Run this file.
--   2. NOTIFY pgrst, 'reload schema';
--   3. Probe: select column_name from information_schema.columns
--        where table_name='mosques'
--          and column_name in ('jumuah_language','donation_url','website_url','logo_url','photos');
--      Expect 5 rows.
--   4. Hard-refresh the app.

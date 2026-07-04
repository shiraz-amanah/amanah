-- 114_madrasa_class_has_hifz.sql
-- ====================================================================
-- Per-class Hifz toggle. A class opts INTO Qur'an-memorisation tracking; when off,
-- the workspace hides the Hifz tab, the class heatmap, and the per-student Hifz bar.
--
-- New column defaults to false, so a one-time backfill flips existing Hifz classes
-- to true — otherwise they'd silently lose their Hifz tab on deploy. A class counts
-- as a Hifz class if EITHER:
--   * it already has Hifz progress logged (table is madrasa_hifz_progress — the
--     spec's "madrasa_hifz" name is wrong), OR
--   * its subject is 'hifz' (an explicit Hifz class, even with no entries yet).
-- The subject='hifz' arm is an addition to the spec (which only mentioned logged
-- entries) — remove it if you'd rather backfill strictly on existing data.
-- ====================================================================

alter table public.madrasa_classes
  add column if not exists has_hifz boolean not null default false;

-- One-time backfill (idempotent: only touches rows still at the false default).
update public.madrasa_classes
   set has_hifz = true
 where has_hifz = false
   and (subject = 'hifz'
        or id in (select distinct class_id from public.madrasa_hifz_progress));

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        -- column exists, correct type/default/not-null
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'madrasa_classes' and column_name = 'has_hifz';        -- 1 row: boolean, NO, false
--        -- backfill sanity: how many classes are now Hifz, and do they line up with
--        -- logged entries + subject='hifz'?
--        select count(*) filter (where has_hifz) as hifz_classes,
--               count(*)                          as total_classes
--          from public.madrasa_classes;
--        -- every class with logged hifz OR subject='hifz' must now be true (expect 0):
--        select count(*) from public.madrasa_classes c
--          where c.has_hifz = false
--            and (c.subject = 'hifz'
--                 or c.id in (select distinct class_id from public.madrasa_hifz_progress));
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

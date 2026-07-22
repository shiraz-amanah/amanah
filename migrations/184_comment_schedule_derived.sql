-- 184_comment_schedule_derived.sql — Workforce/Timetable rebuild, PHASE 1
-- ============================================================================
-- Marks madrasa_classes.schedule (068, jsonb) as a DERIVED MIRROR now that
-- madrasa_class_schedule (180) is the normalized source of truth. The class
-- editor regenerates this jsonb from the rows on every save (via 185); nothing
-- should write it directly. Kept only so legacy readers (MadrasaTimetable, the
-- class list/workspace summaries) keep working until Phase 4 migrates them and
-- drops the column. Pairs with the matching note in the editor code.
-- Comment-only — no data or structure change.
-- ============================================================================

comment on column public.madrasa_classes.schedule is
  'DERIVED MIRROR — do not write directly. Source of truth: madrasa_class_schedule (180). Regenerated from those rows on every class save via madrasa_set_class_schedule (185). Retained only for legacy readers until Phase 4 drops it.';

notify pgrst, 'reload schema';

-- ============================================================================
-- APPLY CHECKLIST (dev first, then prod through Shiraz):
--   1. Apply this file.
--   2. Verify the comment is set:
--        select col_description('public.madrasa_classes'::regclass,
--          (select attnum from pg_attribute
--            where attrelid='public.madrasa_classes'::regclass and attname='schedule'));
--   3. NOTIFY included. No function objects → no hash.
-- ============================================================================

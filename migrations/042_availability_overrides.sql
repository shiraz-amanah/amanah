-- Migration 042: per-date availability overrides for scholars
-- Override shape (jsonb array), date always "YYYY-MM-DD":
--   Block one day:   { "date": "2026-06-20", "blocked": true }
--   Custom hours:    { "date": "2026-06-20", "start": "09:00", "end": "12:00" }
-- Overrides layer on top of the weekly recurring pattern (migration 039): a
-- blocked date hides all slots; a custom-hours date replaces that day's weekly
-- windows; absent → fall back to the weekly pattern. The booking slot picker and
-- the scholar month-view calendar both read this column.
--
-- NOT yet applied — surfaced for approval. Apply in Supabase (dev then prod).
--
-- RLS note: same reasoning as migration 039 — there is NO scholar self-UPDATE
-- policy on `scholars` (a broad one can't be column-scoped and would allow
-- privilege escalation onto dbs_verified / status / rating). So writes go through
-- a SECURITY DEFINER function that touches ONLY availability_overrides, and only
-- for the caller's own row (user_id = auth.uid()).

ALTER TABLE public.scholars
  ADD COLUMN IF NOT EXISTS availability_overrides jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.update_scholar_availability_overrides(p_overrides jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.scholars
     SET availability_overrides = COALESCE(p_overrides, '[]'::jsonb)
   WHERE user_id = auth.uid();
END;
$$;

-- Only signed-in users can call it; anon would no-op anyway (auth.uid() null).
REVOKE ALL ON FUNCTION public.update_scholar_availability_overrides(jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.update_scholar_availability_overrides(jsonb) TO authenticated;

-- Verify after apply (read the rows, don't trust the Success banner):
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'scholars' AND column_name = 'availability_overrides';
-- SELECT routine_name, security_type FROM information_schema.routines
--   WHERE routine_name = 'update_scholar_availability_overrides';

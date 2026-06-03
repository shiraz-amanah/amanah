-- Migration 043: scholar_applications columns for the rebuilt onboarding wizard
-- (5-step: Profile → Packages → Credentials → DBS → Payment).
--
-- NOT yet applied — surfaced for approval. Apply in Supabase (dev then prod).
--
-- Columns as specified in the wizard brief:
--   ijazah_doc_url / ijazah_doc_name   — uploaded ijazah/sanad (private bucket path)
--   dbs_option                         — 'new' (needs a check) | 'existing' (has one)
--   existing_dbs_url/_number/_date     — Option B: uploaded cert + its details
--   legal_name, date_of_birth,
--   national_insurance, id_document_type,
--   previous_names, address_history    — Option A: uCheck identity fields
--
-- ADDED beyond the brief's column list (flagged for review) so the wizard never
-- silently drops user-entered data — the brief's "Data submission" section and
-- Step 1/Step 3 collect these but its column list omitted them:
--   title           — Step 1 required headline; also copied to scholars.title on
--                     approval (a required, card-facing field — must persist).
--   specialties     — Step 3 specialty tags.
--   qualification_doc_url / _name — Step 3's second "Other qualifications" upload
--                     (the brief only named ijazah_doc_* — one column pair for two
--                     distinct uploads would clobber one).

ALTER TABLE public.scholar_applications
  ADD COLUMN IF NOT EXISTS ijazah_doc_url text,
  ADD COLUMN IF NOT EXISTS ijazah_doc_name text,
  ADD COLUMN IF NOT EXISTS dbs_option text CHECK (dbs_option IN ('new', 'existing')),
  ADD COLUMN IF NOT EXISTS existing_dbs_url text,
  ADD COLUMN IF NOT EXISTS existing_dbs_number text,
  ADD COLUMN IF NOT EXISTS existing_dbs_date text,
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS date_of_birth text,
  ADD COLUMN IF NOT EXISTS national_insurance text,
  ADD COLUMN IF NOT EXISTS id_document_type text,
  ADD COLUMN IF NOT EXISTS previous_names text,
  ADD COLUMN IF NOT EXISTS address_history jsonb DEFAULT '[]'::jsonb,
  -- added beyond the brief (see header)
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS specialties text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS qualification_doc_url text,
  ADD COLUMN IF NOT EXISTS qualification_doc_name text;

-- ============================================================================
-- Supabase Storage buckets — create MANUALLY (CC cannot create buckets):
--   Dashboard → Storage → New bucket
--     1. name: credentials        Public: OFF (private)  — ijazah/qualification docs
--     2. name: dbs-certificates   Public: OFF (private)  — existing DBS certificates
--   Both PRIVATE — sensitive documents. The app stores the object PATH in the
--   *_url columns and serves them to admins via short-lived signed URLs
--   (createSignedUrl), never public URLs. RLS for authenticated INSERT scoped to
--   {bucket}/{auth.uid()}/* should be added in a follow-up migration mirroring
--   041_avatars_storage_rls.sql (TODO — buckets work for the owner without it
--   under default policies, but admin signed-URL reads need a SELECT policy).
-- ============================================================================

-- Verify after apply (read the rows, don't trust the Success banner):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'scholar_applications'
--   ORDER BY ordinal_position;

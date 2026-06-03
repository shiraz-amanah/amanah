-- Migration 044: storage RLS for the private `credentials` + `dbs-certificates`
-- buckets (scholar onboarding ijazah/qualification docs + DBS certificates).
--
-- NOT yet applied — surfaced for approval. The policies were authored in the
-- Supabase Storage → Policies UI; this file is the source-of-truth record (the
-- follow-up promised in 043's header, mirroring 041). Apply via the dashboard or
-- by running this SQL in the editor (dev then prod).
--
-- Both buckets are PRIVATE (no Public flag) — no anonymous read at all. RLS on
-- storage.objects is on by default with NO policies for a new bucket, so until
-- these exist EVERYTHING is blocked for authenticated users — including the
-- wizard's own uploads (the INSERT policy is load-bearing, not just admin reads).
--
-- Docs are written to:  {bucket}/{auth.uid()}/{timestamp}.{ext}
-- (see src/lib/storage.js uploadPrivateDoc — NO 'scholars/' prefix, unlike the
-- avatars bucket, so the owner's id is the FIRST folder segment).
--
-- storage.foldername('<uid>/123.pdf') => {<uid>}  (1-indexed)
--   [1] = the owner's auth.uid()
--
-- Admin check uses public.is_admin() (migration 017) — the SECURITY DEFINER
-- helper every other admin RLS policy uses (019, 022, 028). It avoids the
-- profiles-RLS recursion/visibility pitfalls of an inline
-- `(select role from profiles where id = auth.uid()) = 'admin'` subquery.
--
-- Each bucket gets 4 policies: owner INSERT, owner SELECT, admin SELECT (so
-- admins can mint signed URLs to review submissions), admin DELETE.

-- ============================ credentials ============================

-- INSERT — a scholar may upload only into their own folder.
drop policy if exists "credentials: authenticated upload own folder" on storage.objects;
create policy "credentials: authenticated upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT — owner reads their own files.
drop policy if exists "credentials: authenticated read own folder" on storage.objects;
create policy "credentials: authenticated read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'credentials'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT — admins read all (signed-URL review in the admin panel).
drop policy if exists "credentials: admin read all" on storage.objects;
create policy "credentials: admin read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'credentials'
    and public.is_admin()
  );

-- DELETE — admins may remove documents.
drop policy if exists "credentials: admin delete" on storage.objects;
create policy "credentials: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'credentials'
    and public.is_admin()
  );

-- ========================= dbs-certificates =========================

-- INSERT — a scholar may upload only into their own folder.
drop policy if exists "dbs-certificates: authenticated upload own folder" on storage.objects;
create policy "dbs-certificates: authenticated upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'dbs-certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT — owner reads their own files.
drop policy if exists "dbs-certificates: authenticated read own folder" on storage.objects;
create policy "dbs-certificates: authenticated read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dbs-certificates'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT — admins read all (signed-URL review in the admin panel).
drop policy if exists "dbs-certificates: admin read all" on storage.objects;
create policy "dbs-certificates: admin read all"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'dbs-certificates'
    and public.is_admin()
  );

-- DELETE — admins may remove documents.
drop policy if exists "dbs-certificates: admin delete" on storage.objects;
create policy "dbs-certificates: admin delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'dbs-certificates'
    and public.is_admin()
  );

-- Verify after apply (expect the eight policy rows above):
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND (policyname LIKE 'credentials:%' OR policyname LIKE 'dbs-certificates:%')
--    ORDER BY policyname;

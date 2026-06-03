-- Migration 041: storage RLS for the public `avatars` bucket
--
-- NOT yet applied — surfaced for approval. Apply in Supabase (dev then prod).
--
-- The `avatars` bucket is Public, which only grants anonymous READ. RLS on
-- storage.objects is on by default and has NO policies for this bucket, so
-- authenticated uploads (INSERT) are blocked — the cause of the
-- "Couldn't upload your photo" error on profile save.
--
-- Scholar photos are written to:  avatars/scholars/{auth.uid()}/{timestamp}.{ext}
-- (see src/lib/storage.js — the folder is the AUTHENTICATED USER id, not the
-- scholars-row id, so these per-user-folder policies can scope it).
--
-- storage.foldername('scholars/<uid>/123.jpg') => {scholars, <uid>}  (1-indexed)
--   [1] = 'scholars'   [2] = the owner's auth.uid()

-- INSERT — a scholar may upload only into their own folder.
drop policy if exists "avatars: authenticated upload own folder" on storage.objects;
create policy "avatars: authenticated upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'scholars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- UPDATE — re-upload / overwrite within their own folder.
drop policy if exists "avatars: authenticated update own folder" on storage.objects;
create policy "avatars: authenticated update own folder"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'scholars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- DELETE — replace an old photo within their own folder.
drop policy if exists "avatars: authenticated delete own folder" on storage.objects;
create policy "avatars: authenticated delete own folder"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'scholars'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- SELECT — public read. The bucket's Public flag already serves objects, but an
-- explicit policy keeps this portable (and survives the bucket being flipped
-- private later).
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read"
  on storage.objects for select to public
  using ( bucket_id = 'avatars' );

-- Verify after apply (expect the four policy rows above):
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'storage' AND tablename = 'objects'
--      AND policyname LIKE 'avatars:%';

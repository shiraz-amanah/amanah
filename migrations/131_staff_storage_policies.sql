-- 131_staff_storage_policies.sql
-- ====================================================================
-- Session RBAC-C — RLS policies for the PRIVATE `staff-documents` bucket.
-- MANUAL step — apply via Supabase Storage → Policies (or run here against
-- storage.objects). NOT part of the table migration (131_staff_storage_timesheets).
-- Apply AFTER the bucket exists, on BOTH dev + prod.
--
-- Path layout: {mosque_id}/{staff_id}/{doc_type}/{filename}
--   storage.foldername(name) -> [1]=mosque_id, [2]=staff_id, [3]=doc_type
--   doc_type ∈ rtw | dbs | contracts | training | ijazah | other
-- ====================================================================

-- 1) Owner can upload to their own mosque's folders
create policy "staff-docs owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 2) Owner can read their own mosque's files
create policy "staff-docs owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 3) Employee can read their own files (folder [2] = their staff_id)
create policy "staff-docs employee read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[2] in (
      select id::text from public.mosque_staff where profile_id = auth.uid()));

-- 4) Owner can delete their own mosque's files
create policy "staff-docs owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 5) Admin can read all
create policy "staff-docs admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-documents' and public.is_admin());

-- 6) [FIX 2 + tightening] Employee can upload their OWN signed contract only —
--    scoped to the contracts/ subfolder AND their own staff folder, with the
--    mosque_id path segment [1] tied to that staff row's actual mosque_id (so a
--    signed-in staff member can't write under an arbitrary mosque prefix).
create policy "staff-docs employee upload signed contract" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[3] = 'contracts'
    and (storage.foldername(name))[2] in (
      select id::text from public.mosque_staff
      where profile_id = auth.uid()
        and mosque_id::text = (storage.foldername(name))[1]));

-- Probe after applying:
--   select policyname, cmd from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'staff-docs%' order by policyname;   -- expect 6

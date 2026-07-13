-- 135_staff_documents_bucket.sql
-- ====================================================================
-- Session RBAC-D — CREATE the staff-documents bucket that migration 131
-- ASSUMED but never created. 131 left bucket creation as a manual dashboard
-- step ("Create the staff-documents bucket (both projects)"), which was never
-- done on dev OR prod — so every RBAC-C document upload (StaffProfile RTW/DBS/
-- ijazah/training/documents + the signed-contract PDF) has failed at runtime
-- with "Bucket not found" since RBAC-C shipped. The 131 policy probes passed
-- because a storage.objects policy referencing bucket_id='staff-documents' is
-- valid SQL whether or not the bucket exists — the bucket itself was never
-- probed. This migration makes the bucket a SQL-applied, probeable artifact.
--
-- Also bakes in file_size_limit + allowed_mime_types AT CREATION: for the RBAC-D
-- token-auth upload (api/onboarding-upload.js) the bytes bypass our function, so
-- the bucket config is the ONLY server-side size/type control on a signed-upload
-- URL (Supabase enforces bucket restrictions on signed-URL uploads exactly as on
-- authenticated uploads).
--
-- Idempotent throughout: on conflict updates the limits; every policy is
-- drop-if-exists then create (131's 6 policies may or may not already be
-- present, depending on how far the manual RBAC-C apply got).
-- ====================================================================

-- 1) The bucket. 10MB, private, PDF/JPG/PNG only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-documents', 'staff-documents', false,
  10485760,  -- 10 MB
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/jpeg','image/png','application/pdf'];

-- 2) The 6 storage-object policies (verbatim from 131_staff_storage_policies.sql,
--    now idempotent). Path layout {mosque_id}/{staff_id}/{doc_type}/{file}:
--    foldername(name) -> [1]=mosque_id, [2]=staff_id, [3]=doc_type.

-- 1/6) Owner can upload to their own mosque's folders
drop policy if exists "staff-docs owner upload" on storage.objects;
create policy "staff-docs owner upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 2/6) Owner can read their own mosque's files
drop policy if exists "staff-docs owner read" on storage.objects;
create policy "staff-docs owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 3/6) Employee can read their own files (folder [2] = their staff_id)
drop policy if exists "staff-docs employee read own" on storage.objects;
create policy "staff-docs employee read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[2] in (
      select id::text from public.mosque_staff where profile_id = auth.uid()));

-- 4/6) Owner can delete their own mosque's files
drop policy if exists "staff-docs owner delete" on storage.objects;
create policy "staff-docs owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[1] in (
      select id::text from public.mosques where user_id = auth.uid()));

-- 5/6) Admin can read all
drop policy if exists "staff-docs admin read" on storage.objects;
create policy "staff-docs admin read" on storage.objects
  for select to authenticated
  using (bucket_id = 'staff-documents' and public.is_admin());

-- 6/6) [TIGHTENED — late RBAC-C] Employee can upload their OWN signed contract
--    only — scoped to the contracts/ subfolder AND their own staff folder, with
--    the mosque_id segment [1] tied to that staff row's ACTUAL mosque_id (so a
--    signed-in staff member can't write under an arbitrary mosque prefix).
drop policy if exists "staff-docs employee upload signed contract" on storage.objects;
create policy "staff-docs employee upload signed contract" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-documents'
    and (storage.foldername(name))[3] = 'contracts'
    and (storage.foldername(name))[2] in (
      select id::text from public.mosque_staff
      where profile_id = auth.uid()
        and mosque_id::text = (storage.foldername(name))[1]));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod — via the Supabase SQL editor):
--   1. Run this whole file.
--   2. RAW probes (read the rows — do NOT trust the Success banner):
--
--   -- a) the bucket now EXISTS with the limits (this is the probe 131 never ran)
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'staff-documents';   -- 1 row, public=false,
--                                                           -- 10485760, {jpeg,png,pdf}
--
--   -- b) all 6 policies present
--   select policyname, cmd from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'staff-docs%'
--     order by policyname;   -- expect 6
-- ====================================================================

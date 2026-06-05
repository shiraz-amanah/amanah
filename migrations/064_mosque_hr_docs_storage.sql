-- 064_mosque_hr_docs_storage.sql
-- ====================================================================
-- Session W — PRIVATE storage bucket for sensitive HR / safeguarding /
-- compliance documents (DBS certificates, RTW documents, policies,
-- insurance certs, training certs). File bytes for the mosque_documents
-- table (migration 063) and the per-staff DBS/RTW/training uploads.
--
-- PRIVATE (public=false): NO anon read, NO public URL. Reads go through
-- signed URLs minted by the owner's session. Same path convention as the
-- public mosque buckets — first segment is the mosque id — but read is
-- gated to the owner (+ platform admin), NEVER staff, NEVER public.
--
-- PATH CONVENTION (load-bearing for owner-write):
--   <mosque_id>/<subpath>/<filename>   e.g. "a1b2.../dbs/cert.pdf"
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('mosque-hr-docs', 'mosque-hr-docs', false)
on conflict (id) do nothing;

-- Owner (or platform admin) read. Private bucket → no anon, no public.
-- foldername(name) computed at OUTER level (see 053 note: `mosques.name`
-- would shadow the object path inside the subquery and deny every read).
create policy "mosque hr docs owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mosque-hr-docs'
    and (
      (storage.foldername(name))[1] in (
        select m.id::text from public.mosques m where m.user_id = auth.uid()
      )
      or public.is_admin()
    )
  );

create policy "mosque hr docs owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mosque-hr-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "mosque hr docs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'mosque-hr-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "mosque hr docs owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'mosque-hr-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in Supabase SQL editor.
--   2. Probe (RAW rows):
--        select id, public from storage.buckets where id = 'mosque-hr-docs';
--          (expect 1 row, public=false)
--        select policyname from pg_policies
--          where tablename = 'objects' and policyname like 'mosque hr docs%';
--          (expect 4)
--      As an anon session: a public-URL fetch of any object must 400/403.
--   3. storage.objects already has RLS enabled by Supabase — do NOT re-enable.
-- ====================================================================

-- 107_governance_docs_storage.sql
-- ====================================================================
-- Session BB P3 — PRIVATE storage bucket for governance documents
-- (constitution, charity registration, annual accounts, governing documents).
-- File bytes for the governance_documents table (106). Modelled exactly on
-- 064 (mosque-hr-docs): private, owner-or-admin read via signed URLs, owner
-- write, path keyed on the mosque id.
--
-- PATH CONVENTION (load-bearing for owner-write):
--   <mosque_id>/<filename>   e.g. "a1b2.../constitution-1720000000.pdf"
-- ====================================================================

insert into storage.buckets (id, name, public)
values ('governance-docs', 'governance-docs', false)
on conflict (id) do nothing;

create policy "governance docs owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'governance-docs'
    and (
      (storage.foldername(name))[1] in (
        select m.id::text from public.mosques m where m.user_id = auth.uid()
      )
      or public.is_admin()
    )
  );

create policy "governance docs owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'governance-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "governance docs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'governance-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "governance docs owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'governance-docs'
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe (RAW rows):
--        select id, public from storage.buckets where id='governance-docs';        -- 1 row, public=false
--        select policyname from pg_policies
--          where tablename='objects' and policyname like 'governance docs%';         -- 4 rows
--   3. storage.objects already has RLS enabled by Supabase — do NOT re-enable.
-- ====================================================================

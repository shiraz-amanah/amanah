-- 053_mosque_storage.sql — Session U Day 1
--
-- Storage buckets for mosque media + RLS. Two PUBLIC buckets (public profile
-- needs logos/photos unauthenticated):
--   mosque-logos   — single logo per mosque
--   mosque-photos  — gallery, up to 10 per mosque
--
-- PATH CONVENTION (load-bearing for the owner-write policy):
--   <mosque_id>/<filename>          e.g. "a1b2.../logo.png", "a1b2.../g3.jpg"
-- The first path segment is the mosque id; owner-write ties it to
-- mosques.user_id via storage.foldername(name)[1].

insert into storage.buckets (id, name, public)
values ('mosque-logos',  'mosque-logos',  true),
       ('mosque-photos', 'mosque-photos', true)
on conflict (id) do nothing;

-- Public read for both buckets (objects are served to unauthenticated visitors).
create policy "mosque media public read" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('mosque-logos', 'mosque-photos'));

-- Owner write: the <mosque_id> folder must belong to a mosque the caller owns.
-- NOTE: qualify the path as `objects.name`, NOT bare `name`. Inside the subquery
-- aliased `m`, an unqualified `name` binds to mosques.name (mosques has a `name`
-- column), so storage.foldername() would get the mosque NAME, not the object
-- path, and every owner write would be denied. (Caught in the Session U smoke.)
create policy "mosque media owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and exists (
      select 1 from public.mosques m
      where m.user_id = auth.uid()
        and m.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "mosque media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and exists (
      select 1 from public.mosques m
      where m.user_id = auth.uid()
        and m.id::text = (storage.foldername(objects.name))[1]
    )
  );

create policy "mosque media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and exists (
      select 1 from public.mosques m
      where m.user_id = auth.uid()
        and m.id::text = (storage.foldername(objects.name))[1]
    )
  );

-- APPLY CHECKLIST: run -> probe `select id,public from storage.buckets where id like 'mosque-%';`
--   (expect 2 rows, public=true) + `select policyname from pg_policies where tablename='objects'
--   and policyname like 'mosque media%';` (expect 4) -> hard refresh.
-- NOTE: storage.objects already has RLS enabled by Supabase; do NOT re-enable.

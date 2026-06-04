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
-- NOTE: compute storage.foldername(name) at the OUTER level (not inside the
-- mosques subquery). `mosques` has a `name` column, so an unqualified `name`
-- inside `select 1 from mosques m where … foldername(name)` binds to mosques.name
-- (the mosque's NAME) instead of the object path, denying every owner write. The
-- `foldername(name) in (select m.id…)` form keeps `name` unambiguous. (Both the
-- original and an `objects.name`-qualified attempt failed in the Session U smoke;
-- this outer-level form is what passed on dev.)
create policy "mosque media owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "mosque media owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

create policy "mosque media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('mosque-logos', 'mosque-photos')
    and (storage.foldername(name))[1] in (
      select m.id::text from public.mosques m where m.user_id = auth.uid()
    )
  );

-- APPLY CHECKLIST: run -> probe `select id,public from storage.buckets where id like 'mosque-%';`
--   (expect 2 rows, public=true) + `select policyname from pg_policies where tablename='objects'
--   and policyname like 'mosque media%';` (expect 4) -> hard refresh.
-- NOTE: storage.objects already has RLS enabled by Supabase; do NOT re-enable.

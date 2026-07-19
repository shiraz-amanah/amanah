-- 155_staff_avatars_bucket.sql
-- ====================================================================
-- >>> NOT YET APPLIED — SURFACED FOR APPROVAL (Gate 1, staff-editing-v1). <<<
-- Do not apply to any database until Shiraz approves this SQL. Dev-first, raw
-- probes, STOP; prod only on explicit go-ahead.
--
-- WHY A NEW BUCKET (not "harden avatars"):
--   The existing `avatars` bucket (migration 041) is PUBLIC and serves scholar +
--   user marketplace profile photos under `avatars/scholars/{auth.uid()}/…`,
--   rendered directly as public <img src=avatar_url>. Its SELECT policy is
--   "avatars: public read" (to public). Staff avatars need the OPPOSITE posture:
--   PRIVATE, mosque-scoped reads (employee PII, internal HR surfaces only).
--     * Flipping `avatars` to private would break EVERY existing scholar/user
--       avatar URL across the marketplace — unacceptable regression.
--     * Reusing `avatars` as-is (public) would make staff photos world-readable —
--       violates the "SELECT = same-mosque authenticated" requirement.
--   So staff avatars get their OWN private bucket. This file does NOT touch
--   `avatars` or its 041 policies. Modeled on migration 135 (staff-documents).
--
-- PATH CONVENTION:  staff-avatars/{mosque_id}/{staff_id}/{file}
--   storage.foldername(name) -> [1] = mosque_id, [2] = staff_id  (1-indexed)
--   RLS parses scope from the object name, exactly like staff-documents.
--
-- ACCESS MODEL:
--   INSERT / UPDATE / DELETE = the staff member themselves (their own staff_id
--     folder, with the mosque segment tied to that staff row's ACTUAL mosque_id
--     so a prefix can't be forged) OR the mosque owner OR an admin.
--   SELECT = same-mosque authenticated users = the mosque owner OR ANY staff
--     member of that mosque (so staff-list rows render co-members' avatars) OR
--     admin. No anon/public read (private bucket).
--
-- Bucket carries file_size_limit + allowed_mime_types AT CREATION — the ONLY
-- server-side size/type control for direct-to-storage client uploads and signed
-- upload URLs (Supabase enforces bucket restrictions on both). Idempotent: on
-- conflict re-asserts the config; every policy is drop-if-exists then create.
-- ====================================================================

-- 1) The bucket. 2MB, private, JPEG/PNG/WebP only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-avatars', 'staff-avatars', false,
  2097152,  -- 2 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- 2) storage.objects policies (RLS is already enabled platform-wide).

-- 1/4) INSERT — staff-self (own folder, mosque-bound) OR owner OR admin.
drop policy if exists "staff-avatars write insert" on storage.objects;
create policy "staff-avatars write insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-avatars'
    and (
         public.is_admin()
      or (storage.foldername(name))[1] in (
           select id::text from public.mosques where user_id = auth.uid())
      or exists (
           select 1 from public.mosque_staff ms
           where ms.profile_id = auth.uid()
             and ms.id::text        = (storage.foldername(objects.name))[2]
             and ms.mosque_id::text = (storage.foldername(objects.name))[1])
    )
  );

-- 2/4) UPDATE — same actors; USING gates the existing row, WITH CHECK the result
--      (so an object can't be moved into a folder you don't control).
drop policy if exists "staff-avatars write update" on storage.objects;
create policy "staff-avatars write update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (
         public.is_admin()
      or (storage.foldername(name))[1] in (
           select id::text from public.mosques where user_id = auth.uid())
      or exists (
           select 1 from public.mosque_staff ms
           where ms.profile_id = auth.uid()
             and ms.id::text        = (storage.foldername(objects.name))[2]
             and ms.mosque_id::text = (storage.foldername(objects.name))[1])
    )
  )
  with check (
    bucket_id = 'staff-avatars'
    and (
         public.is_admin()
      or (storage.foldername(name))[1] in (
           select id::text from public.mosques where user_id = auth.uid())
      or exists (
           select 1 from public.mosque_staff ms
           where ms.profile_id = auth.uid()
             and ms.id::text        = (storage.foldername(objects.name))[2]
             and ms.mosque_id::text = (storage.foldername(objects.name))[1])
    )
  );

-- 3/4) DELETE — same actors (replace/remove a photo).
drop policy if exists "staff-avatars write delete" on storage.objects;
create policy "staff-avatars write delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (
         public.is_admin()
      or (storage.foldername(name))[1] in (
           select id::text from public.mosques where user_id = auth.uid())
      or exists (
           select 1 from public.mosque_staff ms
           where ms.profile_id = auth.uid()
             and ms.id::text        = (storage.foldername(objects.name))[2]
             and ms.mosque_id::text = (storage.foldername(objects.name))[1])
    )
  );

-- 4/4) SELECT — same-mosque authenticated: owner OR any staff of that mosque OR
--      admin. Keyed on the mosque_id segment [1] so staff-list rows can render
--      every co-member's avatar within the same mosque.
drop policy if exists "staff-avatars same-mosque read" on storage.objects;
create policy "staff-avatars same-mosque read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-avatars'
    and (
         public.is_admin()
      or (storage.foldername(name))[1] in (
           select id::text from public.mosques where user_id = auth.uid())
      or (storage.foldername(name))[1] in (
           select mosque_id::text from public.mosque_staff where profile_id = auth.uid())
    )
  );

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST, then STOP for prod approval):
--   1. Run this whole file on dev.
--   2. RAW probes (read the rows — do NOT trust the Success banner):
--
--   -- a) bucket exists with the config
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id = 'staff-avatars';
--   -- expect: 1 row, public=false, 2097152, {image/jpeg,image/png,image/webp}
--
--   -- b) the 4 policies present
--   select policyname, cmd from pg_policies
--     where schemaname='storage' and tablename='objects'
--       and policyname like 'staff-avatars%'
--     order by policyname;
--   -- expect 4: insert / update / delete / select
--
--   3. BEHAVIOURAL check (via the storage API with real JWTs, not just probes):
--      - a mosque owner uploads   staff-avatars/{their_mosque}/{staff}/x.jpg  -> OK
--      - that mosque's staff member reads it                                  -> OK
--      - an UNRELATED user (other mosque / plain parent) reads that object     -> BLOCKED
--      - the unrelated user uploads under {their_mosque or forged}/…           -> BLOCKED
--   4. Paste raw probe rows + behavioural results here. STOP for prod go-ahead.
-- ====================================================================

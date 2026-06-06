-- 080_madrasa_photos.sql
-- ====================================================================
-- Madrasa Phase 2D — class photos, consent-gated. A teacher/owner uploads a
-- photo for a class session; visible_to is the set of student_ids whose parents
-- have GIVEN consent (computed at upload, default-off — see 079). A parent reads
-- only photos their child appears in. Bytes live in a PRIVATE storage bucket
-- (mosque-madrasa-photos) — NO public read; reads go through signed URLs minted
-- by the caller's own session, gated by storage RLS.
--
-- Consent withdrawal (GDPR): future uploads simply omit the child (the upload
-- reads current consent). PAST photos are NOT silently mutated/deleted — a
-- trigger FLAGS them (flagged_for_review) for an admin to handle. The child
-- stays in visible_to (so the parent still sees them) until an admin acts.
--
-- All cross-table / cross-schema checks go through SECURITY DEFINER helpers
-- (068/069 lesson); storage-path checks compare ids as TEXT to avoid the uuid
-- cast erroring on unrelated objects, and compute storage.foldername at the
-- outer level (the 053/064 `mosques.name` shadowing gotcha).
-- ====================================================================

create table if not exists public.madrasa_photos (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.madrasa_classes(id) on delete cascade,
  mosque_id          uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  storage_path       text not null,           -- object path in mosque-madrasa-photos: <mosque_id>/<class_id>/<file>
  caption            text,
  session_date       date,
  uploaded_by        uuid references public.profiles(id) on delete set null,
  visible_to         uuid[] not null default '{}',   -- consented student_ids at upload time
  flagged_for_review boolean not null default false, -- set when a parent later withdraws consent
  created_at         timestamptz not null default now()
);
create index if not exists madrasa_photos_class_idx  on public.madrasa_photos(class_id, created_at desc);
create index if not exists madrasa_photos_mosque_idx on public.madrasa_photos(mosque_id);

alter table public.madrasa_photos enable row level security;

-- Caller is the parent of any student in p_ids (for the visible_to read check).
create or replace function public.madrasa_parent_owns_any(p_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.profile_id = auth.uid() and s.id = any(p_ids)
  );
$$;
revoke all on function public.madrasa_parent_owns_any(uuid[]) from public;
grant execute on function public.madrasa_parent_owns_any(uuid[]) to authenticated;

create policy "Owner manage photos"
  on public.madrasa_photos for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Teacher manage class photos"
  on public.madrasa_photos for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

create policy "Parent read photos of own child"
  on public.madrasa_photos for select to authenticated
  using (public.madrasa_parent_owns_any(visible_to));

-- --------------------------------------------------------------------
-- Consent withdrawal → flag past photos (never delete). Fires when a consent
-- row flips to consent_given=false.
-- --------------------------------------------------------------------
create or replace function public.madrasa_flag_photos_on_consent_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.consent_given = false and old.consent_given is distinct from new.consent_given then
    update public.madrasa_photos
      set flagged_for_review = true
      where mosque_id = new.mosque_id and new.student_id = any(visible_to);
  end if;
  return new;
end;
$$;
drop trigger if exists madrasa_photo_consent_withdrawal on public.madrasa_photo_consent;
create trigger madrasa_photo_consent_withdrawal
  after update on public.madrasa_photo_consent
  for each row execute function public.madrasa_flag_photos_on_consent_withdrawal();

-- ====================================================================
-- PRIVATE storage bucket + RLS (signed URLs only — no public read)
-- ====================================================================
insert into storage.buckets (id, name, public)
values ('mosque-madrasa-photos', 'mosque-madrasa-photos', false)
on conflict (id) do nothing;

-- Caller may MANAGE objects at this path: owns the mosque (<path>[1]) or teaches
-- the class (<path>[2]) at that mosque, or is admin. ids compared as text.
create or replace function public.madrasa_can_manage_photo_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or exists (
      select 1 from public.mosques m
      where m.user_id = auth.uid() and m.id::text = (storage.foldername(p_path))[1]
    )
    or exists (
      select 1 from public.madrasa_classes c
      join public.mosque_staff s on s.id = c.teacher_staff_id
      where s.profile_id = auth.uid()
        and c.id::text        = (storage.foldername(p_path))[2]
        and c.mosque_id::text = (storage.foldername(p_path))[1]
    );
$$;
revoke all on function public.madrasa_can_manage_photo_path(text) from public;
grant execute on function public.madrasa_can_manage_photo_path(text) to authenticated;

-- Caller is a parent of a student in some photo at this exact path (for reads).
create or replace function public.madrasa_parent_can_see_photo(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_photos ph
    join public.students st on st.id = any(ph.visible_to)
    where ph.storage_path = p_path and st.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_parent_can_see_photo(text) from public;
grant execute on function public.madrasa_parent_can_see_photo(text) to authenticated;

create policy "madrasa photos manage insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mosque-madrasa-photos' and public.madrasa_can_manage_photo_path(name));

create policy "madrasa photos manage update" on storage.objects
  for update to authenticated
  using (bucket_id = 'mosque-madrasa-photos' and public.madrasa_can_manage_photo_path(name));

create policy "madrasa photos manage delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mosque-madrasa-photos' and public.madrasa_can_manage_photo_path(name));

-- Read (for signed URLs): managers OR a parent whose child is in the photo.
create policy "madrasa photos gated read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mosque-madrasa-photos'
    and (public.madrasa_can_manage_photo_path(name) or public.madrasa_parent_can_see_photo(name))
  );

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_photos
--        select id, public from storage.buckets where id = 'mosque-madrasa-photos';  -- public=false
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_parent_owns_any','madrasa_can_manage_photo_path',
--                            'madrasa_parent_can_see_photo','madrasa_flag_photos_on_consent_withdrawal');
--        select polname, cmd from pg_policies where tablename = 'madrasa_photos';
--        select policyname from pg_policies where tablename='objects' and policyname like 'madrasa photos%';  -- expect 4
--      As anon: a public-URL fetch of any object → 400/403; select from madrasa_photos → 0.
--   3. storage.objects already has RLS enabled by Supabase — do NOT re-enable.
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

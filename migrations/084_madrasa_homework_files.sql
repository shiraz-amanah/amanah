-- 084_madrasa_homework_files.sql
-- ====================================================================
-- Madrasa Fix 2 — homework file attachments. Teachers attach resource files to a
-- homework task; parents upload their child's submission. File METADATA rides on
-- the existing rows as a `files` jsonb ([{ path, name, size }]) — no new table,
-- so the existing 077 row RLS already gates who can see/edit which list. The
-- BYTES live in a new PRIVATE bucket with its own storage RLS (signed URLs only).
--
-- Storage path (4 segments so the RLS can tell teacher resources from a specific
-- child's submission — the brief's 3-segment path can't):
--   <mosque_id>/<class_id>/<homework_id>/_resource/<file>     ← teacher resources
--   <mosque_id>/<class_id>/<homework_id>/<student_id>/<file>  ← parent submissions
-- foldername()[1]=mosque, [2]=class, [4]=_resource|student_id. Ids compared as
-- TEXT (the 080 lesson — avoids uuid-cast errors on unrelated objects). Cross-
-- table checks go through SECURITY DEFINER helpers (068/069 lesson).
-- ====================================================================

-- File metadata on the existing rows (no new table → reuse 077 row RLS).
alter table public.madrasa_homework             add column if not exists files jsonb not null default '[]';
alter table public.madrasa_homework_completions add column if not exists files jsonb not null default '[]';

-- --------------------------------------------------------------------
-- Storage RLS helpers for the madrasa-homework-uploads bucket.
-- --------------------------------------------------------------------
-- Owner of the mosque OR teacher of the class (path mosque[1]/class[2]) —
-- manages ANY file under their class (resources + every child's submission).
create or replace function public.madrasa_hw_can_manage(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.mosques m
    where m.user_id = auth.uid() and m.id::text = (storage.foldername(p_path))[1]
  ) or exists (
    select 1 from public.madrasa_classes c
    join public.mosque_staff s on s.id = c.teacher_staff_id
    where s.profile_id = auth.uid()
      and c.id::text        = (storage.foldername(p_path))[2]
      and c.mosque_id::text = (storage.foldername(p_path))[1]
  );
$$;

-- Parent WRITE: owns the student at segment[4], actively enrolled in class[2]
-- (so parents can only write under their own child's submission folder; the
-- '_resource' segment is not a uuid so no student matches → denied).
create or replace function public.madrasa_hw_parent_write(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students st
    join public.madrasa_enrollments e on e.student_id = st.id
    where st.profile_id = auth.uid()
      and st.id::text      = (storage.foldername(p_path))[4]
      and e.class_id::text = (storage.foldername(p_path))[2]
      and e.status = 'active'
  );
$$;

-- Parent READ: their own child's submission, OR a teacher resource for a class
-- their child is enrolled in (parents must be able to download set work).
create or replace function public.madrasa_hw_parent_read(p_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.madrasa_hw_parent_write(p_path) or (
    (storage.foldername(p_path))[4] = '_resource'
    and exists (
      select 1 from public.students st
      join public.madrasa_enrollments e on e.student_id = st.id
      where st.profile_id = auth.uid()
        and e.class_id::text = (storage.foldername(p_path))[2]
        and e.status = 'active'
    )
  );
$$;

revoke all on function public.madrasa_hw_can_manage(text)   from public;
revoke all on function public.madrasa_hw_parent_write(text)  from public;
revoke all on function public.madrasa_hw_parent_read(text)   from public;
grant execute on function public.madrasa_hw_can_manage(text)  to authenticated;
grant execute on function public.madrasa_hw_parent_write(text) to authenticated;
grant execute on function public.madrasa_hw_parent_read(text)  to authenticated;

-- --------------------------------------------------------------------
-- Private bucket + storage.objects policies (mirror 080).
-- --------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('madrasa-homework-uploads', 'madrasa-homework-uploads', false)
on conflict (id) do nothing;

create policy "madrasa hw insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'madrasa-homework-uploads' and (public.madrasa_hw_can_manage(name) or public.madrasa_hw_parent_write(name)));

create policy "madrasa hw update" on storage.objects
  for update to authenticated
  using (bucket_id = 'madrasa-homework-uploads' and (public.madrasa_hw_can_manage(name) or public.madrasa_hw_parent_write(name)));

create policy "madrasa hw delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'madrasa-homework-uploads' and (public.madrasa_hw_can_manage(name) or public.madrasa_hw_parent_write(name)));

create policy "madrasa hw read" on storage.objects
  for select to authenticated
  using (bucket_id = 'madrasa-homework-uploads' and (public.madrasa_hw_can_manage(name) or public.madrasa_hw_parent_read(name)));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_homework            -- files jsonb present
--        \d public.madrasa_homework_completions -- files jsonb present
--        select id, public from storage.buckets where id = 'madrasa-homework-uploads';  -- public=false
--        select polname, cmd from pg_policies where schemaname='storage' and tablename='objects'
--          and polname like 'madrasa hw%' order by polname;   -- 4 rows
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_hw_can_manage','madrasa_hw_parent_write','madrasa_hw_parent_read'); -- all t
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

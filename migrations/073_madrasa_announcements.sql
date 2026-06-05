-- 073_madrasa_announcements.sql
-- ====================================================================
-- Madrasa Phase 2a-i — class announcements. A teacher (or the mosque admin)
-- posts a notice to a whole class; every parent of an ACTIVE-enrolled child
-- reads it. One-to-many broadcast (a notice board) — distinct from the 1:1
-- conversations infra used for parent↔teacher messaging in 2a-ii.
--
-- mosque_id is denormalized and forced to match the class in every WITH CHECK
-- (same shape as 070 attendance). Parent read goes through a SECURITY DEFINER
-- helper (the 068/069 lesson): the helper reads enrollments+students WITHOUT
-- RLS so the cross-table check can't re-enter RLS.
-- ====================================================================

-- Caller is the parent of a student with an ACTIVE enrolment in p_class.
create or replace function public.madrasa_parent_can_see_class(p_class uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_enrollments e
    join public.students s on s.id = e.student_id
    where e.class_id = p_class
      and e.status = 'active'
      and s.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_parent_can_see_class(uuid) from public;
grant execute on function public.madrasa_parent_can_see_class(uuid) to authenticated;

-- --------------------------------------------------------------------
-- madrasa_announcements
-- --------------------------------------------------------------------
create table if not exists public.madrasa_announcements (
  id                uuid primary key default gen_random_uuid(),
  class_id          uuid not null references public.madrasa_classes(id) on delete cascade,
  mosque_id         uuid not null references public.mosques(id)         on delete cascade,  -- denormalized for RLS
  author_profile_id uuid references public.profiles(id) on delete set null,
  title             text,
  body              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists madrasa_announcements_class_idx  on public.madrasa_announcements(class_id, created_at desc);
create index if not exists madrasa_announcements_mosque_idx on public.madrasa_announcements(mosque_id);

alter table public.madrasa_announcements enable row level security;

-- Owner (+admin): manage announcements for own-mosque classes; mosque_id forced
-- to match the class.
create policy "Owner manage announcements"
  on public.madrasa_announcements for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (
    (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Class teacher: manage announcements for their own classes (definer helper).
create policy "Teacher manage class announcements"
  on public.madrasa_announcements for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (
    public.madrasa_is_class_teacher(class_id)
    and mosque_id = (select mosque_id from public.madrasa_classes where id = class_id)
  );

-- Parent: read announcements for classes their children are enrolled in.
create policy "Parent read class announcements"
  on public.madrasa_announcements for select to authenticated
  using (public.madrasa_parent_can_see_class(class_id));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_announcements
--        select proname, prosecdef from pg_proc where proname = 'madrasa_parent_can_see_class';
--        select polname, cmd from pg_policies where tablename = 'madrasa_announcements';
--      As anon: select from madrasa_announcements → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

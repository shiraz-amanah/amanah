-- 079_madrasa_photo_consent.sql
-- ====================================================================
-- Madrasa Phase 2D — photo consent (GDPR). Per (student, mosque) consent to be
-- photographed, **default OFF** (no row, or consent_given=false, = no consent).
-- The PARENT manages their own child's consent; the mosque owner + the child's
-- teacher READ it (to know who may be included in a class photo). Consent is
-- mosque-wide (matches the parent UI: "consent per child per mosque"), not
-- per-class.
--
-- Owner read is the usual own-mosque check. Teacher read is precisely scoped via
-- a SECURITY DEFINER helper (068/069 lesson): the caller must teach a class AT
-- THAT MOSQUE that the student is enrolled in — so a teacher can't read a
-- student's consent for a different mosque the child also attends.
-- ====================================================================

create table if not exists public.madrasa_photo_consent (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  mosque_id        uuid not null references public.mosques(id)  on delete cascade,
  consent_given    boolean not null default false,
  consent_date     timestamptz,                                    -- when it last became 'given'
  consent_given_by uuid references public.profiles(id) on delete set null,  -- the parent
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index if not exists madrasa_photo_consent_uniq        on public.madrasa_photo_consent(student_id, mosque_id);
create index        if not exists madrasa_photo_consent_mosque_idx  on public.madrasa_photo_consent(mosque_id);

alter table public.madrasa_photo_consent enable row level security;

-- Caller teaches a class AT p_mosque that p_student is enrolled in.
create or replace function public.madrasa_teacher_can_see_consent(p_student uuid, p_mosque uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.madrasa_enrollments e
    join public.madrasa_classes c on c.id = e.class_id
    join public.mosque_staff    s on s.id = c.teacher_staff_id
    where e.student_id = p_student
      and c.mosque_id  = p_mosque
      and s.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_teacher_can_see_consent(uuid, uuid) from public;
grant execute on function public.madrasa_teacher_can_see_consent(uuid, uuid) to authenticated;

-- Parent: manage their OWN child's consent (give/withdraw), stamped as theirs.
create policy "Parent manage own-child consent"
  on public.madrasa_photo_consent for all to authenticated
  using      (student_id in (select id from public.students where profile_id = auth.uid()))
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    and consent_given_by = auth.uid()
  );

-- Owner (+admin): read consent for their own mosque.
create policy "Owner read consent"
  on public.madrasa_photo_consent for select to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Teacher: read consent for students they teach at that mosque (definer helper).
create policy "Teacher read consent"
  on public.madrasa_photo_consent for select to authenticated
  using (public.madrasa_teacher_can_see_consent(student_id, mosque_id));

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe (RAW rows):
--        \d public.madrasa_photo_consent
--        select proname, prosecdef from pg_proc where proname = 'madrasa_teacher_can_see_consent';
--        select polname, cmd from pg_policies where tablename = 'madrasa_photo_consent';
--      As anon: select from madrasa_photo_consent → 0 rows / denied.
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

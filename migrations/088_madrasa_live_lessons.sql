-- 088_madrasa_live_lessons.sql
-- Session AL — remote learning via Daily.co (item 14).
--
-- Teacher-scoped RLS on the existing madrasa tables ALREADY EXISTS (068–083 via
-- the madrasa_is_class_teacher helper) — this migration does NOT re-add it. See
-- the DEFENSIVE RE-CHECK probe at the bottom: run it on dev to confirm the 9
-- teacher policies are really present in the DB before relying on them.
--
-- This adds only what live lessons need:
--   1. a remote-join flag on attendance,
--   2. a madrasa_sessions table (one Daily room per class session),
--   3. a parent join RPC that auto-marks their child present+remote.
--
-- Room creation itself is done by the (extended) /api/create-daily-room function
-- with the service role — it fills room_url on the session after authorising the
-- caller; no new /api file (still 11/12).
--
-- Dev-first: apply to amanah-dev, run BOTH probe blocks, smoke test, then prod.

-- --------------------------------------------------------------------
-- 1. Remote-join flag on attendance.
-- --------------------------------------------------------------------
alter table public.madrasa_attendance
  add column if not exists remote boolean not null default false;

-- --------------------------------------------------------------------
-- 2. Live-lesson sessions (one Daily room per class session).
-- --------------------------------------------------------------------
create table if not exists public.madrasa_sessions (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.madrasa_classes(id) on delete cascade,
  mosque_id  uuid not null references public.mosques(id) on delete cascade,  -- denormalized for RLS
  room_url   text,
  room_name  text,
  status     text not null default 'live' check (status in ('live', 'ended')),
  started_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index if not exists madrasa_sessions_class_idx  on public.madrasa_sessions (class_id, status);
create index if not exists madrasa_sessions_mosque_idx on public.madrasa_sessions (mosque_id);
alter table public.madrasa_sessions enable row level security;

-- Owner (+admin): manage own-mosque sessions.
create policy "Owner manage sessions"
  on public.madrasa_sessions for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- Class teacher: manage sessions for their own classes (existing definer helper).
create policy "Teacher manage class sessions"
  on public.madrasa_sessions for all to authenticated
  using      (public.madrasa_is_class_teacher(class_id))
  with check (public.madrasa_is_class_teacher(class_id));

-- Parent: read sessions for classes their child is enrolled in (to show Join).
-- Recursion-safe SECURITY DEFINER helper (the 068/069 lesson).
create or replace function public.madrasa_parent_in_class(p_class uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.madrasa_enrollments e
      join public.students st on st.id = e.student_id
     where e.class_id = p_class and st.profile_id = auth.uid()
  );
$$;
revoke all on function public.madrasa_parent_in_class(uuid) from public;
grant execute on function public.madrasa_parent_in_class(uuid) to authenticated;

create policy "Parent read child class sessions"
  on public.madrasa_sessions for select to authenticated
  using (public.madrasa_parent_in_class(class_id));

-- --------------------------------------------------------------------
-- 3. Parent joins a live session → auto-mark their own child present+remote.
--    Parents have no attendance INSERT policy (and shouldn't get a broad one),
--    so this is a harvest-guarded SECURITY DEFINER RPC, gated to the caller's
--    own child enrolled in the session's (live) class.
-- --------------------------------------------------------------------
create or replace function public.madrasa_join_session(p_session uuid, p_student uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_class  uuid;
  v_mosque uuid;
begin
  select class_id, mosque_id into v_class, v_mosque
    from public.madrasa_sessions
   where id = p_session and status = 'live';
  if v_class is null then raise exception 'session_not_live'; end if;

  -- caller must own this child AND the child must be enrolled in the class
  if not exists (
    select 1
      from public.madrasa_enrollments e
      join public.students st on st.id = e.student_id
     where e.class_id = v_class and st.id = p_student
       and st.profile_id = auth.uid() and e.status = 'active'
  ) then
    raise exception 'forbidden';
  end if;

  insert into public.madrasa_attendance (class_id, student_id, mosque_id, session_date, status, remote, marked_by)
  values (v_class, p_student, v_mosque, current_date, 'present', true, auth.uid())
  on conflict (class_id, student_id, session_date)
  do update set status = 'present', remote = true, updated_at = now();
end;
$$;
revoke all on function public.madrasa_join_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.madrasa_join_session(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';

-- --------------------------------------------------------------------
-- PROBE A (live-lesson objects) — run on dev after applying:
--   1. select column_name from information_schema.columns
--        where table_name='madrasa_attendance' and column_name='remote';        -- 1 row
--   2. select count(*) from information_schema.columns where table_name='madrasa_sessions'; -- 8
--   3. select polname from pg_policies where tablename='madrasa_sessions';       -- 3 rows
--   4. select proname, prosecdef from pg_proc
--        where proname in ('madrasa_parent_in_class','madrasa_join_session');    -- prosecdef=t
--   5. select has_function_privilege('anon','public.madrasa_join_session(uuid,uuid)','execute'); -- f
--
-- PROBE B (DEFENSIVE RE-CHECK — teacher-scoped RLS already in place, 068–083):
--   select tablename, polname from pg_policies
--    where polname in (
--      'Teacher read class enrollments','Teacher read enrolled students',
--      'Teacher manage class attendance','Teacher manage class hifz',
--      'Teacher manage class homework','Teacher read class completions',
--      'Teacher manage class reports','Teacher manage class rewards',
--      'Teacher manage class announcements'
--    ) order by tablename;
--   -- expect 9+ rows across madrasa_enrollments/students/attendance/hifz_progress/
--   --   homework/homework_completions/reports/rewards/announcements.
--   -- If any are MISSING on dev, STOP — teacher isolation isn't actually enforced
--   --   there and the relevant 070–083 migration must be (re)applied first.

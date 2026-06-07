-- 090_madrasa_enrollment_invites.sql
-- Session AL — Student enrolment wizard, Path B ("Remote invite").
--
-- The admin enters only a parent email + child name; the parent gets a link,
-- signs in, and completes the child's details themselves (creating the student
-- under THEIR OWN profile). The admin then assigns the completed student to a
-- class. Mirrors the staff remote-onboarding token pattern (066): anon-readable
-- validate RPC + an authed submit RPC, both SECURITY DEFINER.
--
-- Path A (089) was admin-creates-on-behalf; this is parent-completes-themselves.
--
-- No new /api file (still 11/12): the invite email is a send-transactional intent
-- and the token RPCs are called straight from the client.
--
-- Dev-first: apply to amanah-dev, run the probe block, smoke test, then prod.

-- --------------------------------------------------------------------
-- 1. Invite table. Owner creates/reads/cancels via RLS; the token row is
--    resolved by the parent through the SECURITY DEFINER RPCs below (the table
--    itself is not parent-readable).
-- --------------------------------------------------------------------
create table if not exists public.madrasa_enrollment_invites (
  id           uuid primary key default gen_random_uuid(),
  mosque_id    uuid not null references public.mosques(id) on delete cascade,
  token        uuid not null unique default gen_random_uuid(),
  parent_email text not null,
  child_name   text not null,
  status       text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  student_id   uuid references public.students(id) on delete set null,  -- set on completion
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists madrasa_enrol_invites_mosque_idx on public.madrasa_enrollment_invites (mosque_id, status);
alter table public.madrasa_enrollment_invites enable row level security;

-- Owner (+admin): create / read / cancel their mosque's invites.
create policy "Owner manage enrollment invites"
  on public.madrasa_enrollment_invites for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin());

-- --------------------------------------------------------------------
-- 2. Parent resolves their invite (the accept page). Returns only the minimal
--    info needed to render the page, and only while pending. Anon-grantable
--    (the parent may not be signed in yet) — like validate_staff_wizard (066).
-- --------------------------------------------------------------------
create or replace function public.validate_enrollment_invite(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_child  text;
  v_mosque text;
  v_status text;
begin
  select i.child_name, m.name, i.status
    into v_child, v_mosque, v_status
    from public.madrasa_enrollment_invites i
    join public.mosques m on m.id = i.mosque_id
   where i.token = p_token;
  if v_child is null then return null; end if;
  return jsonb_build_object('child_name', v_child, 'mosque_name', v_mosque, 'status', v_status);
end;
$$;
revoke all on function public.validate_enrollment_invite(uuid) from public;
grant execute on function public.validate_enrollment_invite(uuid) to anon, authenticated;

-- --------------------------------------------------------------------
-- 3. Parent completes the registration: creates the student under their own
--    profile + marks the invite completed. Authed only (auth.uid() owns the new
--    student). Harvest-guarded.
-- --------------------------------------------------------------------
create or replace function public.submit_enrollment_invite(
  p_token    uuid,
  p_name     text,
  p_dob      date,
  p_gender   text,
  p_relation text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite  public.madrasa_enrollment_invites%rowtype;
  v_student uuid;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;

  select * into v_invite from public.madrasa_enrollment_invites
   where token = p_token and status = 'pending'
   for update;
  if v_invite.id is null then raise exception 'invite_not_found'; end if;

  insert into public.students (profile_id, name, age, dob, gender, relation)
  values (
    auth.uid(),
    trim(p_name),
    case when p_dob is not null then extract(year from age(p_dob))::int else null end,
    p_dob,
    nullif(trim(p_gender), ''),
    nullif(trim(p_relation), '')
  )
  returning id into v_student;

  update public.madrasa_enrollment_invites
     set status = 'completed', student_id = v_student, completed_at = now()
   where id = v_invite.id;

  return jsonb_build_object('student_id', v_student, 'mosque_id', v_invite.mosque_id);
end;
$$;
revoke all on function public.submit_enrollment_invite(uuid, text, date, text, text) from public, anon, authenticated;
grant execute on function public.submit_enrollment_invite(uuid, text, date, text, text) to authenticated;

notify pgrst, 'reload schema';

-- --------------------------------------------------------------------
-- PROBE (run on dev after applying):
--   1. table:    select count(*) from information_schema.columns where table_name='madrasa_enrollment_invites'; -- 9
--   2. policy:   select polname from pg_policies where tablename='madrasa_enrollment_invites'; -- 1 row
--   3. rpcs:     select proname, prosecdef from pg_proc
--                  where proname in ('validate_enrollment_invite','submit_enrollment_invite'); -- both prosecdef=t
--   4. grants:   select has_function_privilege('anon','public.validate_enrollment_invite(uuid)','execute');               -- t
--                select has_function_privilege('anon','public.submit_enrollment_invite(uuid,text,date,text,text)','execute'); -- f
--                select has_function_privilege('authenticated','public.submit_enrollment_invite(uuid,text,date,text,text)','execute'); -- t

-- 089_madrasa_admin_enrol.sql
-- Session AL — Student enrolment wizard, Path A (admin "Add in house").
--
-- Lets a mosque admin create a child record on a PARENT's behalf and enrol it
-- into a class in one step, then email the parent a sign-in link. The current
-- addStudent path is caller-owned (students RLS: profile_id = auth.uid()), so an
-- admin cannot insert a student for someone else — this adds a SECURITY DEFINER
-- RPC (owner-gated, harvest-guarded) that can.
--
-- Account handling without a new /api function (we're at 11/12): if the parent
-- already has an account, the student links to their profile immediately. If
-- not, the student holds the parent's email in pending_parent_email and an
-- auth-insert trigger claims it on first sign-in (same email). The welcome email
-- is a send-transactional intent (madrasa_parent_welcome).
--
-- Path B (remote invite) is a later migration; this is Path A only.
--
-- Dev-first: apply to amanah-dev, run the probe block at the bottom, smoke test,
-- THEN apply to prod via the Supabase SQL editor.

-- --------------------------------------------------------------------
-- 1. students: DOB + gender + pending-parent-email; profile_id nullable
--    (a pending student has no owner until the parent signs up).
-- --------------------------------------------------------------------
alter table public.students add column if not exists dob date;
alter table public.students add column if not exists gender text;
alter table public.students add column if not exists pending_parent_email text;
alter table public.students alter column profile_id drop not null;
create index if not exists students_pending_parent_email_idx
  on public.students (lower(pending_parent_email)) where pending_parent_email is not null;

-- --------------------------------------------------------------------
-- 2. Claim pending students when their parent first signs up (email match).
--    Separate AFTER-INSERT trigger on auth.users, named to sort AFTER
--    on_auth_user_created (handle_new_user) so the profile row exists first.
--    Wrapped so it can never block a signup.
-- --------------------------------------------------------------------
create or replace function public.madrasa_claim_pending_students()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.students
     set profile_id = new.id, pending_parent_email = null
   where profile_id is null
     and pending_parent_email is not null
     and lower(pending_parent_email) = lower(new.email);
  return new;
exception when others then
  return new; -- never block auth signup
end;
$$;

drop trigger if exists on_auth_user_created_claim_students on auth.users;
create trigger on_auth_user_created_claim_students
  after insert on auth.users
  for each row execute function public.madrasa_claim_pending_students();

-- --------------------------------------------------------------------
-- 3. Admin creates a student for a parent + enrols into a class (Path A).
--    Owner-gated inside (caller owns the mosque, or platform admin). Returns
--    the new student id + whether the parent already had an account (so the
--    client knows the email is a "log in" vs "create your account" nudge).
-- --------------------------------------------------------------------
create or replace function public.madrasa_admin_enrol_student(
  p_mosque   uuid,
  p_class    uuid,
  p_name     text,
  p_dob      date,
  p_gender   text,
  p_relation text,
  p_parent_email text,
  p_parent_name  text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student uuid;
  v_profile uuid;
  v_email   text := nullif(lower(trim(p_parent_email)), '');
begin
  -- authz: caller owns this mosque, or is a platform admin
  if not (exists (select 1 from public.mosques where id = p_mosque and user_id = auth.uid())
          or public.is_admin()) then
    raise exception 'forbidden';
  end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name_required'; end if;

  -- link to an existing parent account by email, else hold the email pending
  if v_email is not null then
    select id into v_profile from public.profiles where lower(email) = v_email limit 1;
  end if;

  insert into public.students (profile_id, name, age, dob, gender, relation, pending_parent_email)
  values (
    v_profile,
    trim(p_name),
    case when p_dob is not null then extract(year from age(p_dob))::int else null end,
    p_dob,
    nullif(trim(p_gender), ''),
    nullif(trim(p_relation), ''),
    case when v_profile is null then v_email else null end
  )
  returning id into v_student;

  -- enrol into the chosen class (must belong to this mosque)
  if p_class is not null then
    if not exists (select 1 from public.madrasa_classes where id = p_class and mosque_id = p_mosque) then
      raise exception 'class_mismatch';
    end if;
    insert into public.madrasa_enrollments (class_id, student_id, mosque_id, status)
    values (p_class, v_student, p_mosque, 'active');
  end if;

  return jsonb_build_object(
    'student_id',    v_student,
    'parent_exists', v_profile is not null,
    'parent_email',  v_email
  );
end;
$$;

-- Harvest guard: service-flavoured definer RPC — explicitly revoke from anon AND
-- authenticated, then grant only authenticated (authz is enforced inside).
revoke all on function public.madrasa_admin_enrol_student(uuid,uuid,text,date,text,text,text,text) from public, anon, authenticated;
grant execute on function public.madrasa_admin_enrol_student(uuid,uuid,text,date,text,text,text,text) to authenticated;

notify pgrst, 'reload schema';

-- --------------------------------------------------------------------
-- PROBE (run on dev after applying):
--   1. columns:    select column_name, is_nullable from information_schema.columns
--                    where table_name='students' and column_name in ('dob','gender','pending_parent_email','profile_id');
--                  -- expect dob/gender/pending_parent_email present, profile_id is_nullable = YES
--   2. trigger:    select tgname from pg_trigger where tgname='on_auth_user_created_claim_students';  -- 1 row
--   3. rpc secdef: select proname, prosecdef from pg_proc
--                    where proname in ('madrasa_admin_enrol_student','madrasa_claim_pending_students'); -- prosecdef = t
--   4. grants:     select has_function_privilege('anon',  'public.madrasa_admin_enrol_student(uuid,uuid,text,date,text,text,text,text)', 'execute');  -- f
--                  select has_function_privilege('authenticated','public.madrasa_admin_enrol_student(uuid,uuid,text,date,text,text,text,text)','execute'); -- t
--   5. profiles.email exists:  select 1 from information_schema.columns where table_name='profiles' and column_name='email';  -- 1 row

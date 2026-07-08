-- 127_rbac_rpcs.sql
-- ====================================================================
-- RBAC — the 7 SECURITY DEFINER RPCs behind employee invites + permission
-- management (Session RBAC). All are SECURITY DEFINER, set search_path = public,
-- and (per the 033 post-mortem) carry `#variable_conflict use_column` in every
-- plpgsql body so a bareword identifier resolves to the COLUMN, never a shadowing
-- OUT param / local — the exact class of bug that silently broke accept_staff_invite.
--
-- OWNER GATING: every owner-only RPC re-checks `mosques.user_id = auth.uid()` in
-- the body (NOT just RLS) because SECURITY DEFINER bypasses RLS. Class assignments
-- are validated to actually belong to the mosque (assigned_classes[] is bearer
-- data from the client). Tokens are single-use: accept clears invite_token.
--
-- RETURN CONVENTIONS:
--   accept_employee_invite → (ok, reason, ...) rows (mirrors accept_staff_invite)
--     so the public AcceptInvite page can distinguish invalid / expired / suspended.
--   owner-only RPCs → raise exception on auth failure (never reached by normal UI).
--
-- ADDITIONS BEYOND THE ORIGINAL 7-RPC SPEC (flagged for review):
--   • invite_mosque_employee raises `employee_already_invited` if a pending/active
--     row already exists for the same email in the mosque (prevents duplicate rows;
--     re-inviting an expired one goes through resend_employee_invite).
--   • suspend_employee takes an optional p_status ('suspended' default) so the same
--     RPC can REACTIVATE (p_status => 'active') — the spec had no reactivation path.
--     Still callable as suspend_employee(p_employee_id) exactly as specced.
-- ====================================================================


-- 1. invite_mosque_employee ------------------------------------------
create or replace function public.invite_mosque_employee(
  p_mosque_id        uuid,
  p_email            text,
  p_name             text,
  p_role_preset      text,
  p_permissions      jsonb,
  p_assigned_classes uuid[] default '{}'::uuid[]
)
returns table (
  employee_id       uuid,
  invite_token      text,
  invite_expires_at timestamptz
)
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid   uuid := auth.uid();
  v_token text;
  v_exp   timestamptz := now() + interval '24 hours';
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = p_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  if p_role_preset not in
     ('coordinator','teacher','treasurer','receptionist','viewer','custom') then
    raise exception 'invalid_role_preset';
  end if;

  if p_assigned_classes is not null and array_length(p_assigned_classes, 1) is not null then
    if exists (
      select 1 from unnest(p_assigned_classes) as cid
      where cid not in (select id from public.madrasa_classes where mosque_id = p_mosque_id)
    ) then
      raise exception 'assigned_class_not_in_mosque';
    end if;
  end if;

  if exists (
    select 1 from public.mosque_employees
    where mosque_id = p_mosque_id
      and lower(invited_email) = lower(p_email)
      and status in ('pending','active')
  ) then
    raise exception 'employee_already_invited';
  end if;

  v_token := gen_random_uuid()::text;

  insert into public.mosque_employees (
    mosque_id, invited_email, invited_name, role_preset,
    permissions, assigned_classes, invite_token, invite_expires_at, status
  ) values (
    p_mosque_id, p_email, p_name, p_role_preset,
    coalesce(p_permissions, '{}'::jsonb),
    coalesce(p_assigned_classes, '{}'::uuid[]),
    v_token, v_exp, 'pending'
  )
  returning id into v_id;

  return query select v_id, v_token, v_exp;
end;
$$;


-- 2. accept_employee_invite ------------------------------------------
create or replace function public.accept_employee_invite(p_token text)
returns table (
  ok               boolean,
  reason           text,
  mosque_id        uuid,
  permissions      jsonb,
  role_preset      text,
  assigned_classes uuid[]
)
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  emp   record;
begin
  if v_uid is null then
    return query select false, 'not_authenticated'::text,
                        null::uuid, null::jsonb, null::text, null::uuid[];
    return;
  end if;

  select * into emp from public.mosque_employees e
   where e.invite_token = p_token
   limit 1;

  if not found then
    -- token missing/cleared (also covers already-accepted, since accept clears it)
    return query select false, 'invalid'::text,
                        null::uuid, null::jsonb, null::text, null::uuid[];
    return;
  end if;

  if emp.invite_expires_at is null or emp.invite_expires_at < now() then
    return query select false, 'expired'::text,
                        null::uuid, null::jsonb, null::text, null::uuid[];
    return;
  end if;

  if emp.status = 'suspended' then
    return query select false, 'suspended'::text,
                        null::uuid, null::jsonb, null::text, null::uuid[];
    return;
  end if;

  update public.mosque_employees
     set profile_id         = v_uid,
         status             = 'active',
         invite_accepted_at = now(),
         invite_token       = null        -- single-use
   where id = emp.id;

  return query select true, 'accepted'::text,
                      emp.mosque_id, emp.permissions, emp.role_preset, emp.assigned_classes;
end;
$$;


-- 3. get_my_employee_record ------------------------------------------
-- Caller's own employee row for a mosque (SQL, auth.uid()-scoped → safe).
create or replace function public.get_my_employee_record(p_mosque_id uuid)
returns table (
  id               uuid,
  role_preset      text,
  permissions      jsonb,
  assigned_classes uuid[],
  status           text
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.role_preset, e.permissions, e.assigned_classes, e.status
    from public.mosque_employees e
   where e.mosque_id = p_mosque_id
     and e.profile_id = auth.uid()
   limit 1;
$$;


-- 4. get_mosque_employees --------------------------------------------
-- Owner-only. Joins profiles for accepted employees (name + avatar).
create or replace function public.get_mosque_employees(p_mosque_id uuid)
returns table (
  id                 uuid,
  invited_name       text,
  invited_email      text,
  role_preset        text,
  permissions        jsonb,
  assigned_classes   uuid[],
  status             text,
  invite_expires_at  timestamptz,
  invite_accepted_at timestamptz,
  profile_id         uuid,
  profile_name       text,
  profile_avatar     text,
  created_at         timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
begin
  if not exists (select 1 from public.mosques m
                 where m.id = p_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  return query
    select e.id, e.invited_name, e.invited_email, e.role_preset,
           e.permissions, e.assigned_classes, e.status,
           e.invite_expires_at, e.invite_accepted_at,
           e.profile_id, p.name, p.avatar_url, e.created_at
      from public.mosque_employees e
      left join public.profiles p on p.id = e.profile_id
     where e.mosque_id = p_mosque_id
     order by e.created_at desc;
end;
$$;


-- 5. update_employee_permissions -------------------------------------
create or replace function public.update_employee_permissions(
  p_employee_id      uuid,
  p_permissions      jsonb,
  p_assigned_classes uuid[],
  p_role_preset      text
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
begin
  select e.mosque_id into v_mosque_id
    from public.mosque_employees e
   where e.id = p_employee_id;

  if v_mosque_id is null then
    raise exception 'employee_not_found';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  if p_role_preset is not null and p_role_preset not in
     ('coordinator','teacher','treasurer','receptionist','viewer','custom') then
    raise exception 'invalid_role_preset';
  end if;

  if p_assigned_classes is not null and array_length(p_assigned_classes, 1) is not null then
    if exists (
      select 1 from unnest(p_assigned_classes) as cid
      where cid not in (select id from public.madrasa_classes where mosque_id = v_mosque_id)
    ) then
      raise exception 'assigned_class_not_in_mosque';
    end if;
  end if;

  update public.mosque_employees
     set permissions      = coalesce(p_permissions, permissions),
         assigned_classes = coalesce(p_assigned_classes, assigned_classes),
         role_preset      = coalesce(p_role_preset, role_preset)
   where id = p_employee_id;
end;
$$;


-- 6. suspend_employee (also reactivates via p_status => 'active') -----
create or replace function public.suspend_employee(
  p_employee_id uuid,
  p_status      text default 'suspended'
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
begin
  if p_status not in ('active','suspended') then
    raise exception 'invalid_status';
  end if;

  select e.mosque_id into v_mosque_id
    from public.mosque_employees e
   where e.id = p_employee_id;

  if v_mosque_id is null then
    raise exception 'employee_not_found';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  update public.mosque_employees
     set status = p_status
   where id = p_employee_id;
end;
$$;


-- 7. resend_employee_invite ------------------------------------------
create or replace function public.resend_employee_invite(p_employee_id uuid)
returns table (
  invite_token      text,
  invite_expires_at timestamptz,
  invited_email     text,
  invited_name      text,
  role_preset       text
)
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid       uuid := auth.uid();
  v_mosque_id uuid;
  v_status    text;
  v_token     text;
  v_exp       timestamptz := now() + interval '24 hours';
  v_email     text;
  v_name      text;
  v_role      text;
begin
  select e.mosque_id, e.status, e.invited_email, e.invited_name, e.role_preset
    into v_mosque_id, v_status, v_email, v_name, v_role
    from public.mosque_employees e
   where e.id = p_employee_id;

  if v_mosque_id is null then
    raise exception 'employee_not_found';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  if v_status = 'active' then
    raise exception 'already_accepted';
  end if;

  v_token := gen_random_uuid()::text;

  update public.mosque_employees
     set invite_token      = v_token,
         invite_expires_at = v_exp,
         status            = 'pending'
   where id = p_employee_id;

  return query select v_token, v_exp, v_email, v_name, v_role;
end;
$$;


-- 8. get_my_employee_mosque -----------------------------------------
-- Bootstrap resolver: the caller's FIRST active employee mosque (if any), with
-- the whole mosque row + their permissions, so App.jsx can load the dashboard
-- for a non-owner employee. Returns null when the caller isn't an active
-- employee of any mosque (e.g. an owner, who loads via ownership instead).
-- Added post-probe (Session RBAC, Option 1); run via CREATE OR REPLACE in dev.
create or replace function public.get_my_employee_mosque()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'mosque', row_to_json(m.*),
    'permissions', me.permissions,
    'assigned_classes', me.assigned_classes,
    'role_preset', me.role_preset,
    'employee_id', me.id
  )
  into v_result
  from mosque_employees me
  join mosques m on m.id = me.mosque_id
  where me.profile_id = auth.uid()
    and me.status = 'active'
  limit 1;

  return v_result;
end;
$$;


-- Grants: authenticated only (no anon / public). Mirrors 121. --------
revoke all on function public.invite_mosque_employee(uuid,text,text,text,jsonb,uuid[]) from public, anon;
revoke all on function public.accept_employee_invite(text)                              from public, anon;
revoke all on function public.get_my_employee_record(uuid)                              from public, anon;
revoke all on function public.get_mosque_employees(uuid)                                from public, anon;
revoke all on function public.update_employee_permissions(uuid,jsonb,uuid[],text)       from public, anon;
revoke all on function public.suspend_employee(uuid,text)                               from public, anon;
revoke all on function public.resend_employee_invite(uuid)                              from public, anon;
revoke all on function public.get_my_employee_mosque()                                  from public, anon;

grant execute on function public.invite_mosque_employee(uuid,text,text,text,jsonb,uuid[]) to authenticated;
grant execute on function public.accept_employee_invite(text)                            to authenticated;
grant execute on function public.get_my_employee_record(uuid)                            to authenticated;
grant execute on function public.get_mosque_employees(uuid)                              to authenticated;
grant execute on function public.update_employee_permissions(uuid,jsonb,uuid[],text)     to authenticated;
grant execute on function public.suspend_employee(uuid,text)                             to authenticated;
grant execute on function public.resend_employee_invite(uuid)                            to authenticated;
grant execute on function public.get_my_employee_mosque()                                to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows). NOTE: auth.uid() is NULL in the SQL editor, so owner-
--      gated bodies can't be exercised here — behavioural testing is the app
--      smoke (step 13). This probe verifies existence + SECURITY DEFINER + grants:
--        -- 7 functions, all prosecdef = t
--        select proname, prosecdef, pg_get_function_arguments(oid) as args
--          from pg_proc
--          where proname in ('invite_mosque_employee','accept_employee_invite',
--            'get_my_employee_record','get_mosque_employees',
--            'update_employee_permissions','suspend_employee','resend_employee_invite')
--          order by proname;
--        -- EXECUTE granted to authenticated only (expect authenticated rows, NO anon/public)
--        select routine_name, grantee, privilege_type
--          from information_schema.routine_privileges
--          where routine_name in ('invite_mosque_employee','accept_employee_invite',
--            'get_my_employee_record','get_mosque_employees',
--            'update_employee_permissions','suspend_employee','resend_employee_invite')
--          order by routine_name, grantee;
--        -- search_path pinned to public on each (expect proconfig contains search_path=public)
--        select proname, proconfig from pg_proc
--          where proname in ('invite_mosque_employee','accept_employee_invite',
--            'get_my_employee_record','get_mosque_employees',
--            'update_employee_permissions','suspend_employee','resend_employee_invite')
--          order by proname;
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

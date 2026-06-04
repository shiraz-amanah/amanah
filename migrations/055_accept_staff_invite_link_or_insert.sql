-- 055_accept_staff_invite_link_or_insert.sql — Session U Day 2
--
-- Rewrites accept_staff_invite so accepting an invite LINKS the new account to
-- a pre-existing directory record (added by the mosque admin in Session U Day 2)
-- when one matches the invitee email, instead of always inserting a fresh row.
-- Resolution order on accept:
--   1. profile already staff at this mosque  → short-circuit (idempotent)
--   2. an account-less record (profile_id IS NULL) with matching email exists
--      → set its profile_id + invite_status='active'  (the brief's "link")
--   3. otherwise → insert a new row (Session M parity), now carrying
--      name/email + invite_status='active'
--
-- Preserves migration 033's fixes verbatim: the `#variable_conflict use_column`
-- pragma + table-qualified column refs that resolved the mosque_id OUT-param
-- ambiguity. OUT params unchanged so src/auth.js + the accept page need no edit.

create or replace function public.accept_staff_invite(p_token uuid)
returns table (
  ok boolean,
  reason text,
  staff_id uuid,
  mosque_id uuid
)
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  inv record;
  v_user_id uuid;
  v_user_email text;
  v_staff_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select false, 'not_authenticated'::text, null::uuid, null::uuid;
    return;
  end if;

  select email into v_user_email from auth.users where id = v_user_id;

  select * into inv
    from public.mosque_staff_invites
   where token = p_token
   for update;

  if not found then
    return query select false, 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if inv.status <> 'pending' then
    return query select false, ('status:' || inv.status)::text, null::uuid, inv.mosque_id;
    return;
  end if;

  if inv.expires_at < now() then
    update public.mosque_staff_invites set status = 'expired' where id = inv.id;
    return query select false, 'expired'::text, null::uuid, inv.mosque_id;
    return;
  end if;

  if lower(v_user_email) <> lower(inv.invitee_email) then
    return query select false, 'email_mismatch'::text, null::uuid, inv.mosque_id;
    return;
  end if;

  -- (1) Already staff at this mosque → idempotent short-circuit. Columns
  -- table-qualified to disambiguate against the mosque_id OUT param.
  select id into v_staff_id
    from public.mosque_staff
   where mosque_staff.profile_id = v_user_id
     and mosque_staff.mosque_id = inv.mosque_id;

  if v_staff_id is null then
    -- (2) Link a pre-existing account-less directory record by email.
    select id into v_staff_id
      from public.mosque_staff
     where mosque_staff.mosque_id = inv.mosque_id
       and mosque_staff.profile_id is null
       and lower(mosque_staff.email) = lower(inv.invitee_email)
     order by mosque_staff.created_at asc
     limit 1;

    if v_staff_id is not null then
      update public.mosque_staff
         set profile_id = v_user_id, invite_status = 'active'
       where mosque_staff.id = v_staff_id;
    else
      -- (3) No matching record → insert a new one (Session M parity).
      insert into public.mosque_staff (profile_id, mosque_id, role, status, name, email, invite_status)
        values (v_user_id, inv.mosque_id, inv.role, 'active', inv.invitee_name, inv.invitee_email, 'active')
        returning id into v_staff_id;
    end if;
  end if;

  update public.mosque_staff_invites
     set status = 'accepted', accepted_at = now()
   where id = inv.id;

  return query select true, null::text, v_staff_id, inv.mosque_id;
end;
$$;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run -> NOTIFY already included -> re-test the Session M
-- invite/accept loop AND the new link path (admin adds record w/ email ->
-- invite -> accept -> that record gets profile_id + invite_status='active',
-- no duplicate row).

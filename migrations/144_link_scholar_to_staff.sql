-- 144_link_scholar_to_staff.sql
-- ====================================================================
-- SCHOLAR/STAFF bridge — the admin-initiated link that turns an existing
-- marketplace scholar into an ACTIVE mosque_staff member, so a scholar login
-- can be routed to the staff portal (routing change ships separately as the
-- next commit). This is the prerequisite the Q1 audit flagged as unbuilt:
-- `mosque_staff.linked_scholar_id` (the provenance FK) has always existed but
-- was never populated, and nothing ever set `profile_id` from a scholar.
--
-- NO TABLE DDL. Every column this writes already exists:
--   profile_id        uuid -> profiles(id)  ON DELETE RESTRICT   (the identity key)
--   linked_scholar_id uuid -> scholars(id)  ON DELETE SET NULL   (provenance)
--   invite_status     CHECK in (not_invited, invited, active)    ('active' legal)
-- and owner INSERT/UPDATE RLS on mosque_staff already exists.
--
-- WHY AN RPC (not a raw client insert): the owner INSERT policy only checks
-- `mosque_id in (my mosques)` — it does NOT constrain `profile_id`. A blind
-- client insert would let an owner assert ANY uuid as their staff (silently
-- granting that account the staff portal + making it a cover-request recipient
-- via migration 143). This SECURITY DEFINER RPC is the safety boundary: it sets
-- `profile_id` server-side from the SELECTED scholar's own user_id, so the owner
-- cannot forge it, and it enforces the scholar is claimed + active before linking.
--
-- IDENTITY MATH (same as 143): profiles.id = auth.users.id = auth.uid();
-- scholars.user_id is an auth.users.id. So profile_id := scholar.user_id resolves
-- to the scholar's profiles row, and getMyStaffMembership (profile_id = auth.uid(),
-- invite_status='active') then returns this row for the scholar's own login.
--
-- IDEMPOTENT: no unique index on (mosque_id, profile_id) exists, so a re-link must
-- not duplicate. The RPC upgrades an existing non-archived row for the same person
-- (matched by linked_scholar_id OR profile_id) instead of inserting a second.
-- ====================================================================

begin;

create or replace function public.mosque_link_scholar_to_staff(
  p_mosque_id uuid,
  p_scholar_id uuid,
  p_role text default 'Scholar'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid          uuid := auth.uid();
  v_scholar      record;
  v_email        text;
  v_existing     record;
  v_staff_id     uuid;
  v_already      boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Caller must OWN the mosque they are linking into.
  if not exists (
    select 1 from public.mosques m
     where m.id = p_mosque_id and m.user_id = v_uid
  ) then
    raise exception 'not_mosque_owner';
  end if;

  -- Load the scholar. Must be claimed (has an account) and active.
  -- (scholars has no email column; the directory email comes from the account.)
  select s.id, s.user_id, s.name, s.status
    into v_scholar
    from public.scholars s
   where s.id = p_scholar_id;

  if not found then
    raise exception 'scholar_not_found';
  end if;
  if v_scholar.user_id is null then
    -- An unclaimed scholar (no account) has no profiles row to route to.
    raise exception 'scholar_unclaimed';
  end if;
  if v_scholar.status is distinct from 'active' then
    raise exception 'scholar_not_active';
  end if;
  -- profile_id FK is ON DELETE RESTRICT -> profiles(id); pre-check for a clean
  -- error instead of a raw 23503 if the account somehow has no profiles row.
  if not exists (select 1 from public.profiles p where p.id = v_scholar.user_id) then
    raise exception 'scholar_no_profile';
  end if;

  -- Directory email for the staff row: the scholar's account email.
  select u.email into v_email from auth.users u where u.id = v_scholar.user_id;

  -- Idempotency / de-dup: reuse an existing non-archived row for this person
  -- (they may already be an in-house directory entry, or previously linked).
  select ms.id, ms.invite_status
    into v_existing
    from public.mosque_staff ms
   where ms.mosque_id = p_mosque_id
     and coalesce(ms.archived, false) = false
     and (ms.linked_scholar_id = p_scholar_id or ms.profile_id = v_scholar.user_id)
   order by (ms.invite_status = 'active') desc, ms.created_at asc
   limit 1;

  if found then
    v_already := (v_existing.invite_status = 'active');
    update public.mosque_staff
       set profile_id        = v_scholar.user_id,
           linked_scholar_id = p_scholar_id,
           invite_status     = 'active',
           status            = 'active',
           name              = coalesce(name, v_scholar.name),
           email             = coalesce(email, v_email),
           updated_at        = now()
     where id = v_existing.id;
    v_staff_id := v_existing.id;
  else
    insert into public.mosque_staff
      (mosque_id, profile_id, linked_scholar_id, role,
       invite_status, status, name, email)
    values
      (p_mosque_id, v_scholar.user_id, p_scholar_id, coalesce(nullif(btrim(p_role), ''), 'Scholar'),
       'active', 'active', v_scholar.name, v_email)
    returning id into v_staff_id;
  end if;

  return jsonb_build_object(
    'staff_id', v_staff_id,
    'profile_id', v_scholar.user_id,
    'linked_scholar_id', p_scholar_id,
    'already_linked', v_already
  );
end;
$function$;

grant execute on function public.mosque_link_scholar_to_staff(uuid, uuid, text) to authenticated;

commit;

notify pgrst, 'reload schema';

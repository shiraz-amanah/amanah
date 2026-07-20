-- 164_delete_mosque_role.sql
-- ====================================================================
-- D2 — guarded delete for a configurable staff role. RLS (162) can't enforce
-- "don't delete a default role" or "don't delete a role still in use", and can't
-- return a usage count — so deletion goes through this owner-OR-admin SECURITY
-- DEFINER RPC (add/rename/toggle/reorder stay on the RLS write policy).
--
-- USAGE = mosque_staff.role (decoupled TEXT — the role NAME) matched, counting
-- only ACTIVE workforce (archived=false AND status<>'offboarded'); a role used
-- only by offboarded/archived staff is deletable.
--
-- Returns jsonb:
--   { deleted:true,  used_by:0 }                       — deleted
--   { deleted:false, reason:'default', used_by:0 }     — default role, kept
--   { deleted:false, reason:'in_use',  used_by:N }     — still in use, kept
-- No table DDL.
-- ====================================================================

begin;

create or replace function public.delete_mosque_role(p_role_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid        uuid := auth.uid();
  v_mosque_id  uuid;
  v_name       text;
  v_is_default boolean;
  v_used       int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '42501'; end if;

  select mosque_id, name, is_default into v_mosque_id, v_name, v_is_default
    from public.mosque_roles where id = p_role_id;
  if v_mosque_id is null then raise exception 'role_not_found'; end if;

  -- owner OR admin (matches the mosque_roles write RLS — roles aren't owner-secret).
  if not (exists (select 1 from public.mosques m where m.id = v_mosque_id and m.user_id = v_uid)
          or public.is_admin()) then
    raise exception 'not_authorised' using errcode = '42501';
  end if;

  if v_is_default then
    return jsonb_build_object('deleted', false, 'reason', 'default', 'used_by', 0);
  end if;

  -- Only ACTIVE workforce blocks deletion (offboarded/archived don't count).
  select count(*)::int into v_used from public.mosque_staff
    where mosque_id = v_mosque_id and role = v_name
      and archived = false and status <> 'offboarded';
  if v_used > 0 then
    return jsonb_build_object('deleted', false, 'reason', 'in_use', 'used_by', v_used);
  end if;

  delete from public.mosque_roles where id = p_role_id;
  return jsonb_build_object('deleted', true, 'used_by', 0);
end; $$;

revoke all on function public.delete_mosque_role(uuid) from public, anon;
grant execute on function public.delete_mosque_role(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-164-dev.mjs, then STOP):
--   P1  prosecdef=true, owner=postgres, anon denied, authenticated granted.
--   P2  behavioural (BEGIN...ROLLBACK, dev-ref, savepoint per raise):
--       anon→blocked; non-owner→not_authorised(42501); default→{deleted:false,
--       reason:'default'}; in-use(active)→{deleted:false,reason:'in_use',used_by:N};
--       used only by offboarded/archived→{deleted:true}; unused non-default→
--       {deleted:true}.
--   Then STOP for prod go-ahead.
-- ====================================================================

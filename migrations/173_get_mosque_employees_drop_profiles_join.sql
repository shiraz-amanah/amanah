-- 173_get_mosque_employees_drop_profiles_join.sql
-- ====================================================================
-- Repairs get_mosque_employees, which has 400'd on EVERY call since
-- migration 127 — the Permissions panel has been dead for every staff
-- member for the whole window.
--
-- The defect: 127's body selects `p.avatar_url` from public.profiles.
-- That column does not exist and never did on profiles — profiles has
-- avatar_initials + avatar_gradient; avatar_url belongs to `scholars`.
-- Every invocation therefore raises, getMosqueEmployees (auth.js)
-- swallows the error and returns [], and the panel renders "This staff
-- member doesn't have dashboard access" for everyone.
--
-- Why it went unnoticed for so long: role assignment still works,
-- because applyRoleDefaults queries the mosque_employees table directly
-- rather than going through this RPC. Only the read path was broken, so
-- the feature looked half-alive.
--
-- WHY THE WHOLE JOIN GOES, NOT JUST THE BAD COLUMN:
-- The profiles join is `left join public.profiles p on p.id =
-- e.profile_id`, and p is referenced ONLY in the select list, as p.name
-- and p.avatar_url. It contributes no filtering and no row
-- multiplication, so removing it cannot change which rows come back.
-- Both of its output columns are dead on the client:
--   profile_avatar -> auth.js shapeEmployee `profileAvatar` — the only
--                     occurrence of that identifier repo-wide; nothing
--                     reads it.
--   profile_name   -> auth.js shapeEmployee `profileName`   — likewise
--                     the only occurrence; nothing reads it.
-- Both mappings are deleted from shapeEmployee in the paired client
-- commit. So the join is pure cost with no consumer, and the fix is a
-- removal rather than a patch.
--
-- The signature changes (two columns leave RETURNS TABLE), so CREATE OR
-- REPLACE is not available — Postgres refuses to replace a function
-- whose OUT parameters differ. Hence DROP + CREATE.
--
-- GRANTS ARE MANDATORY HERE: a DROP takes every grant with it. Note the
-- revoke is not decorative — Postgres grants EXECUTE to PUBLIC by
-- default on CREATE FUNCTION, and Supabase additionally carries ALTER
-- DEFAULT PRIVILEGES granting EXECUTE on new public functions to anon,
-- authenticated and service_role. So a bare grant-to-authenticated
-- would silently leave anon able to execute. The revoke runs AFTER the
-- create precisely so it strips that default. Mirrors 127's own
-- revoke-then-grant pattern for this function.
--
-- Measured grant set after applying (dev): authenticated, postgres,
-- service_role — anon correctly ABSENT. postgres + service_role are
-- re-granted by Supabase's default privileges, not by this file; they
-- are left alone (that matches the pre-drop set, which was the same
-- three). The sole application caller remains src/auth.js on an
-- authenticated client.
--
-- Preserved verbatim from 127: SECURITY DEFINER, STABLE,
-- SET search_path TO 'public', #variable_conflict use_column, the
-- mosque-owner gate, and ORDER BY e.created_at desc.
-- ====================================================================

drop function if exists public.get_mosque_employees(uuid);

create function public.get_mosque_employees(p_mosque_id uuid)
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
           e.profile_id, e.created_at
      from public.mosque_employees e
     where e.mosque_id = p_mosque_id
     order by e.created_at desc;
end;
$$;

revoke all on function public.get_mosque_employees(uuid) from public, anon;
grant execute on function public.get_mosque_employees(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'get_mosque_employees';
--
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'get_mosque_employees';
--   -- expect authenticated EXECUTE present; anon ABSENT.
--
-- Usage verification (NOT shape): the RPC returning 200 is not
-- sufficient — open the employees/permissions panel in the browser as
-- the mosque owner and confirm staff rows actually RENDER. The whole
-- point of this defect is that a swallowed error produced an empty list
-- that looked like a legitimate "no dashboard access" state.

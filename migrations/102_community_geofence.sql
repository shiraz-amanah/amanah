-- 102_community_geofence.sql
-- ====================================================================
-- Geofence auto check-in support (Session AZ, Phase 3b).
--
-- A registered member with the site open + location granted is auto-checked-in
-- when within 100m of their mosque. To do that their client must discover the
-- currently-OPEN session at the mosque — but they have no QR URL and
-- community_sessions is owner-only under RLS. This definer RPC returns ONLY the
-- open session's id/name/date (no PII), scoped to open sessions, and is granted
-- to authenticated (members) — NOT anon (geofence is a member-only path). The
-- check-in itself still goes through community_check_in, which resolves the
-- member from auth.uid() and dedups against any QR check-in.
--
-- No new table. Dev first, probe, then prod (same discipline as always).
-- ====================================================================

create or replace function public.community_current_session(p_mosque_id uuid)
returns table (id uuid, name text, session_date date)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.session_date
  from public.community_sessions s
  where s.mosque_id = p_mosque_id
    and s.closed_at is null
    and (s.closes_at is null or now() < s.closes_at)
  order by s.opened_at desc
  limit 1;
$$;
revoke all on function public.community_current_session(uuid) from public, anon;
grant execute on function public.community_current_session(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select proname, prosecdef from pg_proc where proname='community_current_session'; -- 1 row, t
--      select has_function_privilege('anon','public.community_current_session(uuid)','execute');          -- f
--      select has_function_privilege('authenticated','public.community_current_session(uuid)','execute'); -- t
--   3. Functional (as an authenticated member, against a mosque with an open session):
--      select * from community_current_session('<mosque-uuid>');   -- the open session id/name/date
--      -- close the session, call again -> 0 rows.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

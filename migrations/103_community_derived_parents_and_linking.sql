-- 103_community_derived_parents_and_linking.sql
-- ====================================================================
-- Community module — two "make membership real from an external identity" RPCs
-- (Session AZ). NO new table.
--
-- A. community_derived_parents(mosque_id) — parents of students actively enrolled
--    at the mosque, surfaced READ-ONLY in the Members directory (not written into
--    community_members). Owner-scoped in-query (modelled on 083 madrasa_export_
--    roster). Includes both signed-up parents (via students.profile_id → profiles)
--    and pending parents (students.pending_parent_email, no account yet).
--
-- B. community_link_my_memberships() — called on sign-in: links the caller's
--    account to any invited community_members row that carries their email (the
--    auto-link deferred from the invite commit). Sets profile_id so an invited
--    member sees their Community tab.
--
-- Dev first, probe, then prod (same discipline).
-- ====================================================================

-- A. Derived enrolled-parents (read-only directory surfacing) ------------------
-- One row per distinct parent (grouped by account id, else lowercased pending
-- email). child_count = distinct enrolled children. is_pending = the parent has
-- no Amanah account yet (email-only). Authz is the in-query owner/admin filter
-- (returns no rows to a non-owner), matching madrasa_export_roster.
create or replace function public.community_derived_parents(p_mosque_id uuid)
returns table (
  profile_id  uuid,
  name        text,
  email       text,
  is_pending  boolean,
  child_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (array_agg(s.profile_id) filter (where s.profile_id is not null))[1] as profile_id,
    max(pp.name)                                             as name,
    coalesce(max(pp.email), max(s.pending_parent_email))     as email,
    bool_and(s.profile_id is null)                           as is_pending,
    count(distinct s.id)::int                                as child_count
  from public.madrasa_enrollments e
  join public.students s        on s.id = e.student_id
  left join public.profiles pp  on pp.id = s.profile_id
  where e.mosque_id = p_mosque_id
    and e.status = 'active'
    and (p_mosque_id in (select id from public.mosques where user_id = auth.uid()) or public.is_admin())
  group by coalesce(s.profile_id::text, lower(s.pending_parent_email))
  having coalesce(max(pp.email), max(s.pending_parent_email)) is not null;
$$;
revoke all     on function public.community_derived_parents(uuid) from public;
revoke execute on function public.community_derived_parents(uuid) from anon;
grant  execute on function public.community_derived_parents(uuid) to authenticated, service_role;

-- B. Auto-link the caller's account to invited membership rows by email --------
-- Idempotent; returns the count linked. Skips a mosque where the caller is
-- already a linked member (avoids the (mosque_id, profile_id) partial-unique
-- collision if a manual + an invited row share the email).
create or replace function public.community_link_my_memberships()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_count int;
begin
  if v_uid is null then return 0; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email is null or v_email = '' then return 0; end if;

  update public.community_members cm
     set profile_id = v_uid
   where cm.profile_id is null
     and lower(cm.email) = v_email
     and not exists (
       select 1 from public.community_members x
       where x.mosque_id = cm.mosque_id and x.profile_id = v_uid
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all     on function public.community_link_my_memberships() from public, anon;
grant  execute on function public.community_link_my_memberships() to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select proname, prosecdef from pg_proc
--        where proname in ('community_derived_parents','community_link_my_memberships'); -- 2 rows, both t
--      select has_function_privilege('anon','public.community_derived_parents(uuid)','execute');            -- f
--      select has_function_privilege('authenticated','public.community_derived_parents(uuid)','execute');   -- t
--      select has_function_privilege('anon','public.community_link_my_memberships()','execute');            -- f
--      select has_function_privilege('authenticated','public.community_link_my_memberships()','execute');   -- t
--   3. Functional (as the mosque owner, with an actively-enrolled student):
--      select * from community_derived_parents('<mosque-uuid>');   -- one row per parent, child_count, is_pending
--      -- as a non-owner: same call -> 0 rows.
--      -- invite a member (email set, profile_id null), sign in as that email, then:
--      select community_link_my_memberships();                     -- 1 (that row now has profile_id)
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

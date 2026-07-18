-- 154_profiles_can_view_rls.sql
-- STATUS: new. Apply dev first (probe raw), then prod (Supabase SQL editor).
-- No table DDL — one helper function + a SELECT-policy swap on public.profiles.
--
-- ============================================================================
-- WHY (the vulnerability this closes)
-- ============================================================================
-- `public.profiles` carried a SELECT policy "Authenticated users can view
-- profiles" with qual = `true`. Combined with the row set (name, email, phone,
-- city, avatar, role, notification prefs, dashboard_prefs, …), that let ANY
-- authenticated user read EVERY profile on the platform — a cross-tenant PII
-- leak. This migration replaces that blanket `true` with a bounded predicate,
-- `can_view_profile(id)`: a caller may read a profile only when they are that
-- person, an admin, or in a genuine relationship with them (share a mosque, or
-- share a conversation).
--
-- Prior-session audit mapped every cross-user profiles read the app relies on:
--   * 6 madrasah name-resolution joins (same-mosque): attendance markedBy,
--     announcement/homework/report authors — owner + parent resolving a
--     teacher/author's name → covered by the shares-a-mosque clause.
--   * messaging embeds (getConversations / getMessages participant + sender
--     profiles) → covered by the shares-a-conversation clause.
--   * getReviewsForScholar (frozen marketplace surface) → DELIBERATELY NOT
--     covered (see RESIDUALS).
--
-- ============================================================================
-- SECURITY of can_view_profile
-- ============================================================================
-- SECURITY DEFINER, search_path pinned to 'public', STABLE. It is called FROM a
-- policy ON profiles, so it must not re-enter that policy: it never reads
-- `profiles` (its clauses touch mosques / mosque_staff / madrasa_enrollments /
-- students / conversation_participants only), and the one profiles-touching
-- dependency it calls — public.is_admin() — is itself SECURITY DEFINER and reads
-- profiles as the function owner, bypassing RLS. So there is NO RLS recursion
-- into profiles. All table refs are schema-qualified and aliased.
--
-- Membership breadth: a profile "belongs to" a mosque via ANY of three paths —
-- owner (mosques.user_id), staff (mosque_staff.profile_id, ANY status), or
-- parent of an enrolled child (students.profile_id → madrasa_enrollments). Two
-- profiles share a mosque when those id-sets intersect. mosque_staff is NOT
-- filtered by status: a row is an owner-created employment relationship, and the
-- only thing exposed within one mosque is name/avatar/PII of a co-member —
-- tightening to status='active' is a low-value future option, logged below.

create or replace function public.can_view_profile(p_target uuid)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select
    -- self
    p_target = auth.uid()
    -- admin: is_admin() is SECURITY DEFINER and reads profiles as owner, so this
    -- does not recurse into the profiles SELECT policy that calls us.
    or public.is_admin()
    -- shares a mosque: viewer (auth.uid()) and target belong to a common mosque
    -- via any membership path (owner / staff / parent-of-enrolled-child).
    or exists (
      with membership as (
        select m.id        as mosque_id, m.user_id as profile_id
          from public.mosques m
         where m.user_id is not null
        union
        select ms.mosque_id, ms.profile_id
          from public.mosque_staff ms
        union
        select e.mosque_id, s.profile_id
          from public.madrasa_enrollments e
          join public.students s on s.id = e.student_id
         where s.profile_id is not null
      )
      select 1
        from membership me
        join membership them on them.mosque_id = me.mosque_id
       where me.profile_id   = auth.uid()
         and them.profile_id = p_target
    )
    -- shares a conversation: both are participants of the same conversation.
    or exists (
      select 1
        from public.conversation_participants cp_me
        join public.conversation_participants cp_them
          on cp_them.conversation_id = cp_me.conversation_id
       where cp_me.user_id   = auth.uid()
         and cp_them.user_id = p_target
    );
$function$;

revoke all on function public.can_view_profile(uuid) from public;
-- authenticated: the profiles SELECT policy (to authenticated) evaluates this.
-- anon: granted for parity with is_admin() so any future public path evaluates
--       to false cleanly (auth.uid() is null → self/membership/conversation all
--       miss, is_admin() false → returns false). No info leak: boolean only.
grant execute on function public.can_view_profile(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Swap the leaky SELECT policy. The prod + dev policy name is
-- "Authenticated users can view profiles" (probed). Also drop the historical
-- migration-006 alias in case any environment still carries it.
-- "Admins read all profiles" (022) and both UPDATE policies are LEFT INTACT —
-- admin coverage is now doubly ensured (that policy OR can_view_profile's admin
-- clause), and the self-UPDATE policy is the dashboard_prefs write path.
-- ---------------------------------------------------------------------------
drop policy if exists "Authenticated users can view profiles" on public.profiles;
drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "Users can view permitted profiles"
  on public.profiles for select
  to authenticated
  using (public.can_view_profile(id));

-- ============================================================================
-- RESIDUALS (Phase 1 is deliberately partial — Phase 2 closes these)
-- ============================================================================
--   1. Relationship-bounded parties (same mosque / same conversation) can still
--      read each other's email + phone + all other columns, not just name +
--      avatar. Phase 2 (column-split PII + a public_profiles view exposing only
--      display fields) narrows the payload; this migration only narrows WHO.
--   2. Frozen marketplace surfaces degrade to blank names, by design
--      (freeze-don't-delete): getReviewsForScholar (published review authors)
--      AND getScholarBookings (a scholar reading a marketplace booking's parent
--      profile — createBooking spawns no conversation, and scholar↔parent need
--      not share a mosque). Neither is user-visible pre-launch; Phase 2's
--      name-snapshot restores them before Discover unfreezes. NOT patched here
--      with a review/booking clause — that was outside the approved design.
--   3. mosque_staff membership is unfiltered by status; tightening to
--      status='active' is a possible future hardening (low value).

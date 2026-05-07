-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 5)
--
-- Adds admin-aware RLS policies to profiles. Additive over the
-- existing policies (006: SELECT to authenticated using true; 010
-- TODO: UPDATE using auth.uid() = id). PostgreSQL OR-combines
-- policies for the same cmd, so:
--
--   SELECT: 006's open-to-authenticated policy already grants
--           visibility — this admin policy is redundant for
--           SELECT but documents intent. Future tightening (drop
--           006's open SELECT, replace with users-read-own + this
--           admin policy) is a parked item.
--   UPDATE: existing self-only policy stays; admin gets a parallel
--           policy that lets them flip role / suspended on any
--           profile.
--
-- Phase 5's auth.js helpers (listAllProfiles, setProfileRole,
-- setProfileSuspended) call through these policies. Without this
-- migration, setProfileRole on someone else's profile is a silent
-- RLS denial (same shape as the K-3 reviews bug).

create policy "Admins read all profiles"
  on profiles for select
  to authenticated
  using (public.is_admin());

create policy "Admins update profiles"
  on profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

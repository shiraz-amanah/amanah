-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 1)
--
-- Foundation for real admin authentication. Adds two columns to
-- profiles + two helper functions that subsequent migrations
-- (019+) reference from RLS policies.
--
--   profiles.role       — 'user' | 'scholar' | 'admin'
--                         Pre-K, AdminPanel access was a client-side
--                         demo gate (LoginScreen accepted any creds).
--                         From now on, AdminPanel is gated by
--                         role='admin' on the authenticated user's
--                         profile, set explicitly via SQL by an
--                         existing admin.
--   profiles.suspended  — soft-disable a user without deleting their
--                         account. Phase 1 only blocks signed-in
--                         admin access. Phase 5+ extends RLS write
--                         policies on bookings / saves / messages /
--                         reviews / donations to deny when
--                         is_suspended() = true; that's separate
--                         scope and intentionally deferred so the
--                         migration here doesn't grow.
--
-- HELPER FUNCTION SCHEMA
-- We put is_admin / is_suspended in the public schema rather than
-- auth. Some Supabase hosting tiers block CREATE FUNCTION in the
-- auth schema, and there's no upside — RLS policies can call any
-- schema. SECURITY DEFINER means policies can call these without
-- needing their own SELECT permission on profiles, which both
-- avoids recursion (a policy on profiles that called is_admin()
-- without security definer would recurse) and lets anon-but-
-- authenticated paths short-circuit when auth.uid() is null.
--
-- Marked stable so PostgREST can cache the result within a single
-- query plan; both queries have inputs only via auth.uid() which
-- is itself stable.

alter table profiles
  add column if not exists role text not null default 'user'
    check (role in ('user', 'scholar', 'admin')),
  add column if not exists suspended boolean not null default false;

-- Hot path: AdminPanel boot fires `select role from profiles where
-- id = auth.uid()` on every navigation. Index keeps that O(1).
create index if not exists profiles_role_idx on profiles(role);

-- Suspension is a sparse condition (almost no rows). Partial index
-- so the suspended-user lookup the admin All Users tab will run is
-- a small scan rather than a full table sweep.
create index if not exists profiles_suspended_idx on profiles(suspended)
  where suspended = true;

-- Helper: is the current authed user an admin?
-- coalesce + false default = anon callers (auth.uid() is null) and
-- profiles rows that don't exist yet both return false rather than
-- raising. Subsequent RLS policies can use `to authenticated using
-- (public.is_admin())` without worrying about edge cases.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select role = 'admin' from profiles where id = auth.uid()),
    false
  );
$$;

-- Helper: is the current authed user suspended?
-- Same shape as is_admin. Phase 1 only consumes this from the
-- client (handleSignIn). Phase 5+ migrations will reference it
-- from per-table INSERT/UPDATE policies.
create or replace function public.is_suspended()
returns boolean
language sql
security definer
stable
as $$
  select coalesce(
    (select suspended from profiles where id = auth.uid()),
    false
  );
$$;

-- anon needs is_admin() to evaluate to false in policies that might
-- hit the public path, so grant to anon too. is_suspended is only
-- meaningful for authenticated callers.
grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.is_suspended() to authenticated;

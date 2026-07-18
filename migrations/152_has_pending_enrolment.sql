-- 152_has_pending_enrolment.sql
-- STATUS: new. Apply dev first, then prod (Supabase SQL editor). No table DDL.
--
-- Gate parent self-signup to a real enrolment context (RBAC-E follow-up, Option A).
--
-- Background: the parent sign-in door (LandingPageV2 nav, PublicHeader, etc.) lands
-- on the shared UserAuth form whose "Create an account" toggle let ANY visitor
-- self-register a role='user' account, firing the deferred marketplace
-- "Welcome — Find a scholar" email + a new_parent_signup alert. But that same
-- self-signup is how LIVE, mosque-initiated madrasah parents onboard, so we GATE
-- rather than remove it.
--
-- This anon-callable boolean oracle answers: does p_email carry a live enrolment
-- signal —
--   * Path A (089): a child a mosque enrolled directly, holding the parent's
--     address in students.pending_parent_email until the parent first signs up; OR
--   * Path B (090): an outstanding self-registration invite
--     (madrasa_enrollment_invites.parent_email, status 'pending').
-- The UserAuth signup gate calls it before creating a role='user' account: no
-- signal → login-only (no self-signup); signal → allowed. Employee invites
-- (inviteToken) and scholar/mosque self-registration are gated in the client, not
-- here, and are unaffected.
--
-- SECURITY: SECURITY DEFINER (reads students + invites past RLS) but returns ONLY a
-- boolean for the exact email supplied — never rows or PII. The sole signal exposed
-- is "does this email have a pending madrasah enrolment", a low-sensitivity yes/no
-- fully consistent with the app already keying parent↔child linkage on email
-- (089 handle_new_user). Input trimmed + lowercased; null/empty → false. search_path
-- pinned. Callable pre-auth, so granted to anon.

create or replace function public.has_pending_enrolment(p_email text)
returns boolean
language sql
security definer
set search_path to 'public'
stable
as $function$
  select case
    when p_email is null or btrim(p_email) = '' then false
    else (
      exists (
        select 1 from public.students s
         where lower(s.pending_parent_email) = lower(btrim(p_email))
      )
      or exists (
        select 1 from public.madrasa_enrollment_invites i
         where lower(i.parent_email) = lower(btrim(p_email))
           and i.status = 'pending'
      )
    )
  end;
$function$;

revoke all on function public.has_pending_enrolment(text) from public;
grant execute on function public.has_pending_enrolment(text) to anon, authenticated;

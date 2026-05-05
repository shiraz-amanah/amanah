-- STATUS: Reconstructed
-- Already applied: 4 May 2026 (NOTES.md Session D, "Profiles RLS opened to authenticated reads").
--
-- Pre-D, profiles SELECT was `auth.uid() = id` (own row only). The
-- participant→profile join in messaging broke (other participants
-- rendered as "Unknown" with "??" initials). Replaced with
-- to-authenticated-using-true. Standard messaging-app pattern.
--
-- TODO: verify the original policy name. The DROP POLICY name below
-- is best-effort — Supabase Studio default would be something like
-- "Users can view their own profile" or "profiles_select_self".

drop policy if exists "profiles_select_self" on profiles;

create policy "profiles_select_authenticated" on profiles
  for select to authenticated using (true);

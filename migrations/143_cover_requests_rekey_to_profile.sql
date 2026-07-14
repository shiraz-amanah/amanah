-- 143_cover_requests_rekey_to_profile.sql
-- ====================================================================
-- SCHOLAR/PARENT cleanup — Commit 1 of 3: re-key cover_requests off the
-- scholars table onto a PROFILE identity, so a mosque_staff member who is
-- NOT a marketplace scholar can receive cover requests. This unblocks routing
-- scholar logins through the staff portal (commit 2) without a scholars row.
--
-- DECISION (C1): `recipient_profile_id` becomes the SOLE identity key — RLS
-- and the notification trigger both key off it. `scholar_id` is DEMOTED to an
-- inert display/provenance column (nullable, ON DELETE SET NULL, in NO RLS
-- policy). The scholars table is NOT touched structurally — freeze means freeze.
--
-- IDENTITY MATH (verified on dev): profiles.id -> auth.users(id); i.e.
-- profiles.id = auth.users.id = auth.uid(). scholars.user_id is an
-- auth.users.id; mosque_staff.profile_id is a profiles.id — the SAME uuid for
-- the same person. So recipient_profile_id -> profiles(id) with RLS
-- (= auth.uid()) resolves for BOTH a legacy scholar and a staff-only recipient.
--
-- Migration-134 discipline: add nullable -> backfill (only where a profiles row
-- exists — scholars.user_id references auth.users, not profiles) -> ABORT if any
-- pre-existing row is left unmigrated -> FK NOT VALID -> VALIDATE -> SET NOT NULL.
-- On dev this migrates 0 rows (cover_requests is empty); the abort-guard protects
-- prod if any orphan rows exist there.
--
-- Live pre-state (raw probe, dev, matches migration 061 exactly):
--   FK  cover_requests_scholar_id_fkey  -> scholars(id) ON DELETE CASCADE, scholar_id NOT NULL
--   RLS "Scholar read own cover requests"   SELECT  scholar_id IN (scholars WHERE user_id = auth.uid())
--   RLS "Scholar respond to cover requests" UPDATE  same USING + WITH CHECK
--   RLS "Owner manage cover requests"       ALL     (UNCHANGED by this migration)
--   TRIGGER notify_cover_request -> notify_on_cover_request() (087) resolves the
--           recipient on INSERT via scholars.user_id — re-keyed below.
-- ====================================================================

begin;

-- 1. New identity column, nullable for the backfill window.
alter table public.cover_requests
  add column if not exists recipient_profile_id uuid;

-- 2. Backfill from the legacy scholar link, ONLY where a profiles row exists.
--    (scholars.user_id -> auth.users, so a scholar whose user has no profiles
--    row cannot be a valid profiles-FK recipient — those are caught in step 3.)
update public.cover_requests cr
   set recipient_profile_id = s.user_id
  from public.scholars s
  join public.profiles p on p.id = s.user_id
 where cr.scholar_id = s.id
   and cr.recipient_profile_id is null;

-- 3. ABORT if ANY pre-existing row was left unmigrated — never proceed to
--    NOT NULL with orphan rows. (Dev: 0 rows -> passes trivially.)
do $$
declare n int;
begin
  select count(*) into n
    from public.cover_requests
   where scholar_id is not null and recipient_profile_id is null;
  if n > 0 then
    raise exception
      'ABORT: % cover_requests row(s) could not be migrated (scholar_id has no profiles-backed user_id). Resolve before re-running.', n;
  end if;
end $$;

-- 4. FK on the new column — NOT VALID then VALIDATE (134 pattern).
alter table public.cover_requests
  add constraint cover_requests_recipient_profile_id_fkey
  foreign key (recipient_profile_id) references public.profiles(id) on delete cascade
  not valid;
alter table public.cover_requests
  validate constraint cover_requests_recipient_profile_id_fkey;

-- 5. Recipient is always known on insert going forward -> enforce NOT NULL.
alter table public.cover_requests
  alter column recipient_profile_id set not null;

create index if not exists cover_requests_recipient_idx
  on public.cover_requests(recipient_profile_id);

-- 6. DEMOTE scholar_id to an inert display/provenance column (C1):
--    - nullable (future staff-only cover requests have no scholars row)
--    - FK ON DELETE CASCADE -> ON DELETE SET NULL (deleting a scholar must NOT
--      delete a cover request now owned by recipient_profile_id).
alter table public.cover_requests alter column scholar_id drop not null;
alter table public.cover_requests drop constraint cover_requests_scholar_id_fkey;
alter table public.cover_requests
  add constraint cover_requests_scholar_id_fkey
  foreign key (scholar_id) references public.scholars(id) on delete set null;

-- 7. RLS: replace the two scholar-keyed recipient policies with profile-keyed
--    ones. "Owner manage cover requests" is UNTOUCHED.
drop policy if exists "Scholar read own cover requests"   on public.cover_requests;
drop policy if exists "Scholar respond to cover requests" on public.cover_requests;

create policy "Recipient read own cover requests"
  on public.cover_requests for select to authenticated
  using (recipient_profile_id = auth.uid());

create policy "Recipient respond to cover requests"
  on public.cover_requests for update to authenticated
  using (recipient_profile_id = auth.uid())
  with check (recipient_profile_id = auth.uid());

-- 8. Re-key the notification trigger's recipient lookup: notify the recipient
--    DIRECTLY off recipient_profile_id (works for a staff-only recipient, not
--    just a scholar). The status-change branch (notifies the mosque owner) is
--    unchanged; scholar_id kept in its payload for continuity, plus the new id.
create or replace function public.notify_on_cover_request()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_user uuid;
begin
  begin
    if TG_OP = 'INSERT' then
      v_user := NEW.recipient_profile_id;
      perform public.create_notification(v_user, 'cover_request', 'New cover request',
        'A mosque has requested you for cover',
        jsonb_build_object('cover_request_id', NEW.id, 'mosque_id', NEW.mosque_id));
    elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status and NEW.status in ('confirmed', 'declined') then
      select user_id into v_user from public.mosques where id = NEW.mosque_id;
      perform public.create_notification(v_user, 'cover_request', 'Cover request ' || NEW.status,
        'A scholar has ' || NEW.status || ' your cover request',
        jsonb_build_object('cover_request_id', NEW.id, 'scholar_id', NEW.scholar_id, 'recipient_profile_id', NEW.recipient_profile_id));
    end if;
  exception when others then null; end;
  return null;
end; $function$;

commit;

notify pgrst, 'reload schema';

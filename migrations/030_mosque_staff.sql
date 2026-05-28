-- STATUS: Verbatim (authoritative; not documentary like 001–014)
-- Already applied: TBD (Session M Part B Day 1)
--
-- Creates the mosque-staff foundation: a join-table `mosque_staff`
-- linking profiles to mosques with a per-role status enum, and an
-- `mosque_staff_invites` table that captures the pre-acceptance
-- lifecycle. Plus two SECURITY DEFINER RPCs gating the anon and
-- authed acceptance paths.
--
-- Day-1 scope is the invite-token loop end-to-end. RTW form / DBS
-- order / Stripe Connect are explicitly out-of-scope for today and
-- ship in Days 2–3+ of Session M Part B. Staff land at
-- status='pending_rtw' and stop until the RTW surface ships.
--
-- Schema decisions (Session M Part B Day 1, locked):
--   Q1: status enums as CHECK constraints (not native enum types).
--       Matches every other status column in the project (mosques,
--       scholars, reviews, scholar_applications, dbs_orders). Keeps
--       value-space changes to ALTER CONSTRAINT, not ALTER TYPE.
--   Q2: tokens are uuid (gen_random_uuid) with a unique index, not
--       sequential ids. Per brief: "never predictable counters."
--   Q3: invite expiry defaults to now() + 24 hours. The token RPC
--       compares to now() and emits 'expired' rather than relying
--       on a scheduled job to flip status. A backfill flip-to-
--       'expired' on accept is the only state mutation; cleanup of
--       stale 'expired' rows is a Day-2+ concern.
--   Q4: invitee_email is text, NOT FK'd to auth.users — invitees
--       don't have an account yet when the invite is created. The
--       accept_staff_invite RPC checks the freshly-signed-up auth
--       user's email matches the invite (case-insensitive) before
--       inserting the mosque_staff row.
--   Q5: role is free-text on both tables. No CHECK constraint. The
--       admin wizard restricts the dropdown to {imam, admin,
--       teacher, volunteer, other}; broader value space stays open
--       at the DB layer so future role types don't need a migration.
--   Q6: anon read path is the SECURITY DEFINER function
--       `validate_staff_invite(token)` only — NOT a broad anon
--       SELECT policy on the invites table. Per brief: "Token
--       validation for anon goes through a SECURITY DEFINER function
--       (e.g. validate_staff_invite(token uuid)) that returns only
--       safe columns (mosque name, role, invitee email/name,
--       expiry, validity) — NOT a broad anon SELECT policy."
--   Q7: accept path is also a SECURITY DEFINER function
--       `accept_staff_invite(token)`. Two reasons: (a) atomicity
--       — mosque_staff INSERT + invite UPDATE must happen in one
--       call so a network drop mid-flow can't leave a half-state;
--       (b) RLS for INSERT on mosque_staff would otherwise need to
--       permit the invitee, who has no admin-of-mosque grant.
--   Q8: FK on-delete behavior — mosque_id ON DELETE CASCADE (deleting
--       a mosque tears down its staff + invites; mosques are rarely
--       hard-deleted, but the row-orphan failure mode is worse than
--       the audit-trail loss). profile_id ON DELETE RESTRICT on
--       mosque_staff — parallels invited_by; preserves audit and
--       blocks accidental profile deletion when active staff
--       affiliations exist (intentional friction, not a bug).
--       invited_by ON DELETE RESTRICT for the same reason —
--       deleting an admin with outstanding invites is blocked.
--   Q9: unique(mosque_id, profile_id) on mosque_staff prevents the
--       same person being staff at the same mosque twice. Different
--       mosques OK.
--   Q10: unique partial index on (mosque_id, lower(invitee_email))
--        where status='pending' prevents duplicate pending invites
--        to the same email at the same mosque. Re-inviting after
--        the prior invite expires/is revoked is permitted.

-- ====================================================================
-- mosque_staff
-- ====================================================================

create table mosque_staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  role text not null,
  status text not null default 'pending_rtw'
    check (status in ('pending_invite', 'pending_rtw', 'active', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index mosque_staff_mosque_profile_idx
  on mosque_staff(mosque_id, profile_id);
create index mosque_staff_mosque_idx on mosque_staff(mosque_id);
create index mosque_staff_profile_idx on mosque_staff(profile_id);

alter table mosque_staff enable row level security;

-- Mosque admins: full CRUD on rows for their own mosque(s).
create policy "Mosque admins read own-mosque staff"
  on mosque_staff for select
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

create policy "Mosque admins update own-mosque staff"
  on mosque_staff for update
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  )
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

create policy "Mosque admins delete own-mosque staff"
  on mosque_staff for delete
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

-- No INSERT policy: the only insert path is accept_staff_invite
-- (SECURITY DEFINER) which bypasses RLS. Future admin-direct-add
-- surface would get its own policy.

-- Staff members can read their own row (status visibility for the
-- post-acceptance confirmation screen + future staff dashboard).
create policy "Staff read own row"
  on mosque_staff for select
  to authenticated
  using (profile_id = auth.uid());

-- Admins (platform admins, not mosque admins) read all rows.
create policy "Platform admins read all staff"
  on mosque_staff for select
  to authenticated
  using (public.is_admin());

-- ====================================================================
-- mosque_staff_invites
-- ====================================================================

create table mosque_staff_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid(),
  mosque_id uuid not null references public.mosques(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete restrict,
  invitee_email text not null,
  invitee_name text,
  role text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index mosque_staff_invites_token_idx on mosque_staff_invites(token);
create index mosque_staff_invites_mosque_idx on mosque_staff_invites(mosque_id);
create unique index mosque_staff_invites_pending_email_idx
  on mosque_staff_invites(mosque_id, lower(invitee_email))
  where status = 'pending';

alter table mosque_staff_invites enable row level security;

-- Mosque admins: full CRUD on invites for their own mosque(s).
create policy "Mosque admins read own-mosque invites"
  on mosque_staff_invites for select
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

create policy "Mosque admins insert own-mosque invites"
  on mosque_staff_invites for insert
  to authenticated
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
    and invited_by = auth.uid()
  );

create policy "Mosque admins update own-mosque invites"
  on mosque_staff_invites for update
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  )
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

create policy "Mosque admins delete own-mosque invites"
  on mosque_staff_invites for delete
  to authenticated
  using (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

-- Authenticated invitees can read their own pending invite (lets a
-- signed-in user revisit the accept page without going through the
-- definer function again — convenience, not required for the core
-- flow which uses validate_staff_invite for the anon page load).
create policy "Invitees read own pending invite"
  on mosque_staff_invites for select
  to authenticated
  using (
    status = 'pending'
    and lower(invitee_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- Platform admin read.
create policy "Platform admins read all invites"
  on mosque_staff_invites for select
  to authenticated
  using (public.is_admin());

-- NOTE: no anon SELECT policy. Anon validation flows through the
-- validate_staff_invite() SECURITY DEFINER function below.

-- ====================================================================
-- updated_at trigger (mosque_staff only — invites are immutable
-- post-creation except via status flips, which we accept may not
-- touch updated_at). Follows the per-table touch_* convention from
-- migrations 015 / 025 / 027 / 029 rather than a shared helper.
-- ====================================================================

create or replace function public.touch_mosque_staff_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger mosque_staff_touch_updated_at
  before update on public.mosque_staff
  for each row execute function public.touch_mosque_staff_updated_at();

-- ====================================================================
-- validate_staff_invite — anon-callable, returns safe-shape preview
-- of an invite by token. Returns one row with valid=false + reason
-- for not-found, wrong-status, expired cases so the accept page can
-- render an appropriate message without revealing whether a token
-- exists.
-- ====================================================================

create or replace function public.validate_staff_invite(p_token uuid)
returns table (
  valid boolean,
  reason text,
  mosque_id uuid,
  mosque_name text,
  invitee_email text,
  invitee_name text,
  role text,
  expires_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  inv record;
begin
  select i.mosque_id, i.invitee_email, i.invitee_name, i.role,
         i.status, i.expires_at, m.name as mosque_name
    into inv
    from public.mosque_staff_invites i
    join public.mosques m on m.id = i.mosque_id
   where i.token = p_token;

  if not found then
    return query select false, 'not_found'::text,
                        null::uuid, null::text, null::text, null::text,
                        null::text, null::timestamptz;
    return;
  end if;

  if inv.status <> 'pending' then
    return query select false, ('status:' || inv.status)::text,
                        inv.mosque_id, inv.mosque_name,
                        inv.invitee_email, inv.invitee_name,
                        inv.role, inv.expires_at;
    return;
  end if;

  if inv.expires_at < now() then
    return query select false, 'expired'::text,
                        inv.mosque_id, inv.mosque_name,
                        inv.invitee_email, inv.invitee_name,
                        inv.role, inv.expires_at;
    return;
  end if;

  return query select true, null::text,
                      inv.mosque_id, inv.mosque_name,
                      inv.invitee_email, inv.invitee_name,
                      inv.role, inv.expires_at;
end;
$$;

revoke all on function public.validate_staff_invite(uuid) from public;
grant execute on function public.validate_staff_invite(uuid) to anon, authenticated;

-- ====================================================================
-- accept_staff_invite — authenticated-only. Atomic: re-validates the
-- token, verifies the calling user's email matches the invite, then
-- inserts mosque_staff (status='pending_rtw') and updates the invite
-- to accepted in a single transaction. Returns ok=false + reason on
-- any rejection so the client can render a clear error.
-- ====================================================================

create or replace function public.accept_staff_invite(p_token uuid)
returns table (
  ok boolean,
  reason text,
  staff_id uuid,
  mosque_id uuid
)
language plpgsql
security definer
volatile
set search_path = public
as $$
declare
  inv record;
  v_user_id uuid;
  v_user_email text;
  v_staff_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return query select false, 'not_authenticated'::text, null::uuid, null::uuid;
    return;
  end if;

  select email into v_user_email from auth.users where id = v_user_id;

  select * into inv
    from public.mosque_staff_invites
   where token = p_token
   for update;

  if not found then
    return query select false, 'not_found'::text, null::uuid, null::uuid;
    return;
  end if;

  if inv.status <> 'pending' then
    return query select false, ('status:' || inv.status)::text, null::uuid, inv.mosque_id;
    return;
  end if;

  if inv.expires_at < now() then
    update public.mosque_staff_invites set status = 'expired' where id = inv.id;
    return query select false, 'expired'::text, null::uuid, inv.mosque_id;
    return;
  end if;

  if lower(v_user_email) <> lower(inv.invitee_email) then
    return query select false, 'email_mismatch'::text, null::uuid, inv.mosque_id;
    return;
  end if;

  -- Idempotency: if this profile is already staff at this mosque,
  -- short-circuit and mark invite accepted without inserting a dupe.
  select id into v_staff_id
    from public.mosque_staff
   where profile_id = v_user_id and mosque_id = inv.mosque_id;

  if v_staff_id is null then
    insert into public.mosque_staff (profile_id, mosque_id, role, status)
      values (v_user_id, inv.mosque_id, inv.role, 'pending_rtw')
      returning id into v_staff_id;
  end if;

  update public.mosque_staff_invites
     set status = 'accepted', accepted_at = now()
   where id = inv.id;

  return query select true, null::text, v_staff_id, inv.mosque_id;
end;
$$;

revoke all on function public.accept_staff_invite(uuid) from public;
grant execute on function public.accept_staff_invite(uuid) to authenticated;

-- ====================================================================
-- PostgREST schema cache reload — required after every migration
-- that adds tables/columns/functions (see NOTES.md "PostgREST schema
-- cache trap"). Run alongside this migration in the SQL editor.
-- ====================================================================

notify pgrst, 'reload schema';

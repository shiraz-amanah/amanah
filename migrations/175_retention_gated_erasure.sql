-- 175_retention_gated_erasure.sql
-- ====================================================================
-- Retention-gated erasure. GDPR right-to-erasure must be IMPOSSIBLE until
-- statutory retention expires — enforced by RULES, in both layers. This
-- file is the DB layer; the client renders a locked danger zone on the
-- same stored date. Erasure stays human-triggered: the system gates
-- permission, it never acts on its own.
--
-- THE FORMULA
--   retention_eligible_at = greatest(
--     end_date + 2 years,                        -- right-to-work evidence
--     (tax year end following end_date) + 3 years -- payroll / HMRC
--   )
-- UK tax year ends 5 April. "Tax year end following end_date" is
-- implemented as THE FIRST 5 APRIL ON OR AFTER end_date, so an end_date
-- of exactly 2026-04-05 resolves to 2026-04-05 (the end of the tax year
-- that contains it), and 2026-04-06 resolves to 2027-04-05. That
-- boundary is deliberate and legally load-bearing — do not "fix" it to
-- strictly-after without a ruling.
--
-- STORED, NOT DERIVED: computed once at offboard and written to the row,
-- so the date is auditable and stable even if the rules change later. A
-- generated/derived column would silently rewrite history.
--
-- The formula lives in ONE place — public.staff_retention_eligible_at()
-- — used by both offboard_staff and the backfill below, so the two can
-- never drift.
--
-- ── RULINGS ENCODED HERE (a)-(c) ─────────────────────────────────────
-- (a) end_date becomes REQUIRED on offboard: offboard_staff raises
--     'end_date_required' on a null p_end_date (client validates too).
--     The retention formula uses coalesce(end_date,
--     offboarding_completed_at::date) so LEGACY rows without an end_date
--     still compute. The guard's null branch survives as an unreachable
--     safety net.
-- (b) deleted_at is SUPERSEDED. offboard_staff stops writing it, and the
--     backfill clears existing values. One retention concept, not two.
--     Background: offboard wrote deleted_at = now() + 2 years, but
--     get_mosque_staff_list filters `deleted_at is null` — treating a
--     FUTURE date as a tombstone. Nothing ever compared it to now(), so
--     offboarded staff vanished from the Employees tab immediately and
--     the "2 years" did nothing.
--     >>> VISIBLE CONSEQUENCE ON PROD: clearing deleted_at makes
--     >>> previously-hidden offboarded staff REAPPEAR in the Employees
--     >>> tab (badged "Offboarded", muted). That is a data-driven list
--     >>> change in a phase specified as "no list-query changes".
--     >>> Phase 2 adds the Former staff tab that gives them a proper
--     >>> home. Flagged for a go/no-go before prod apply.
--     Compliance is NOT affected: isComplianceCountable already excludes
--     archived + 'offboarded', so Ofsted/compliance counts do not move.
-- (c) The 157 privileged-column guard is extended to the three new
--     columns. Without this they would be freely settable from the
--     client: updateMosqueStaff (auth.js:1402) is a generic
--     `.update(updates)` passthrough with no allowlist, so an owner
--     could set retention_eligible_at into the past and unlock their own
--     erasure. That would defeat the entire gate.
--
-- ── TWO DECISIONS FORCED BY THIS MIGRATION (flagged, not assumed) ─────
-- 1. get_mosque_staff_list MUST return retention_eligible_at for the
--    client to render the locked state at all. That changes its
--    signature, so it needs DROP + CREATE (replace cannot alter OUT
--    params) — the same shape as migration 173. Not a design deviation;
--    a necessary consequence of the specified UI.
-- 2. Its grants die with that DROP. The pre-drop set was
--    {PUBLIC, anon, authenticated, postgres, service_role}. This file
--    restores authenticated and REVOKES public/anon rather than
--    reinstating them. Functionally identical — the function already
--    raises 'not_mosque_owner' for any non-owner/non-admin caller, so
--    anon never got data — and it matches the 127/173 convention. It is
--    nonetheless a tightening of the prior state: say so if unwanted.
--
-- Cross-refs: 129 (offboard_staff + anonymise_staff origin), 130
-- (current get_mosque_staff_list), 157 (the guard being extended),
-- 172 (erasure writes email = NULL), 174 (partial unique index that
-- lets more than one row hold a NULL email).
-- ====================================================================

begin;

-- ── 1. Columns ─────────────────────────────────────────────────────
alter table public.mosque_staff
  add column if not exists offboarded_at         timestamptz,
  add column if not exists anonymised_at         timestamptz,
  add column if not exists retention_eligible_at timestamptz;

comment on column public.mosque_staff.retention_eligible_at is
  'Stored at offboard. Erasure is refused by anonymise_staff until now() >= this. See migration 175.';
comment on column public.mosque_staff.anonymised_at is
  'Set by anonymise_staff. The flag the erasure register and list filters key on — do not sniff [REDACTED] strings.';

-- ── 2. The formula, in one place ───────────────────────────────────
-- STABLE not IMMUTABLE: the ::timestamptz cast depends on the session
-- TimeZone setting, so it is not immutable in the strict Postgres sense.
create or replace function public.staff_retention_eligible_at(p_end_date date)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case when p_end_date is null then null else greatest(
    (p_end_date + interval '2 years'),
    ((case
        when p_end_date <= make_date(extract(year from p_end_date)::int, 4, 5)
          then make_date(extract(year from p_end_date)::int, 4, 5)
        else make_date(extract(year from p_end_date)::int + 1, 4, 5)
      end) + interval '3 years')
  )::timestamptz end
$$;

revoke all on function public.staff_retention_eligible_at(date) from public, anon;
grant execute on function public.staff_retention_eligible_at(date) to authenticated;

-- ── 3. offboard_staff — require end_date, stamp the retention date ──
-- Unchanged from 129 except: the end_date guard, offboarded_at,
-- retention_eligible_at, and the REMOVED deleted_at write (ruling b).
create or replace function public.offboard_staff(
  p_staff_id uuid, p_reason text, p_end_date date)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  -- Ruling (a): retention cannot be computed without a leaving date, and a
  -- null one would lock the record against erasure forever.
  if p_end_date is null then
    raise exception 'end_date_required';
  end if;
  update mosque_staff set
    status = 'offboarded', archived = true,
    end_date = p_end_date, offboarding_reason = p_reason,
    offboarding_completed_at = now(),
    offboarded_at = now(),
    retention_eligible_at = public.staff_retention_eligible_at(p_end_date)
    -- deleted_at deliberately NOT set — superseded by retention_eligible_at.
    , profile_id = null, invite_status = 'not_invited'
  where id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque, v_uid, p_staff_id, 'staff_offboarded',
            jsonb_build_object('reason', p_reason, 'end_date', p_end_date,
                               'retention_eligible_at',
                               public.staff_retention_eligible_at(p_end_date)));
end; $$;

-- ── 4. anonymise_staff — retention guard + anonymised_at ───────────
-- Body is the 172 version plus: the retention guard (immediately after
-- the ownership check, BEFORE any write) and the anonymised_at stamp.
create or replace function public.anonymise_staff(p_staff_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid; v_eligible timestamptz;
begin
  select mosque_id, retention_eligible_at
    into v_mosque, v_eligible
    from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  -- Statutory retention gate. Refuses BEFORE the first write, so a blocked
  -- attempt leaves the row completely untouched and writes no audit row.
  -- The null branch is the unreachable safety net from ruling (a): a row
  -- that never got a retention date can never be erased.
  if v_eligible is null or now() < v_eligible then
    raise exception 'retention_active';
  end if;
  update mosque_staff set
    name = '[REDACTED]', email = null, phone = '[REDACTED]',
    bio = null, dbs_certificate = '[REDACTED]',
    anonymised_at = now()
  where id = p_staff_id;
  update mosque_staff_employment set
    dob = null, address = '[REDACTED]', ni_number = '[REDACTED]',
    bank_account_name = '[REDACTED]', bank_sort_code = '[REDACTED]',
    bank_account_number = '[REDACTED]',
    nationality = '[REDACTED]',
    emergency_contact_name = '[REDACTED]', emergency_contact_phone = '[REDACTED]',
    rtw_document_number = '[REDACTED]', rtw_share_code = '[REDACTED]',
    dbs_certificate_number = '[REDACTED]', dbs_id_document_number = '[REDACTED]',
    reference_1_name = '[REDACTED]', reference_1_email = '[REDACTED]',
    reference_2_name = '[REDACTED]', reference_2_email = '[REDACTED]'
  where staff_id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'staff_anonymised');
end; $function$;

-- ── 5. Extend the 157 privileged-column guard (ruling c) ───────────
-- Body is 157's verbatim, plus the three retention columns. Still
-- SECURITY INVOKER — a DEFINER trigger would always see postgres and
-- defeat the check (see 157's header).
create or replace function public.guard_mosque_staff_privileged_cols()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.profile_id            is distinct from old.profile_id
    or new.invite_status         is distinct from old.invite_status
    or new.status                is distinct from old.status
    or new.mosque_id             is distinct from old.mosque_id
    or new.offboarded_at         is distinct from old.offboarded_at
    or new.anonymised_at         is distinct from old.anonymised_at
    or new.retention_eligible_at is distinct from old.retention_eligible_at then
      raise exception
        'mosque_staff privileged column (profile_id/invite_status/status/mosque_id/'
        'offboarded_at/anonymised_at/retention_eligible_at) may only be changed via '
        'suspend_staff / offboard_staff / anonymise_staff / approve_onboarding_session '
        '/ accept_staff_invite — not a direct update'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ── 6. get_mosque_staff_list — expose the retention columns ────────
-- Signature changes, so DROP + CREATE. Grants die with the drop and are
-- restored below (see header decision 2).
drop function if exists public.get_mosque_staff_list(uuid);

create function public.get_mosque_staff_list(p_mosque_id uuid)
returns table (
  id uuid, mosque_id uuid, name text, email text, photo_url text, role text,
  job_title text, department text, staff_type text, employment_type text,
  status text, invite_status text, archived boolean, start_date date,
  end_date date, onboarding_completed_at timestamptz, onboarding_method text,
  listed_on_marketplace boolean, show_dbs_badge_publicly boolean,
  show_on_profile boolean, linked_scholar_id uuid, annual_leave_days integer,
  leave_balance_days numeric, dbs_status text, dbs_level text,
  dbs_expiry_date date, dbs_required boolean, rtw_verified boolean,
  rtw_refused boolean, rtw_expiry_date date, rtw_document_type text,
  last_login_at timestamptz, created_at timestamptz,
  offboarded_at timestamptz, anonymised_at timestamptz,
  retention_eligible_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from mosques where id = p_mosque_id and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_mosque_owner';
  end if;
  return query
    select s.id, s.mosque_id, s.name, s.email, s.photo_url,
           s.role, s.job_title, s.department, s.staff_type,
           s.employment_type, s.status, s.invite_status, s.archived,
           s.start_date, s.end_date, s.onboarding_completed_at,
           s.onboarding_method, s.listed_on_marketplace,
           s.show_dbs_badge_publicly, s.show_on_profile, s.linked_scholar_id,
           s.annual_leave_days, s.leave_balance_days,
           s.dbs_status, s.dbs_level, s.dbs_expiry_date, s.dbs_required,
           e.rtw_verified, e.rtw_refused, e.rtw_expiry_date, e.rtw_document_type,
           s.last_login_at, s.created_at,
           s.offboarded_at, s.anonymised_at, s.retention_eligible_at
      from mosque_staff s
      left join mosque_staff_employment e on e.staff_id = s.id
      where s.mosque_id = p_mosque_id
        and s.deleted_at is null
      order by s.created_at desc;
end; $function$;

revoke all on function public.get_mosque_staff_list(uuid) from public, anon;
grant execute on function public.get_mosque_staff_list(uuid) to authenticated;

-- ── 7. Backfill ────────────────────────────────────────────────────
-- Runs as the migration owner (postgres), so the 157 trigger's
-- current_user branch does not apply. Data-driven throughout: no pasted
-- timestamps, so it is safe to re-run and identical on dev and prod.

-- 7a. offboarded_at from the existing completion stamp.
update public.mosque_staff
   set offboarded_at = offboarding_completed_at
 where offboarded_at is null
   and offboarding_completed_at is not null;

-- 7b. retention_eligible_at for every offboarded-shaped row, using the
--     ruling-(a) coalesce so legacy rows with no end_date still compute.
update public.mosque_staff
   set retention_eligible_at = public.staff_retention_eligible_at(
         coalesce(end_date, offboarding_completed_at::date))
 where retention_eligible_at is null
   and coalesce(end_date, offboarding_completed_at::date) is not null
   and (status = 'offboarded' or archived or end_date is not null);

-- 7c. anonymised_at for already-erased rows, taken from the audit trail
--     itself rather than a hardcoded value (this is the known prod row).
update public.mosque_staff s
   set anonymised_at = a.ts
  from (select staff_id, max(created_at) as ts
          from public.mosque_staff_audit_log
         where action = 'staff_anonymised'
         group by staff_id) a
 where a.staff_id = s.id
   and s.anonymised_at is null;

-- 7d. Clear the superseded retention marker (ruling b). See the VISIBLE
--     CONSEQUENCE note in the header before applying to prod.
update public.mosque_staff
   set deleted_at = null
 where deleted_at is not null;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- PROBES (dev then prod).
--
-- Formula spot-checks — these are the legally load-bearing boundaries:
--   select d, public.staff_retention_eligible_at(d) from (values
--     ('2026-04-05'::date), ('2026-04-06'::date), ('2026-01-31'::date)
--   ) v(d);
--   -- 2026-04-05 -> tax year end 2026-04-05 +3y = 2029-04-05;
--   --               end_date+2y = 2028-04-05; greatest = 2029-04-05
--   -- 2026-04-06 -> tax year end 2027-04-05 +3y = 2030-04-05
--   -- 2026-01-31 -> tax year end 2026-04-05 +3y = 2029-04-05
--
-- Rows left without a retention date (should be only never-offboarded staff):
--   select count(*) from public.mosque_staff
--    where retention_eligible_at is null and (status='offboarded' or archived);
--   -- expect 0. Any row here can NEVER be erased — investigate before prod.
--
--   select count(*) as leftover_deleted_at from public.mosque_staff
--    where deleted_at is not null;   -- expect 0
--
-- Usage verification (NOT shape):
--   1. Offboard with a known end_date -> retention_eligible_at correct.
--   2. Offboard with a null end_date  -> raises end_date_required.
--   3. anonymise_staff on a retained row -> raises retention_active, row
--      completely untouched, NO audit row written.
--   4. Direct .update() of retention_eligible_at from an owner session ->
--      rejected by the 157 trigger with 42501.
--   5. Time-travel (set retention_eligible_at into the past as postgres)
--      -> erasure succeeds and anonymised_at is stamped.

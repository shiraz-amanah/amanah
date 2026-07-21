-- 179_retention_eligibility_nudge.sql
-- ====================================================================
-- Proactive nudge when a former staff record crosses into erasure
-- eligibility.
--
-- THE PROBLEM THIS SOLVES. Eligibility is a TIME-BASED transition:
-- retention_eligible_at going from future to past changes no row and fires
-- no trigger, so there is nothing for the database to react to. Today the
-- only signal is the green banner on the Former staff tab, which requires
-- the owner to already be looking at the tab — precisely what they will not
-- be doing for a record they have forgotten. Hence a scheduled sweep.
--
-- 1. retention_notified_at — the DEDUPE MARKER. Without it the sweep
--    re-notifies every morning forever, and a daily nag trains the owner to
--    ignore the one notification that matters.
--
-- 2. The 157 guard is EXTENDED to cover it (same reasoning as 175 ruling c).
--    A client that could clear this column via the generic updateMosqueStaff
--    passthrough could re-trigger nudges at will. Lower stakes than the
--    retention date itself, but the same hole.
--
-- 3. CLAIM-AND-NOTIFY IN ONE STATEMENT. The UPDATE ... RETURNING claims the
--    rows and reports them atomically, so two overlapping runs cannot both
--    notify: the second sees retention_notified_at already set and matches
--    nothing. This mirrors mark_reminder_sent in the existing reminder_sweep,
--    which claims before sending for the same reason.
--
-- 4. NOTIFICATION IS CREATED INSIDE THIS FUNCTION, not by the caller.
--    create_notification is revoked from public and is meant to be called
--    from definer functions (087 does exactly this for progress reports).
--    Doing it here also keeps claim and notify in one transaction: a crash
--    between them would otherwise stamp the marker and never notify, and the
--    marker means the nudge can never fire again. Silent permanent loss.
--
-- 5. DIGEST, NOT PER-RECORD. One notification per mosque per sweep, however
--    many records crossed. Three separate notifications on the same morning
--    is noise describing one situation.
--
-- 6. OWNER ONLY (v1). Notifies mosques.user_id. Admins are deliberately not
--    notified — this is an action the owner takes, and erasure is theirs to
--    decide.
--
-- 7. IN-APP ONLY (v1). No email. type='system' is already allowed by the
--    087 CHECK, so no constraint change.
--
-- SERVICE-ROLE ONLY. The sweep runs from Vercel Cron via the service key.
-- The function refuses any other caller so a signed-in user cannot drive the
-- notification machinery or mass-stamp the dedupe marker.
-- ====================================================================

-- ── 1. The dedupe marker ────────────────────────────────────────────
alter table public.mosque_staff
  add column if not exists retention_notified_at timestamptz;

comment on column public.mosque_staff.retention_notified_at is
  'Stamped by sweep_retention_eligible when the owner has been nudged that this '
  'record cleared retention. Dedupe marker — privileged, see the 157 guard. '
  'Migration 179.';

-- ── 2. Extend the 157 privileged-column guard ───────────────────────
-- Body is 175''s verbatim, plus retention_notified_at. Still SECURITY
-- INVOKER — a DEFINER trigger would always see postgres and defeat the
-- check (see 157''s header).
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
    or new.retention_eligible_at is distinct from old.retention_eligible_at
    or new.retention_notified_at is distinct from old.retention_notified_at then
      raise exception
        'mosque_staff privileged column (profile_id/invite_status/status/mosque_id/'
        'offboarded_at/anonymised_at/retention_eligible_at/retention_notified_at) '
        'may only be changed via suspend_staff / offboard_staff / anonymise_staff / '
        'approve_onboarding_session / accept_staff_invite / sweep_retention_eligible '
        '— not a direct update'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ── 3. The sweep ────────────────────────────────────────────────────
create or replace function public.sweep_retention_eligible()
returns table (mosque_id uuid, owner_id uuid, newly_eligible integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  -- Cron-only. Not reachable by authenticated or anon.
  if current_user not in ('postgres', 'service_role') then
    raise exception 'service_role_only';
  end if;

  for r in
    with claimed as (
      update mosque_staff s
         set retention_notified_at = now()
       where s.retention_eligible_at is not null
         and s.retention_eligible_at <= now()
         and s.anonymised_at is null
         and s.retention_notified_at is null
      returning s.mosque_id as mid
    )
    select m.id as mid, m.user_id as uid, m.name as mname, count(*)::int as n
      from claimed c
      join mosques m on m.id = c.mid
     group by m.id, m.user_id, m.name
  loop
    perform public.create_notification(
      r.uid,
      'system',
      case when r.n = 1
        then '1 staff record can now be erased'
        else r.n || ' staff records can now be erased' end,
      case when r.n = 1
        then 'A former staff record at ' || coalesce(r.mname, 'your mosque') ||
             ' has passed its statutory retention period and can now be anonymised, if you choose to.'
        else r.n || ' former staff records at ' || coalesce(r.mname, 'your mosque') ||
             ' have passed their statutory retention period and can now be anonymised, if you choose to.' end,
      jsonb_build_object('kind', 'retention_eligible', 'mosque_id', r.mid, 'count', r.n)
    );
    mosque_id := r.mid; owner_id := r.uid; newly_eligible := r.n;
    return next;
  end loop;
end; $function$;

revoke all on function public.sweep_retention_eligible() from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select md5(p.prosrc), length(p.prosrc)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('sweep_retention_eligible', 'guard_mosque_staff_privileged_cols');
--
--   select grantee from information_schema.routine_privileges
--    where routine_schema = 'public' and routine_name = 'sweep_retention_eligible';
--   -- expect NO authenticated, NO anon, NO PUBLIC (service_role/postgres only)
--
-- Behaviour to verify by usage, not shape:
--   * a record crossing eligibility produces exactly ONE notification;
--   * a second sweep with nothing new produces NONE;
--   * a client UPDATE of retention_notified_at is rejected 42501;
--   * the Former staff banner still works independently.

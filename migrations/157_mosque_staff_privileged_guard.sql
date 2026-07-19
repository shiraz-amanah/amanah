-- 157_mosque_staff_privileged_guard.sql
-- ====================================================================
-- >>> APPLIED + probed on dev + prod (19 July 2026). Landed via staff-avatars-v1. <<<
-- Gate 2 hardening. Two parts, one file. Dev probes 16/16; prod probes confirmed
-- (guard_mosque_staff_privileged_cols prosecdef=false; trigger tgtype=19 BEFORE UPDATE).
--
-- PART 1 — Column guard on mosque_staff.
-- WHY: updateMosqueStaff(id, updates) (auth.js) is a generic `.update(updates)`
-- passthrough with NO server-side column allowlist. The 030 UPDATE RLS policy
-- ("Mosque admins update own-mosque staff") re-checks only mosque_id in WITH
-- CHECK, so an authenticated owner sending a hand-crafted payload could set
-- status / invite_status / profile_id on their own-mosque rows — notably forging
-- a staff<->account link (profile_id) that bypasses the email-match invariant
-- enforced by accept_staff_invite / create-account.js. RLS bounds it to the
-- owner's own mosque, but there is no column-level defense.
--
-- FIX: a BEFORE UPDATE trigger that REJECTS any change to
--   profile_id | invite_status | status | mosque_id
-- when the write originates from a PostgREST client role (authenticated / anon).
-- These columns may change ONLY through their named writers:
--   suspend_staff, offboard_staff, approve_onboarding_session (SECURITY DEFINER,
--   run as owner=postgres), accept_staff_invite (INSERT path), and the
--   create-account.js account-link (service_role). All of those run with
--   current_user <> 'authenticated', so they are exempt.
--
-- WHY A TRIGGER, NOT RLS WITH CHECK: WITH CHECK only sees the NEW row; it cannot
-- detect that a column CHANGED (no OLD access). Rejecting "any update that TOUCHES
-- these columns" needs OLD-vs-NEW, which only a BEFORE UPDATE trigger has.
--
-- WHY current_user (not session_user): SECURITY DEFINER sets current_user to the
-- function OWNER (postgres) for the duration; session_user stays 'authenticated'.
-- We WANT the definer RPCs exempt, so we branch on current_user. The trigger
-- function is SECURITY INVOKER (default) on purpose — a DEFINER trigger would
-- always see postgres and defeat the check.
--
-- PART 2 — Audit role_preset / assigned_classes changes in
-- update_employee_permissions (127). One INSERT inside the existing SECURITY
-- DEFINER body. staff_id is NULL: this RPC keys off mosque_employees, but
-- mosque_staff_audit_log.staff_id FKs mosque_staff — so the employee id rides in
-- details (an employee id there would violate the FK).
--
-- SAFETY: no table DDL, no data rewrite. Part 1 is BEFORE UPDATE only, so every
-- INSERT path (accept_staff_invite, wizard stub, createMosqueStaff) is untouched,
-- and `is distinct from` short-circuits the common case (identity edits,
-- avatar_path, last_login_at) to a no-op. Part 2 only adds an audit write.
-- ====================================================================

begin;

-- ── PART 1 — mosque_staff privileged-column guard ──────────────────
create or replace function public.guard_mosque_staff_privileged_cols()
returns trigger
language plpgsql
-- SECURITY INVOKER (default) is REQUIRED — see header. Do NOT make this DEFINER.
set search_path = public
as $$
begin
  -- Only client-originated writes (PostgREST roles) are restricted. Named RPCs
  -- run SECURITY DEFINER as postgres; the account-link runs as service_role —
  -- inside both, current_user is NOT 'authenticated'/'anon', so they are exempt.
  if current_user in ('authenticated', 'anon') then
    if new.profile_id    is distinct from old.profile_id
    or new.invite_status is distinct from old.invite_status
    or new.status        is distinct from old.status
    or new.mosque_id     is distinct from old.mosque_id then
      raise exception
        'mosque_staff privileged column (profile_id/invite_status/status/mosque_id) '
        'may only be changed via suspend_staff / offboard_staff / '
        'approve_onboarding_session / accept_staff_invite — not a direct update'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mosque_staff_guard_privileged_cols on public.mosque_staff;
create trigger mosque_staff_guard_privileged_cols
  before update on public.mosque_staff
  for each row execute function public.guard_mosque_staff_privileged_cols();

-- ── PART 2 — audit role_preset / assigned_classes in update_employee_permissions ──
create or replace function public.update_employee_permissions(
  p_employee_id      uuid,
  p_permissions      jsonb,
  p_assigned_classes uuid[],
  p_role_preset      text
)
returns void
language plpgsql
security definer
volatile
set search_path = public
as $$
#variable_conflict use_column
declare
  v_uid                  uuid := auth.uid();
  v_mosque_id            uuid;
  v_old_role_preset      text;
  v_old_assigned_classes uuid[];
  v_new_role_preset      text;
  v_new_assigned_classes uuid[];
begin
  select e.mosque_id, e.role_preset, e.assigned_classes
    into v_mosque_id, v_old_role_preset, v_old_assigned_classes
    from public.mosque_employees e
   where e.id = p_employee_id;

  if v_mosque_id is null then
    raise exception 'employee_not_found';
  end if;

  if not exists (select 1 from public.mosques m
                 where m.id = v_mosque_id and m.user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;

  if p_role_preset is not null and p_role_preset not in
     ('coordinator','teacher','treasurer','receptionist','viewer','custom') then
    raise exception 'invalid_role_preset';
  end if;

  if p_assigned_classes is not null and array_length(p_assigned_classes, 1) is not null then
    if exists (
      select 1 from unnest(p_assigned_classes) as cid
      where cid not in (select id from public.madrasa_classes where mosque_id = v_mosque_id)
    ) then
      raise exception 'assigned_class_not_in_mosque';
    end if;
  end if;

  update public.mosque_employees
     set permissions      = coalesce(p_permissions, permissions),
         assigned_classes = coalesce(p_assigned_classes, assigned_classes),
         role_preset      = coalesce(p_role_preset, role_preset)
   where id = p_employee_id;

  -- Audit role_preset / assigned_classes changes (who, from, to, when). Only
  -- fires on an actual change. staff_id NULL (see header); employee id in details.
  v_new_role_preset      := coalesce(p_role_preset, v_old_role_preset);
  v_new_assigned_classes := coalesce(p_assigned_classes, v_old_assigned_classes);
  if v_new_role_preset is distinct from v_old_role_preset
     or v_new_assigned_classes is distinct from v_old_assigned_classes then
    insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
      values (v_mosque_id, v_uid, null, 'employee_permissions_changed',
              jsonb_build_object(
                'employee_id', p_employee_id,
                'role_preset', jsonb_build_object('from', v_old_role_preset, 'to', v_new_role_preset),
                'assigned_classes', jsonb_build_object(
                  'from', to_jsonb(v_old_assigned_classes),
                  'to',   to_jsonb(v_new_assigned_classes))
              ));
  end if;
end;
$$;

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-157-dev.mjs, then STOP):
--   Probes (raw, do NOT trust the Success banner):
--    P1.1  authed owner UPDATE status         -> rejected (42501)
--    P1.2  authed owner UPDATE profile_id /
--          invite_status / mosque_id(->other
--          owned mosque)                       -> rejected (42501)
--    P1.3  authed owner UPDATE name /
--          avatar_path                          -> OK (Commit A path intact)
--    P1.4  suspend_staff / offboard_staff       -> OK; guarded cols actually flip
--          (SECURITY DEFINER exempt)
--    P1.5  service_role sets profile_id +
--          invite_status (mirrors create-account)-> OK (service_role exempt)
--    P1.B  pg_proc: prosecdef + owner for
--          submit_staff_wizard(066),
--          mosque_link_scholar_to_staff(144),
--          approve_onboarding_session, suspend_,
--          offboard_ = definer/postgres         -> confirms current_user=postgres
--    P2.1  update_employee_permissions changes
--          role_preset                          -> exactly one audit row, from/to
--    P2.2  same call, no change                 -> no new audit row
--   Then STOP for prod go-ahead.
-- ====================================================================

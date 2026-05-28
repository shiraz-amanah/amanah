-- STATUS: Verbatim (authoritative; not documentary like 001–014)
-- Already applied: TBD (Session M Part B Day 1 — root cause #2 fix)
--
-- Fixes `accept_staff_invite`'s mosque_id ambiguity bug. Migration
-- 030's function signature declares `mosque_id` as an OUT parameter
-- in the RETURNS TABLE clause:
--
--   returns table ( ok boolean, reason text, staff_id uuid, mosque_id uuid )
--
-- OUT parameters are PL/pgSQL variables inside the function body.
-- The body's INSERT into mosque_staff has the column name as a
-- bareword in the column list:
--
--   insert into public.mosque_staff (profile_id, mosque_id, role, status)
--     values (v_user_id, inv.mosque_id, inv.role, 'pending_rtw')
--
-- Supabase runs PL/pgSQL with `variable_conflict = error` (project
-- default), so the parser raises rather than picking. Postgres
-- logs at 16:39:48 + 16:39:55 on 2026-05-28 captured:
--
--   ERROR: column reference "mosque_id" is ambiguous —
--          could refer to either a PL/pgSQL variable or a table column
--
-- The function threw before the INSERT, mosque_staff stayed empty
-- for every accept attempt, and the wrapper in src/auth.js mapped
-- the exception to a generic `rpc_error` that masked the cause
-- until Postgres logs were pulled.
--
-- Fix: belt-and-braces. (1) Add `#variable_conflict use_column` at
-- the top of the function body — PL/pgSQL then resolves bareword
-- identifiers to the column rather than the variable. (2) Table-
-- qualify the bareword column references in the idempotency-check
-- WHERE clause (`mosque_staff.profile_id`,
-- `mosque_staff.mosque_id`) so the disambiguation is structural —
-- if the pragma ever fails to parse/apply (a real risk after a
-- mid-session SQL-editor false-positive — see Day-1 discovery
-- chain), the qualified references still keep the function safe.
-- OUT params are still populated positionally via `return query
-- select …` so renaming them isn't needed (and would force a
-- coupled change in src/auth.js and the accept page).
--
-- Audit of other potential shadowing (none affected the original
-- bug but the pragma defends against future edits):
--   - ok (out param)          → no column collision
--   - reason (out param)      → no column collision
--   - staff_id (out param)    → no column collision (mosque_staff.id is "id")
--   - mosque_id (out param)   → SHADOWS mosque_staff.mosque_id / mosque_staff_invites.mosque_id  ← the bug
--   - invitee_email / role / status / profile_id / id — not declared as PL/pgSQL identifiers in this function
--
-- Scope of this migration: accept_staff_invite ONLY.
-- validate_staff_invite is left untouched: its body uses table
-- aliases `i.` / `m.` for every column reference, so no bareword
-- identifier is ambiguous against its OUT params. The defensive
-- pragma was in an earlier draft of this migration but trimmed to
-- match what was actually applied to dev. A separate small
-- migration can add the defensive pragma to validate_staff_invite
-- later if the codebase grows enough to warrant it.

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
#variable_conflict use_column
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
  -- Columns table-qualified to disambiguate against the mosque_id
  -- OUT param, independent of the #variable_conflict pragma above.
  select id into v_staff_id
    from public.mosque_staff
   where mosque_staff.profile_id = v_user_id
     and mosque_staff.mosque_id = inv.mosque_id;

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


-- PostgREST schema cache reload — required after function
-- create-or-replace so the API picks up the new bodies.
notify pgrst, 'reload schema';

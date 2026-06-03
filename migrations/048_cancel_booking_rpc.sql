-- Migration 048: cancel_booking RPC + extend booking notification data (Session R)
--
-- NOT yet applied — surfaced for approval. Apply in the SQL editor (dev then
-- prod), then `NOTIFY pgrst, 'reload schema';`.
--
-- Two changes:
--   1. cancel_booking() — the single authority for cancelling a booking. Called
--      from the BROWSER (src/auth.js → supabase.rpc) with the user's JWT, so it
--      is granted to `authenticated` (NOT service_role) and self-authorizes via
--      auth.uid(). SECURITY DEFINER so it can write the cancellation columns
--      regardless of the (permissive) bookings UPDATE RLS, while the in-function
--      checks are the real trust boundary.
--   2. get_booking_notification_data() is re-created to ALSO return cancelled_by,
--      refund_policy and cancelled_at, which the booking_cancelled email needs.
--      Additive + keyed-by-name in PostgREST, so the existing booking_confirmed /
--      reminder callers are unaffected. Stays service_role-only.

-- ---------------------------------------------------------------------------
-- 1. cancel_booking — authorize caller, derive refund policy, cancel
-- ---------------------------------------------------------------------------
-- Refund policy (per Session R brief):
--   scholar or admin cancels        -> 'full'
--   family cancels >24h before      -> 'full'
--   family cancels within 24h       -> 'partial'
-- Role is derived from WHICH party the caller matches (there is no 'family'
-- profiles.role), precedence family > scholar > admin. Only 'confirmed' bookings
-- can be cancelled; anything else returns an empty set (idempotent no-op).
create or replace function public.cancel_booking(p_booking_id uuid, p_reason text default null)
returns table (refund_policy text, cancelled_at timestamptz, cancelled_by text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_parent    uuid;
  v_scholar   uuid;
  v_scheduled timestamptz;
  v_status    text;
  v_role      text;
  v_policy    text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select b.parent_id, b.scholar_id, b.scheduled_at, b.status
    into v_parent, v_scholar, v_scheduled, v_status
  from public.bookings b
  where b.id = p_booking_id;

  if not found then
    raise exception 'booking not found' using errcode = 'P0002';
  end if;

  -- Caller role for THIS booking (precedence: family > scholar > admin)
  if v_parent = v_uid then
    v_role := 'family';
  elsif exists (select 1 from public.scholars s where s.id = v_scholar and s.user_id = v_uid) then
    v_role := 'scholar';
  elsif public.is_admin() then
    v_role := 'admin';
  else
    raise exception 'not authorized to cancel this booking' using errcode = '42501';
  end if;

  -- Only confirmed bookings can be cancelled; otherwise no-op (empty result).
  if v_status is distinct from 'confirmed' then
    return;
  end if;

  if v_role in ('scholar','admin') then
    v_policy := 'full';
  else  -- family
    if now() < v_scheduled - interval '24 hours' then
      v_policy := 'full';
    else
      v_policy := 'partial';
    end if;
  end if;

  return query
  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = v_role,
         cancellation_reason = p_reason,
         refund_policy = v_policy
   where id = p_booking_id
     and status = 'confirmed'
  returning bookings.refund_policy, bookings.cancelled_at, bookings.cancelled_by;
end;
$$;

revoke all on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Extend get_booking_notification_data with cancellation fields
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_notification_data(p_booking_id uuid)
returns table (
  booking_id     uuid,
  status         text,
  scheduled_at   timestamptz,
  package_name   text,
  meeting_url    text,
  parent_name    text,
  parent_email   text,
  scholar_name   text,
  scholar_slug   text,
  scholar_email  text,
  cancelled_by   text,
  refund_policy  text,
  cancelled_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.status,
    b.scheduled_at,
    b.package_name,
    b.meeting_url,
    pp.name            as parent_name,
    pu.email           as parent_email,
    s.name             as scholar_name,
    s.slug             as scholar_slug,
    su.email           as scholar_email,
    b.cancelled_by,
    b.refund_policy,
    b.cancelled_at
  from public.bookings b
  join public.profiles  pp on pp.id = b.parent_id
  join auth.users       pu on pu.id = b.parent_id
  join public.scholars  s  on s.id  = b.scholar_id
  left join auth.users  su on su.id = s.user_id
  where b.id = p_booking_id;
$$;

revoke all on function public.get_booking_notification_data(uuid) from public, anon, authenticated;
grant execute on function public.get_booking_notification_data(uuid) to service_role;

-- After applying:
--   NOTIFY pgrst, 'reload schema';

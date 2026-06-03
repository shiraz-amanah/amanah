-- Migration 046: SECURITY DEFINER RPCs for transactional emails (Session Q)
--
-- NOT yet applied — surfaced for approval. Apply in the SQL editor (dev then
-- prod), then `NOTIFY pgrst, 'reload schema';`.
--
-- WHY these exist (the trust model):
--   api/send-transactional must email the family and the scholar, which means it
--   needs their email addresses. Recipient emails live in `auth.users`, which
--   PostgREST does NOT expose (it only serves the `public` schema). So instead of
--   the client passing `to`/content — an open spoofing relay where any user could
--   send branded Amanah mail to any address or harvest the other party's email —
--   the client passes only an id, and these SECURITY DEFINER functions resolve
--   the recipients + field data server-side from the DB. This mirrors
--   validate_staff_invite() (the existing send-staff-invite pattern).
--
--   EXECUTE is granted to `service_role` ONLY (the key api/send-transactional
--   runs with). anon/authenticated are explicitly revoked so these can never be
--   called from the browser to enumerate user emails.
--
-- search_path is pinned to public so a definer function can't be hijacked via a
-- caller-controlled search_path (standard hardening for SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- 1. Booking → notification data (used by booking-confirmed + reminder sends)
-- ---------------------------------------------------------------------------
-- Returns one row joining the booking to the parent profile, scholar, and both
-- parties' auth.users emails. NULL row if the booking does not exist.
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
  scholar_email  text
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
    su.email           as scholar_email
  from public.bookings b
  join public.profiles  pp on pp.id = b.parent_id
  join auth.users       pu on pu.id = b.parent_id
  join public.scholars  s  on s.id  = b.scholar_id
  -- LEFT join: a scholar with no linked account (seeded/claimable) still yields
  -- a row so the family's confirmation (which only needs scholar_name) sends.
  left join auth.users  su on su.id = s.user_id
  where b.id = p_booking_id;
$$;

-- ---------------------------------------------------------------------------
-- 2. Scholar → notification data (used by the scholar-approved/verified send)
-- ---------------------------------------------------------------------------
create or replace function public.get_scholar_notification_data(p_scholar_id uuid)
returns table (
  scholar_id    uuid,
  name          text,
  slug          text,
  status        text,
  email         text
)
language sql
security definer
set search_path = public
as $$
  select s.id, s.name, s.slug, s.status, u.email
  from public.scholars s
  join auth.users u on u.id = s.user_id
  where s.id = p_scholar_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Due reminders sweep (used by the hourly Vercel Cron)
-- ---------------------------------------------------------------------------
-- Confirmed bookings whose session starts in the next-day window and which have
-- not yet been reminded. The window is now()+23h .. now()+25h so an hourly cron
-- catches every booking exactly once even with clock jitter; reminder_sent_at
-- (migration 045) is the idempotency guard that prevents the ~24 re-matches from
-- each firing an email.
create or replace function public.get_due_reminders()
returns table (
  booking_id     uuid,
  scheduled_at   timestamptz,
  package_name   text,
  meeting_url    text,
  parent_name    text,
  parent_email   text,
  scholar_name   text,
  scholar_email  text
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.scheduled_at,
    b.package_name,
    b.meeting_url,
    pp.name  as parent_name,
    pu.email as parent_email,
    s.name   as scholar_name,
    su.email as scholar_email
  from public.bookings b
  join public.profiles pp on pp.id = b.parent_id
  join auth.users      pu on pu.id = b.parent_id
  join public.scholars s  on s.id  = b.scholar_id
  join auth.users      su on su.id = s.user_id
  where b.status = 'confirmed'
    and b.reminder_sent_at is null
    and b.scheduled_at between now() + interval '23 hours'
                           and now() + interval '25 hours';
$$;

-- ---------------------------------------------------------------------------
-- 4. Mark a booking reminded (called after BOTH reminder emails are sent)
-- ---------------------------------------------------------------------------
-- Guarded with `reminder_sent_at is null` so two overlapping sweeps can't both
-- stamp/double-send. Returns true if THIS call won the row (stamped it), false
-- if it was already stamped.
create or replace function public.mark_reminder_sent(p_booking_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.bookings
       set reminder_sent_at = now()
     where id = p_booking_id
       and reminder_sent_at is null
    returning id
  )
  select exists (select 1 from upd);
$$;

-- Lock down EXECUTE to the service role only (never the browser).
revoke all on function public.get_booking_notification_data(uuid) from public, anon, authenticated;
revoke all on function public.get_scholar_notification_data(uuid) from public, anon, authenticated;
revoke all on function public.get_due_reminders()                 from public, anon, authenticated;
revoke all on function public.mark_reminder_sent(uuid)            from public, anon, authenticated;
grant execute on function public.get_booking_notification_data(uuid) to service_role;
grant execute on function public.get_scholar_notification_data(uuid) to service_role;
grant execute on function public.get_due_reminders()                 to service_role;
grant execute on function public.mark_reminder_sent(uuid)            to service_role;

-- After applying:
--   NOTIFY pgrst, 'reload schema';

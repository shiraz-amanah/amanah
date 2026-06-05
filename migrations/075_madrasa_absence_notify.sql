-- 075_madrasa_absence_notify.sql
-- ====================================================================
-- Madrasa Phase 2b — absence notifications. When a teacher/admin saves
-- attendance, the app fires `/api/send-transactional` (intent madrasa_absence),
-- which emails the parent of every NEWLY-absent child and — at 3 consecutive
-- absences — also alerts the mosque admin.
--
-- The data logic lives in SECURITY DEFINER RPCs (the booking-notification
-- pattern): the serverless function calls them with the service-role key, so
-- they resolve parent emails (which live in auth.users / are not client-
-- readable) server-side. They are granted to service_role ONLY — revoked from
-- public/authenticated — so no signed-in client can call them to harvest
-- addresses. Idempotency uses a claim RPC + an absence_notified_at column,
-- mirroring mark_reminder_sent (claim-before-send → no double email on re-save).
-- ====================================================================

-- Server-managed dedup marker. The client upsert (upsertMadrasaAttendance) never
-- sets this column, so re-marking attendance preserves it.
alter table public.madrasa_attendance
  add column if not exists absence_notified_at timestamptz;

-- Length of the run of 'absent' sessions for a student in a class, ending at
-- (and including) p_upto. rn is 1-based most-recent-first; the count of leading
-- absents is (rn of the first non-absent) - 1, or all rows if none are present.
create or replace function public.madrasa_consecutive_absences(p_class uuid, p_student uuid, p_upto date)
returns int
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select status, row_number() over (order by session_date desc) as rn
    from public.madrasa_attendance
    where class_id = p_class and student_id = p_student and session_date <= p_upto
  )
  select coalesce(min(rn) filter (where status <> 'absent') - 1, (select count(*) from s))::int
  from s;
$$;

-- Newly-absent rows for a class+date, with everything the email needs resolved
-- server-side: child name, parent (user id / email / name / email opt-in from
-- the notifications jsonb), class + mosque name, and the mosque owner's contact
-- for the streak alert. Plus the consecutive-absence count for this session.
create or replace function public.madrasa_absences_to_notify(p_class uuid, p_session_date date)
returns table (
  attendance_id       uuid,
  student_id          uuid,
  student_name        text,
  parent_user_id      uuid,
  parent_email        text,
  parent_name         text,
  parent_email_opt_in boolean,
  class_name          text,
  mosque_id           uuid,
  mosque_name         text,
  owner_email         text,
  owner_name          text,
  consecutive_count   int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.student_id,
    s.name,
    s.profile_id,
    pp.email,
    pp.name,
    coalesce((pp.notifications->>'email')::boolean, true),
    c.name,
    c.mosque_id,
    m.name,
    op.email,
    op.name,
    public.madrasa_consecutive_absences(a.class_id, a.student_id, a.session_date)
  from public.madrasa_attendance a
  join public.madrasa_classes c on c.id = a.class_id
  join public.mosques m on m.id = c.mosque_id
  left join public.students s on s.id = a.student_id
  left join public.profiles pp on pp.id = s.profile_id
  left join public.profiles op on op.id = m.user_id
  where a.class_id = p_class
    and a.session_date = p_session_date
    and a.status = 'absent'
    and a.absence_notified_at is null;
$$;

-- Claim a row for notification: stamp absence_notified_at only if still NULL.
-- Returns true if THIS call claimed it (so overlapping saves can't double-send).
create or replace function public.madrasa_claim_absence_notification(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  update public.madrasa_attendance
    set absence_notified_at = now()
    where id = p_id and absence_notified_at is null;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- Harvest guard: only the serverless function (service_role) may call these.
revoke all on function public.madrasa_consecutive_absences(uuid, uuid, date)  from public;
revoke all on function public.madrasa_absences_to_notify(uuid, date)          from public;
revoke all on function public.madrasa_claim_absence_notification(uuid)        from public;
grant execute on function public.madrasa_consecutive_absences(uuid, uuid, date) to service_role;
grant execute on function public.madrasa_absences_to_notify(uuid, date)         to service_role;
grant execute on function public.madrasa_claim_absence_notification(uuid)        to service_role;

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor.
--   2. Probe:
--        \d public.madrasa_attendance   -- absence_notified_at present
--        select proname, prosecdef from pg_proc
--          where proname in ('madrasa_consecutive_absences',
--                            'madrasa_absences_to_notify',
--                            'madrasa_claim_absence_notification');  -- all prosecdef=t
--      As an authenticated (non-service) client: rpc madrasa_absences_to_notify
--        → permission denied (harvest guard).
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================
notify pgrst, 'reload schema';

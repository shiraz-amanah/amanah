-- 085_mosque_time_logs.sql — Session AL (timesheets rebuilt as clock-in/out)
--
-- The original mosque_timesheets (058) is a weekly hours-grid model. This
-- migration introduces a clock-in/out LOG model: one row per shift, with a
-- clock_in / clock_out timestamp pair, an admin approval lifecycle, and a
-- stored generated worked_hours column that drives the payroll CSV export.
--
-- ADDITIVE: mosque_timesheets (058) is left in place (no data dropped); the new
-- People → Timesheets UI reads/writes mosque_time_logs instead. The old table
-- can be retired in a later migration once nothing references it.
--
-- RLS mirrors 058's proven, non-recursive shape (mosque_time_logs only ever
-- reads mosques / mosque_staff, whose own policies never read this table, so no
-- SECURITY DEFINER helper is needed):
--   • mosque admins (mosques.user_id = auth.uid()) — full CRUD on their mosque
--   • linked staff (mosque_staff.profile_id = auth.uid()):
--       - READ their own logs (any status)
--       - INSERT their own logs, but only as status='pending' (clock in)
--       - UPDATE their own logs only while status='pending', and the row must
--         stay 'pending' (clock out / edit an open shift)
-- The pending guards are the status protection: staff can never move a row to
-- 'approved'/'rejected' (only the admin "for all" policy can), and can never
-- edit a row once the admin has approved/rejected it. Approval stays
-- admin-only. Staff cannot DELETE (admin-only).

create table if not exists public.mosque_time_logs (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id)      on delete cascade,
  staff_id      uuid not null references public.mosque_staff(id) on delete cascade,
  clock_in      timestamptz not null,
  clock_out     timestamptz,                       -- null while the shift is open
  break_minutes integer not null default 0 check (break_minutes >= 0),
  note          text,
  -- Net paid hours for the shift, rounded to 2dp; null until clocked out.
  -- greatest(..,0) guards against a break longer than the shift.
  worked_hours  numeric generated always as (
    case when clock_out is null then null
         else round(greatest(extract(epoch from (clock_out - clock_in)) / 3600.0 - break_minutes / 60.0, 0), 2)
    end
  ) stored,
  status        text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  created_by    uuid references auth.users(id) on delete set null,  -- admin or staff who logged it
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (clock_out is null or clock_out >= clock_in)
);

create index if not exists mosque_time_logs_mosque_idx     on public.mosque_time_logs(mosque_id);
create index if not exists mosque_time_logs_staff_idx      on public.mosque_time_logs(staff_id);
-- Payroll/date-range scans (a month for a mosque) hit mosque_id + clock_in.
create index if not exists mosque_time_logs_mosque_in_idx  on public.mosque_time_logs(mosque_id, clock_in);

alter table public.mosque_time_logs enable row level security;

-- Mosque admins: full CRUD on their own mosque's clock logs.
create policy "Mosque admins manage own time logs"
  on public.mosque_time_logs for all
  to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Linked staff can read their own clock logs.
create policy "Staff read own time logs"
  on public.mosque_time_logs for select
  to authenticated
  using (staff_id in (select id from public.mosque_staff where profile_id = auth.uid()));

-- Staff clock IN: insert their own row, forced to status='pending'. The
-- mosque_id must also be one of their own staff records' mosques (so a client
-- can't write a row scoped to a mosque they don't belong to).
create policy "Staff clock in own"
  on public.mosque_time_logs for insert
  to authenticated
  with check (
    status = 'pending'
    and staff_id in (select id from public.mosque_staff where profile_id = auth.uid())
    and mosque_id in (select mosque_id from public.mosque_staff where profile_id = auth.uid())
  );

-- Staff clock OUT / edit: only their own rows, only while pending, and the row
-- must stay pending (can't self-approve, can't touch approved/rejected rows).
create policy "Staff edit own pending logs"
  on public.mosque_time_logs for update
  to authenticated
  using (
    status = 'pending'
    and staff_id in (select id from public.mosque_staff where profile_id = auth.uid())
  )
  with check (
    status = 'pending'
    and staff_id in (select id from public.mosque_staff where profile_id = auth.uid())
  );

create or replace function public.touch_mosque_time_logs_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_time_logs_touch_updated_at
  before update on public.mosque_time_logs
  for each row execute function public.touch_mosque_time_logs_updated_at();

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run on dev -> NOTIFY included above -> probe:
--   \d public.mosque_time_logs                       (worked_hours present + generated)
--   select count(*) from pg_policies where tablename = 'mosque_time_logs';  -- expect 4
--   -- smoke: insert a clocked-out row, confirm worked_hours computes:
--   --   insert ... clock_in = now() - interval '3 hours', clock_out = now(), break_minutes = 30;
--   --   expect worked_hours = 2.50
--   -- RLS smoke (as a linked staff member, not the owner):
--   --   can insert a status='pending' row for own staff_id; can clock_out while pending;
--   --   cannot update status to 'approved'; cannot update a row already 'approved'.
-- -> hard refresh -> repeat on prod.

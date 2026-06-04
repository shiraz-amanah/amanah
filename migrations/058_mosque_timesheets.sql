-- 058_mosque_timesheets.sql — Session V (chunk 2: timesheets / payroll)
--
-- Weekly hours per staff member for payroll export. One row per (staff, week);
-- hours is a jsonb map { mon,tue,wed,thu,fri,sat,sun: decimal }. Approval
-- lifecycle via a status CHECK. Mosque admin manages everything in the HR tab
-- (no staff self-service surface yet); linked staff may READ their own rows
-- (for a future staff dashboard).

create table if not exists public.mosque_timesheets (
  id           uuid primary key default gen_random_uuid(),
  mosque_id    uuid not null references public.mosques(id)      on delete cascade,
  staff_id     uuid not null references public.mosque_staff(id) on delete cascade,
  week_start   date not null,
  hours        jsonb not null default '{}'::jsonb,
  notes        text,
  status       text not null default 'draft'
    check (status in ('draft', 'submitted', 'approved', 'rejected')),
  submitted_at timestamptz,
  approved_at  timestamptz,
  approved_by  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (staff_id, week_start)
);

create index if not exists mosque_timesheets_mosque_idx on public.mosque_timesheets(mosque_id);
create index if not exists mosque_timesheets_staff_idx  on public.mosque_timesheets(staff_id);

alter table public.mosque_timesheets enable row level security;

-- Mosque admins: full CRUD on their own mosque's timesheets.
create policy "Mosque admins manage own timesheets"
  on public.mosque_timesheets for all
  to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Linked staff can read their own timesheets.
create policy "Staff read own timesheets"
  on public.mosque_timesheets for select
  to authenticated
  using (staff_id in (select id from public.mosque_staff where profile_id = auth.uid()));

create or replace function public.touch_mosque_timesheets_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_timesheets_touch_updated_at
  before update on public.mosque_timesheets
  for each row execute function public.touch_mosque_timesheets_updated_at();

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run -> NOTIFY included -> probe \d mosque_timesheets +
-- pg_policies (2 on mosque_timesheets) -> hard refresh.

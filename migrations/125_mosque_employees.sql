-- 125_mosque_employees.sql
-- ====================================================================
-- RBAC — mosque employee records (Session RBAC). Distinct from the existing
-- `mosque_staff` HR directory (054/066/067): that table is for HR/payroll/rota/
-- DBS. THIS table grants *dashboard permissions* — who can see/do what inside a
-- mosque's Amanah workspace.
--
-- WHY JSONB PERMISSIONS (not a role string): preset roles write a known JSONB
-- shape; custom overrides update specific keys; adding a future module = a new
-- key, no migration. `role_preset` is a label/starting-point only ('custom' once
-- individually overridden) — the JSONB is the source of truth. Shape + preset
-- defaults live in src/lib/employeePermissions.js.
--
-- INVITE FLOW: owner calls invite_mosque_employee (127) → row with a single-use
-- invite_token + 24h expiry → branded email (send-transactional 'employee_invite')
-- → staff opens /accept-invite?token=… → accept_employee_invite clears the token,
-- sets profile_id + status='active'. Tokens are single-use (cleared on accept).
--
-- RLS: owner manages own mosque's employees (FOR ALL); an employee reads only
-- their own row; platform admin reads all. Mutations otherwise go through the
-- SECURITY DEFINER RPCs in 127. anon is explicitly revoked (belt-and-braces with
-- RLS, mirrors 119).
-- ====================================================================

create table if not exists public.mosque_employees (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosques(id)
                      on delete cascade,
  profile_id        uuid references public.profiles(id)
                      on delete set null,
  invited_email     text not null,
  invited_name      text not null,
  role_preset       text not null default 'viewer'
                      check (role_preset in (
                        'coordinator','teacher','treasurer',
                        'receptionist','viewer','custom')),
  permissions       jsonb not null default '{}'::jsonb,
  assigned_classes  uuid[] default '{}'::uuid[],
  invite_token      text unique,
  invite_expires_at timestamptz,
  invite_accepted_at timestamptz,
  status            text not null default 'pending'
                      check (status in (
                        'pending','active','suspended')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists mosque_employees_mosque_idx
  on public.mosque_employees(mosque_id);
create index if not exists mosque_employees_profile_idx
  on public.mosque_employees(profile_id);
create index if not exists mosque_employees_token_idx
  on public.mosque_employees(invite_token);
create index if not exists mosque_employees_email_idx
  on public.mosque_employees(invited_email);

alter table public.mosque_employees
  enable row level security;
revoke all on public.mosque_employees from anon;

-- Owner reads/manages own mosque employees
create policy "Owner manages mosque employees"
  on public.mosque_employees for all to authenticated
  using (mosque_id in (
    select id from public.mosques
    where user_id = auth.uid()
  ));

-- Employee reads own record
create policy "Employee reads own record"
  on public.mosque_employees for select to authenticated
  using (profile_id = auth.uid());

-- Platform admin reads all
create policy "Admin reads all employees"
  on public.mosque_employees for select to authenticated
  using (public.is_admin());

-- updated_at trigger (follow existing pattern)
create or replace function
  public.touch_mosque_employees_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_employees_touch_updated_at
  before update on public.mosque_employees
  for each row execute function
  public.touch_mosque_employees_updated_at();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows — never trust the Success banner):
--        -- columns (expect 14 rows)
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'mosque_employees' order by ordinal_position;
--        -- policies: exactly 3 (1 ALL owner, 2 SELECT employee/admin)
--        select policyname, cmd, roles
--          from pg_policies where tablename = 'mosque_employees';
--        -- anon has NO privileges (expect 0 rows)
--        select grantee, privilege_type
--          from information_schema.role_table_grants
--          where table_name = 'mosque_employees' and grantee = 'anon';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

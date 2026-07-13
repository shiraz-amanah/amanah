-- 133_mosque_staff_onboarding_sessions.sql
-- ====================================================================
-- Session RBAC-D — a real onboarding-session entity, replacing the
-- wizard-token-on-mosque_staff stub model (066). Resumable partial progress
-- + a mosque-owner approval gate. Bank details + NI are WRITE-ONLY: saved but
-- never returned by an anon RPC (masked "saved — re-enter to change" on the
-- client). The stub mosque_staff directory row is STILL created at invite
-- (carrying employee_email) so approval is an UPDATE, preserving the 055
-- email-link invariant.
--
-- staff_id is nullable in the schema (a session may exist independently of a
-- directory row for a future RBAC-D+ pure-session flow, and on delete cascade
-- cleans it up) but is ALWAYS populated in RBAC-D: createStaffWizardInvite mints
-- the stub mosque_staff row + this session together and sets staff_id.
--
-- EMAIL INVARIANT (055): employee_email is captured once at invite time,
-- lowercased, and written identically to (a) the stub mosque_staff row's email
-- and (b) this session's employee_email. The remote wizard NEVER collects/edits
-- email. approve_onboarding_session promotes by UPDATE on the existing staff row
-- and NEVER writes email from any jsonb — so a later accept_staff_invite still
-- matches lower(email) and LINKS rather than INSERTs a duplicate.
-- ====================================================================

create table if not exists public.mosque_staff_onboarding_sessions (
  id                 uuid primary key default gen_random_uuid(),
  mosque_id          uuid not null references public.mosques(id) on delete cascade,
  staff_id           uuid references public.mosque_staff(id) on delete cascade, -- nullable; always set in RBAC-D
  invited_by         uuid references public.profiles(id),
  employee_name      text not null,
  employee_email     text not null,   -- MUST equal the directory mosque_staff row email (055 invariant)
  token              uuid not null unique default gen_random_uuid(),
  token_expires_at   timestamptz not null default (now() + interval '7 days'),
  path               text not null check (path in ('remote','in_person')),
  status             text not null default 'in_progress'
                       check (status in ('in_progress','submitted','changes_requested','approved')),
  step_completed     int  not null default 0,
  personal_details   jsonb,   -- name, phone, dob, address, ni_number, emergency_contact_*
  rtw_details        jsonb,
  dbs_details        jsonb,
  employment_details jsonb,   -- role, contract_type, start_date, hours_per_week (NO salary — admin-only)
  tax_details        jsonb,
  bank_details       jsonb,   -- WRITE-ONLY. Never returned by any anon RPC.
  reviewed_by        uuid references public.profiles(id),
  reviewed_at        timestamptz,
  review_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists mosque_onboarding_mosque_idx on public.mosque_staff_onboarding_sessions(mosque_id);
create index if not exists mosque_onboarding_staff_idx  on public.mosque_staff_onboarding_sessions(staff_id);
create index if not exists mosque_onboarding_token_idx  on public.mosque_staff_onboarding_sessions(token);
create index if not exists mosque_onboarding_status_idx on public.mosque_staff_onboarding_sessions(status);

alter table public.mosque_staff_onboarding_sessions enable row level security;
revoke all on public.mosque_staff_onboarding_sessions from anon;

create policy "Owner manages onboarding sessions"
  on public.mosque_staff_onboarding_sessions for all to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

create policy "Admin reads onboarding sessions"
  on public.mosque_staff_onboarding_sessions for select to authenticated
  using (public.is_admin());

-- touch trigger for updated_at
drop trigger if exists trg_onboarding_touch on public.mosque_staff_onboarding_sessions;
create or replace function public.touch_onboarding_session()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger trg_onboarding_touch before update on public.mosque_staff_onboarding_sessions
  for each row execute function public.touch_onboarding_session();

-- ────────────────────────────────────────────────────────────────────
-- ANON-CALLABLE (token-gated). HARD harvest guard on every one: token must
-- exist, not be expired, and status ∈ (in_progress, changes_requested). A
-- leaked token can never read/write a submitted or approved session.
-- ────────────────────────────────────────────────────────────────────

-- 1. Repopulation read. NEVER returns bank_details; strips ni_number out of
--    personal_details. Booleans tell the client to render masked "saved" state.
create or replace function public.get_onboarding_session_by_token(p_token uuid)
returns table (
  employee_name text, mosque_name text, path text, step_completed int,
  status text, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb,
  bank_details_saved boolean, ni_saved boolean
)
language plpgsql security definer stable set search_path = public as $$
declare v record;
begin
  select s.*, m.name as mosque_name into v
    from public.mosque_staff_onboarding_sessions s
    join public.mosques m on m.id = s.mosque_id
   where s.token = p_token;
  if not found then return; end if;
  if v.token_expires_at < now() then return; end if;
  if v.status not in ('in_progress','changes_requested') then return; end if;

  return query select
    v.employee_name, v.mosque_name, v.path, v.step_completed, v.status, v.review_notes,
    (v.personal_details - 'ni_number'),   -- strip NI
    v.rtw_details, v.dbs_details, v.employment_details, v.tax_details,
    (v.bank_details is not null and v.bank_details <> '{}'::jsonb),
    (coalesce(v.personal_details->>'ni_number','') <> '');
end; $$;

-- 2. Save one step's jsonb. step_completed = greatest(existing, p_step).
create or replace function public.save_onboarding_step(p_token uuid, p_step int, p_data jsonb)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare v record;
begin
  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then
    return false;
  end if;

  update public.mosque_staff_onboarding_sessions set
    personal_details   = case when p_step = 1 then p_data else personal_details   end,
    rtw_details        = case when p_step = 2 then p_data else rtw_details        end,
    dbs_details        = case when p_step = 3 then p_data else dbs_details        end,
    employment_details = case when p_step = 4 then p_data else employment_details end,
    tax_details        = case when p_step = 5 then p_data else tax_details        end,
    bank_details       = case when p_step = 6 then p_data else bank_details       end,
    step_completed     = greatest(step_completed, p_step)
  where id = v.id;
  return true;
end; $$;

-- 3. Submit for review. status → submitted. Audit row (actor_id null — the
--    employee is unauthenticated; actor_id is nullable in mosque_staff_audit_log).
--    Fires no email itself; the client calls send-transactional.
create or replace function public.submit_onboarding_session(p_token uuid)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare v record;
begin
  select * into v from public.mosque_staff_onboarding_sessions where token = p_token for update;
  if not found or v.token_expires_at < now()
     or v.status not in ('in_progress','changes_requested') then
    return false;
  end if;
  update public.mosque_staff_onboarding_sessions set status = 'submitted' where id = v.id;
  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, null, v.staff_id, 'onboarding_submitted',
            jsonb_build_object('session_id', v.id));
  return true;
end; $$;

revoke all on function public.get_onboarding_session_by_token(uuid) from public;
revoke all on function public.save_onboarding_step(uuid,int,jsonb)  from public;
revoke all on function public.submit_onboarding_session(uuid)       from public;
grant execute on function public.get_onboarding_session_by_token(uuid) to anon, authenticated;
grant execute on function public.save_onboarding_step(uuid,int,jsonb)  to anon, authenticated;
grant execute on function public.submit_onboarding_session(uuid)       to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────
-- OWNER-GATED (mosque owner only — NOT amanah admin; the mosque is the
-- employer and the accountable party).
-- ────────────────────────────────────────────────────────────────────
create or replace function public.owns_onboarding_mosque(p_mosque_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mosques where id = p_mosque_id and user_id = auth.uid());
$$;

-- 4. List (no sensitive fields).
create or replace function public.get_onboarding_sessions_for_mosque(p_mosque_id uuid)
returns table (
  id uuid, staff_id uuid, employee_name text, employee_email text,
  path text, status text, step_completed int,
  reviewed_at timestamptz, review_notes text, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not owns_onboarding_mosque(p_mosque_id) then raise exception 'not_authorised'; end if;
  return query
    select s.id, s.staff_id, s.employee_name, s.employee_email, s.path, s.status,
           s.step_completed, s.reviewed_at, s.review_notes, s.created_at, s.updated_at
      from public.mosque_staff_onboarding_sessions s
     where s.mosque_id = p_mosque_id
     order by s.created_at desc;
end; $$;

-- 5. Full reveal — bank + NI. Audited (onboarding_sensitive_viewed). Owner only.
--    Same audited-reveal posture as get_staff_sensitive.
create or replace function public.get_onboarding_session_full(p_session_id uuid)
returns table (
  id uuid, mosque_id uuid, staff_id uuid, employee_name text, employee_email text,
  path text, status text, step_completed int, review_notes text,
  personal_details jsonb, rtw_details jsonb, dbs_details jsonb,
  employment_details jsonb, tax_details jsonb, bank_details jsonb,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer volatile set search_path = public as $$
declare v record;
begin
  select * into v from public.mosque_staff_onboarding_sessions where id = p_session_id;
  if not found then raise exception 'not_found'; end if;
  if not owns_onboarding_mosque(v.mosque_id) then raise exception 'not_authorised'; end if;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_sensitive_viewed',
            jsonb_build_object('session_id', v.id));

  return query select
    v.id, v.mosque_id, v.staff_id, v.employee_name, v.employee_email, v.path, v.status,
    v.step_completed, v.review_notes,
    v.personal_details, v.rtw_details, v.dbs_details, v.employment_details,
    v.tax_details, v.bank_details, v.created_at, v.updated_at;
end; $$;

-- 6. Approve → promote into mosque_staff + mosque_staff_employment. Reads each
--    field from its NAMED per-step blob (no || merge) so a future step can never
--    collide-overwrite a promotion. Promotion columns/extraction lifted verbatim
--    from submit_staff_wizard (066). NEVER writes email (055 invariant).
create or replace function public.approve_onboarding_session(p_session_id uuid)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare
  v record;
  pers jsonb; rtw jsonb; dbs jsonb; emp jsonb; tax jsonb; bank jsonb;
begin
  select * into v from public.mosque_staff_onboarding_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if not owns_onboarding_mosque(v.mosque_id) then raise exception 'not_authorised'; end if;
  if v.status <> 'submitted' then raise exception 'not_submitted'; end if;
  if v.staff_id is null then raise exception 'no_staff_row'; end if;

  pers := coalesce(v.personal_details,   '{}'::jsonb);
  rtw  := coalesce(v.rtw_details,        '{}'::jsonb);
  dbs  := coalesce(v.dbs_details,        '{}'::jsonb);
  emp  := coalesce(v.employment_details, '{}'::jsonb);
  tax  := coalesce(v.tax_details,        '{}'::jsonb);
  bank := coalesce(v.bank_details,       '{}'::jsonb);

  update public.mosque_staff set
    name            = coalesce(nullif(pers->>'name',''), name),
    role            = coalesce(nullif(emp->>'role',''), role),
    phone           = nullif(pers->>'phone',''),
    start_date      = nullif(emp->>'start_date','')::date,
    dbs_status      = coalesce(nullif(dbs->>'dbs_status',''), 'not_checked'),
    dbs_certificate = nullif(dbs->>'dbs_certificate_number',''),
    dbs_expiry_date = nullif(dbs->>'dbs_expiry_date','')::date,
    status          = 'active',
    onboarding_completed_at = now(),
    onboarding_method       = 'remote_session'
  where id = v.staff_id;   -- email deliberately untouched (055 invariant)

  insert into public.mosque_staff_employment (
    staff_id, mosque_id,
    ni_number, dob, address, emergency_contact_name, emergency_contact_phone,
    bank_account_name, bank_sort_code, bank_account_number,
    contract_type, hours_per_week, salary_rate,
    p46_statement, student_loan, student_loan_plan,
    dbs_check_type, dbs_workforce_type, dbs_id_document_type, dbs_id_document_number,
    dbs_ucheck_reference, dbs_certificate_number, dbs_result_date, dbs_checked_by,
    rtw_check_type, rtw_document_type, rtw_document_number, rtw_share_code,
    rtw_check_date, rtw_expiry_date, rtw_checked_by
  ) values (
    v.staff_id, v.mosque_id,
    nullif(pers->>'ni_number',''), nullif(pers->>'dob','')::date,
    nullif(pers->>'address',''), nullif(pers->>'emergency_contact_name',''),
    nullif(pers->>'emergency_contact_phone',''),
    nullif(bank->>'bank_account_name',''), nullif(bank->>'bank_sort_code',''),
    nullif(bank->>'bank_account_number',''),
    nullif(emp->>'contract_type',''), nullif(emp->>'hours_per_week','')::numeric,
    nullif(emp->>'salary_rate',''),
    nullif(tax->>'p46_statement',''), coalesce((tax->>'student_loan')::boolean, false),
    nullif(tax->>'student_loan_plan',''),
    nullif(dbs->>'dbs_check_type',''), nullif(dbs->>'dbs_workforce_type',''),
    nullif(dbs->>'dbs_id_document_type',''), nullif(dbs->>'dbs_id_document_number',''),
    nullif(dbs->>'dbs_ucheck_reference',''), nullif(dbs->>'dbs_certificate_number',''),
    nullif(dbs->>'dbs_result_date','')::date, nullif(dbs->>'dbs_checked_by',''),
    nullif(rtw->>'rtw_check_type',''), nullif(rtw->>'rtw_document_type',''),
    nullif(rtw->>'rtw_document_number',''), nullif(rtw->>'rtw_share_code',''),
    nullif(rtw->>'rtw_check_date','')::date, nullif(rtw->>'rtw_expiry_date','')::date,
    nullif(rtw->>'rtw_checked_by','')
  )
  on conflict (staff_id) do update set
    ni_number = excluded.ni_number, dob = excluded.dob, address = excluded.address,
    emergency_contact_name = excluded.emergency_contact_name,
    emergency_contact_phone = excluded.emergency_contact_phone,
    bank_account_name = excluded.bank_account_name, bank_sort_code = excluded.bank_sort_code,
    bank_account_number = excluded.bank_account_number,
    contract_type = excluded.contract_type, hours_per_week = excluded.hours_per_week,
    salary_rate = excluded.salary_rate,
    p46_statement = excluded.p46_statement, student_loan = excluded.student_loan,
    student_loan_plan = excluded.student_loan_plan,
    dbs_check_type = excluded.dbs_check_type, dbs_workforce_type = excluded.dbs_workforce_type,
    dbs_id_document_type = excluded.dbs_id_document_type, dbs_id_document_number = excluded.dbs_id_document_number,
    dbs_ucheck_reference = excluded.dbs_ucheck_reference, dbs_certificate_number = excluded.dbs_certificate_number,
    dbs_result_date = excluded.dbs_result_date, dbs_checked_by = excluded.dbs_checked_by,
    rtw_check_type = excluded.rtw_check_type, rtw_document_type = excluded.rtw_document_type,
    rtw_document_number = excluded.rtw_document_number, rtw_share_code = excluded.rtw_share_code,
    rtw_check_date = excluded.rtw_check_date, rtw_expiry_date = excluded.rtw_expiry_date,
    rtw_checked_by = excluded.rtw_checked_by,
    updated_at = now();

  update public.mosque_staff_onboarding_sessions
     set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
   where id = v.id;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_approved',
            jsonb_build_object('session_id', v.id));
  return true;
end; $$;

-- 7. Request changes → status changes_requested, store notes, refresh token
--    expiry so the employee can resume and fix.
create or replace function public.request_onboarding_changes(p_session_id uuid, p_notes text)
returns boolean
language plpgsql security definer volatile set search_path = public as $$
declare v record;
begin
  select * into v from public.mosque_staff_onboarding_sessions where id = p_session_id for update;
  if not found then raise exception 'not_found'; end if;
  if not owns_onboarding_mosque(v.mosque_id) then raise exception 'not_authorised'; end if;

  update public.mosque_staff_onboarding_sessions set
    status = 'changes_requested', review_notes = p_notes,
    reviewed_by = auth.uid(), reviewed_at = now(),
    token_expires_at = now() + interval '7 days'
  where id = v.id;

  insert into public.mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v.mosque_id, auth.uid(), v.staff_id, 'onboarding_changes_requested',
            jsonb_build_object('session_id', v.id, 'notes', p_notes));
  return true;
end; $$;

revoke all on function public.get_onboarding_sessions_for_mosque(uuid) from public;
revoke all on function public.get_onboarding_session_full(uuid)        from public;
revoke all on function public.approve_onboarding_session(uuid)         from public;
revoke all on function public.request_onboarding_changes(uuid,text)    from public;
grant execute on function public.get_onboarding_sessions_for_mosque(uuid) to authenticated;
grant execute on function public.get_onboarding_session_full(uuid)        to authenticated;
grant execute on function public.approve_onboarding_session(uuid)         to authenticated;
grant execute on function public.request_onboarding_changes(uuid,text)    to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod — via the Supabase SQL editor):
--   1. Run this whole file.
--   2. Run the RAW probes below and read the rows (do NOT trust the Success
--      banner — read the actual output):
--
--   -- a) column list
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='mosque_staff_onboarding_sessions'
--    order by ordinal_position;
--
--   -- b) policies
--   select policyname, cmd, roles
--     from pg_policies
--    where schemaname='public' and tablename='mosque_staff_onboarding_sessions'
--    order by policyname;
--
--   -- c) prosecdef for all 7 RPCs (+ 2 helpers) — expect all true
--   select proname, prosecdef from pg_proc
--    where proname in ('get_onboarding_session_by_token','save_onboarding_step',
--      'submit_onboarding_session','get_onboarding_sessions_for_mosque',
--      'get_onboarding_session_full','approve_onboarding_session',
--      'request_onboarding_changes','owns_onboarding_mosque','touch_onboarding_session')
--    order by proname;
--
--   -- d) anon grant check on the table — expect 0 rows
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_schema='public' and table_name='mosque_staff_onboarding_sessions'
--      and grantee='anon';
-- ====================================================================

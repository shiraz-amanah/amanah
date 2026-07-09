-- 129_staff_hr_tables_rpcs.sql
-- ====================================================================
-- Session RBAC-B — supporting tables + SECURITY DEFINER RPCs for the
-- People-tab rebuild. Built ON mosque_staff (Option 1). Every new table
-- FKs mosque_staff(id) (messages/audit FK mosques(id)); mosque_employees
-- is untouched.
--
-- Per the 033 post-mortem, every plpgsql body carries
-- `#variable_conflict use_column` + `set search_path = public`, and every
-- owner-only RPC re-checks mosque ownership in the body (SECURITY DEFINER
-- bypasses RLS). Sensitive reads (salary, DOB, doc numbers) go ONLY through
-- the audited RPCs here — never a client select of the underlying columns.
--
-- ADDITIONS BEYOND THE APPROVED 5-RPC LIST (flagged for review):
--   • suspend_staff(staff_id, p_status='suspended') — the Actions→Suspend /
--     Reactivate control (p_status='active' reactivates). No suspend path
--     existed otherwise.
--   • record_staff_audit(staff_id, action, details) — owner/admin audit
--     writer for document-viewed / message-sent (those happen client-side;
--     without this there is no way to log them).
-- ====================================================================

-- ── A) Extend the existing training table (don't duplicate) ─────────
alter table public.mosque_staff_training
  add column if not exists course_name text,
  add column if not exists provider    text,
  add column if not exists category    text
    check (category in ('safeguarding','first_aid','teaching',
                        'islamic','governance','other')),
  add column if not exists notes       text;
-- (completion_date, renewal_due=expiry, certificate_path already exist)

-- ── B) Extend the staff status vocabulary for suspend / offboard ────
alter table public.mosque_staff drop constraint if exists mosque_staff_status_check;
alter table public.mosque_staff add constraint mosque_staff_status_check
  check (status in ('pending_invite','pending_rtw','active',
                    'revoked','expired','suspended','offboarded'));

-- ── C) New tables (all FK mosque_staff(id)) ─────────────────────────
create table if not exists public.mosque_staff_ijazahs (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.mosque_staff(id) on delete cascade,
  ijazah_type  text not null check (ijazah_type in (
                 'quran_recitation','tajweed','islamic_studies',
                 'fiqh','arabic','hadith','other')),
  qiraat       text,
  granted_by   text not null,
  sanad        text,
  date_granted date,
  storage_path text,               -- key in mosque-hr-docs bucket (064)
  verified     boolean default false,
  verified_by  uuid references public.profiles(id),
  verified_at  timestamptz,
  notes        text,
  created_at   timestamptz not null default now()
);

create table if not exists public.mosque_staff_leave (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references public.mosque_staff(id) on delete cascade,
  leave_type  text not null check (leave_type in (
                'annual','sick','compassionate','unpaid',
                'hajj','maternity','paternity','other')),
  start_date  date not null,
  end_date    date not null,
  days_taken  numeric,
  status      text not null default 'pending'
                check (status in ('pending','approved','declined','cancelled')),
  notes       text,
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists public.mosque_staff_documents (
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references public.mosque_staff(id) on delete cascade,
  document_type text not null,
  document_name text not null,
  storage_path  text not null,     -- key in mosque-hr-docs bucket (064); signed on demand
  uploaded_by   uuid references public.profiles(id),
  uploaded_at   timestamptz not null default now(),
  expires_at    date,
  notes         text
);

create table if not exists public.mosque_staff_messages (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id) on delete cascade,
  sent_by       uuid references public.profiles(id),
  recipient_ids uuid[],            -- mosque_staff.id values (validated server-side)
  subject       text,
  body          text not null,
  channels      text[] default '{}'::text[],
  template_used text,
  sent_at       timestamptz not null default now()
);

create table if not exists public.mosque_staff_audit_log (
  id         uuid primary key default gen_random_uuid(),
  mosque_id  uuid not null references public.mosques(id) on delete cascade,
  actor_id   uuid references public.profiles(id),
  staff_id   uuid references public.mosque_staff(id) on delete set null,
  action     text not null,
  details    jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists mosque_staff_ijazahs_staff_idx   on public.mosque_staff_ijazahs(staff_id);
create index if not exists mosque_staff_leave_staff_idx      on public.mosque_staff_leave(staff_id);
create index if not exists mosque_staff_documents_staff_idx  on public.mosque_staff_documents(staff_id);
create index if not exists mosque_staff_messages_mosque_idx  on public.mosque_staff_messages(mosque_id);
create index if not exists mosque_staff_audit_mosque_idx     on public.mosque_staff_audit_log(mosque_id);

-- ── D) RLS + revoke anon ────────────────────────────────────────────
alter table public.mosque_staff_ijazahs   enable row level security;
alter table public.mosque_staff_leave     enable row level security;
alter table public.mosque_staff_documents enable row level security;
alter table public.mosque_staff_messages  enable row level security;
alter table public.mosque_staff_audit_log enable row level security;

revoke all on public.mosque_staff_ijazahs   from anon;
revoke all on public.mosque_staff_leave     from anon;
revoke all on public.mosque_staff_documents from anon;
revoke all on public.mosque_staff_messages  from anon;
revoke all on public.mosque_staff_audit_log from anon;

-- ── E) Policies ─────────────────────────────────────────────────────
-- Owner manages (FOR ALL) their mosque's rows; employee reads own;
-- admin reads all. Messages + audit are mosque-level (owner/admin only).
create policy "Owner manages staff ijazahs" on public.mosque_staff_ijazahs
  for all to authenticated using (staff_id in (
    select id from public.mosque_staff where mosque_id in (
      select id from public.mosques where user_id = auth.uid())));
create policy "Employee reads own ijazahs" on public.mosque_staff_ijazahs
  for select to authenticated using (staff_id in (
    select id from public.mosque_staff where profile_id = auth.uid()));
create policy "Admin reads all ijazahs" on public.mosque_staff_ijazahs
  for select to authenticated using (public.is_admin());

create policy "Owner manages staff leave" on public.mosque_staff_leave
  for all to authenticated using (staff_id in (
    select id from public.mosque_staff where mosque_id in (
      select id from public.mosques where user_id = auth.uid())));
create policy "Employee reads own leave" on public.mosque_staff_leave
  for select to authenticated using (staff_id in (
    select id from public.mosque_staff where profile_id = auth.uid()));
create policy "Admin reads all leave" on public.mosque_staff_leave
  for select to authenticated using (public.is_admin());

create policy "Owner manages staff documents" on public.mosque_staff_documents
  for all to authenticated using (staff_id in (
    select id from public.mosque_staff where mosque_id in (
      select id from public.mosques where user_id = auth.uid())));
create policy "Employee reads own documents" on public.mosque_staff_documents
  for select to authenticated using (staff_id in (
    select id from public.mosque_staff where profile_id = auth.uid()));
create policy "Admin reads all documents" on public.mosque_staff_documents
  for select to authenticated using (public.is_admin());

create policy "Owner manages staff messages" on public.mosque_staff_messages
  for all to authenticated using (mosque_id in (
    select id from public.mosques where user_id = auth.uid()));
create policy "Admin reads all messages" on public.mosque_staff_messages
  for select to authenticated using (public.is_admin());

create policy "Owner reads staff audit" on public.mosque_staff_audit_log
  for select to authenticated using (mosque_id in (
    select id from public.mosques where user_id = auth.uid()));
create policy "Admin reads staff audit" on public.mosque_staff_audit_log
  for select to authenticated using (public.is_admin());

notify pgrst, 'reload schema';

-- ── F) SECURITY DEFINER RPCs ────────────────────────────────────────

-- 1. Safe directory list — NO salary / dob / phone / doc numbers.
--    Returns badge-level RTW/DBS (booleans, dates, level) only. Replaces
--    getMosqueStaff's select('*').
create or replace function public.get_mosque_staff_list(p_mosque_id uuid)
returns table (
  id uuid, mosque_id uuid, name text, email text, photo_url text,
  role text, job_title text, department text, staff_type text,
  employment_type text, status text, invite_status text, archived boolean,
  start_date date, end_date date, onboarding_completed_at timestamptz,
  onboarding_method text, listed_on_marketplace boolean,
  show_on_profile boolean, linked_scholar_id uuid,
  annual_leave_days integer, leave_balance_days numeric,
  dbs_status text, dbs_level text, dbs_expiry_date date, dbs_required boolean,
  rtw_verified boolean, rtw_expiry_date date, rtw_document_type text,
  created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid();
begin
  if not exists (select 1 from mosques where id = p_mosque_id and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_mosque_owner';
  end if;
  return query
    select s.id, s.mosque_id, s.name, s.email, s.photo_url,
           s.role, s.job_title, s.department, s.staff_type,
           s.employment_type, s.status, s.invite_status, s.archived,
           s.start_date, s.end_date, s.onboarding_completed_at,
           s.onboarding_method, s.listed_on_marketplace,
           s.show_on_profile, s.linked_scholar_id,
           s.annual_leave_days, s.leave_balance_days,
           s.dbs_status, s.dbs_level, s.dbs_expiry_date, s.dbs_required,
           e.rtw_verified, e.rtw_expiry_date, e.rtw_document_type,
           s.created_at
      from mosque_staff s
      left join mosque_staff_employment e on e.staff_id = s.id
      where s.mosque_id = p_mosque_id
        and s.deleted_at is null
      order by s.created_at desc;
end; $$;

-- 2. Salary — owner OR the employee themselves. Audit logged.
create or replace function public.get_staff_salary(p_staff_id uuid)
returns integer
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_salary integer; v_mosque uuid;
begin
  select e.salary_pence, s.mosque_id into v_salary, v_mosque
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and (m.user_id = v_uid or s.profile_id = v_uid);
  if v_mosque is null then raise exception 'not_authorised'; end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'salary_viewed');
  return v_salary;
end; $$;

-- 3. Sensitive PII — owner only. Audit logged. (Bank details excluded —
--    those stay behind the existing owner-only employment read.)
create or replace function public.get_staff_sensitive(p_staff_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_result jsonb; v_mosque uuid;
begin
  select s.mosque_id, jsonb_build_object(
      'date_of_birth', e.dob,
      'phone', s.phone,
      'address', e.address,
      'nationality', e.nationality,
      'next_of_kin', e.next_of_kin,
      'emergency_contact_name', e.emergency_contact_name,
      'emergency_contact_phone', e.emergency_contact_phone,
      'ni_number', e.ni_number,
      'rtw_document_number', e.rtw_document_number,
      'dbs_certificate_number', e.dbs_certificate_number
    ) into v_mosque, v_result
    from mosque_staff s
    left join mosque_staff_employment e on e.staff_id = s.id
    join mosques m on m.id = s.mosque_id
    where s.id = p_staff_id and m.user_id = v_uid;
  if v_mosque is null then raise exception 'not_mosque_owner'; end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'sensitive_data_viewed');
  return v_result;
end; $$;

-- 4. Offboard — owner only. Soft delete + revoke access.
create or replace function public.offboard_staff(
  p_staff_id uuid, p_reason text, p_end_date date)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  update mosque_staff set
    status = 'offboarded', archived = true,
    end_date = p_end_date, offboarding_reason = p_reason,
    offboarding_completed_at = now(),
    profile_id = null, invite_status = 'not_invited',
    deleted_at = (now() + interval '2 years')   -- GDPR retention window
  where id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque, v_uid, p_staff_id, 'staff_offboarded',
            jsonb_build_object('reason', p_reason, 'end_date', p_end_date));
end; $$;

-- 5. Anonymise (GDPR erasure) — owner only. Redacts PII, keeps audit trail.
create or replace function public.anonymise_staff(p_staff_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  update mosque_staff set
    name = '[REDACTED]', email = '[REDACTED]', phone = '[REDACTED]',
    bio = null, dbs_certificate = '[REDACTED]'
  where id = p_staff_id;
  update mosque_staff_employment set
    dob = null, address = '[REDACTED]', ni_number = '[REDACTED]',
    bank_account_name = '[REDACTED]', bank_sort_code = '[REDACTED]',
    bank_account_number = '[REDACTED]', next_of_kin = '[REDACTED]',
    nationality = '[REDACTED]',
    emergency_contact_name = '[REDACTED]', emergency_contact_phone = '[REDACTED]',
    rtw_document_number = '[REDACTED]', rtw_share_code = '[REDACTED]',
    dbs_certificate_number = '[REDACTED]', dbs_id_document_number = '[REDACTED]',
    reference_1_name = '[REDACTED]', reference_1_email = '[REDACTED]',
    reference_2_name = '[REDACTED]', reference_2_email = '[REDACTED]'
  where staff_id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action)
    values (v_mosque, v_uid, p_staff_id, 'staff_anonymised');
end; $$;

-- 6. [ADDITION — flagged] Suspend / reactivate — owner only.
create or replace function public.suspend_staff(
  p_staff_id uuid, p_status text default 'suspended')
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  if p_status not in ('suspended','active') then
    raise exception 'invalid_status';
  end if;
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  update mosque_staff set status = p_status where id = p_staff_id;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque, v_uid, p_staff_id,
            case when p_status = 'active' then 'staff_reactivated' else 'staff_suspended' end,
            jsonb_build_object('status', p_status));
end; $$;

-- 7. [ADDITION — flagged] Record an audit entry (document viewed /
--    message sent) — owner/admin. Validates staff belongs to the mosque.
create or replace function public.record_staff_audit(
  p_staff_id uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque uuid;
begin
  select mosque_id into v_mosque from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque and user_id = v_uid)
     and not is_admin() then
    raise exception 'not_authorised';
  end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque, v_uid, p_staff_id, p_action, coalesce(p_details, '{}'::jsonb));
end; $$;

grant execute on function public.get_mosque_staff_list(uuid)         to authenticated;
grant execute on function public.get_staff_salary(uuid)              to authenticated;
grant execute on function public.get_staff_sensitive(uuid)           to authenticated;
grant execute on function public.offboard_staff(uuid,text,date)      to authenticated;
grant execute on function public.anonymise_staff(uuid)               to authenticated;
grant execute on function public.suspend_staff(uuid,text)            to authenticated;
grant execute on function public.record_staff_audit(uuid,text,jsonb) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor / psql-dev (dev), then prod.
--   2. Probe (RAW rows):
--        select table_name from information_schema.tables
--          where table_name in ('mosque_staff_ijazahs','mosque_staff_leave',
--            'mosque_staff_documents','mosque_staff_messages','mosque_staff_audit_log')
--          order by table_name;
--        select tablename, policyname, cmd from pg_policies
--          where tablename like 'mosque_staff_%' order by tablename, policyname;
--        select proname, prosecdef from pg_proc where proname in
--          ('get_mosque_staff_list','get_staff_salary','get_staff_sensitive',
--           'offboard_staff','anonymise_staff','suspend_staff','record_staff_audit')
--          order by proname;
--        select grantee from information_schema.role_table_grants
--          where table_name like 'mosque_staff_%' and grantee = 'anon';  -- expect 0 rows
--   3. NOTIFY pgrst, 'reload schema';
-- ====================================================================

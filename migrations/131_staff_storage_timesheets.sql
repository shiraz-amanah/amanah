-- 131_staff_storage_timesheets.sql
-- ====================================================================
-- Session RBAC-C — persisted timesheets table + document/contract audit RPCs.
-- Staff documents consolidate on the NEW private `staff-documents` bucket
-- (layout {mosque_id}/{staff_id}/{doc_type}/{file}); the 6 storage-object
-- policies are applied MANUALLY (Storage → Policies) — see
-- 131_staff_storage_policies.sql. mosque-hr-docs is deprecated for staff docs.
--
-- CORRECTIONS FROM THE DRAFT (all folded in before any apply):
--   • audit inserts use mosque_staff_audit_log.staff_id (NOT employee_id — that
--     column doesn't exist; 129 named it staff_id).
--   • log_contract_signed gains an owner-OR-self guard (it's the evidentiary
--     signature row; employee signs too, so it can't be owner-only).
--   • get_staff_document_url validates the path prefix ({mosque}/{staff}/…) so an
--     audit row can't be logged against a mismatched staff_id.
--   • timesheets trigger dropped-if-exists before create (idempotency parity).
--   • ip_address stays (nullable) but NO RPC asserts it — there is no capture
--     path (12/12, no serverless slot); a future slot can populate it.
-- ====================================================================

create table if not exists public.mosque_staff_timesheets (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references public.mosque_staff(id) on delete cascade,
  mosque_id    uuid not null references public.mosques(id) on delete cascade,
  work_date    date not null,
  hours_worked numeric not null check (hours_worked >= 0 and hours_worked <= 24),
  notes        text,
  approved     boolean default false,
  approved_by  uuid references public.profiles(id),
  approved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (staff_id, work_date)
);

create index if not exists mosque_staff_timesheets_staff_idx  on public.mosque_staff_timesheets(staff_id);
create index if not exists mosque_staff_timesheets_mosque_idx on public.mosque_staff_timesheets(mosque_id);
create index if not exists mosque_staff_timesheets_date_idx   on public.mosque_staff_timesheets(work_date);

alter table public.mosque_staff_timesheets enable row level security;
revoke all on public.mosque_staff_timesheets from anon;

create policy "Owner manages timesheets" on public.mosque_staff_timesheets
  for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid()));

create policy "Employee reads own timesheets" on public.mosque_staff_timesheets
  for select to authenticated
  using (staff_id in (select id from public.mosque_staff where profile_id = auth.uid()));

create policy "Admin reads all timesheets" on public.mosque_staff_timesheets
  for select to authenticated
  using (public.is_admin());

-- updated_at trigger (drop-first for idempotency parity with the rest)
create or replace function public.touch_timesheets_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists timesheets_touch_updated_at on public.mosque_staff_timesheets;
create trigger timesheets_touch_updated_at
  before update on public.mosque_staff_timesheets
  for each row execute function public.touch_timesheets_updated_at();

-- ── SECURITY DEFINER RPCs ───────────────────────────────────────────

-- Authorise + audit a staff-document view, then return the path for the client
-- to createSignedUrl (storage RLS gates the actual signed-URL generation).
-- Owner OR the employee themselves. Path is validated to belong to this
-- mosque+staff so the audit row can't be logged against a mismatched staff_id.
create or replace function public.get_staff_document_url(
  p_storage_path text, p_staff_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque_id uuid;
begin
  select mosque_id into v_mosque_id from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque_id and user_id = v_uid)
     and not exists (select 1 from mosque_staff where id = p_staff_id and profile_id = v_uid) then
    raise exception 'not_authorised';
  end if;
  if p_storage_path is null
     or p_storage_path not like (v_mosque_id::text || '/' || p_staff_id::text || '/%') then
    raise exception 'path_mismatch';
  end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque_id, v_uid, p_staff_id, 'document_viewed',
            jsonb_build_object('path', p_storage_path));
  return p_storage_path;
end; $$;

-- Log contract-disclaimer acceptance — owner only (the mosque accepts the T&Cs).
create or replace function public.log_contract_disclaimer_accepted(
  p_staff_id uuid, p_contract_type text)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque_id uuid;
begin
  select mosque_id into v_mosque_id from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque_id and user_id = v_uid) then
    raise exception 'not_mosque_owner';
  end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque_id, v_uid, p_staff_id, 'contract_disclaimer_accepted',
            jsonb_build_object('contract_type', p_contract_type, 'timestamp', now()));
end; $$;

-- Log an e-signature — owner OR the employee themselves (both sign). This row is
-- the evidentiary record, so it MUST be guarded (FIX 1).
create or replace function public.log_contract_signed(
  p_staff_id uuid, p_contract_type text, p_signatory_name text, p_storage_path text)
returns void
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare v_uid uuid := auth.uid(); v_mosque_id uuid;
begin
  select mosque_id into v_mosque_id from mosque_staff where id = p_staff_id;
  if not exists (select 1 from mosques where id = v_mosque_id and user_id = v_uid)
     and not exists (select 1 from mosque_staff where id = p_staff_id and profile_id = v_uid) then
    raise exception 'not_authorised';
  end if;
  insert into mosque_staff_audit_log (mosque_id, actor_id, staff_id, action, details)
    values (v_mosque_id, v_uid, p_staff_id, 'contract_signed',
            jsonb_build_object('contract_type', p_contract_type,
                               'signatory_name', p_signatory_name,
                               'storage_path', p_storage_path,
                               'signed_at', now()));
end; $$;

grant execute on function public.get_staff_document_url(text, uuid)              to authenticated;
grant execute on function public.log_contract_disclaimer_accepted(uuid, text)    to authenticated;
grant execute on function public.log_contract_signed(uuid, text, text, text)     to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Create the staff-documents bucket (both projects) + the 6 storage
--      policies (131_staff_storage_policies.sql) FIRST.
--   2. Run this file (dev), then prod.
--   3. Probe (RAW rows):
--        select column_name, data_type, is_nullable from information_schema.columns
--          where table_name='mosque_staff_timesheets' order by ordinal_position;
--        select policyname, cmd from pg_policies where tablename='mosque_staff_timesheets';
--        select proname, prosecdef from pg_proc where proname in
--          ('get_staff_document_url','log_contract_disclaimer_accepted','log_contract_signed');
--        select grantee from information_schema.role_table_grants
--          where table_name='mosque_staff_timesheets' and grantee='anon';  -- 0 rows
--   4. NOTIFY pgrst, 'reload schema';
-- ====================================================================

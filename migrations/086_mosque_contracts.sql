-- 086_mosque_contracts.sql — Session AM (employment contracts + lightweight e-sign)
-- ====================================================================
-- Contract templates (full_time / part_time / sessional / volunteer) are
-- auto-populated from the staff record, rendered to PDF client-side (jspdf),
-- and signed via a lightweight token-based e-sign: the admin issues a contract
-- (status='sent') with a random token + expiry and emails the link; the staff
-- member opens it (NOT signed in), reviews, types their name and agrees. The
-- signature is just: token + typed name + timestamp (+ user agent), which is
-- the legally-meaningful audit for a lightweight e-sign.
--
-- terms jsonb is an immutable SNAPSHOT of the populated contract fields at issue
-- time (employee name, role, hours, pay, dates, clauses, mosque/employer
-- details). The PDF is a render of terms — we don't store PDF bytes, so no
-- storage bucket is needed and the signed record stays reproducible.
--
-- Signing happens through SECURITY DEFINER RPCs (the token is the authorisation,
-- exactly like 066's staff-wizard RPCs) because mosque_contracts is owner-only
-- under RLS and the signer is typically not authenticated. The RPCs derive the
-- row from the token, so a caller can only ever touch the one contract the token
-- points at.
-- ====================================================================

create table if not exists public.mosque_contracts (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosques(id)      on delete cascade,
  staff_id          uuid not null references public.mosque_staff(id) on delete cascade,
  contract_type     text not null
    check (contract_type in ('full_time', 'part_time', 'sessional', 'volunteer')),
  status            text not null default 'draft'
    check (status in ('draft', 'sent', 'signed', 'declined', 'void')),
  token             uuid not null unique default gen_random_uuid(),
  token_expires_at  timestamptz,
  terms             jsonb not null default '{}'::jsonb,  -- immutable snapshot at issue time
  created_by        uuid references auth.users(id) on delete set null,
  sent_at           timestamptz,
  signed_at         timestamptz,
  signed_name       text,
  signed_user_agent text,
  declined_reason   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists mosque_contracts_mosque_idx on public.mosque_contracts(mosque_id);
create index if not exists mosque_contracts_staff_idx  on public.mosque_contracts(staff_id);

alter table public.mosque_contracts enable row level security;

-- Mosque admins: full CRUD on their own mosque's contracts (create, issue/send,
-- void). RLS mirrors 058/085's non-recursive shape — no SECURITY DEFINER helper
-- needed for the admin path.
create policy "Mosque admins manage own contracts"
  on public.mosque_contracts for all
  to authenticated
  using      (mosque_id in (select id from public.mosques where user_id = auth.uid()))
  with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- Linked staff can read their own contracts (future staff portal view). Signing
-- itself goes through the RPCs below, not this policy.
create policy "Staff read own contracts"
  on public.mosque_contracts for select
  to authenticated
  using (staff_id in (select id from public.mosque_staff where profile_id = auth.uid()));

create or replace function public.touch_mosque_contracts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_contracts_touch_updated_at
  before update on public.mosque_contracts
  for each row execute function public.touch_mosque_contracts_updated_at();

-- --------------------------------------------------------------------
-- get_contract_for_signing — anon-callable safe-shape for the public signing
-- page. Returns the contract content (terms) + display names so the page can
-- render the PDF and branch on status. The token is the secret, so returning
-- terms to its holder is the intended behaviour (same posture as 066).
-- --------------------------------------------------------------------
create or replace function public.get_contract_for_signing(p_token uuid)
returns table (
  found         boolean,
  status        text,
  contract_type text,
  terms         jsonb,
  mosque_name   text,
  staff_name    text,
  signed_at     timestamptz,
  signed_name   text,
  expired       boolean
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare rec record;
begin
  if p_token is null then
    return query select false, null::text, null::text, null::jsonb, null::text, null::text, null::timestamptz, null::text, false; return;
  end if;
  select c.status, c.contract_type, c.terms, c.signed_at, c.signed_name, c.token_expires_at,
         m.name as mosque_name, s.name as staff_name
    into rec
    from public.mosque_contracts c
    join public.mosques m      on m.id = c.mosque_id
    join public.mosque_staff s on s.id = c.staff_id
   where c.token = p_token;
  if not found then
    return query select false, null::text, null::text, null::jsonb, null::text, null::text, null::timestamptz, null::text, false; return;
  end if;
  return query select true, rec.status, rec.contract_type, rec.terms, rec.mosque_name, rec.staff_name,
                      rec.signed_at, rec.signed_name,
                      (rec.token_expires_at is not null and rec.token_expires_at < now());
end;
$$;

revoke all on function public.get_contract_for_signing(uuid) from public;
grant execute on function public.get_contract_for_signing(uuid) to anon, authenticated;

-- --------------------------------------------------------------------
-- sign_contract — anon-callable (token-authorised). Records the signature on a
-- 'sent', non-expired contract. One-way: a signed contract can't be re-signed.
-- --------------------------------------------------------------------
create or replace function public.sign_contract(p_token uuid, p_signed_name text, p_user_agent text default null)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare rec record;
begin
  if p_signed_name is null or length(trim(p_signed_name)) < 2 then
    return json_build_object('ok', false, 'error', 'name_required');
  end if;
  select id, status, token_expires_at
    into rec
    from public.mosque_contracts
   where token = p_token
   for update;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if rec.status = 'signed' then return json_build_object('ok', false, 'error', 'already_signed'); end if;
  if rec.status <> 'sent' then return json_build_object('ok', false, 'error', 'not_signable'); end if;
  if rec.token_expires_at is not null and rec.token_expires_at < now() then
    return json_build_object('ok', false, 'error', 'expired');
  end if;

  update public.mosque_contracts
     set status = 'signed', signed_at = now(), signed_name = trim(p_signed_name),
         signed_user_agent = p_user_agent, updated_at = now()
   where id = rec.id;

  return json_build_object('ok', true, 'id', rec.id);
end;
$$;

revoke all on function public.sign_contract(uuid, text, text) from public;
grant execute on function public.sign_contract(uuid, text, text) to anon, authenticated;

-- --------------------------------------------------------------------
-- decline_contract — anon-callable (token-authorised). Lets the recipient
-- decline a 'sent' contract with an optional reason.
-- --------------------------------------------------------------------
create or replace function public.decline_contract(p_token uuid, p_reason text default null)
returns json
language plpgsql
security definer
volatile
set search_path = public
as $$
declare rec record;
begin
  select id, status into rec from public.mosque_contracts where token = p_token for update;
  if not found then return json_build_object('ok', false, 'error', 'not_found'); end if;
  if rec.status not in ('sent') then return json_build_object('ok', false, 'error', 'not_declinable'); end if;
  update public.mosque_contracts
     set status = 'declined', declined_reason = nullif(trim(coalesce(p_reason, '')), ''), updated_at = now()
   where id = rec.id;
  return json_build_object('ok', true, 'id', rec.id);
end;
$$;

revoke all on function public.decline_contract(uuid, text) from public;
grant execute on function public.decline_contract(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, then prod):
--   1. Run in the Supabase SQL editor (NOTIFY included above).
--   2. Probe:
--        \d public.mosque_contracts
--        select count(*) from pg_policies where tablename = 'mosque_contracts';  -- expect 2
--        select proname, prosecdef from pg_proc
--          where proname in ('get_contract_for_signing','sign_contract','decline_contract');
--          -- prosecdef = true for all three
--        select found from public.get_contract_for_signing(gen_random_uuid());  -- expect false
--   3. End-to-end (as owner): insert a contract (status='sent', token_expires_at
--      = now() + interval '30 days'); call get_contract_for_signing(token)
--      (found=true, status='sent'); call sign_contract(token,'Test Name')
--      (ok=true); confirm row is status='signed' with signed_at/signed_name set;
--      re-call sign_contract → error 'already_signed'.
--   4. Hard refresh -> repeat on prod.
-- ====================================================================

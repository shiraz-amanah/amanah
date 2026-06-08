-- 093_mosque_public_profile_and_claims.sql
-- ====================================================================
-- Mosque public profile completion: richer prayer-times metadata + the mosque
-- claim flow.
--
-- NOTE: prayer_times (jsonb) and jumuah_time (text) ALREADY exist on mosques
-- (024/049) — this migration only ADDS the new metadata columns. The prayer_times
-- jsonb is re-shaped client-side to { fajr:{adhan,iqamah}, …, jumuah:{khutbah1,
-- khutbah2,iqamah}, seasonal_note }; ramadan_active is a real column (below).
-- ramadan_calendar holds the 30-day timetable [{date, sehri_end, iftar,
-- tarawih_start}], ramadan_year tags which year it's for; both client-managed.
--
-- Emails are fired CLIENT-side via /api/send-transactional (the codebase
-- pattern; Postgres has no mailer here). The RPC just inserts + harvest-guards;
-- the anon claimant then calls the anon-safe `mosque_claim_received` intent, and
-- the admin calls `mosque_claim_approved` on approval. (App code, separate turn.)
-- ====================================================================

-- 1. Prayer-times + Ramadan metadata on mosques (prayer_times already present) --
alter table public.mosques add column if not exists jummuah_info            jsonb;
alter table public.mosques add column if not exists ramadan_times           jsonb;
alter table public.mosques add column if not exists prayer_times_updated_at  timestamptz;
alter table public.mosques add column if not exists ramadan_calendar         jsonb;          -- 30-day [{date,sehri_end,iftar,tarawih_start}]
alter table public.mosques add column if not exists ramadan_year            integer;
alter table public.mosques add column if not exists ramadan_active          boolean not null default false;

-- 2. Mosque claims -------------------------------------------------------------
create table if not exists public.mosque_claims (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosques(id) on delete cascade,
  claimant_name     text not null,
  claimant_role     text,
  claimant_email    text not null,
  claimant_phone    text,
  verification_note text,
  status            text not null default 'pending' check (status in ('pending','approved','rejected')),
  -- single-use-ish link the approved claimant opens to bind their new account:
  claim_token       uuid not null default gen_random_uuid(),
  reviewed_by       uuid references auth.users(id) on delete set null,
  reviewed_at       timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists mosque_claims_status_idx on public.mosque_claims(status, created_at desc);
create index if not exists mosque_claims_mosque_idx on public.mosque_claims(mosque_id);

alter table public.mosque_claims enable row level security;

-- RLS: claim details are private. Only the platform admin can read/manage them.
-- Submission goes exclusively through the harvest-guarded SECURITY DEFINER RPC
-- below (safer than a raw anon INSERT policy, which would bypass the guard), so
-- no anon/authenticated INSERT/SELECT policy is granted.
drop policy if exists "Admin manage mosque claims" on public.mosque_claims;
create policy "Admin manage mosque claims" on public.mosque_claims
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3. Submit a claim (anon-safe, harvest-guarded) -------------------------------
create or replace function public.submit_mosque_claim(
  p_mosque_id uuid, p_name text, p_role text, p_email text, p_phone text, p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_email text := lower(trim(p_email));
begin
  if p_mosque_id is null or coalesce(trim(p_name), '') = '' or v_email = '' then
    raise exception 'mosque, name and email are required';
  end if;
  if not exists (select 1 from public.mosques m where m.id = p_mosque_id) then
    raise exception 'mosque not found';
  end if;
  -- Harvest guard: one live pending claim per (mosque, email); cap per email/day.
  if exists (
    select 1 from public.mosque_claims c
    where c.mosque_id = p_mosque_id and lower(c.claimant_email) = v_email and c.status = 'pending'
  ) then
    raise exception 'a claim for this mosque from this email is already pending review';
  end if;
  if (select count(*) from public.mosque_claims c
        where lower(c.claimant_email) = v_email and c.created_at > now() - interval '1 day') >= 5 then
    raise exception 'too many claims submitted recently — please try again later';
  end if;

  insert into public.mosque_claims (mosque_id, claimant_name, claimant_role, claimant_email, claimant_phone, verification_note)
  values (p_mosque_id, trim(p_name), nullif(trim(p_role), ''), v_email, nullif(trim(p_phone), ''), nullif(trim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_mosque_claim(uuid,text,text,text,text,text) from public;
grant execute on function public.submit_mosque_claim(uuid,text,text,text,text,text) to anon, authenticated;

-- 4. Approve / reject a claim (platform admin only) ----------------------------
create or replace function public.update_mosque_claim_status(p_claim_id uuid, p_status text)
returns public.mosque_claims
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.mosque_claims;
begin
  if not public.is_admin() then raise exception 'not authorised'; end if;
  if p_status not in ('pending','approved','rejected') then raise exception 'invalid status'; end if;
  update public.mosque_claims
     set status = p_status, reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_claim_id
   returning * into v_row;
  if v_row is null then raise exception 'claim not found'; end if;
  return v_row;
end;
$$;
revoke all on function public.update_mosque_claim_status(uuid,text) from public, anon;
grant execute on function public.update_mosque_claim_status(uuid,text) to authenticated;

-- 5. Accept an approved claim — binds the signed-in account to the mosque -------
-- The approved claimant signs up/in with their claim email, opens the token link,
-- and this binds mosques.user_id (only if still unclaimed AND their email matches).
create or replace function public.accept_mosque_claim(p_token uuid)
returns public.mosques
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim  public.mosque_claims;
  v_mosque public.mosques;
  v_email  text;
begin
  if auth.uid() is null then raise exception 'sign in to accept the claim'; end if;
  select * into v_claim from public.mosque_claims where claim_token = p_token;
  if v_claim is null then raise exception 'invalid or expired claim link'; end if;
  if v_claim.status <> 'approved' then raise exception 'this claim has not been approved'; end if;

  select email into v_email from auth.users where id = auth.uid();
  if lower(coalesce(v_email, '')) <> lower(v_claim.claimant_email) then
    raise exception 'please sign in with the email the claim was submitted from';
  end if;

  select * into v_mosque from public.mosques where id = v_claim.mosque_id;
  if v_mosque.user_id is not null and v_mosque.user_id <> auth.uid() then
    raise exception 'this mosque has already been claimed';
  end if;

  update public.mosques set user_id = auth.uid() where id = v_claim.mosque_id returning * into v_mosque;
  return v_mosque;
end;
$$;
revoke all on function public.accept_mosque_claim(uuid) from public, anon;
grant execute on function public.accept_mosque_claim(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe + smoke, then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select column_name from information_schema.columns
--          where table_name='mosques' and column_name in
--          ('jummuah_info','ramadan_times','prayer_times_updated_at',
--           'ramadan_calendar','ramadan_year','ramadan_active');                  -- 6 rows
--        select column_name from information_schema.columns where table_name='mosque_claims';
--          -- id, mosque_id, claimant_name, claimant_role, claimant_email,
--          --   claimant_phone, verification_note, status, claim_token,
--          --   reviewed_by, reviewed_at, created_at
--        select polname, cmd from pg_policies where tablename='mosque_claims';     -- 1 (Admin manage, ALL)
--        select proname, prosecdef from pg_proc where proname in
--          ('submit_mosque_claim','update_mosque_claim_status','accept_mosque_claim'); -- all prosecdef=t
--        select has_function_privilege('anon','public.submit_mosque_claim(uuid,text,text,text,text,text)','execute');          -- t
--        select has_function_privilege('anon','public.update_mosque_claim_status(uuid,text)','execute');                       -- f
--        select has_function_privilege('anon','public.accept_mosque_claim(uuid)','execute');                                   -- f
--      As anon: select from mosque_claims  -> 0 rows / denied (no read policy).
--      As anon: submit_mosque_claim(<real mosque>, 'Test', 'Imam', 'a@b.com', '', '') -> returns a uuid.
--               submit again same mosque+email -> 'already pending review'.
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

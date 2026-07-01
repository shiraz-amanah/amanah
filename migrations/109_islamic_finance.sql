-- 109_islamic_finance.sql
-- ====================================================================
-- Islamic Finance (ZISWAF) module (Session BC). Owner-only across the board.
-- Scope: Sadaqah + Waqf + Pledges + Qard Hasan. ZAKAT IS EXCLUDED by design —
-- collecting/distributing Zakat needs a designated Sharia-compliant fund +
-- scholarly oversight, so it is NOT in this schema (enabling it later is a
-- separate, explicitly-warned step). No payments processing — record-keeping
-- only (Stripe is a later, separate concern).
--
-- Pledge Night = a live session (like the community visitor register): members
-- submit pledges via an anon-safe RPC scoped to an OPEN session, with realtime
-- for the running total. Everything feeds Finance → Reports (client-side
-- aggregation) + Gift Aid (25% uplift on eligible entries).
--
-- Dev first, probe, then prod.
-- ====================================================================

-- 1. Campaigns (Sadaqah Jariyah / Waqf / Pledge) -------------------------------
create table if not exists public.finance_campaigns (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id) on delete cascade,
  kind          text not null check (kind in ('sadaqah_jariyah','waqf','pledge')),
  name          text not null,
  description   text,
  target_amount numeric,
  deadline      date,
  status        text not null default 'active' check (status in ('active','closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists finance_campaigns_mosque_idx on public.finance_campaigns(mosque_id, kind, status);

-- 2. Sadaqah donations (general or tied to a campaign) -------------------------
create table if not exists public.finance_sadaqah (
  id                 uuid primary key default gen_random_uuid(),
  mosque_id          uuid not null references public.mosques(id) on delete cascade,
  campaign_id        uuid references public.finance_campaigns(id) on delete set null, -- null = general Sadaqah
  donor_name         text,
  donor_address      text,        -- for the Gift Aid / HMRC report
  amount             numeric not null,
  donation_date      date not null default current_date,
  purpose            text,
  gift_aid_eligible  boolean not null default false,
  created_at         timestamptz not null default now()
);
create index if not exists finance_sadaqah_mosque_idx on public.finance_sadaqah(mosque_id, donation_date desc);
create index if not exists finance_sadaqah_campaign_idx on public.finance_sadaqah(campaign_id);

-- 3. Waqf assets (endowments — principal protected, never spent) ---------------
create table if not exists public.finance_waqf_assets (
  id                          uuid primary key default gen_random_uuid(),
  mosque_id                   uuid not null references public.mosques(id) on delete cascade,
  name                        text not null,
  description                 text,
  purpose                     text,
  donor_name                  text,
  endowed_date                date,
  principal_amount            numeric not null default 0,   -- protected — never spent
  yield_generated             numeric not null default 0,   -- cumulative income
  yield_distributed           numeric not null default 0,   -- cumulative distributed
  yield_notes                 text,
  trustee_committee_member_id uuid references public.governance_committee_members(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists finance_waqf_mosque_idx on public.finance_waqf_assets(mosque_id);

-- 4. Pledge Night sessions (live) ----------------------------------------------
create table if not exists public.finance_pledge_sessions (
  id          uuid primary key default gen_random_uuid(),
  mosque_id   uuid not null references public.mosques(id) on delete cascade,
  campaign_id uuid references public.finance_campaigns(id) on delete set null,
  name        text not null,
  opened_at   timestamptz not null default now(),
  closes_at   timestamptz,
  closed_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists finance_pledge_sessions_mosque_idx on public.finance_pledge_sessions(mosque_id, opened_at desc);

-- 5. Pledges (admin-entered or member-submitted at a Pledge Night) -------------
create table if not exists public.finance_pledges (
  id                uuid primary key default gen_random_uuid(),
  mosque_id         uuid not null references public.mosques(id) on delete cascade,
  campaign_id       uuid references public.finance_campaigns(id) on delete set null,
  session_id        uuid references public.finance_pledge_sessions(id) on delete set null,
  profile_id        uuid references public.profiles(id) on delete set null, -- member, if submitted signed-in
  donor_name        text not null,
  donor_email       text,
  donor_address     text,
  amount_pledged    numeric not null,
  due_date          date,
  gift_aid_eligible boolean not null default false,
  source            text not null default 'admin' check (source in ('admin','member','pledge_night')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists finance_pledges_mosque_idx    on public.finance_pledges(mosque_id, due_date);
create index if not exists finance_pledges_campaign_idx  on public.finance_pledges(campaign_id);
create index if not exists finance_pledges_session_idx   on public.finance_pledges(session_id);

-- 6. Pledge payments (amount paid accrues here; outstanding = pledged - paid) ---
create table if not exists public.finance_pledge_payments (
  id         uuid primary key default gen_random_uuid(),
  pledge_id  uuid not null references public.finance_pledges(id) on delete cascade,
  mosque_id  uuid not null references public.mosques(id) on delete cascade,   -- denormalized for RLS/reports
  amount     numeric not null,
  paid_date  date not null default current_date,
  created_at timestamptz not null default now()
);
create index if not exists finance_pledge_payments_pledge_idx on public.finance_pledge_payments(pledge_id);
create index if not exists finance_pledge_payments_mosque_idx on public.finance_pledge_payments(mosque_id, paid_date);

-- 7. Qard Hasan (interest-free benevolent loans — HIGHLY confidential) ---------
create table if not exists public.finance_qard_hasan (
  id                 uuid primary key default gen_random_uuid(),
  mosque_id          uuid not null references public.mosques(id) on delete cascade,
  recipient_name     text not null,
  amount             numeric not null,
  loan_date          date not null default current_date,
  repayment_schedule text,
  amount_repaid      numeric not null default 0,
  status             text not null default 'active' check (status in ('active','repaid','written_off')),
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists finance_qard_mosque_idx on public.finance_qard_hasan(mosque_id, status);

-- ---- RLS: owner-only across the module --------------------------------------
alter table public.finance_campaigns        enable row level security;
alter table public.finance_sadaqah          enable row level security;
alter table public.finance_waqf_assets      enable row level security;
alter table public.finance_pledge_sessions  enable row level security;
alter table public.finance_pledges          enable row level security;
alter table public.finance_pledge_payments  enable row level security;
alter table public.finance_qard_hasan       enable row level security;

drop policy if exists "Owner manage finance_campaigns" on public.finance_campaigns;
create policy "Owner manage finance_campaigns" on public.finance_campaigns for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_sadaqah" on public.finance_sadaqah;
create policy "Owner manage finance_sadaqah" on public.finance_sadaqah for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_waqf_assets" on public.finance_waqf_assets;
create policy "Owner manage finance_waqf_assets" on public.finance_waqf_assets for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_pledge_sessions" on public.finance_pledge_sessions;
create policy "Owner manage finance_pledge_sessions" on public.finance_pledge_sessions for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_pledges" on public.finance_pledges;
create policy "Owner manage finance_pledges" on public.finance_pledges for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_pledge_payments" on public.finance_pledge_payments;
create policy "Owner manage finance_pledge_payments" on public.finance_pledge_payments for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));
drop policy if exists "Owner manage finance_qard_hasan" on public.finance_qard_hasan;
create policy "Owner manage finance_qard_hasan" on public.finance_qard_hasan for all to authenticated
  using (mosque_id in (select id from public.mosques where user_id = auth.uid())) with check (mosque_id in (select id from public.mosques where user_id = auth.uid()));

-- ---- Pledge Night: anon-safe public session lookup + submit (harvest-guarded) --
-- The QR/link encodes /pledge?mosque=<id>&session=<id>. Anyone can look up the
-- open session (display) and submit a pledge; no broad anon table access.
create or replace function public.pledge_session_public(p_session_id uuid)
returns table (name text, mosque_name text, campaign_name text, target numeric, is_open boolean, pledged_total numeric, pledge_count int)
language sql stable security definer set search_path = public
as $$
  select s.name, m.name, c.name, c.target_amount,
         (s.closed_at is null and (s.closes_at is null or now() < s.closes_at)) as is_open,
         coalesce((select sum(p.amount_pledged) from public.finance_pledges p where p.session_id = s.id), 0),
         (select count(*)::int from public.finance_pledges p where p.session_id = s.id)
  from public.finance_pledge_sessions s
  join public.mosques m on m.id = s.mosque_id
  left join public.finance_campaigns c on c.id = s.campaign_id
  where s.id = p_session_id;
$$;
revoke all on function public.pledge_session_public(uuid) from public;
grant execute on function public.pledge_session_public(uuid) to anon, authenticated;

create or replace function public.submit_pledge(p_session_id uuid, p_donor_name text, p_amount numeric, p_email text, p_gift_aid boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_session public.finance_pledge_sessions; v_id uuid;
begin
  if coalesce(trim(p_donor_name),'') = '' then raise exception 'your name is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'enter a valid amount'; end if;
  select * into v_session from public.finance_pledge_sessions where id = p_session_id;
  if v_session is null then raise exception 'pledge session not found'; end if;
  if v_session.closed_at is not null or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'this pledge session has closed';
  end if;
  insert into public.finance_pledges (mosque_id, campaign_id, session_id, profile_id, donor_name, donor_email, amount_pledged, gift_aid_eligible, source)
  values (v_session.mosque_id, v_session.campaign_id, p_session_id, auth.uid(), trim(p_donor_name), nullif(trim(p_email),''), p_amount, coalesce(p_gift_aid,false), 'pledge_night')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_pledge(uuid,text,numeric,text,boolean) from public;
grant execute on function public.submit_pledge(uuid,text,numeric,text,boolean) to anon, authenticated;

-- Realtime for the live Pledge Night total (owner subscribes to their session's pledges).
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='finance_pledges') then
    alter publication supabase_realtime add table public.finance_pledges;
  end if;
end $$;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev pbej first, probe RAW rows, then prod):
--   1. Run in the Supabase SQL editor (dev), then prod.
--   2. Probe:
--      select relname, relrowsecurity from pg_class where relname like 'finance_%';        -- 7 rows, all t
--      select tablename, polname from pg_policies where tablename like 'finance_%' order by tablename; -- 7 rows
--      select proname, prosecdef from pg_proc where proname in ('pledge_session_public','submit_pledge'); -- 2, both t
--      select has_function_privilege('anon','public.submit_pledge(uuid,text,numeric,text,boolean)','execute'); -- t
--      select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='finance_pledges'; -- 1 row
--   3. Functional (anon, against a real open session): submit_pledge(...) → uuid; closed session → refused.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

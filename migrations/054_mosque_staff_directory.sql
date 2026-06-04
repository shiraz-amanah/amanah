-- 054_mosque_staff_directory.sql — Session U Day 2
--
-- Extends the Session M mosque_staff table (migration 030) from an
-- account-linked join table into a full staff directory. Key model change:
-- staff records may now exist WITHOUT an Amanah account — profile_id becomes
-- NULLABLE, and a mosque-admin INSERT policy is added (030 had none; the only
-- insert path was the accept_staff_invite RPC). App access stays optional via
-- the invite flow (see 055, which links an accepted account to a record).
--
-- Reuses the existing `profile_id` for the brief's "user_id" (no duplicate
-- column). The existing `status` column (Session M lifecycle) is left intact
-- but is vestigial for the directory, which keys off staff_type / invite_status
-- / dbs_status. `unique(mosque_id, profile_id)` is unaffected — Postgres treats
-- NULL profile_ids as distinct, so multiple no-account records coexist.

-- profile_id: was NOT NULL (every staff = a linked account). Drop it so the
-- directory can hold records for staff who have no app account (yet).
alter table public.mosque_staff alter column profile_id drop not null;

alter table public.mosque_staff
  add column if not exists name              text,
  add column if not exists email             text,
  add column if not exists phone             text,
  add column if not exists photo_url         text,
  add column if not exists staff_type        text not null default 'permanent'
    check (staff_type in ('permanent', 'temporary')),
  add column if not exists start_date        date,
  add column if not exists end_date          date,
  add column if not exists cover_reason      text,
  add column if not exists linked_scholar_id uuid references public.scholars(id) on delete set null,
  add column if not exists dbs_status        text not null default 'not_checked'
    check (dbs_status in ('not_checked', 'pending', 'verified', 'expired')),
  add column if not exists dbs_certificate   text,
  add column if not exists dbs_issue_date    date,
  add column if not exists dbs_expiry_date   date,
  add column if not exists invite_status     text not null default 'not_invited'
    check (invite_status in ('not_invited', 'invited', 'active')),
  add column if not exists archived          boolean not null default false;

create index if not exists mosque_staff_type_idx     on public.mosque_staff(mosque_id, staff_type);
create index if not exists mosque_staff_enddate_idx  on public.mosque_staff(end_date);

-- Mosque admins can directly add staff records (030 only allowed inserts via
-- the accept_staff_invite SECURITY DEFINER RPC). Mirrors the update/delete
-- policies' ownership check.
create policy "Mosque admins insert own-mosque staff"
  on public.mosque_staff for insert
  to authenticated
  with check (
    mosque_id in (select id from public.mosques where user_id = auth.uid())
  );

-- APPLY CHECKLIST (dev first, then prod):
--   1. Run this file. 2. NOTIFY pgrst, 'reload schema';
--   3. Probe: \d mosque_staff (profile_id nullable + new columns) and
--      select policyname from pg_policies where tablename='mosque_staff'
--      and policyname like '%insert%'; (expect the new admin-insert policy).
--   4. Hard refresh.

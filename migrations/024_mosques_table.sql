-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 6a)
--
-- Creates the `mosques` table — public listing target for the
-- existing MosquesListing / MosqueDetail surfaces (currently driven
-- by MOCK_MOSQUES). Mirrors the scholars table's shape: status
-- enum, three verification flags, slug for URL routing, optional
-- user_id linkage to the claimant.
--
-- Schema decisions (Session K Phase 6a, locked):
--   Q1: three verification flags (charity_number_verified,
--       address_verified, safeguarding_confirmed) mirroring the
--       scholars DBS/RTW/Ijazah pattern. Single-boolean was
--       considered and rejected for inconsistency with scholars.
--   Q2: mosques don't get a new role. profiles.role stays in
--       {user, scholar, admin}; mosque accounts are role='user'
--       and routing keys off mosques.user_id (mirrors scholars).
--       So no role enum migration here.
--   Q3: include lat/lng/phone/email/facilities/jumuah_time/
--       description/bio so the MOCK_MOSQUES seed (026) preserves
--       all fields the public components currently render. Without
--       these, public listings would regress.
--   Q4: claim flow for pre-seeded rows is parked. Seeded rows in
--       026 will have user_id=null. Future claim flow can update
--       user_id once it ships.
--
-- facilities and services are text[] (flat string arrays — see
-- MOCK_MOSQUES shape). No nested structure justifies jsonb. Their
-- value spaces are open enums we'll narrow in app code, not in DB.
--
-- prayer_times stays jsonb (object with five keys: fajr/dhuhr/asr/
-- maghrib/isha). Could be five separate columns; jsonb is more
-- flexible and matches MOCK_MOSQUES.iqamaTimes shape directly.
--
-- No INSERT policy. The application-approval trigger (migration
-- 025) inserts via SECURITY DEFINER and bypasses RLS. Seed
-- migration 026 runs as postgres superuser and bypasses RLS too.
-- Future admin-side direct-create surface, if needed, gets its
-- own INSERT policy at that time.

create table mosques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),  -- nullable, claim flow parked (Q4)
  slug text unique not null,
  name text not null,
  description text,
  bio text,
  address text not null,
  city text not null,
  postcode text not null,
  lat numeric,
  lng numeric,
  phone text,
  email text,
  registered_charity_number text,
  capacity integer,
  services text[] not null default '{}',
  facilities text[] not null default '{}',
  prayer_times jsonb,
  jumuah_time text,
  photo_url text,
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'active', 'inactive')),
  -- Three verification flags mirroring scholars (Q1)
  charity_number_verified boolean not null default false,
  address_verified boolean not null default false,
  safeguarding_confirmed boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index mosques_status_idx on mosques(status);
create index mosques_city_idx on mosques(city);
-- 1:1 mosque:user when claimed; null user_id (seeded/unclaimed) is
-- exempt from the unique constraint via partial index
create unique index mosques_user_id_idx
  on mosques(user_id)
  where user_id is not null;

alter table mosques enable row level security;

-- Public read (status = 'active' only — mirrors scholars)
create policy "Active mosques are publicly viewable"
  on mosques for select
  to anon, authenticated
  using (status = 'active');

-- Owner read (claimant can see own listing regardless of status)
create policy "Mosque owners read own listing"
  on mosques for select
  to authenticated
  using (auth.uid() = user_id);

-- Owner update (mosque-side profile editing — read-only in 6a UI;
-- editing surface comes in a follow-up. Policy lands now so the
-- update path is unblocked when the surface ships.)
create policy "Mosque owners update own listing"
  on mosques for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admin read (any status)
create policy "Admins read all mosques"
  on mosques for select
  to authenticated
  using (public.is_admin());

-- Admin update (any column — verification flags + status flip
-- happen here)
create policy "Admins update mosques"
  on mosques for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

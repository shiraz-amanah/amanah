-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 6a)
--
-- Creates the `mosque_applications` table + approval trigger.
-- Mirror of 015 (scholar_applications) for mosques. Wizard
-- submissions land here; admin approves; trigger creates the
-- `mosques` row with status='pending_verification' and writes
-- created_mosque_id back to the application row.
--
-- Wizard field set locked from Phase 6 brief:
--   org_name, city, postcode, address (Step 2 About)
--   registered_charity_number, capacity, photo_url, prayer_times
--     (Step 3 Details)
--   services, bio (Step 4 Services)
--
-- Fields on `mosques` not collected by the wizard
-- (description, lat, lng, phone, email, facilities, jumuah_time)
-- are NULL on insert. Mosque-side profile editing (parked
-- follow-up) will let mosque admins fill them in. The seed
-- migration 026 populates them for the 8 backfilled rows from
-- MOCK_MOSQUES.
--
-- ADMIN GATE — TRUST BOUNDARY: matches 015's posture. Open
-- SELECT/UPDATE to authenticated stays in place; admin-aware
-- policies are additive (same shape as 019). Tightening — drop
-- the open policies, leave users-read-own + admins-read-all —
-- is parked for a future cleanup pass.

create table mosque_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  -- Step 2: About
  org_name text not null,
  city text not null,
  postcode text not null,
  address text not null,
  -- Step 3: Details
  registered_charity_number text,
  capacity integer,
  photo_url text,
  prayer_times jsonb,
  -- Step 4: Services
  services text[] not null default '{}',
  bio text not null,
  -- Approval metadata
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  rejection_reason text,
  -- Linkback to the mosques row created on approval (amendment 3
  -- — mirror of 015's created_scholar_id; trigger sets this).
  created_mosque_id uuid references mosques(id),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- One pending application per user. After rejection, user can
-- submit a new one (rejected rows kept; constraint only applies
-- to pending status). Mirrors the partial unique index from 015.
create unique index idx_one_pending_mosque_app_per_user
  on mosque_applications (user_id)
  where status = 'pending';

create index mosque_applications_status_idx on mosque_applications(status);
create index mosque_applications_user_id_idx on mosque_applications(user_id);

alter table mosque_applications enable row level security;

-- Open SELECT/UPDATE to authenticated (matches 015 — privacy
-- concern same as scholar_applications; tightening parked).
create policy "Authenticated read all mosque applications"
  on mosque_applications for select
  to authenticated
  using (true);

create policy "Users insert own mosque application"
  on mosque_applications for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Authenticated update mosque applications"
  on mosque_applications for update
  to authenticated
  using (true)
  with check (true);

-- Admin-aware (additive, same pattern as 019)
create policy "Admins read all mosque applications"
  on mosque_applications for select
  to authenticated
  using (public.is_admin());

create policy "Admins update all mosque applications"
  on mosque_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Trigger: on UPDATE pending→approved, generate slug + INSERT
-- mosques row with status='pending_verification' + write
-- created_mosque_id back to the application (amendment 3).
-- On rejected, just stamp reviewed metadata. Mirrors
-- handle_application_approval from 015.

create or replace function handle_mosque_application_approval()
returns trigger as $$
declare
  new_mosque_id uuid;
  base_slug text;
  candidate_slug text;
  collision_count int;
  suffix int := 0;
begin
  if NEW.status = 'approved' and OLD.status = 'pending' then
    -- Slug from org_name. Lowercase, runs of non-alphanumerics
    -- collapsed to single hyphens, leading/trailing hyphens
    -- trimmed. Edge case: empty result (org_name was all
    -- special chars) → fallback 'mosque'.
    base_slug := trim(both '-' from lower(regexp_replace(NEW.org_name, '[^a-zA-Z0-9]+', '-', 'g')));
    if base_slug = '' then
      base_slug := 'mosque';
    end if;
    candidate_slug := base_slug;

    -- Append -2, -3, … on slug collision (unique constraint on
    -- mosques.slug enforces; we pre-check to keep error messages
    -- clean rather than relying on retry-on-23505).
    loop
      select count(*) into collision_count from mosques where slug = candidate_slug;
      exit when collision_count = 0;
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || (suffix + 1)::text;
    end loop;

    insert into mosques (
      slug, name, city, postcode, address,
      registered_charity_number, capacity, services, prayer_times,
      bio, photo_url, user_id, status,
      charity_number_verified, address_verified, safeguarding_confirmed
    )
    values (
      candidate_slug, NEW.org_name, NEW.city, NEW.postcode, NEW.address,
      NEW.registered_charity_number, NEW.capacity, NEW.services, NEW.prayer_times,
      NEW.bio, NEW.photo_url, NEW.user_id, 'pending_verification',
      false, false, false
    )
    returning id into new_mosque_id;

    -- Linkback (amendment 3) — mirrors 015's created_scholar_id
    -- linkback. Same UPDATE that flipped status to approved
    -- captures this in the application row.
    NEW.created_mosque_id := new_mosque_id;
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    NEW.updated_at := now();
  elsif NEW.status = 'rejected' and OLD.status = 'pending' then
    NEW.reviewed_at := now();
    NEW.reviewed_by := auth.uid();
    NEW.updated_at := now();
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

create trigger mosque_application_approval
  before update on mosque_applications
  for each row execute function handle_mosque_application_approval();

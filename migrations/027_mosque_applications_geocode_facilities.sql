-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 6b)
--
-- Adds three columns to mosque_applications + replaces the
-- approval trigger function so they carry through to the new
-- mosques row on approval.
--
-- Why this wasn't in 025: the master Phase 6 brief listed the
-- wizard fields without lat/lng/facilities. The K-6a smoke test
-- with a SQL-seeded test application surfaced that wizard-approved
-- mosques without lat/lng render with junk distance + the master
-- brief never accounted for facilities collection. Mid-K-6b scope
-- review locked: wizard collects all three (Postcodes.io geocodes
-- the postcode pre-submit; facilities is a multi-select chip step
-- alongside services). This migration backfills the schema.
--
-- COLUMN ADDITIONS
--   lat numeric            — populated by Postcodes.io geocode at
--                            wizard submit time. Null on geocode
--                            failure (admin sees a warning chip in
--                            AdminMosqueApplications detail to
--                            prompt manual backfill before publishing).
--   lng numeric            — same as lat.
--   facilities text[] not  — multi-select from the wizard Step 4
--     null default '{}'      facilities list. Mirrors mosques.facilities.
--
-- TRIGGER FUNCTION REPLACEMENT
-- Trigger function replaced to carry the new columns (lat/lng/
-- facilities) through to mosques on approval. The trigger binding
-- from 025 is retained automatically since CREATE OR REPLACE
-- preserves the existing trigger pointer — `mosque_application_
-- approval` keeps firing this function, just with the new body.
--
-- The function body is otherwise byte-identical to 025's: same
-- slug-generation (kebab + collision loop -2/-3, fallback 'mosque'),
-- same created_mosque_id linkback, same reviewed_at/by stamps on
-- approve/reject. Only change: the INSERT into mosques now copies
-- NEW.lat / NEW.lng / NEW.facilities alongside the rest.

alter table mosque_applications
  add column if not exists lat numeric,
  add column if not exists lng numeric,
  add column if not exists facilities text[] not null default '{}';

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
    base_slug := trim(both '-' from lower(regexp_replace(NEW.org_name, '[^a-zA-Z0-9]+', '-', 'g')));
    if base_slug = '' then
      base_slug := 'mosque';
    end if;
    candidate_slug := base_slug;

    loop
      select count(*) into collision_count from mosques where slug = candidate_slug;
      exit when collision_count = 0;
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || (suffix + 1)::text;
    end loop;

    insert into mosques (
      slug, name, city, postcode, address,
      lat, lng,
      registered_charity_number, capacity, services, facilities,
      prayer_times, bio, photo_url, user_id, status,
      charity_number_verified, address_verified, safeguarding_confirmed
    )
    values (
      candidate_slug, NEW.org_name, NEW.city, NEW.postcode, NEW.address,
      NEW.lat, NEW.lng,
      NEW.registered_charity_number, NEW.capacity, NEW.services, NEW.facilities,
      NEW.prayer_times, NEW.bio, NEW.photo_url, NEW.user_id, 'pending_verification',
      false, false, false
    )
    returning id into new_mosque_id;

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

-- Sanity-check after applying:
--   select column_name, data_type from information_schema.columns
--   where table_schema='public' and table_name='mosque_applications'
--     and column_name in ('lat','lng','facilities');
--   → expect 3 rows: numeric, numeric, ARRAY
--
-- Then mandatory:
--   notify pgrst, 'reload schema';
-- + hard browser refresh.

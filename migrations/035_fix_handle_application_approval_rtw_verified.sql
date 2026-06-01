-- Migration 035: remove rtw_verified from handle_application_approval trigger
-- rtw_verified does not exist on the scholars table — it's a mosque staff concept.
-- Applied directly to prod via SQL editor before this migration file was created.

CREATE OR REPLACE FUNCTION public.handle_application_approval()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  new_scholar_id uuid;
  base_slug text;
  candidate_slug text;
  collision_count int;
  suffix int := 0;
begin
  if NEW.status = 'approved' and OLD.status = 'pending' then
    base_slug := trim(both '-' from lower(regexp_replace(NEW.full_name, '[^a-zA-Z0-9]+', '-', 'g')));
    if base_slug = '' then
      base_slug := 'scholar';
    end if;
    candidate_slug := base_slug;
    loop
      select count(*) into collision_count from scholars where slug = candidate_slug;
      exit when collision_count = 0;
      suffix := suffix + 1;
      candidate_slug := base_slug || '-' || (suffix + 1)::text;
    end loop;
    insert into scholars (
      slug, name, city, bio, languages, categories,
      packages, user_id, status,
      dbs_verified, ijazah_verified
    )
    values (
      candidate_slug, NEW.full_name, NEW.city, NEW.bio,
      NEW.languages, NEW.subjects, NEW.packages,
      NEW.user_id, 'pending_verification',
      false, false
    )
    returning id into new_scholar_id;
    NEW.created_scholar_id := new_scholar_id;
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
$function$;

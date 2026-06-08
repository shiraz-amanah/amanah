-- 097_search_staff_directory_fix.sql
-- ====================================================================
-- Fix global search staff results (Session AU smoke test). The 096
-- search_global staff subqueries INNER JOIN mosque_staff → profiles on
-- profile_id and filter/display p.name. But since migration 054 a staff
-- record can be DIRECTORY-ONLY (no app account): profile_id is NULL and the
-- display name lives in mosque_staff.name. The inner join silently dropped
-- every such record (e.g. an onboarding-sent staff member not yet signed up).
--
-- Fix: LEFT JOIN profiles and use coalesce(p.name, ms.name) for both the
-- filter and the title, in BOTH the admin and the mosque-owner staff blocks.
-- Also exclude archived (054) staff. Everything else is identical to 096.
--
-- Depends on: 096 (search_global), 054 (mosque_staff.name / nullable profile_id
--   / archived).
-- Apply dev first, probe, then prod, probe. NOT auto-applied.
-- ====================================================================

create or replace function public.search_global(p_query text, p_limit int default 8)
returns table (
  result_type text,
  result_id   uuid,
  title       text,
  subtitle    text,
  mosque_id   uuid,
  rank        real
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin   boolean := public.is_admin();
  v_mosque_ids uuid[];
  v_q          text    := btrim(coalesce(p_query, ''));
  v_tsq        tsquery;
  v_like       text;
begin
  if length(v_q) < 2 then
    return;
  end if;

  v_tsq  := websearch_to_tsquery('english', v_q);
  v_like := '%' || v_q || '%';

  select array_agg(id) into v_mosque_ids
  from public.mosques where user_id = auth.uid();

  -- ===== ADMIN scope: scholars, mosques, students, staff, parents (global) =====
  if v_is_admin then
    return query
      select 'scholar'::text, s.id, s.name,
             nullif(btrim(concat_ws(' · ', s.title, s.city)), ''),
             null::uuid,
             ts_rank(s.search_vector, v_tsq)::real
      from public.scholars s
      where s.search_vector @@ v_tsq
      order by 6 desc
      limit p_limit;

    return query
      select 'mosque'::text, m.id, m.name,
             nullif(m.city, ''),
             m.id,
             ts_rank(m.search_vector, v_tsq)::real
      from public.mosques m
      where m.search_vector @@ v_tsq
      order by 6 desc
      limit p_limit;

    return query
      select 'student'::text, st.id, st.name,
             nullif(btrim(concat_ws(' · ', st.relation, coalesce(st.age, extract(year from age(st.dob))::int)::text)), ''),
             null::uuid,
             similarity(st.name, v_q)::real
      from public.students st
      where st.name ilike v_like
      order by 6 desc
      limit p_limit;

    -- LEFT JOIN so directory-only staff (profile_id null, name on mosque_staff)
    -- still surface; coalesce picks the account name, else the directory name.
    return query
      select 'staff'::text, ms.id, coalesce(p.name, ms.name),
             nullif(ms.role, ''),
             ms.mosque_id,
             similarity(coalesce(p.name, ms.name), v_q)::real
      from public.mosque_staff ms
      left join public.profiles p on p.id = ms.profile_id
      where coalesce(p.name, ms.name) ilike v_like
        and not coalesce(ms.archived, false)
      order by 6 desc
      limit p_limit;

    return query
      select 'parent'::text, p.id, p.name,
             nullif(p.email, ''),
             null::uuid,
             greatest(similarity(p.name, v_q), similarity(coalesce(p.email, ''), v_q))::real
      from public.profiles p
      where p.role = 'parent'
        and (p.name ilike v_like or p.email ilike v_like)
      order by 6 desc
      limit p_limit;
  end if;

  -- ===== MOSQUE-OWNER scope: students, staff, classes for OWNED mosques =====
  if v_mosque_ids is not null then
    if not v_is_admin then
      return query
        select distinct on (st.id)
               'student'::text, st.id, st.name,
               nullif(btrim(concat_ws(' · ', st.relation, coalesce(st.age, extract(year from age(st.dob))::int)::text)), ''),
               en.mosque_id,
               similarity(st.name, v_q)::real
        from public.students st
        join public.madrasa_enrollments en on en.student_id = st.id
        where en.mosque_id = any(v_mosque_ids)
          and st.name ilike v_like
        order by st.id, 6 desc
        limit p_limit;

      return query
        select 'staff'::text, ms.id, coalesce(p.name, ms.name),
               nullif(ms.role, ''),
               ms.mosque_id,
               similarity(coalesce(p.name, ms.name), v_q)::real
        from public.mosque_staff ms
        left join public.profiles p on p.id = ms.profile_id
        where ms.mosque_id = any(v_mosque_ids)
          and coalesce(p.name, ms.name) ilike v_like
          and not coalesce(ms.archived, false)
        order by 6 desc
        limit p_limit;
    end if;

    return query
      select 'class'::text, c.id, c.name,
             nullif(btrim(concat_ws(' · ', c.subject, c.term)), ''),
             c.mosque_id,
             similarity(c.name, v_q)::real
      from public.madrasa_classes c
      where c.mosque_id = any(v_mosque_ids)
        and c.name ilike v_like
      order by 6 desc
      limit p_limit;
  end if;

  return;
end;
$$;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows):
--        select proname, prosecdef from pg_proc where proname='search_global';   -- 1 row, prosecdef=t
--      Data sanity for the directory-staff case (no auth.uid() needed):
--        select id, name, profile_id, archived from public.mosque_staff
--          where name ilike '%<staff name>%';   -- expect the directory row, profile_id null
--   3. Functional: as a mosque owner, search that staff member's name → appears.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

-- 096_global_search.sql
-- ====================================================================
-- Global search (Session AU). A role-scoped command palette (⌘K) over the
-- platform's core entities. Two parts:
--
--   1. Keyword index columns/indexes:
--        - scholars.search_vector / mosques.search_vector  (FTS tsvector,
--          generated + GIN) — these two also carry the existing embedding
--          columns (036) for the semantic fallback, so NO new vector columns.
--        - pg_trgm GIN indexes on the people/class name+email fields
--          (students, profiles, madrasa_classes) — short fields, typo-tolerant
--          substring match, no semantic tier.
--
--   2. search_global(p_query, p_limit) — ONE SECURITY DEFINER RPC returning a
--      unified row set { result_type, result_id, title, subtitle, mosque_id,
--      rank }. Scope is derived server-side from auth.uid(): admins see
--      scholars / mosques / students / staff / parents (global); mosque owners
--      see students / staff / classes for THEIR mosques only. Parents are
--      admin-only; classes are mosque-only. DEFINER (not INVOKER) so we bypass
--      per-table RLS and enforce scope explicitly here — the api forwards the
--      USER's JWT so auth.uid()/is_admin() resolve to the real caller and the
--      client cannot widen its own scope.
--
-- Depends on: 017 (is_admin), 024 (mosques), 030 (mosque_staff), 036
--   (embeddings), 068 (madrasa_classes/enrollments), 011 (students),
--   089 (students.dob/gender — used for the effective-age subtitle).
-- Apply dev first, probe, then prod, probe. NOT auto-applied.
-- ====================================================================

create extension if not exists pg_trgm;

-- 1. FTS columns on the two semantic entities -------------------------------
alter table public.scholars add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '') || ' ' || coalesce(title, '') || ' ' ||
      coalesce(bio, '')  || ' ' || coalesce(city, ''))
  ) stored;

alter table public.mosques add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(name, '')        || ' ' || coalesce(description, '') || ' ' ||
      coalesce(city, '')        || ' ' || coalesce(address, ''))
  ) stored;

create index if not exists scholars_search_vector_idx on public.scholars using gin (search_vector);
create index if not exists mosques_search_vector_idx  on public.mosques  using gin (search_vector);

-- 2. Trigram indexes for the keyword-only entities --------------------------
create index if not exists students_name_trgm        on public.students        using gin (name  gin_trgm_ops);
create index if not exists profiles_name_trgm         on public.profiles        using gin (name  gin_trgm_ops);
create index if not exists profiles_email_trgm        on public.profiles        using gin (email gin_trgm_ops);
create index if not exists madrasa_classes_name_trgm  on public.madrasa_classes using gin (name  gin_trgm_ops);

-- 3. The unified, role-scoped search RPC ------------------------------------
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
  -- Need at least 2 chars to be worth a round-trip.
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

    return query
      select 'staff'::text, ms.id, p.name,
             nullif(ms.role, ''),
             ms.mosque_id,
             similarity(p.name, v_q)::real
      from public.mosque_staff ms
      join public.profiles p on p.id = ms.profile_id
      where p.name ilike v_like
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
  -- Students + staff are gated on `not v_is_admin` because the admin block above
  -- already returns them globally — this prevents duplicates for a user who is
  -- BOTH an admin and a mosque owner. Classes are admin-invisible, so they run
  -- unconditionally and a dual-role user still gets their own classes.
  if v_mosque_ids is not null then
    if not v_is_admin then
      -- A student enrolled at one of the caller's mosques (deduped across enrolments).
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
        select 'staff'::text, ms.id, p.name,
               nullif(ms.role, ''),
               ms.mosque_id,
               similarity(p.name, v_q)::real
        from public.mosque_staff ms
        join public.profiles p on p.id = ms.profile_id
        where ms.mosque_id = any(v_mosque_ids)
          and p.name ilike v_like
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

grant execute on function public.search_global(text, int) to authenticated;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first, probe, then prod, probe):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows, not the Success banner):
--        -- columns + indexes present:
--        select column_name from information_schema.columns
--          where table_name in ('scholars','mosques') and column_name='search_vector';   -- 2 rows
--        select indexname from pg_indexes
--          where indexname in ('scholars_search_vector_idx','mosques_search_vector_idx',
--            'students_name_trgm','profiles_name_trgm','profiles_email_trgm',
--            'madrasa_classes_name_trgm');                                                -- 6 rows
--        select proname, prosecdef from pg_proc where proname='search_global';            -- 1 row, prosecdef=t
--   3. Smoke (as an ADMIN session via the app's JWT, NOT the SQL editor's
--      postgres role — auth.uid() is null in the editor so scope returns empty):
--        select * from search_global('test', 8);
--      Editor run should return 0 rows (no auth.uid()); that is EXPECTED and
--      proves scope is enforced. Real verification is via /api/search in step 4
--      of the build once the UI is wired.
--   4. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

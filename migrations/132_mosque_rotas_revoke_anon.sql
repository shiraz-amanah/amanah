-- 132_mosque_rotas_revoke_anon.sql
-- ====================================================================
-- Session RBAC-C hardening — belt-and-braces: revoke anon on mosque_rotas.
--
-- mosque_rotas (056, Session U) has RLS ENABLED with owner-manage + staff-read
-- policies and NO anon policy, so anon already gets row-level default-deny. But
-- 056 never revoked anon's default table-level grants (unlike every RBAC-B/C
-- table). RBAC-C's drag-drop rota grid now stores richer shift data (times +
-- notes) here, so bring it in line with the rest of the staff schema.
-- Data was never exposed (RLS blocks anon); this just removes the unused grant
-- so `grantee='anon'` probes come back clean.
-- ====================================================================

revoke all on public.mosque_rotas from anon;

notify pgrst, 'reload schema';

-- Probe after applying (dev then prod):
--   select relname, relrowsecurity from pg_class where relname='mosque_rotas';        -- t
--   select policyname, cmd from pg_policies where tablename='mosque_rotas';           -- 2
--   select grantee from information_schema.role_table_grants
--     where table_name='mosque_rotas' and grantee='anon';                             -- 0 rows

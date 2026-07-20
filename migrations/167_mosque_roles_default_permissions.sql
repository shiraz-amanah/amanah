-- 167_mosque_roles_default_permissions.sql
-- ====================================================================
-- Granular per-role default permissions. ONE nullable jsonb column on
-- mosque_roles, holding the SAME shape as mosque_employees.permissions
-- (migration 125) — the shape defined by src/lib/employeePermissions.js
-- (MODULES / PRESET_ROLES): scope modules → "own" | "all" | false,
-- bool modules → true | false. 13 keys today.
--
-- NO CHECK: free-form jsonb by design, validated client-side and by the
-- existing update_employee_permissions RPC at apply time. Adding a future
-- module therefore stays migration-free (the 125 rationale, unchanged).
-- NO RLS change: mosque_roles already carries owner/admin write policies
-- (162), and writes go through the existing updateMosqueRole RLS path.
-- NO new RPC.
--
-- COEXISTS with default_role_preset (165) — it does NOT replace it.
-- Apply-time priority: default_permissions > default_role_preset > nothing.
-- ====================================================================

begin;

alter table public.mosque_roles
  add column if not exists default_permissions jsonb;

comment on column public.mosque_roles.default_permissions is
  'Granular default dashboard permissions applied when this role is assigned to a staff member. Same jsonb shape as mosque_employees.permissions. NULL = fall back to default_role_preset.';

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-167-dev.mjs, then STOP):
--   P1  default_permissions present on mosque_roles, jsonb, nullable.
--   P2  round-trip — UPDATE a role to a valid 13-key blob, read back
--       deep-equal; UPDATE to null, confirm null.
--   Then STOP for prod approval before any client code.
-- ====================================================================

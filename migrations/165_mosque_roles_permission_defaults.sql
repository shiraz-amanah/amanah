-- 165_mosque_roles_permission_defaults.sql
-- ====================================================================
-- D2 addition — per-role default permission preset ("master key"). Two nullable
-- columns on mosque_roles; the preset set matches update_employee_permissions'
-- allowed values (127/157). default_assigned_classes holds madrasa_classes ids
-- (validated by that RPC on apply — no array FK). No RLS change (mosque_roles
-- already owner/admin write). No new RPC — editing = UPDATE via updateMosqueRole;
-- apply-on-assignment reuses update_employee_permissions.
-- ====================================================================

begin;

alter table public.mosque_roles
  add column if not exists default_role_preset      text,
  add column if not exists default_assigned_classes uuid[];

alter table public.mosque_roles
  drop constraint if exists mosque_roles_default_preset_check;
alter table public.mosque_roles
  add constraint mosque_roles_default_preset_check
  check (default_role_preset is null or default_role_preset in
    ('coordinator','teacher','treasurer','receptionist','viewer','custom'));

commit;

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST via scripts/behcheck-165-dev.mjs, then STOP):
--   P1  columns: default_role_preset (text, nullable), default_assigned_classes
--       (ARRAY, nullable) present; CHECK constraint on default_role_preset exists.
--   P2  behavioural (BEGIN...ROLLBACK, dev-ref, savepoint per raise):
--       insert role with invalid preset → CHECK violation; valid preset → OK;
--       null preset → OK; default_assigned_classes = array[<uuid>] → OK.
--   Then STOP for prod go-ahead.
-- ====================================================================

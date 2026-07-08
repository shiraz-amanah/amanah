-- 126_mosque_parent_permissions.sql
-- ====================================================================
-- RBAC — parent-facing visibility controls (Session RBAC). Owners decide what
-- parents can see/do per mosque, with optional per-class overrides.
--
-- ROW SEMANTICS:
--   class_id IS NULL      → the mosque-wide DEFAULT (exactly one per mosque)
--   class_id IS NOT NULL  → a class-specific override of that default
--
-- WHY `unique nulls not distinct` (NOT plain `unique(mosque_id, class_id)`):
-- in Postgres a standard unique index treats every NULL as distinct, so a plain
-- unique(mosque_id, class_id) would ALLOW multiple mosque-wide (NULL class_id)
-- rows per mosque, and a client `.upsert(onConflict: 'mosque_id,class_id')` for
-- the mosque-wide row would never match the existing NULL row → it would INSERT
-- a duplicate on every save instead of updating. `nulls not distinct` (PG15+,
-- Supabase) makes two NULL-class_id rows collide, guaranteeing exactly one
-- mosque-wide default and making upsert-by-conflict work for it.
--
-- RLS: owner manages own mosque's rows (FOR ALL); platform admin reads all.
-- Parents do NOT read this table directly — the mosque dashboard reads it to
-- decide which parent-facing surfaces to render/scope; the parent-facing reads
-- (fee records, reports, etc.) already have their own RLS/RPCs. anon revoked.
-- ====================================================================

create table if not exists public.mosque_parent_permissions (
  id            uuid primary key default gen_random_uuid(),
  mosque_id     uuid not null references public.mosques(id)
                  on delete cascade,
  class_id      uuid references public.madrasa_classes(id)
                  on delete cascade,
  -- null class_id = mosque-wide default
  -- non-null class_id = class-specific override
  see_attendance      boolean not null default true,
  see_progress_reports boolean not null default true,
  see_pastoral_rewards boolean not null default true,
  see_fee_amounts     boolean not null default true,
  see_class_photos    boolean not null default true,
  message_teacher     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- nulls not distinct: one mosque-wide default row (class_id null) per mosque
  unique nulls not distinct (mosque_id, class_id)
);

alter table public.mosque_parent_permissions
  enable row level security;
revoke all on public.mosque_parent_permissions from anon;

create policy "Owner manages parent permissions"
  on public.mosque_parent_permissions for all
  to authenticated
  using (mosque_id in (
    select id from public.mosques
    where user_id = auth.uid()
  ));

create policy "Admin reads all parent permissions"
  on public.mosque_parent_permissions for select
  to authenticated
  using (public.is_admin());

create or replace function
  public.touch_mosque_parent_permissions_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger mosque_parent_permissions_touch_updated_at
  before update on public.mosque_parent_permissions
  for each row execute function
  public.touch_mosque_parent_permissions_updated_at();

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev first — ref pbejyukihhmybxxtheqq — then prod):
--   1. Run in the Supabase SQL editor (amanah-dev), then prod.
--   2. Probe (RAW rows — never trust the Success banner):
--        -- columns (expect 12 rows)
--        select column_name, data_type, is_nullable, column_default
--          from information_schema.columns
--          where table_name = 'mosque_parent_permissions' order by ordinal_position;
--        -- policies: exactly 2 (1 ALL owner, 1 SELECT admin)
--        select policyname, cmd, roles
--          from pg_policies where tablename = 'mosque_parent_permissions';
--        -- unique index IS nulls-not-distinct (indnullsnotdistinct = t)
--        select i.indexrelid::regclass as index_name, i.indnullsnotdistinct
--          from pg_index i
--          where i.indrelid = 'public.mosque_parent_permissions'::regclass
--            and i.indisunique and not i.indisprimary;
--        -- anon has NO privileges (expect 0 rows)
--        select grantee, privilege_type
--          from information_schema.role_table_grants
--          where table_name = 'mosque_parent_permissions' and grantee = 'anon';
--   3. NOTIFY pgrst, 'reload schema';  (included above)
-- ====================================================================

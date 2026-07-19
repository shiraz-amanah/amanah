-- 156_staff_avatar_path.sql
-- ====================================================================
-- >>> APPLIED + probed on dev + prod (19 July 2026). Landed via staff-avatars-v1. <<<
-- Was dev-first with raw probes, then applied to prod before the client code merged.
--
-- WHY: Commit A stores each staff member's PRIVATE avatar as an object in the
-- `staff-avatars` bucket (migration 155, private, mosque-scoped RLS). We need a
-- place to record that object's PATH so the app knows an avatar exists (null =
-- none → render initials, no broken-image flash) and can batch-sign only the real
-- ones for list rendering.
--
-- It must be a NEW column, NOT `photo_url`: `mosque_staff.photo_url` is already the
-- PUBLIC team photo — `get_mosque_team` (migration 057, SECURITY DEFINER, opt-in
-- show_on_profile=true) returns it and the public MosqueProfile "Our team" section
-- renders it as <img> to anonymous visitors. Overloading it with a private
-- staff-avatars path would break those public images and leak a private path
-- through a public RPC. So the private HR avatar lives in its own column.
--
-- SCOPE: one nullable text column + a schema-cache reload. NO RLS change — the
-- existing mosque_staff row policies (030 + later) already govern who reads/writes
-- the row, and the OBJECT bytes are governed by the 155 storage policies. No CHECK
-- (a storage path is free-form). No backfill (every existing row = no avatar yet).
--
-- NUMBERING: this takes 156. Migration 157 became the mosque_staff privileged-column
-- guard (Gate 2); the tentative bank-details audit-log table (Commit C) shifts to 158.
-- ====================================================================

alter table public.mosque_staff
  add column if not exists avatar_path text;

comment on column public.mosque_staff.avatar_path is
  'Object path in the PRIVATE staff-avatars bucket ({mosque_id}/{staff_id}/...). '
  'NULL = no avatar (render initials). Read via a signed URL (createSignedUrl). '
  'Distinct from photo_url, which is the PUBLIC get_mosque_team / MosqueProfile photo.';

notify pgrst, 'reload schema';

-- ====================================================================
-- APPLY CHECKLIST (dev FIRST, then STOP for prod approval):
--   1. Run this file on dev.
--   2. RAW probes (read the rows — do NOT trust the Success banner):
--
--   -- a) the column exists, nullable text
--   select column_name, data_type, is_nullable
--     from information_schema.columns
--    where table_schema='public' and table_name='mosque_staff'
--      and column_name='avatar_path';
--   -- expect: 1 row -> avatar_path | text | YES
--
--   -- b) the comment is attached
--   select col_description('public.mosque_staff'::regclass, ordinal_position) as comment
--     from information_schema.columns
--    where table_schema='public' and table_name='mosque_staff'
--      and column_name='avatar_path';
--   -- expect: the descriptive comment above (non-null)
--
--   3. Paste both probe rows here. STOP for prod go-ahead. Prod applied + probed
--      BEFORE the Commit A client code merges (avatar_path read/write path).
-- ====================================================================

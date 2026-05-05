-- STATUS: Reconstructed from code
-- Already applied: pre-Session-A (~April 2026).
-- Verify against `pg_dump --schema-only -t saves` before applying to a fresh project.
--
-- Columns confirmable from src/auth.js:
--   user_id   filtered via .eq('user_id', user.id)
--   item_type CHECK in ('scholar','campaign'); 'mosque' added in 003
--   item_id   inserted via String(scholar.id) — text type confirmed
--
-- Types, defaults, FK targets (auth.users vs profiles), and exact RLS
-- expressions are best-effort.

create table if not exists saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_type  text not null check (item_type in ('scholar', 'campaign')),
  item_id    text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, item_type, item_id)
);

alter table saves enable row level security;

create policy "saves_select_self" on saves
  for select using (user_id = auth.uid());

create policy "saves_insert_self" on saves
  for insert with check (user_id = auth.uid());

create policy "saves_delete_self" on saves
  for delete using (user_id = auth.uid());

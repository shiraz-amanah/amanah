-- Migration 037: search_logs table for AI search behaviour tracking
-- Logs every search query and result click to enable continuous learning
-- Applied directly to prod before this migration file was created.

create table if not exists public.search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  user_id uuid references profiles(id) on delete set null,
  result_type text check (result_type in ('scholar', 'mosque', 'campaign')),
  result_id uuid,
  clicked boolean default false,
  created_at timestamptz default now()
);

alter table public.search_logs enable row level security;

create policy "Users can insert own search logs"
  on search_logs for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Anon can insert search logs"
  on search_logs for insert
  to anon
  with check (user_id is null);

create policy "Admins can read all search logs"
  on search_logs for select
  using (public.is_admin());

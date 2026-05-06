-- STATUS: Verbatim
-- Already applied: 6 May 2026 (NOTES.md Session H).
-- First migration written using the migrations/ convention. Apply this
-- when bootstrapping a fresh project.
--
-- Replaces the legacy SCHOLAR_REVIEWS_DB client-side dict (integer keys
-- like 101, 102, …) which never matched real scholars.id UUIDs and
-- therefore rendered empty review sections on every prod scholar page.
--
-- Side effect to flag at apply time: the trigger
-- recompute_scholar_review_stats_trigger overwrites scholars.rating and
-- scholars.review_count for any scholar that gets a row in this table.
-- Capture a backup before seeding (013) if you want to preserve the
-- pre-real-reviews "marketing" averages from the original scholars seed:
--   create table scholars_rating_backup as
--     select id, rating, review_count from scholars;

create table reviews (
  id uuid primary key default gen_random_uuid(),
  scholar_id uuid not null references scholars(id) on delete cascade,
  parent_id uuid references profiles(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  rating int not null check (rating >= 1 and rating <= 5),
  body text not null check (length(body) >= 10 and length(body) <= 2000),
  status text not null default 'published'
    check (status in ('published', 'hidden', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common access patterns
create index reviews_scholar_published_idx
  on reviews(scholar_id, created_at desc)
  where status = 'published';
create index reviews_status_idx on reviews(status);
create index reviews_parent_idx on reviews(parent_id);

-- RLS
alter table reviews enable row level security;

-- Anyone can read published reviews (public scholar pages)
create policy "Anyone reads published reviews"
  on reviews for select
  to anon, authenticated
  using (status = 'published');

-- Authenticated users can read their own reviews regardless of status
create policy "Users read their own reviews"
  on reviews for select
  to authenticated
  using (parent_id = auth.uid());

-- Authenticated users can insert their own reviews
-- (parent_id must match the authed user)
create policy "Users insert own reviews"
  on reviews for insert
  to authenticated
  with check (parent_id = auth.uid());

-- Authenticated users can update their own reviews body/rating
-- (but not status — that's admin only)
create policy "Users update own reviews"
  on reviews for update
  to authenticated
  using (parent_id = auth.uid())
  with check (parent_id = auth.uid() and status = 'published');

-- Trigger: keep scholars.rating + review_count in sync
create or replace function recompute_scholar_review_stats()
returns trigger as $$
declare
  target_scholar_id uuid;
begin
  target_scholar_id := coalesce(new.scholar_id, old.scholar_id);

  update scholars set
    rating = coalesce(
      (select round(avg(rating)::numeric, 1)
       from reviews
       where scholar_id = target_scholar_id
         and status = 'published'),
      0
    ),
    review_count = (
      select count(*)
      from reviews
      where scholar_id = target_scholar_id
        and status = 'published'
    )
  where id = target_scholar_id;

  return coalesce(new, old);
end;
$$ language plpgsql security definer;

create trigger recompute_scholar_review_stats_trigger
  after insert or update or delete on reviews
  for each row execute function recompute_scholar_review_stats();

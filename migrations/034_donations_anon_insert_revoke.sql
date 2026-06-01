-- Migration 034: restrict donations INSERT to authenticated users only
-- Previously "Anyone can insert donations" allowed anon inserts
-- Donations must be tied to a real user record for receipts, Gift Aid, and fraud prevention

drop policy if exists "Anyone can insert donations" on donations;

create policy "Authenticated users can insert donations"
  on donations for insert
  to authenticated
  with check (true);

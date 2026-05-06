-- STATUS: Verbatim
-- Already applied: 6 May 2026 (NOTES.md Session H).
--
-- Seeds the reviews table with sanitized content from the legacy
-- SCHOLAR_REVIEWS_DB client-side dict (now deleted). Mapping decisions:
--
--   1 confident match (exact name + city):
--     - Ustadh Yusuf Al-Rahman (Birmingham) ← old key 101
--
--   3 first-name + topic-overlap matches (NOT real attribution —
--   surfaced and approved by user as "seed data for visual
--   demonstration", to be replaced when real reviews accumulate
--   post-launch):
--     - Ustadha Maryam Siddique (Sheffield) ← old key 102
--     - Ustadh Ibrahim Khan (Bradford)      ← old key 103
--     - Ustadha Fatima Hussain (Leeds)      ← old key 105
--
--   2 dropped (anti-fabrication — original review content was too
--   service-specific to safely cross-map):
--     - Khalid Osman (Manchester) ← old key 104 (nikah-specific)
--     - Aisha Malik (London)      ← old key 106 (no overlap)
--
-- All seeded reviews:
--   - parent_id = NULL (display path renders "(name withheld)")
--   - booking_id = NULL (no verified-booking badge)
--   - status = 'published'
--   - body sanitized: no specific durations, ages, names, or
--     service claims that could be falsifiable
--   - created_at varied across the past ~3 months for realism
--
-- Side effect: trigger recompute_scholar_review_stats_trigger will
-- fire 9 times (once per insert) and rewrite scholars.rating +
-- scholars.review_count for the 4 seeded scholars. Pre-seed values
-- captured in scholars_rating_backup.

-- ============================================================
-- Ustadh Yusuf Al-Rahman (Birmingham) — 4 reviews
-- ============================================================
insert into reviews (scholar_id, parent_id, booking_id, rating, body, status, created_at) values
  (
    'e57b5b5d-ce37-4fc2-8bb3-569ab65fbfd9', null, null, 5,
    'Subhan''Allah, my son has come on leaps and bounds. Ustadh is so patient and clearly loves teaching the Qur''an. The progress has been beyond what we hoped for.',
    'published', now() - interval '14 days'
  ),
  (
    'e57b5b5d-ce37-4fc2-8bb3-569ab65fbfd9', null, null, 5,
    'Best Qur''an teacher we''ve worked with. Brilliant with kids. Punctual, structured, and stays in regular touch about progress.',
    'published', now() - interval '30 days'
  ),
  (
    'e57b5b5d-ce37-4fc2-8bb3-569ab65fbfd9', null, null, 5,
    'We had tried other teachers before. Ustadh is in another league. My daughter actually looks forward to her lessons.',
    'published', now() - interval '45 days'
  ),
  (
    'e57b5b5d-ce37-4fc2-8bb3-569ab65fbfd9', null, null, 4,
    'Very good teacher. Flexible when something needs to shift, always makes up missed time.',
    'published', now() - interval '75 days'
  );

-- ============================================================
-- Ustadha Maryam Siddique (Sheffield) — 2 reviews
-- ============================================================
insert into reviews (scholar_id, parent_id, booking_id, rating, body, status, created_at) values
  (
    'ec7f67ea-1a75-4ef3-8197-90231a0417d8', null, null, 5,
    'Finally a female scholar I can ask anything without shame. Has genuinely changed how I approach my deen.',
    'published', now() - interval '21 days'
  ),
  (
    'ec7f67ea-1a75-4ef3-8197-90231a0417d8', null, null, 5,
    'Ustadha is the highlight of my week. She explains complex topics in a way that actually makes sense for us sisters.',
    'published', now() - interval '60 days'
  );

-- ============================================================
-- Ustadh Ibrahim Khan (Bradford) — 1 review
-- ============================================================
insert into reviews (scholar_id, parent_id, booking_id, rating, body, status, created_at) values
  (
    '1624da41-b29c-43df-b778-105f89ac670c', null, null, 5,
    'Alhamdulillah, my daughter''s progress has been remarkable. Ustadh''s structured approach really works.',
    'published', now() - interval '35 days'
  );

-- ============================================================
-- Ustadha Fatima Hussain (Leeds) — 2 reviews
-- ============================================================
insert into reviews (scholar_id, parent_id, booking_id, rating, body, status, created_at) values
  (
    '99e5a466-e54e-4c7c-b3ea-37e01d7d2b5b', null, null, 5,
    'I never thought I could learn at this stage of life. Ustadha proved me wrong! Patient, uses modern methods, very encouraging.',
    'published', now() - interval '7 days'
  ),
  (
    '99e5a466-e54e-4c7c-b3ea-37e01d7d2b5b', null, null, 5,
    'My daughter loves the lessons. Lots of games, stories — she doesn''t even realise she''s learning.',
    'published', now() - interval '25 days'
  );

-- ============================================================
-- Verification queries (run after seed)
-- ============================================================
-- 1. Confirm 9 rows inserted:
--    select count(*) from reviews;
--
-- 2. Confirm trigger updated scholars.rating + review_count:
--    select id, name, rating, review_count from scholars
--      where review_count > 0 order by name;
--
-- 3. Spot-check Khalid Osman + Aisha Malik dropped to 0:
--    select id, name, rating, review_count from scholars
--      where review_count = 0;
--
-- 4. Compare against pre-seed snapshot:
--    select s.name, b.rating as prev_rating, s.rating as new_rating,
--           b.review_count as prev_count, s.review_count as new_count
--      from scholars s
--      join scholars_rating_backup b on b.id = s.id
--      order by s.name;

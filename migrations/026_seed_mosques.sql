-- STATUS: Verbatim
-- Already applied: TBD (Session K Phase 6a)
--
-- Seeds 8 mosques from src/data/mockMosques.js MOCK_MOSQUES into
-- the `mosques` table. status='active' so they immediately appear
-- in public listings (no admin verification step — they're treated
-- as already-verified). user_id=null per Q4 (claim flow parked).
-- All three verification flags set true for parity with the mock
-- "verified: true" property (which the new schema models with the
-- three flags + status enum, not a single boolean).
--
-- FIELD MAPPING (MOCK_MOSQUES → mosques)
--   id              → DROP (use gen_random_uuid())
--   slug            → slug              (kebab from mock)
--   name            → name
--   description     → description
--   bio             → NULL              (not collected in mock; mosque-side editing fills later)
--   address         → address
--   city            → city
--   postcode        → postcode
--   lat / lng       → lat / lng
--   phone           → phone
--   email           → email
--   facilities      → facilities (text[])
--   services        → '{}'              (mock had no services field; default empty)
--   iqamaTimes      → prayer_times (jsonb, same 5-key shape)
--   jumuahTime      → jumuah_time
--   photo           → photo_url
--   verified: true  → status='active' + 3 flags=true
--   scholarIds      → DROP (mosque-scholar affiliations parked since Session F)
--   campaignId      → DROP (mock campaign id; campaigns are still mock per K-4 deferral)
--   mockReviews     → DROP (mosque reviews not a feature)
--   user_id         → NULL              (Q4: claim flow parked)
--
-- IDEMPOTENCY: ON CONFLICT (slug) DO NOTHING. Re-running this file
-- against a populated mosques table is a safe no-op. This matters
-- for two reasons: (a) re-applying after a bug fix is non-
-- destructive, (b) if a later migration re-runs this file by
-- mistake (e.g. via a CI bootstrap path), no duplicates appear.
--
-- ROLLBACK (per amendment 6): if a field-mapping bug surfaces
-- post-apply, the unwind is:
--
--   delete from mosques where user_id is null;
--
-- This is safe because every seeded row has user_id=null and every
-- wizard-approved mosque has user_id set by the 025 trigger
-- (copied from mosque_applications.user_id). After deleting the
-- seed rows, fix the mapping in this file and re-run. No need to
-- touch mosque_applications — the seed bypasses applications
-- entirely.

insert into mosques (
  slug, name, description, address, city, postcode,
  lat, lng, phone, email,
  facilities, services,
  prayer_times, jumuah_time, photo_url,
  status, charity_number_verified, address_verified, safeguarding_confirmed
) values
  (
    'birmingham-central',
    'Birmingham Central Mosque',
    'One of the largest mosques in the UK, serving the community since 1969 with daily prayers, Islamic education, and welfare services.',
    '180 Belgrave Middleway', 'Birmingham', 'B12 0XS',
    52.4651, -1.8895,
    '0121 440 5588', 'info@birminghamcentralmosque.org.uk',
    array['disability_access','parking','womens_area','wudu_facilities','first_aid']::text[],
    '{}'::text[],
    '{"fajr":"05:30","dhuhr":"13:30","asr":"16:30","maghrib":"20:15","isha":"21:45"}'::jsonb,
    '13:30',
    'https://images.unsplash.com/photo-1604873446650-3a47e9c3f8e6?w=800&q=80',
    'active', true, true, true
  ),
  (
    'east-london-mosque',
    'East London Mosque',
    'A landmark mosque in the heart of East London, providing prayer, education, and community services for over 35 years.',
    '82-92 Whitechapel Road', 'London', 'E1 1JQ',
    51.5168, -0.0648,
    '020 7650 3000', 'info@eastlondonmosque.org.uk',
    array['disability_access','parking','womens_area','wudu_facilities','first_aid','defibrillator']::text[],
    '{}'::text[],
    '{"fajr":"05:15","dhuhr":"13:15","asr":"16:45","maghrib":"20:00","isha":"21:30"}'::jsonb,
    '13:15',
    'https://images.unsplash.com/photo-1542379510-6c4dabe18f87?w=800&q=80',
    'active', true, true, true
  ),
  (
    'manchester-central',
    'Manchester Central Mosque',
    'Serving Manchester''s Muslim community with daily prayers, Quran classes, and outreach programmes.',
    '20 Upper Park Road', 'Manchester', 'M14 5RU',
    53.4528, -2.2271,
    '0161 224 4119', 'info@manchestercentralmosque.org',
    array['disability_access','womens_area','wudu_facilities']::text[],
    '{}'::text[],
    '{"fajr":"05:45","dhuhr":"13:00","asr":"17:00","maghrib":"20:30","isha":"22:00"}'::jsonb,
    '13:00',
    'https://images.unsplash.com/photo-1584286595398-a59e7dfb7991?w=800&q=80',
    'active', true, true, true
  ),
  (
    'leeds-grand',
    'Leeds Grand Mosque',
    'A welcoming community mosque in central Leeds offering daily prayers, Islamic education, and revert support.',
    '9 Woodsley Road', 'Leeds', 'LS3 1DT',
    53.8089, -1.5645,
    '0113 245 6789', 'contact@leedsgrandmosque.com',
    array['disability_access','parking','womens_area','first_aid']::text[],
    '{}'::text[],
    '{"fajr":"05:30","dhuhr":"13:15","asr":"16:45","maghrib":"20:15","isha":"21:45"}'::jsonb,
    '13:15',
    'https://images.unsplash.com/photo-1591824438708-ce405f36ba3d?w=800&q=80',
    'active', true, true, true
  ),
  (
    'bradford-grand',
    'Bradford Grand Mosque',
    'A historic mosque serving Bradford''s Muslim community with prayers, education, and family programmes.',
    'Horton Park Avenue', 'Bradford', 'BD7 3EG',
    53.7833, -1.7667,
    '01274 727 922', 'info@bradfordgrandmosque.org.uk',
    array['parking','womens_area','wudu_facilities']::text[],
    '{}'::text[],
    '{"fajr":"05:30","dhuhr":"13:30","asr":"16:30","maghrib":"20:15","isha":"21:45"}'::jsonb,
    '13:30',
    'https://images.unsplash.com/photo-1564769625905-50e93615e769?w=800&q=80',
    'active', true, true, true
  ),
  (
    'glasgow-central',
    'Glasgow Central Mosque',
    'Scotland''s largest mosque, serving the community with daily prayers, education, and community engagement.',
    '1 Mosque Avenue', 'Glasgow', 'G5 9TA',
    55.8519, -4.2528,
    '0141 429 3132', 'info@glasgowcentralmosque.com',
    array['disability_access','parking','womens_area','wudu_facilities','first_aid','defibrillator']::text[],
    '{}'::text[],
    '{"fajr":"06:00","dhuhr":"13:30","asr":"17:15","maghrib":"20:30","isha":"22:00"}'::jsonb,
    '13:30',
    'https://images.unsplash.com/photo-1542652694-40abf526446e?w=800&q=80',
    'active', true, true, true
  ),
  (
    'cardiff-madina',
    'Cardiff Madina Mosque',
    'Welsh capital''s vibrant mosque community with active youth and family programmes.',
    '121 Woodville Road', 'Cardiff', 'CF24 4DY',
    51.4928, -3.1781,
    '029 2049 3656', 'info@madinamosque.co.uk',
    array['womens_area','wudu_facilities','first_aid']::text[],
    '{}'::text[],
    '{"fajr":"05:45","dhuhr":"13:15","asr":"16:45","maghrib":"20:15","isha":"21:45"}'::jsonb,
    '13:15',
    'https://images.unsplash.com/photo-1548625361-1adcab316530?w=800&q=80',
    'active', true, true, true
  ),
  (
    'leicester-central',
    'Leicester Central Mosque',
    'Serving Leicester''s Muslim community since 1980 with prayers, education, and welfare.',
    '20 Conduit Street', 'Leicester', 'LE2 0JN',
    52.6309, -1.1223,
    '0116 254 4459', 'info@leicestercentralmosque.org',
    array['disability_access','parking','womens_area','wudu_facilities']::text[],
    '{}'::text[],
    '{"fajr":"05:30","dhuhr":"13:30","asr":"16:45","maghrib":"20:15","isha":"21:45"}'::jsonb,
    '13:30',
    'https://images.unsplash.com/photo-1584286595398-a59e7dfb7991?w=800&q=80',
    'active', true, true, true
  )
on conflict (slug) do nothing;

-- Sanity-check after applying:
--   select count(*) from mosques where user_id is null;
--   → expect 8
--   select slug, name, city, jsonb_typeof(prayer_times) from mosques order by city;
--   → expect 8 rows, prayer_times = 'object' for each

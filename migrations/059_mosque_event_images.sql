-- 059_mosque_event_images.sql — Session V (chunk 3: posters)
--
-- Optional poster/image for events and announcements. Stored in the existing
-- mosque-photos bucket at {mosque_id}/events/<file> and
-- {mosque_id}/announcements/<file> (covered by the 053 owner-write policy, which
-- keys on the first path segment = mosque id). Public reads already allowed.

alter table public.mosque_events        add column if not exists image_url text;
alter table public.mosque_announcements add column if not exists image_url text;

notify pgrst, 'reload schema';

-- APPLY CHECKLIST: run -> NOTIFY included -> probe the image_url column exists on
-- both tables -> hard refresh.

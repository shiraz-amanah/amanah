-- STATUS: Verbatim
-- Already applied: 5 May 2026 (NOTES.md Session E, commit 20c08c6).

alter table bookings
  add column if not exists meeting_url text;

comment on column bookings.meeting_url is
  'Scholar-provided video meeting URL (Zoom/Meet/Teams). Set per-booking by scholar. Nullable until scholar adds it.';

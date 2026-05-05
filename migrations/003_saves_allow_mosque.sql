-- STATUS: Verbatim
-- Already applied: 2 May 2026 (NOTES.md Session B, lessons learned).
-- Source: NOTES.md lines 175–176.

ALTER TABLE saves DROP CONSTRAINT saves_item_type_check;
ALTER TABLE saves ADD CONSTRAINT saves_item_type_check
  CHECK (item_type IN ('scholar', 'campaign', 'mosque'));

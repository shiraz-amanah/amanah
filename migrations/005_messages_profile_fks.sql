-- STATUS: Reconstructed
-- Already applied: 4 May 2026 (NOTES.md Session D follow-up).
--
-- The constraint names are CONFIRMABLE — frontend uses them as embed
-- disambiguators in PostgREST queries:
--   src/auth.js: profiles:messages_sender_id_profiles_fkey ( ... )
--   src/auth.js: profiles:conversation_participants_user_id_profiles_fkey ( ... )
--
-- Adds explicit FKs from messages.sender_id and
-- conversation_participants.user_id to profiles(id) — without these,
-- PostgREST can't resolve the nested embed because the original FKs
-- in 004 point at auth.users(id), not profiles(id).

alter table messages
  add constraint messages_sender_id_profiles_fkey
  foreign key (sender_id) references profiles(id);

alter table conversation_participants
  add constraint conversation_participants_user_id_profiles_fkey
  foreign key (user_id) references profiles(id);

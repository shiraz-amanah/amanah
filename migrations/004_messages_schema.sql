-- STATUS: Reconstructed from NOTES.md prose + frontend code
-- Already applied: 4 May 2026 (NOTES.md Session D).
--
-- Column names and table relationships are confirmable from frontend
-- usage in src/auth.js. Column types, default values, RLS policy
-- expressions, trigger body, and RPC body are best-effort.
--
-- VERIFY before applying to a fresh project:
--   pg_dump --schema-only \
--     -t conversations -t conversation_participants -t messages
--   select pg_get_functiondef('public.is_conversation_participant(uuid)'::regprocedure);
--   select pg_get_functiondef('public.bump_conversation_on_message()'::regprocedure);
--   select pg_get_functiondef('public.get_or_create_direct_conversation(uuid,text,text)'::regprocedure);
--   select * from pg_policies where tablename in ('conversations','conversation_participants','messages');

-- ============================================================================
-- TABLES
-- ============================================================================

create table if not exists conversations (
  id                       uuid primary key default gen_random_uuid(),
  kind                     text not null check (kind in ('direct', 'group')),
  title                    text,
  created_by               uuid references auth.users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  last_message_at          timestamptz,
  last_message_preview     text,
  last_message_sender_id   uuid references auth.users(id)
);

create table if not exists conversation_participants (
  conversation_id      uuid not null references conversations(id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  role                 text check (role in ('parent', 'scholar', 'mosque_admin', 'student')),
  joined_at            timestamptz not null default now(),
  last_read_at         timestamptz,
  notifications_muted  boolean not null default false,
  primary key (conversation_id, user_id)
);

create table if not exists messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references conversations(id) on delete cascade,
  sender_id        uuid not null references auth.users(id),
  body             text not null,
  created_at       timestamptz not null default now(),
  edited_at        timestamptz,
  deleted_at       timestamptz
);

-- ============================================================================
-- HELPER (SECURITY DEFINER bypasses RLS recursion when policies on
-- conversation_participants need to check membership)
-- ============================================================================

create or replace function is_conversation_participant(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

-- ============================================================================
-- RLS POLICIES (best-effort reconstruction)
-- ============================================================================

alter table conversations              enable row level security;
alter table conversation_participants  enable row level security;
alter table messages                   enable row level security;

create policy "conversations_select_participant" on conversations
  for select using (is_conversation_participant(id));

create policy "conversations_insert_creator" on conversations
  for insert with check (created_by = auth.uid());

create policy "conversation_participants_select_member" on conversation_participants
  for select using (is_conversation_participant(conversation_id));

create policy "conversation_participants_insert_self" on conversation_participants
  for insert with check (user_id = auth.uid());

create policy "conversation_participants_update_self" on conversation_participants
  for update using (user_id = auth.uid());

create policy "messages_select_participant" on messages
  for select using (is_conversation_participant(conversation_id));

create policy "messages_insert_self_sender" on messages
  for insert with check (sender_id = auth.uid() and is_conversation_participant(conversation_id));

-- ============================================================================
-- TRIGGER — keep conversations.last_message_* in sync on new message
-- ============================================================================

create or replace function bump_conversation_on_message()
returns trigger
language plpgsql
as $$
begin
  update conversations set
    updated_at             = now(),
    last_message_at        = new.created_at,
    last_message_preview   = left(new.body, 120),
    last_message_sender_id = new.sender_id
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger bump_conversation_on_message_trg
after insert on messages
for each row
execute function bump_conversation_on_message();

-- ============================================================================
-- RPC — atomic get-or-create for 1:1 conversations (dedupe)
-- ============================================================================

create or replace function get_or_create_direct_conversation(
  other_user_id  uuid,
  my_role        text,
  their_role     text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  conv_id uuid;
begin
  -- look for existing 1:1 conversation between auth.uid() and other_user_id
  select c.id into conv_id
  from conversations c
  where c.kind = 'direct'
    and exists (
      select 1 from conversation_participants
      where conversation_id = c.id and user_id = auth.uid()
    )
    and exists (
      select 1 from conversation_participants
      where conversation_id = c.id and user_id = other_user_id
    )
  limit 1;

  if conv_id is not null then
    return conv_id;
  end if;

  insert into conversations (kind, created_by)
  values ('direct', auth.uid())
  returning id into conv_id;

  insert into conversation_participants (conversation_id, user_id, role)
  values
    (conv_id, auth.uid(),     my_role),
    (conv_id, other_user_id,  their_role);

  return conv_id;
end;
$$;

-- ============================================================================
-- REALTIME publication
-- ============================================================================

alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;

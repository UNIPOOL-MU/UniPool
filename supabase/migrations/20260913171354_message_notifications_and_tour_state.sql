alter table public.unipool_user_directory add column if not exists tour_completed_at timestamptz;

create or replace function public.unipool_notify_message() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare sender_name text; chat_kind text;
begin
  if new.legacy_message_id is not null then return new; end if;
  select name into sender_name from public.unipool_user_directory where user_id = new.from_user_id;
  select kind into chat_kind from public.unipool_conversations where id = new.conversation_id;
  insert into public.unipool_v3_notifications(user_id,type,title,body,route,metadata,created_at)
  select m.user_id,'message',coalesce(sender_name,'Traveller') || ' sent a message',left(new.text,160),
    case when chat_kind='direct' then '/chat/' || new.from_user_id else '/chat/group/' || new.conversation_id::text end,
    jsonb_build_object('message_id',new.id,'conversation_id',new.conversation_id,'sender_user_id',new.from_user_id),new.created_at
  from public.unipool_conversation_members m
  where m.conversation_id=new.conversation_id and m.user_id<>new.from_user_id
    and (chat_kind<>'direct' or m.user_id=new.to_user_id);
  return new;
end $$;
revoke all on function public.unipool_notify_message() from public,anon,authenticated;
drop trigger if exists unipool_message_notification on public.unipool_messages;
create trigger unipool_message_notification after insert on public.unipool_messages
for each row execute function public.unipool_notify_message();

create or replace function public.unipool_read_chat_notifications() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.unipool_v3_notifications set read_at=new.last_read_at
  where user_id=new.user_id and type='message' and read_at is null
    and metadata->>'conversation_id'=new.conversation_id::text and created_at<=new.last_read_at;
  return new;
end $$;
revoke all on function public.unipool_read_chat_notifications() from public,anon,authenticated;
drop trigger if exists unipool_chat_notification_read on public.unipool_conversation_members;
create trigger unipool_chat_notification_read after update of last_read_at on public.unipool_conversation_members
for each row execute function public.unipool_read_chat_notifications();

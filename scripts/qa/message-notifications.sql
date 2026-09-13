begin;
do $$
declare cid uuid:=gen_random_uuid(); gid uuid:=gen_random_uuid(); mid uuid; sid text:='qa-notif-'||gen_random_uuid()::text; tid text:='qa-notif-'||gen_random_uuid()::text; third text:='qa-notif-'||gen_random_uuid()::text; n integer;
begin
insert into public.unipool_conversations(id,kind,direct_key) values(cid,'direct',sid||'::'||tid);
insert into public.unipool_conversation_members(conversation_id,user_id) values(cid,sid),(cid,tid);
insert into public.unipool_messages(conversation_id,from_user_id,to_user_id,text) values(cid,sid,tid,'Isolated QA message') returning id into mid;
select count(*) into n from public.unipool_v3_notifications where metadata->>'message_id'=mid::text and user_id=tid and type='message';
if n<>1 then raise exception 'Direct notification missing'; end if;
select count(*) into n from public.unipool_v3_notifications where metadata->>'message_id'=mid::text and user_id=sid;
if n<>0 then raise exception 'Sender notified'; end if;
update public.unipool_conversation_members set last_read_at=clock_timestamp() where conversation_id=cid and user_id=tid;
select count(*) into n from public.unipool_v3_notifications where metadata->>'message_id'=mid::text and read_at is null;
if n<>0 then raise exception 'Read notification not cleared'; end if;
insert into public.unipool_messages(conversation_id,from_user_id,to_user_id,text,legacy_message_id) values(cid,sid,tid,'Historical import','qa-'||gen_random_uuid()::text) returning id into mid;
select count(*) into n from public.unipool_v3_notifications where metadata->>'message_id'=mid::text;
if n<>0 then raise exception 'Imported history notified'; end if;
insert into public.unipool_conversations(id,kind,name) values(gid,'group','Isolated QA group');
insert into public.unipool_conversation_members(conversation_id,user_id) values(gid,sid),(gid,tid),(gid,third);
insert into public.unipool_messages(conversation_id,from_user_id,text) values(gid,sid,'Isolated group QA') returning id into mid;
select count(*) into n from public.unipool_v3_notifications where metadata->>'message_id'=mid::text and user_id in(tid,third) and route='/chat/group/'||gid::text;
if n<>2 then raise exception 'Group recipients incorrect'; end if;
end $$;
rollback;

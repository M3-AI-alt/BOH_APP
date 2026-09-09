create or replace function public.boh_store(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 result jsonb; old public.boh_records; r public.boh_records;
 member public.boh_staff; old_staff public.boh_staff;
 p jsonb; rec jsonb; rid text; k text; cid text; sid text; uid text;
 account_name text; reconciled_statement jsonb; net_change numeric;
 rev integer; m text; transfer_day text; lead_id text; current_cursor integer;
begin
 if current_user <> 'service_role' then raise insufficient_privilege; end if;
 if operation in ('claim_staff','ensure_owner','import_chunk','commit_record','save_staff') then
   perform pg_advisory_xact_lock(683920261);
 end if;
 case operation
 when 'get_record' then
   select to_jsonb(t) into result from public.boh_records t where id=args->>'id';
 when 'list_records' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
    select * from public.boh_records where
      case when args->>'kind'='source' then kind='source' and payload::text ilike '%'||coalesce(args->>'query','')||'%' else kind<>'source' end
    order by id limit least(coalesce((args->>'limit')::integer,900),900)
    offset greatest(coalesce((args->>'offset')::integer,0),0)) t;
 when 'staff_by_user' then
   select to_jsonb(t) into result from public.boh_staff t where user_id=args->>'userId';
 when 'staff_by_email' then
   select to_jsonb(t) into result from public.boh_staff t where email=args->>'email';
 when 'claim_staff' then
   update public.boh_staff set user_id=args->>'userId' where email=args->>'email' and user_id is null and active returning to_jsonb(boh_staff) into result;
 when 'ensure_owner' then
   insert into public.boh_staff(id,user_id,email,name,role) values('owner',args->>'userId',args->>'email',args->>'name','Director') on conflict do nothing;
   select to_jsonb(t) into result from public.boh_staff t where user_id=args->>'userId';
 when 'list_staff' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select id,user_id,email,name,role,class_ids,active from public.boh_staff order by created_at) t;
 when 'list_activity' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select id,at,actor_name,action,record_id from public.boh_activity order by at desc limit 60) t;
 when 'get_setting' then
   select to_jsonb(value) into result from public.boh_settings where key=args->>'key';
 when 'import_chunk' then
   if exists(select 1 from public.boh_settings where key='import-complete') then return jsonb_build_object('done',true); end if;
   select coalesce((select value::integer from public.boh_settings where key='import-cursor'),0) into current_cursor;
   if current_cursor <> (args->>'cursor')::integer then return jsonb_build_object('retry',true); end if;
   for rec in select value from jsonb_array_elements(args->'records') loop
     insert into public.boh_records(id,kind,class_id,student_id,date,payload,updated_at)
     values(rec->>'id',rec->>'kind',rec->>'classId',rec->>'studentId',rec->>'date',rec->'payload',now()::text) on conflict do nothing;
   end loop;
   insert into public.boh_settings(key,value) values('import-cursor',args->>'next') on conflict(key) do update set value=excluded.value;
   if (args->>'done')::boolean then
     insert into public.boh_settings(key,value) values('import-complete',args->>'version') on conflict do nothing;
     insert into public.boh_settings(key,value) values('import-manifest',(args->'manifest')::text) on conflict do nothing;
   end if;
   result=jsonb_build_object('done',(args->>'done')::boolean);
 when 'commit_record' then
   rec=args->'record'; rid=rec->>'id'; k=rec->>'kind'; p=rec->'payload'; cid=coalesce(rec->>'classId','');sid=coalesce(rec->>'studentId','');uid=args->>'actorId';
   select * into member from public.boh_staff where user_id=uid and active;
   if member.id is null then raise insufficient_privilege; end if;
   select * into old from public.boh_records where id=rid for update;
   if (old.id is null and args->>'expectedRevision' is not null) or (old.id is not null and (args->>'expectedRevision' is null or old.revision<>(args->>'expectedRevision')::integer or old.kind<>k)) then
     raise exception 'Record changed. Refresh and try again.' using errcode='40001';
   end if;
   if k in ('source','unmatched') or (member.role='Finance' and k not in ('receipt','expense','package','commitment','close','reconciliation','payroll','task')) or
     (member.role='TA' and (k not in ('attendance','makeup','support') or not member.class_ids ? cid or (old.id is not null and not member.class_ids ? old.class_id))) then raise insufficient_privilege; end if;
   if k in ('receipt','expense','reconciliation') then
     for m in select distinct value from jsonb_array_elements_text(jsonb_build_array(p->>'month',old.payload->>'month')) loop
       if exists(select 1 from public.boh_records where id='close:'||m and payload->>'status'='Closed') then raise exception 'Month is closed.' using errcode='P0001'; end if;
     end loop;
   end if;
   if k='close' and old.payload->>'status'='Closed' and p->>'status'='Open' and member.role<>'Director' then raise insufficient_privilege; end if;
   if k='attendance' and p->>'mark'<>'A' and exists(select 1 from public.boh_records where kind='makeup' and payload->>'absenceId'=rid and payload->>'status'<>'Cancelled') then raise exception 'Cancel linked makeup first.'; end if;
   if k='makeup' and not exists(select 1 from public.boh_records where id=p->>'absenceId' and payload->>'mark' in ('A','L','K')) then raise exception 'Original lesson is not an absence.'; end if;
   if k='close' and p->>'status'='Closed' then
     m=p->>'month';
     if m>=to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM') then raise exception 'Close the month after it ends.'; end if;
     if exists(select 1 from public.boh_records x where x.kind in ('receipt','expense') and x.payload->>'month'=m
       and (jsonb_typeof(x.payload->'amount') is distinct from 'number' or coalesce(x.payload->>'date','')='' or not coalesce((x.payload->>'reconciled')::boolean,false))) then raise exception 'Match and confirm every cash transaction before closing.'; end if;
     for account_name in select distinct x.payload->>'account' from public.boh_records x where x.kind in ('receipt','expense') and x.payload->>'month'=m loop
       select x.payload into reconciled_statement from public.boh_records x where x.kind='reconciliation' and x.payload->>'month'=m and x.payload->>'account'=account_name;
       select coalesce(sum(case when x.kind='receipt' then 1 else -1 end*(x.payload->>'amount')::numeric),0) into net_change from public.boh_records x where x.kind in ('receipt','expense') and x.payload->>'month'=m and x.payload->>'account'=account_name;
       if reconciled_statement is null or (reconciled_statement->>'statementClosing')::numeric<>(reconciled_statement->>'opening')::numeric+net_change then raise exception 'Reconcile every account before closing.'; end if;
     end loop;
   end if;
   rev=coalesce(old.revision,0)+1;
   insert into public.boh_records(id,kind,class_id,student_id,date,payload,revision,updated_at)
   values(rid,k,cid,sid,coalesce(rec->>'date',''),p,rev,now()::text)
   on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,date=excluded.date,payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at returning * into r;
   if k='student' and cid<>'' and (old.id is null or old.class_id<>cid) then
     transfer_day=args->>'transferDate';
     if old.id is not null then
       update public.boh_records set payload=payload||jsonb_build_object('until',((transfer_day::date)-1)::text,'forecast',false),revision=revision+1,updated_at=now()::text
       where kind='membership' and student_id=rid and class_id=old.class_id and coalesce(payload->>'until','')='';
     end if;
     insert into public.boh_records(id,kind,class_id,student_id,date,payload,updated_at)
       values('membership:'||rid||':'||gen_random_uuid()::text,'membership',cid,rid,transfer_day,
         jsonb_build_object('studentId',rid,'classId',cid,'from',transfer_day,'until','','schedule','Regular','forecast',true,'position',999),now()::text);
   end if;
   lead_id=args->>'leadId';
   if k='student' and old.id is null and coalesce(lead_id,'')<>'' then
     if exists(select 1 from public.boh_records where id=lead_id and coalesce(payload->>'studentId','')<>'') then raise exception 'Lead is already enrolled.'; end if;
     update public.boh_records set payload=payload||jsonb_build_object('studentId',rid,'status','Enrolled'),revision=revision+1,updated_at=now()::text where id=lead_id and kind='lead';
   end if;
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after)
     values(gen_random_uuid()::text,uid,member.name,case when old.id is null then 'Added ' else 'Updated ' end||k||coalesce(' · '||nullif(args->>'reason',''),''),rid,old.payload,p);
   result=to_jsonb(r);
 when 'save_staff' then
   select * into member from public.boh_staff where user_id=args->>'actorId' and active and role='Director';
   if member.id is null then raise insufficient_privilege; end if;
   p=args->'staff';select * into old_staff from public.boh_staff where email=p->>'email' for update;
   if old_staff.id='owner' or (old_staff.user_id=member.user_id and (p->>'role'<>'Director' or not (p->>'active')::boolean)) then raise insufficient_privilege; end if;
   insert into public.boh_staff(id,email,name,role,class_ids,active)
     values(coalesce(old_staff.id,gen_random_uuid()::text),p->>'email',p->>'name',p->>'role',p->'classIds',(p->>'active')::boolean)
     on conflict(email) do update set name=excluded.name,role=excluded.role,class_ids=excluded.class_ids,active=excluded.active;
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after)
     values(gen_random_uuid()::text,member.user_id,member.name,'Updated staff access',p->>'email',to_jsonb(old_staff),p);
   result=jsonb_build_object('saved',true);
 else raise exception 'Unsupported operation';
 end case;
 return result;
end;
$$;
revoke all on function public.boh_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_store(text,jsonb) to service_role;

-- Incremental guards. Existing source records are not rewritten or deleted.
create or replace function boh_private.student_identity(sid text)
returns text language plpgsql stable security invoker set search_path='' as $$
declare target text:=sid; next_id text; seen text[]:='{}';
begin
 loop
  if target=any(seen) then raise exception 'Student identity cycle needs review.'; end if;
  seen=array_append(seen,target);
  select nullif(payload->>'canonicalStudentId','') into next_id from public.boh_records where id=target and kind='student';
  if next_id is null then return target; end if;
  target=next_id;
 end loop;
end; $$;
create or replace function boh_private.check_membership(rid text,sid text,cid text,from_date text,until_date text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(nullif(until_date,''),'9999-12-31')<coalesce(nullif(from_date,''),'0001-01-01') then raise exception 'End date must follow start date.'; end if;
 if exists(select 1 from public.boh_records x where x.kind='membership' and x.id<>rid and x.class_id=cid
   and boh_private.student_identity(x.student_id)=boh_private.student_identity(sid)
   and coalesce(nullif(x.payload->>'from',''),'0001-01-01')<=coalesce(nullif(until_date,''),'9999-12-31')
   and coalesce(nullif(from_date,''),'0001-01-01')<=coalesce(nullif(x.payload->>'until',''),'9999-12-31')) then
   raise exception 'This student already has an overlapping class membership. Edit the existing row.';
 end if;
end; $$;
revoke all on function boh_private.student_identity(text),boh_private.check_membership(text,text,text,text,text) from public,anon,authenticated;
grant execute on function boh_private.student_identity(text),boh_private.check_membership(text,text,text,text,text) to service_role;
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
 if operation in ('claim_staff','ensure_owner','import_chunk','commit_record','save_staff','student_action') then
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
 when 'student_action' then
   select * into member from public.boh_staff where user_id=args->>'actorId' and active and role='Director';
   if member.id is null then raise insufficient_privilege; end if;
   rid=args->>'id';
   select * into old from public.boh_records where id=rid and kind='student' for update;
   if old.id is null then raise exception 'Student not found.'; end if;
   if args->>'expectedRevision' is null or old.revision<>(args->>'expectedRevision')::integer then raise exception 'Record changed. Refresh and try again.' using errcode='40001'; end if;
   if length(trim(coalesce(args->>'reason',''))) not between 1 and 500 then raise exception 'Enter a reason (up to 500 characters).'; end if;
   if coalesce(old.payload->>'canonicalStudentId','')<>'' then raise exception 'Manage the linked current student profile instead.'; end if;
   p=old.payload;
   case args->>'action'
   when 'archive' then
     if p->>'status'='Archived' then raise exception 'Student is already archived.'; end if;
     p=p||jsonb_build_object('previousStatus',coalesce(p->>'status','Active'),'status','Archived','archivedAt',now()::text);
   when 'restore' then
     if p->>'status'<>'Archived' then raise exception 'Only archived students can be restored.'; end if;
     p=p||jsonb_build_object('status',case when p->>'previousStatus' in ('Active','Paused','Stopped','Roster only','Free','Ends without renewal') then p->>'previousStatus' else 'Active' end,'archivedAt','');
   when 'delete' then
     if coalesce(p->>'source','')<>'' or coalesce((p->>'imported')::boolean,false) or rid ~ '^(STU-|HIS-)' then raise exception 'Original imported students cannot be deleted. Archive instead.'; end if;
     if args->>'confirmation' is distinct from p->>'name' then raise exception 'Type the exact student name to confirm.'; end if;
     if exists(select 1 from public.boh_records x where x.id<>rid and
       not (x.kind='membership' and x.id like 'membership:%' and coalesce(x.payload->>'source','')='' and coalesce(x.payload->>'sourceRow','')='' and not exists(select 1 from public.boh_records dep where dep.payload->>'membershipId'=x.id)) and
       (x.student_id=rid or x.payload->>'studentId'=rid or x.payload->>'canonicalStudentId'=rid or
        exists(select 1 from jsonb_array_elements(case when jsonb_typeof(x.payload->'allocations')='array' then x.payload->'allocations' else '[]'::jsonb end) a where a->>'studentId'=rid))) then
       raise exception 'Linked history exists. Archive this student instead.';
     end if;
     select jsonb_build_object('student',old.payload,'emptyMemberships',coalesce(jsonb_agg(x.payload),'[]'::jsonb)) into rec from public.boh_records x where x.kind='membership' and (x.student_id=rid or x.payload->>'studentId'=rid);
     delete from public.boh_records where kind='membership' and (student_id=rid or payload->>'studentId'=rid);
     delete from public.boh_records where id=rid;
     p=null;
   else raise exception 'Choose archive, restore or delete.';
   end case;
   if p is not null then
     update public.boh_records set payload=p,revision=revision+1,updated_at=now()::text where id=rid returning * into r;
   end if;
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after)
   values(gen_random_uuid()::text,member.user_id,member.name,(args->>'action')||' student · '||(args->>'reason'),rid,case when p is null then rec else old.payload end,p);
   result=case when p is null then jsonb_build_object('deleted',true) else to_jsonb(r) end;
 when 'commit_record' then
   rec=args->'record'; rid=rec->>'id'; k=rec->>'kind'; p=rec->'payload'; cid=coalesce(rec->>'classId','');sid=coalesce(rec->>'studentId','');uid=args->>'actorId';
   select * into member from public.boh_staff where user_id=uid and active;
   if member.id is null then raise insufficient_privilege; end if;
   select * into old from public.boh_records where id=rid for update;
   if (old.id is null and args->>'expectedRevision' is not null) or (old.id is not null and (args->>'expectedRevision' is null or old.revision<>(args->>'expectedRevision')::integer or old.kind<>k)) then
     raise exception 'Record changed. Refresh and try again.' using errcode='40001';
   end if;
   if k in ('source','unmatched') or (member.role='Finance' and k not in ('receipt','expense','package','catalogue','commitment','close','reconciliation','payroll','task')) or
     (member.role='TA' and k not in ('attendance','makeup','support')) then raise insufficient_privilege; end if;

   if k='catalogue' and coalesce((p->>'active')::boolean,true) and exists(select 1 from public.boh_records x where x.kind='catalogue' and x.id<>rid and coalesce((x.payload->>'active')::boolean,true) and x.payload->>'sessions'=p->>'sessions') then raise exception 'An active catalogue package already uses this session count. Edit it instead.'; end if;
   -- All teaching staff have teaching-only access to current and future classes.
   if member.role='TA' and not exists(select 1 from public.boh_records c where c.id=cid and c.kind='class' and not coalesce((c.payload->>'archived')::boolean,false)) then raise insufficient_privilege; end if;
   if k='package' and p->>'scope'='class' and not exists(select 1 from public.boh_records c where c.kind='class' and c.id=cid and cid<>'') then raise exception 'Choose a class for this class-specific package.'; end if;
   if k='package' and (old.id is null or (p - array['notes']) is distinct from (old.payload - array['notes'])) and
     exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month' in (left(old.payload->>'startDate',7),left(p->>'startDate',7))) then
     raise exception 'Package terms affect a closed month. An approved correction is required.';
   end if;
   if k='membership' and (old.id is null or (p->>'from',p->>'until') is distinct from (old.payload->>'from',old.payload->>'until')) then
     perform boh_private.check_membership(rid,sid,cid,p->>'from',p->>'until');
   end if;
   if k in ('membership','package') and old.id is not null and (sid,cid) is distinct from (old.student_id,old.class_id) then raise exception 'Record ownership cannot be reassigned. Use a new agreement or membership.'; end if;
   if k='attendance' then
     if old.id is not null and (sid,cid,p->>'membershipId',p->>'date') is distinct from (old.student_id,old.class_id,old.payload->>'membershipId',old.payload->>'date') then raise exception 'The attendance row identity cannot change.'; end if;
     if coalesce(p->>'mark','INVALID') not in ('','P','T','A','N') then raise exception 'Choose present, late, absent or not scheduled.'; end if;
     if (p->>'date')::date > (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'You cannot mark attendance before the lesson.'; end if;
     if not exists(select 1 from public.boh_records x where x.id=p->>'membershipId' and x.kind='membership' and x.student_id=sid and x.class_id=cid
       and coalesce(nullif(x.payload->>'from',''),'0001-01-01')<=p->>'date'
       and coalesce(nullif(x.payload->>'until',''),'9999-12-31')>=p->>'date') then raise exception 'Lesson is outside this class membership.'; end if;
     if exists(select 1 from public.boh_records x where x.kind='attendance' and x.id<>rid and x.class_id=cid and x.date=p->>'date'
       and boh_private.student_identity(x.student_id)=boh_private.student_identity(sid)) then
       raise exception 'Attendance already exists for this student, class and date. Refresh and edit the existing lesson.' using errcode='23505';
     end if;
   end if;
   if k='makeup' and exists(select 1 from public.boh_records x where x.kind='makeup' and x.id<>rid and x.payload->>'absenceId'=p->>'absenceId') then
     raise exception 'A makeup already exists for this absence.' using errcode='23505';
   end if;
   if k='makeup' and not exists(select 1 from public.boh_records x where x.id=p->>'absenceId' and x.kind='attendance' and x.student_id=sid and x.class_id=cid) then raise exception 'Makeup must belong to the original student and class.'; end if;
   if k='payroll' then
     if jsonb_typeof(p->'gross') is distinct from 'number' or jsonb_typeof(p->'deductions') is distinct from 'number' or
       (p->>'gross')::numeric < 0 or (p->>'deductions')::numeric < 0 or
       trunc((p->>'gross')::numeric)<>(p->>'gross')::numeric or trunc((p->>'deductions')::numeric)<>(p->>'deductions')::numeric or
       (p->>'deductions')::numeric>(p->>'gross')::numeric then raise exception 'Enter valid payroll amounts in whole VND.'; end if;
     p=p||jsonb_build_object('net',(p->>'gross')::numeric-(p->>'deductions')::numeric);
     if old.id is not null and (p->>'month',p->>'name',p->>'gross',p->>'deductions',p->>'employerInsurance')
         is distinct from (old.payload->>'month',old.payload->>'name',old.payload->>'gross',old.payload->>'deductions',old.payload->>'employerInsurance') then
       if exists(select 1 from public.boh_records e where e.kind='expense' and e.payload->>'payrollId'=rid) then raise exception 'Paid payroll is preserved. Record a separately approved adjustment.'; end if;
       if old.payload->>'status'='Approved' then p=p||jsonb_build_object('status','Draft','approvedBy',null,'approvedAt',null); end if;
     end if;
     if p->>'status'='Approved' and old.payload->>'status' is distinct from 'Approved' then
       if member.role<>'Director' then raise insufficient_privilege; end if;
       p=p||jsonb_build_object('approvedBy',member.user_id,'approvedAt',now(),'approvedRevision',coalesce(old.revision,0)+1);
     end if;
   end if;
   if k='expense' and coalesce(old.payload->>'payrollId','')<>'' and p->>'payrollId' is distinct from old.payload->>'payrollId' then raise exception 'A payroll payment cannot be detached or reassigned. Record an approved adjustment.'; end if;
   if k='expense' and coalesce(p->>'payrollId','')<>'' then
     if not exists(select 1 from public.boh_records x where x.id=p->>'payrollId' and x.kind='payroll' and x.payload->>'status'='Approved') then raise exception 'Approve payroll before recording its payment.'; end if;
     if (p->>'amount')::numeric + coalesce((select sum((x.payload->>'amount')::numeric) from public.boh_records x where x.kind='expense' and x.id<>rid and x.payload->>'payrollId'=p->>'payrollId'),0)
       > (select (x.payload->>'net')::numeric from public.boh_records x where x.id=p->>'payrollId') then raise exception 'Payroll payments exceed the approved net salary.'; end if;
   end if;

   if k='support' and member.role='TA' and (
     sid is distinct from p->>'studentId' or cid is distinct from p->>'classId' or
     not exists(select 1 from public.boh_records x where x.kind='membership' and x.student_id=sid and x.class_id=cid) or
     (old.id is not null and not exists(select 1 from public.boh_records x where x.kind='membership' and x.student_id=old.student_id and x.class_id=old.class_id))
   ) then raise insufficient_privilege; end if;
   if k in ('receipt','expense','reconciliation','payroll') then
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
   -- Keep reference validation under the same lock as lifecycle deletion.
   for lead_id in select distinct value from jsonb_array_elements_text(
      jsonb_build_array(nullif(sid,''),nullif(p->>'studentId','')) ||
      coalesce((select jsonb_agg(a->>'studentId') from jsonb_array_elements(case when jsonb_typeof(p->'allocations')='array' then p->'allocations' else '[]'::jsonb end) a),'[]'::jsonb)) where value is not null loop
     if not exists(select 1 from public.boh_records where id=lead_id and kind='student') then raise exception 'Student no longer exists. Refresh the form.'; end if;
   end loop;
   if k='student' and (coalesce(old.payload->>'canonicalStudentId','')<>'' or
     (p->>'status' is distinct from old.payload->>'status' and (p->>'status' in ('Archived','Transferred') or old.payload->>'status' in ('Archived','Transferred')))) then
     raise exception 'Use the student profile archive/restore controls or linked current profile.';
   end if;
   if k='attendance' and exists(select 1 from public.boh_records where id=sid and payload->>'status' in ('Archived','Transferred')) then raise exception 'Restore the student before recording new attendance.'; end if;
   rev=coalesce(old.revision,0)+1;
   insert into public.boh_records(id,kind,class_id,student_id,date,payload,revision,updated_at)
   values(rid,k,cid,sid,coalesce(rec->>'date',''),p,rev,now()::text)
   on conflict(id) do update set class_id=excluded.class_id,student_id=excluded.student_id,date=excluded.date,payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at returning * into r;
   if k='student' and cid<>'' and (old.id is null or coalesce(nullif(old.class_id,''),old.payload->>'classId','')<>cid) then
     transfer_day=case when old.id is null then coalesce(nullif(p->>'enrollmentDate',''),args->>'transferDate') else args->>'transferDate' end;
     if coalesce(transfer_day,'')='' then raise exception 'Enter the enrollment or transfer date.'; end if;
     if old.id is not null and exists(select 1 from public.boh_records x where x.kind='membership' and x.student_id=rid and x.class_id=coalesce(nullif(old.class_id,''),old.payload->>'classId','') and coalesce(x.payload->>'until','')='' and coalesce(nullif(x.payload->>'from',''),'0001-01-01')>=transfer_day) then raise exception 'Transfer must follow the existing membership start.'; end if;
     perform boh_private.check_membership('',rid,cid,transfer_day,'');
     if old.id is not null then
       update public.boh_records set payload=payload||jsonb_build_object('until',((transfer_day::date)-1)::text,'forecast',false),revision=revision+1,updated_at=now()::text
       where kind='membership' and student_id=rid and class_id=coalesce(nullif(old.class_id,''),old.payload->>'classId','') and coalesce(payload->>'until','')='';
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

-- Deletion is available only to the private server role; RPC enforces the narrow unused-record rule.
grant delete on public.boh_records to service_role;

-- Public catalogue from the supplied BOH price list; no student agreement changes.
insert into public.boh_records(id,kind,payload,updated_at)
select 'catalogue:'||sessions,'catalogue',jsonb_build_object('label',sessions||' sessions','sessions',sessions,'price',price,'active',true),now()::text
from (values(24,6600000),(48,12000000),(96,21600000),(192,36000000),(288,50400000)) v(sessions,price)
on conflict(id) do nothing;

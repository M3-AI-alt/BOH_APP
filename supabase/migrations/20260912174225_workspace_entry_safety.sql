-- Qualify existing history columns: PL/pgSQL also has a local variable named action.
-- Preserve the original financial rules while repairing this read-only branch.
do $migration$
declare definition text:=pg_get_functiondef('public.boh_finance(text,jsonb)'::regprocedure);
 old_sql text:='select at,actor_name,action,before,after from public.boh_activity where record_id=args->>''id'' order by at desc limit 100';
 new_sql text:='select a.at,a.actor_name,a.action,a.before,a.after from public.boh_activity a where a.record_id=args->>''id'' order by a.at desc limit 100';
begin
 if position(old_sql in definition)>0 then execute replace(definition,old_sql,new_sql);
 elsif position(new_sql in definition)=0 then raise exception 'Review the current accounting history function before applying this migration.';
 end if;
end $migration$;

create or replace function public.boh_finance_workspace(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 member public.boh_staff; doc public.boh_fin_documents; previous public.boh_fin_documents;
 command public.boh_fin_commands; result jsonb; p jsonb:=args->'payload';
 amount_n numeric; paid_n numeric; cash_id text; request_hash text; day date;
 rows_n jsonb; month_n text:=coalesce(args->>'month',''); status_n text:=coalesce(args->>'status','');
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 select * into member from public.boh_staff where user_id=args->>'actorId' and active and role in ('Director','Finance');
 if member.id is null then raise insufficient_privilege; end if;
 if operation='fin_focus' then
   result=public.boh_finance('fin_list',args||'{"offset":0,"tab":"documents"}');
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_n from (
     select d.*,coalesce((select sum(s.amount) from public.boh_fin_settlements s where s.document_id=d.id),0) as paid
     from public.boh_fin_documents d where id=(args->>'id')::uuid
   ) t;
   return result||jsonb_build_object('rows',rows_n,'total',jsonb_array_length(rows_n),'offset',0);
 end if;
 if operation in ('fin_export','fin_queue') then
   if month_n<>'' and month_n !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Choose a valid period.'; end if;
   if operation='fin_queue' then
     select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_n from (
       select id,kind,title,date,due_date,status,revision from public.boh_fin_documents
       where status='Submitted' and date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date
       order by due_date nulls last,date,id limit 100
     ) t;
     return jsonb_build_object('rows',rows_n,'total',(select count(*) from public.boh_fin_documents where status='Submitted' and date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date));
   end if;
   -- One statement snapshot: no offset pagination races or partially exported pages.
   if args->>'tab'='imports' then
     select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_n from (
       select r.*,b.source,b.dataset,b.period,b.view_name,b.file_name
       from public.boh_import_rows r join public.boh_import_batches b on b.id=r.batch_id
       where (month_n='' or b.period=month_n) and (status_n='' or r.status=status_n)
       order by b.created_at,b.id,r.row_number
     ) t;
   else
     select coalesce(jsonb_agg(to_jsonb(t)),'[]') into rows_n from (
       select d.*,coalesce((select sum(s.amount) from public.boh_fin_settlements s where s.document_id=d.id),0) as paid
       from public.boh_fin_documents d where
         (args->>'id' is not null and d.id=(args->>'id')::uuid) or
         (args->>'id' is null and (month_n='' or to_char(d.date,'YYYY-MM')=month_n) and (status_n='' or d.status=status_n))
       order by d.date,d.id
     ) t;
   end if;
   return jsonb_build_object('rows',rows_n,'total',jsonb_array_length(rows_n),'month',case when args->>'id' is null then month_n else '' end,'status',case when args->>'id' is null then status_n else '' end,'selectedDocumentId',args->>'id','generatedAt',now(),'basis','Operational documents and source review; not posted ledger revenue');
 end if;
 if operation<>'fin_pay' then raise exception 'Unsupported accounting operation.'; end if;
 perform pg_advisory_xact_lock(683920261);
 select * into member from public.boh_staff where user_id=args->>'actorId' and active and role in ('Director','Finance') for share;
 if member.id is null then raise insufficient_privilege; end if;
 if coalesce(args->>'commandId','')='' then raise exception 'A command identifier is required.'; end if;
 request_hash=md5(operation||args::text);
 select * into command from public.boh_fin_commands where id=(args->>'commandId')::uuid;
 if command.id is not null then
   if command.actor_id<>member.user_id or command.request_hash<>request_hash then raise exception 'Command identifier was reused with different data.'; end if;
   return command.result;
 end if;
 select * into doc from public.boh_fin_documents where id=(args->>'id')::uuid for update;
 if doc.id is null then raise exception 'Document not found.'; end if;
 previous=doc;
 if doc.revision is distinct from (args->>'revision')::integer then raise exception 'Record changed. Refresh and try again.' using errcode='40001'; end if;
 -- Payroll and refunds need dedicated original-liability links; do not manufacture them here.
 if doc.kind<>'bill' then raise exception 'Use the linked payroll or refund workflow for this document.'; end if;
 if doc.status not in ('Approved','Posted') or doc.approved_by is null or
   (doc.status='Approved' and doc.approved_revision is distinct from doc.revision) or
   (doc.status='Posted' and not exists(select 1 from public.boh_fin_journals where document_id=doc.id)) then raise exception 'Approve the current bill before recording payment.'; end if;
 if jsonb_typeof(p->'amount') is distinct from 'number' then raise exception 'Enter an amount in whole VND.'; end if;
 amount_n=(p->>'amount')::numeric;
 if amount_n<=0 or amount_n>1000000000000 or trunc(amount_n)<>amount_n then raise exception 'Enter an amount in whole VND.'; end if;
 if coalesce(p->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Check the payment date.'; end if;
 day=(p->>'date')::date;
 if day>(now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'A future payment is not money paid.'; end if;
 if length(trim(coalesce(p->>'account',''))) not between 1 and 100 or length(trim(coalesce(p->>'evidence',''))) not between 1 and 1000 then raise exception 'Enter the paying account and payment reference.'; end if;
 if coalesce(p->>'category','') not in ('Rent','Utilities','Teaching','Books','Marketing','Insurance','Bank fees','Office','Other') then raise exception 'Choose the payment category.'; end if;
 if exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month' in (to_char(day,'YYYY-MM'),to_char(doc.date,'YYYY-MM'))) then raise exception 'Month is closed.'; end if;
 select coalesce(sum(amount),0) into paid_n from public.boh_fin_settlements where document_id=doc.id;
 if amount_n+paid_n>doc.amount then raise exception 'Payment exceeds the remaining bill balance.'; end if;
 cash_id='expense:bill:'||(args->>'commandId');
 insert into public.boh_records(id,kind,date,payload,updated_at) values(cash_id,'expense',day::text,
   jsonb_build_object('date',day::text,'month',to_char(day,'YYYY-MM'),'amount',amount_n,'account',trim(p->>'account'),'category',p->>'category','description',doc.title,'reference',trim(p->>'evidence'),'name','','notes','','documentId',doc.id,'reconciled',false),now()::text);
 insert into public.boh_fin_settlements(id,document_id,cash_record_id,amount,evidence,created_by)
 values((args->>'commandId')::uuid,doc.id,cash_id,amount_n,trim(p->>'evidence'),member.user_id);
 update public.boh_fin_documents set revision=revision+1,approved_revision=revision+1,updated_at=now() where id=doc.id returning * into doc;
 result=jsonb_build_object('document',to_jsonb(doc),'cashRecordId',cash_id,'paid',paid_n+amount_n,'bankVerified',false);
 insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after) values(gen_random_uuid()::text,member.user_id,member.name,'Recorded bill payment',doc.id::text,to_jsonb(previous),result);
 insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after) values(gen_random_uuid()::text,member.user_id,member.name,'Recorded payment for approved bill',cash_id,null,jsonb_build_object('documentId',doc.id,'amount',amount_n,'date',day));
 insert into public.boh_fin_commands(id,actor_id,request_hash,result) values((args->>'commandId')::uuid,member.user_id,request_hash,result);
 return result;
end $$;
revoke all on function public.boh_finance_workspace(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_finance_workspace(text,jsonb) to service_role;
create index if not exists boh_fin_settlements_document on public.boh_fin_settlements(document_id);

-- Private unfinished entry is never part of operational totals or snapshot data.
create table public.boh_entry_drafts (
 id uuid primary key, owner_id text not null references public.boh_staff(user_id),
 kind text not null, record_id text references public.boh_records(id),
 record_revision integer, payload jsonb not null check(jsonb_typeof(payload)='object'),
 revision integer not null default 1, updated_at timestamptz not null default now(),
 check(octet_length(payload::text)<=65000)
);
create index boh_entry_drafts_owner on public.boh_entry_drafts(owner_id,updated_at desc);
alter table public.boh_entry_drafts enable row level security;
revoke all on public.boh_entry_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.boh_entry_drafts to service_role;
create or replace function public.boh_guard_draft_reference() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if exists(select 1 from public.boh_entry_drafts where record_id=old.id) then
   raise exception 'This record has an unfinished draft. Archive the record or ask its editor to discard the draft first.';
 end if;
 return old;
end $$;
revoke all on function public.boh_guard_draft_reference() from public,anon,authenticated;
grant execute on function public.boh_guard_draft_reference() to service_role;
create trigger boh_guard_draft_reference before delete on public.boh_records
for each row execute function public.boh_guard_draft_reference();
create or replace function public.boh_drafts(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.boh_staff; draft public.boh_entry_drafts; result jsonb; kinds text[]; k text;
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(683920261);
 select * into member from public.boh_staff where user_id=args->>'actorId' and active for share;
 if member.id is null then raise insufficient_privilege; end if;
 kinds=case member.role when 'Director' then array['lead','student','class','catalogue','package','receipt','expense','commitment','task','payroll','reconciliation','close','membership','calendar'] when 'Finance' then array['catalogue','package','receipt','expense','commitment','task','payroll','reconciliation','close'] else array[]::text[] end;
 if operation='draft_list' then
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (select * from public.boh_entry_drafts where owner_id=member.user_id and kind=any(kinds) order by updated_at desc limit 100) t;
   return result;
 end if;
 select * into draft from public.boh_entry_drafts where id=(args->>'id')::uuid for update;
 if draft.id is not null and (draft.owner_id<>member.user_id or not draft.kind=any(kinds)) then raise insufficient_privilege; end if;
 if operation='draft_delete' then
   if draft.id is null then return jsonb_build_object('deleted',true); end if;
   if draft.revision is distinct from (args->>'revision')::integer then raise exception 'Draft changed. Refresh and try again.' using errcode='40001'; end if;
   delete from public.boh_entry_drafts where id=draft.id;
   return jsonb_build_object('deleted',true);
 end if;
 if operation<>'draft_save' then raise exception 'Unsupported draft action.'; end if;
 k=args->>'kind';
 if k is null or not k=any(kinds) then raise insufficient_privilege; end if;
 if draft.id is not null and draft.kind<>k then raise exception 'Draft type cannot change.'; end if;
 if jsonb_typeof(args->'payload') is distinct from 'object' or octet_length((args->'payload')::text)>65000 then raise exception 'Draft is too large.'; end if;
 if coalesce(args->>'recordId','')<>'' and not exists(select 1 from public.boh_records where id=args->>'recordId' and kind=k) then raise exception 'Original record not found.'; end if;
 -- Retry of an identical save is harmless, including a response lost after commit.
 if draft.id is not null and draft.payload=args->'payload' and draft.record_id is not distinct from nullif(args->>'recordId','') and draft.record_revision is not distinct from (args->>'recordRevision')::integer then return to_jsonb(draft); end if;
 if (draft.id is not null and draft.revision is distinct from (args->>'revision')::integer) or (draft.id is null and args->>'revision' is not null) then raise exception 'Draft changed. Refresh and try again.' using errcode='40001'; end if;
 insert into public.boh_entry_drafts(id,owner_id,kind,record_id,record_revision,payload) values((args->>'id')::uuid,member.user_id,k,nullif(args->>'recordId',''),(args->>'recordRevision')::integer,args->'payload')
 on conflict(id) do update set payload=excluded.payload,record_id=excluded.record_id,record_revision=excluded.record_revision,revision=boh_entry_drafts.revision+1,updated_at=now() returning to_jsonb(boh_entry_drafts) into result;
 return result;
end $$;
revoke all on function public.boh_drafts(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_drafts(text,jsonb) to service_role;

create or replace function public.boh_entry_command(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.boh_staff; cmd public.boh_fin_commands; draft public.boh_entry_drafts; result jsonb; k text:=args->>'kind'; cid text:=coalesce(args->>'classId',''); hash text;
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(683920261);
 select * into member from public.boh_staff where user_id=args->>'actorId' and active for share;
 if member.id is null then raise insufficient_privilege; end if;
 if member.role='Finance' and k not in ('receipt','expense','package','catalogue','commitment','close','reconciliation','payroll','task') then raise insufficient_privilege; end if;
 if member.role='TA' and (k not in ('attendance','makeup','support') or not exists(select 1 from public.boh_records c where c.id=cid and c.kind='class' and not coalesce((c.payload->>'archived')::boolean,false))) then raise insufficient_privilege; end if;
 if coalesce(args->>'requestHash','') !~ '^[a-f0-9]{64}$' or k is null then raise exception 'Invalid entry command.'; end if;
 hash='entry:'||(args->>'requestHash');
 select * into cmd from public.boh_fin_commands where id=(args->>'commandId')::uuid;
 if cmd.id is not null then
   if cmd.actor_id<>member.user_id or cmd.request_hash<>hash then raise exception 'Command identifier was reused with different data.'; end if;
   -- A user may save a private draft after the response to a successful entry was lost.
   -- Recover that original result and consume only their matching draft, never create cash again.
   if args->>'draftId' is not null then
     select * into draft from public.boh_entry_drafts where id=(args->>'draftId')::uuid for update;
     if draft.id is not null then
       if draft.owner_id<>member.user_id or draft.kind<>k then raise insufficient_privilege; end if;
       if draft.revision is distinct from (args->>'draftRevision')::integer then raise exception 'Draft changed. Refresh and try again.' using errcode='40001'; end if;
       delete from public.boh_entry_drafts where id=draft.id;
     end if;
   end if;
   return cmd.result;
 end if;
 if operation='entry_result' then return null; end if;
 if operation<>'entry_commit' or args->'command'->>'actorId' is distinct from member.user_id or args->'command'->'record'->>'kind' is distinct from k then raise exception 'Invalid entry command.'; end if;
 if args->>'draftId' is not null then
   delete from public.boh_entry_drafts where id=(args->>'draftId')::uuid and owner_id=member.user_id and kind=k and revision=(args->>'draftRevision')::integer;
   if not found then raise exception 'Draft changed. Refresh and try again.' using errcode='40001'; end if;
 end if;
 result=public.boh_store('commit_record',args->'command');
 insert into public.boh_fin_commands(id,actor_id,request_hash,result) values((args->>'commandId')::uuid,member.user_id,hash,result);
 return result;
end $$;
revoke all on function public.boh_entry_command(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_entry_command(text,jsonb) to service_role;

-- Review layer: no imported row or document adds a receipt/expense to the cash ledger.
create table public.boh_import_batches (
 id uuid primary key default gen_random_uuid(), source text not null check(source in ('MISA','Bank','Spreadsheet','Top ID')),
 dataset text not null, period text not null, view_name text not null, file_name text not null,
 file_hash text not null, normalization_hash text not null, imported_by text not null, created_at timestamptz not null default now(),
 unique(source,dataset,view_name,file_hash)
);
create table public.boh_import_rows (
 id uuid primary key default gen_random_uuid(), batch_id uuid not null references public.boh_import_batches(id),
 row_number integer not null, external_id text not null, document_date date not null, amount numeric(16,0) not null,
 name text not null, category text not null, direction text not null, reference text not null,
 raw jsonb not null, status text not null default 'Needs confirmation' check(status in ('Needs confirmation','Matched','Excluded','Draft created')),
 matched_record_id text references public.boh_records(id), review_note text not null default '', reviewed_by text,
 revision integer not null default 1, unique(batch_id,row_number)
);
create index boh_import_external on public.boh_import_rows(external_id);
create index boh_import_review on public.boh_import_rows(status,batch_id);
create table public.boh_fin_documents (
 id uuid primary key, kind text not null check(kind in ('bill','payroll','refund','journal')),
 date date not null, due_date date, title text not null, counterparty text not null default '',
 amount numeric(16,0) not null check(amount>=0), notes text not null default '',
 status text not null default 'Draft' check(status in ('Draft','Submitted','Approved','Posted','Reversed','Archived')),
 lines jsonb not null default '[]' check(jsonb_typeof(lines)='array'),
 source_row_id uuid unique references public.boh_import_rows(id),
 revision integer not null default 1, approved_revision integer, approved_by text, ever_approved boolean not null default false,
 created_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 reversal_of uuid unique references public.boh_fin_documents(id)
);
create index boh_fin_documents_date on public.boh_fin_documents(date,status);
create table public.boh_fin_settlements (
 id uuid primary key, document_id uuid not null references public.boh_fin_documents(id),
 cash_record_id text not null references public.boh_records(id), amount numeric(16,0) not null check(amount>0),
 evidence text not null, created_by text not null, created_at timestamptz not null default now()
);
create index boh_fin_settlements_cash on public.boh_fin_settlements(cash_record_id);
create table public.boh_fin_journals (
 id uuid primary key default gen_random_uuid(), document_id uuid not null unique references public.boh_fin_documents(id),
 date date not null, lines jsonb not null, posted_by text not null, posted_at timestamptz not null default now(),
 reversal_of uuid unique references public.boh_fin_journals(id)
);
create table public.boh_fin_commands (
 id uuid primary key, actor_id text not null, request_hash text not null, result jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.boh_import_batches enable row level security;
alter table public.boh_import_rows enable row level security;
alter table public.boh_fin_documents enable row level security;
alter table public.boh_fin_settlements enable row level security;
alter table public.boh_fin_journals enable row level security;
alter table public.boh_fin_commands enable row level security;
revoke all on public.boh_import_batches,public.boh_import_rows,public.boh_fin_documents,public.boh_fin_settlements,public.boh_fin_journals,public.boh_fin_commands from public,anon,authenticated;
grant select,insert,update on public.boh_import_batches,public.boh_import_rows,public.boh_fin_documents to service_role;
grant delete on public.boh_fin_documents to service_role;
grant select,insert on public.boh_fin_settlements,public.boh_fin_journals,public.boh_fin_commands to service_role;

create or replace function boh_private.assert_journal(lines jsonb)
returns numeric language plpgsql security invoker set search_path='' as $$
declare total_debit numeric; total_credit numeric; line jsonb;
begin
 if jsonb_typeof(lines) is distinct from 'array' or jsonb_array_length(lines) not between 2 and 100 then raise exception 'Enter between 2 and 100 journal lines.'; end if;
 for line in select value from jsonb_array_elements(lines) loop
   if coalesce(line->>'account','') !~ '^[0-9A-Za-z._-]{1,30}$' or jsonb_typeof(line->'debit') is distinct from 'number' or jsonb_typeof(line->'credit') is distinct from 'number' or
     (line->>'debit')::numeric<0 or (line->>'credit')::numeric<0 or
     trunc((line->>'debit')::numeric)<>(line->>'debit')::numeric or trunc((line->>'credit')::numeric)<>(line->>'credit')::numeric or
     ((line->>'debit')::numeric>0)=((line->>'credit')::numeric>0) then raise exception 'Each line needs an account and either a debit or a credit in whole VND.'; end if;
 end loop;
 select sum((value->>'debit')::numeric),sum((value->>'credit')::numeric) into total_debit,total_credit from jsonb_array_elements(lines);
 if total_debit<>total_credit or total_debit<=0 then raise exception 'Journal debits and credits must balance.'; end if;
 return total_debit;
end; $$;
revoke all on function boh_private.assert_journal(jsonb) from public,anon,authenticated;
grant execute on function boh_private.assert_journal(jsonb) to service_role;

-- Referenced cash remains immutable, including through the older daily-entry route.
create or replace function boh_private.guard_matched_cash()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.kind in ('receipt','expense') and (new.payload - array['reconciled','notes']) is distinct from (old.payload - array['reconciled','notes']) and
    (exists(select 1 from public.boh_fin_settlements where cash_record_id=old.id) or exists(select 1 from public.boh_import_rows where matched_record_id=old.id and status='Matched')) then
    raise exception 'This cash record is linked to an approved document. A reviewed correction is required.';
 end if;
 return new;
end; $$;
revoke all on function boh_private.guard_matched_cash() from public,anon,authenticated;
grant execute on function boh_private.guard_matched_cash() to service_role;
create trigger boh_matched_cash_guard before update on public.boh_records for each row execute function boh_private.guard_matched_cash();

create or replace function public.boh_finance(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 member public.boh_staff; doc public.boh_fin_documents; previous public.boh_fin_documents;
 source_row public.boh_import_rows; cash public.boh_records; batch public.boh_import_batches;
 command public.boh_fin_commands; result jsonb; request_hash text; p jsonb; item jsonb;
 offset_n integer:=greatest(coalesce((args->>'offset')::integer,0),0); count_n integer;
 doc_id uuid; batch_id uuid; amount_n numeric; row_n integer:=0; stage text; action text;
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 select * into member from public.boh_staff where user_id=args->>'actorId' and active and role in ('Director','Finance');
 if member.id is null then raise insufficient_privilege; end if;
 if operation='fin_list' then
   if args->>'tab'='imports' then
     select count(*) into count_n from public.boh_import_rows r join public.boh_import_batches b on b.id=r.batch_id where (coalesce(args->>'status','')='' or r.status=args->>'status') and (coalesce(args->>'month','')='' or b.period=args->>'month');
     select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
       select r.*,b.source,b.dataset,b.period,b.file_name,b.view_name,
       (select count(*) from public.boh_import_rows x join public.boh_import_batches xb on xb.id=x.batch_id where x.id<>r.id and x.external_id=r.external_id and xb.source=b.source and xb.dataset=b.dataset) as possible_duplicates
       from public.boh_import_rows r join public.boh_import_batches b on b.id=r.batch_id
       where (coalesce(args->>'status','')='' or r.status=args->>'status') and (coalesce(args->>'month','')='' or b.period=args->>'month') order by b.created_at desc,b.id,r.row_number limit 50 offset offset_n
     ) t;
   else
     select count(*) into count_n from public.boh_fin_documents d where (coalesce(args->>'status','')='' or d.status=args->>'status') and (coalesce(args->>'month','')='' or to_char(d.date,'YYYY-MM')=args->>'month');
     select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
       select d.*,(select coalesce(sum(s.amount),0) from public.boh_fin_settlements s where s.document_id=d.id) as paid
       from public.boh_fin_documents d where (coalesce(args->>'status','')='' or d.status=args->>'status') and (coalesce(args->>'month','')='' or to_char(d.date,'YYYY-MM')=args->>'month') order by d.updated_at desc,d.id limit 50 offset offset_n
     ) t;
   end if;
   return jsonb_build_object('rows',result,'total',count_n,'offset',offset_n,'pageSize',50,
     'summary',jsonb_build_object('unreviewed',(select count(*) from public.boh_import_rows where status='Needs confirmation'),
       'submitted',(select count(*) from public.boh_fin_documents where status='Submitted'),
       'approved',(select count(*) from public.boh_fin_documents where status='Approved')),
     'misa',jsonb_build_object('connected',false,'officialActivation',false,'state','Registration and reconciled opening balances required'));
 end if;
 if operation='fin_history' then
   return jsonb_build_object('activity',coalesce((select jsonb_agg(to_jsonb(t)) from (select at,actor_name,action,before,after from public.boh_activity where record_id=args->>'id' order by at desc limit 100)t),'[]'),
     'settlements',coalesce((select jsonb_agg(to_jsonb(s)) from public.boh_fin_settlements s where s.document_id::text=args->>'id'),'[]'));
 end if;
 perform pg_advisory_xact_lock(683920261);
 -- Access may have changed while this mutation waited behind a staff update.
 select * into member from public.boh_staff where user_id=args->>'actorId' and active and role in ('Director','Finance') for share;
 if member.id is null then raise insufficient_privilege; end if;
 if coalesce(args->>'commandId','')='' then raise exception 'A command identifier is required.'; end if;
 request_hash=md5(operation||args::text);
 select * into command from public.boh_fin_commands where id=(args->>'commandId')::uuid;
 if command.id is not null then
   if command.actor_id<>member.user_id or command.request_hash<>request_hash then raise exception 'Command identifier was reused with different data.'; end if;
   return command.result;
 end if;
 p=args->'payload';
 if operation='fin_stage' then
   if jsonb_array_length(p->'rows') not between 1 and 500 then raise exception 'Choose a CSV with a header and 1–500 data rows.'; end if;
   insert into public.boh_import_batches(source,dataset,period,view_name,file_name,file_hash,normalization_hash,imported_by)
   values(p->>'source',p->>'dataset',p->>'period',p->>'view',p->>'fileName',p->>'fileHash',md5((p->'rows')::text),member.user_id)
   on conflict(source,dataset,view_name,file_hash) do nothing returning * into batch;
   if batch.id is null then
     select * into batch from public.boh_import_batches b where b.source=p->>'source' and b.dataset=p->>'dataset' and b.view_name=p->>'view' and b.file_hash=p->>'fileHash';
     if batch.normalization_hash<>md5((p->'rows')::text) or batch.period<>p->>'period' then raise exception 'This file was already staged with different mapping or period. Review the original import before correcting it.'; end if;
     result=jsonb_build_object('batchId',batch.id,'duplicate',true);
   else
     for item in select value from jsonb_array_elements(p->'rows') loop
       row_n=row_n+1;
       insert into public.boh_import_rows(batch_id,row_number,external_id,document_date,amount,name,category,direction,reference,raw)
       values(batch.id,row_n,item->>'externalId',(item->>'date')::date,(item->>'amount')::numeric,item->>'name',item->>'category',item->>'direction',item->>'reference',item->'raw');
     end loop;
     result=jsonb_build_object('batchId',batch.id,'rows',row_n,'duplicate',false);
     insert into public.boh_activity(id,actor_id,actor_name,action,record_id,after) values(gen_random_uuid()::text,member.user_id,member.name,'Staged import; cash unchanged',batch.id::text,to_jsonb(batch));
   end if;
 elsif operation='fin_review' then
   select * into source_row from public.boh_import_rows where id=(args->>'id')::uuid for update;
   if source_row.id is null then raise exception 'Source row not found.'; end if;
   if source_row.revision is distinct from (args->>'revision')::integer then raise exception 'Record changed. Refresh and try again.' using errcode='40001'; end if;
   if source_row.status<>'Needs confirmation' and not (source_row.status in ('Matched','Excluded') and p->>'status'='Needs confirmation') then raise exception 'This source row has already been reviewed.'; end if;
   if length(trim(coalesce(p->>'note','')))=0 then raise exception 'Enter the matching evidence or review reason.'; end if;
   stage=p->>'status';
   if stage not in ('Matched','Excluded','Draft created','Needs confirmation') then raise exception 'Choose a review decision.'; end if;
   if stage='Matched' then
     select * into cash from public.boh_records where id=p->>'recordId' and kind in ('receipt','expense');
     if cash.id is null or jsonb_typeof(cash.payload->'amount') is distinct from 'number' or abs(source_row.amount)<>(cash.payload->>'amount')::numeric then raise exception 'Match an existing cash record with the same amount.'; end if;
   elsif stage='Draft created' then
     if p->>'kind' not in ('bill','payroll','refund','journal') then raise exception 'Choose a document type.'; end if;
     insert into public.boh_fin_documents(id,kind,date,title,counterparty,amount,source_row_id,created_by,notes)
     values(gen_random_uuid(),p->>'kind',source_row.document_date,source_row.external_id,source_row.name,abs(source_row.amount),source_row.id,member.user_id,'Source review: '||(p->>'note')) returning id into doc_id;
   end if;
   update public.boh_import_rows set status=stage,matched_record_id=case when stage='Matched' then cash.id else null end,review_note=p->>'note',reviewed_by=member.user_id,revision=revision+1 where id=source_row.id returning to_jsonb(boh_import_rows) into result;
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after) values(gen_random_uuid()::text,member.user_id,member.name,'Reviewed source · '||stage,source_row.id::text,to_jsonb(source_row),result);
 elsif operation in ('fin_save','fin_action','fin_settle') then
   doc_id=(args->>'id')::uuid;
   select * into doc from public.boh_fin_documents where id=doc_id for update;
   previous=doc;
   if (doc.id is not null and doc.revision is distinct from (args->>'revision')::integer) or (doc.id is null and args->>'revision' is not null) then raise exception 'Record changed. Refresh and try again.' using errcode='40001'; end if;
   if operation='fin_save' then
     if doc.status in ('Posted','Reversed','Archived') then raise exception 'Posted or archived documents cannot be edited.'; end if;
     if exists(select 1 from public.boh_fin_settlements where document_id=doc_id) then raise exception 'Settled documents require a reviewed adjustment.'; end if;
     if p->>'kind' not in ('bill','payroll','refund','journal') then raise exception 'Choose a document type.'; end if;
     if exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month' in (left(p->>'date',7),to_char(doc.date,'YYYY-MM'))) then raise exception 'Month is closed.'; end if;
     insert into public.boh_fin_documents(id,kind,date,due_date,title,counterparty,amount,notes,lines,created_by)
     values(doc_id,p->>'kind',(p->>'date')::date,nullif(p->>'dueDate','')::date,p->>'title',coalesce(p->>'counterparty',''),(p->>'amount')::numeric,coalesce(p->>'notes',''),coalesce(p->'lines','[]'),member.user_id)
     on conflict(id) do update set kind=excluded.kind,date=excluded.date,due_date=excluded.due_date,title=excluded.title,counterparty=excluded.counterparty,amount=excluded.amount,notes=excluded.notes,lines=excluded.lines,
       status='Draft',approved_by=null,approved_revision=null,revision=boh_fin_documents.revision+1,updated_at=now() returning * into doc;
   elsif operation='fin_settle' then
     if doc.status not in ('Approved','Posted') or doc.kind='journal' then raise exception 'Approve this obligation before matching payments.'; end if;
     if coalesce(p->>'evidence','')='' then raise exception 'Enter payment matching evidence.'; end if;
     select * into cash from public.boh_records where id=p->>'cashRecordId' and kind='expense';
     if cash.id is null or jsonb_typeof(cash.payload->'amount') is distinct from 'number' then raise exception 'Choose a confirmed existing expense.'; end if;
     if coalesce(cash.date,'') !~ '^\d{4}-\d{2}-\d{2}$' or not coalesce((cash.payload->>'reconciled')::boolean,false) then raise exception 'Confirm the payment date and reconcile it in Finance before matching.'; end if;
     if coalesce(cash.payload->>'payrollId','')<>'' then raise exception 'This payment already settles a payroll record. Keep that original payroll link.'; end if;
     if exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month' in (left(cash.date,7),to_char(doc.date,'YYYY-MM'))) then raise exception 'Month is closed.'; end if;
     amount_n=(p->>'amount')::numeric;
     if amount_n<=0 or trunc(amount_n)<>amount_n or amount_n+(select coalesce(sum(amount),0) from public.boh_fin_settlements where cash_record_id=cash.id)>(cash.payload->>'amount')::numeric
       or amount_n+(select coalesce(sum(amount),0) from public.boh_fin_settlements where document_id=doc_id)>doc.amount then raise exception 'Allocated payments exceed the cash record or document balance.'; end if;
     insert into public.boh_fin_settlements(id,document_id,cash_record_id,amount,evidence,created_by) values((args->>'commandId')::uuid,doc_id,cash.id,amount_n,p->>'evidence',member.user_id);
     update public.boh_fin_documents set revision=revision+1,approved_revision=case when approved_revision is not null then revision+1 end,updated_at=now() where id=doc_id returning * into doc;
   else
     if doc.id is null then raise exception 'Document not found.'; end if;
     action=p->>'action';
     if action='submit' and doc.status='Draft' then
       if doc.amount<=0 or length(trim(doc.title))=0 then raise exception 'Enter a title and positive amount.'; end if;
       if doc.kind='journal' and boh_private.assert_journal(doc.lines)<>doc.amount then raise exception 'Journal total must equal the document amount.'; end if;
       stage='Submitted';
     elsif action='approve' and doc.status='Submitted' then
       if member.role<>'Director' then raise insufficient_privilege; end if;
       if doc.kind='journal' and boh_private.assert_journal(doc.lines)<>doc.amount then raise exception 'Journal total must equal the document amount.'; end if;
       stage='Approved';
     elsif action='return' and doc.status in ('Submitted','Approved') then
       if exists(select 1 from public.boh_fin_settlements where document_id=doc_id) then raise exception 'Settled documents require a reviewed adjustment.'; end if;
       stage='Draft';
     elsif action='archive' and doc.status in ('Draft','Submitted') then stage='Archived';
     elsif action='restore' and doc.status='Archived' then stage='Draft';
     elsif action='delete' and doc.status='Draft' and doc.source_row_id is null and not doc.ever_approved then
       if exists(select 1 from public.boh_fin_settlements where document_id=doc_id) then raise exception 'Archive referenced records instead.'; end if;
       delete from public.boh_fin_documents where id=doc_id; stage='Deleted';
     elsif action='post' and doc.status='Approved' then
       if member.role<>'Director' then raise insufficient_privilege; end if;
       if not exists(select 1 from public.boh_settings where key='accounting-cutover-approved' and value::jsonb->>'approved'='true') then raise exception 'Posting is locked until opening balances, accounts and cutover are approved.'; end if;
       if doc.approved_revision<>doc.revision then raise exception 'Approve the current document version before posting.'; end if;
       if boh_private.assert_journal(doc.lines)<>doc.amount then raise exception 'Journal total must equal the document amount.'; end if;
       insert into public.boh_fin_journals(document_id,date,lines,posted_by) values(doc_id,doc.date,doc.lines,member.user_id); stage='Posted';
     else raise exception 'This action is not available for the current document status.';
     end if;
     if action in ('approve','post') and exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month'=to_char(doc.date,'YYYY-MM')) then raise exception 'Month is closed.'; end if;
     if action<>'delete' then
       update public.boh_fin_documents set status=stage,revision=revision+1,updated_at=now(),
         ever_approved=ever_approved or stage='Approved',
         approved_by=case when stage='Approved' then member.user_id when stage='Posted' then approved_by else null end,
         approved_revision=case when stage='Approved' then revision+1 when stage='Posted' then approved_revision else null end where id=doc_id returning * into doc;
     end if;
   end if;
   result=case when stage='Deleted' then jsonb_build_object('deleted',true) else to_jsonb(doc) end;
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after) values(gen_random_uuid()::text,member.user_id,member.name,operation||coalesce(' · '||action,''),doc_id::text,to_jsonb(previous),result);
 else raise exception 'Unsupported accounting operation';
 end if;
 insert into public.boh_fin_commands(id,actor_id,request_hash,result) values((args->>'commandId')::uuid,member.user_id,request_hash,result);
 return result;
end; $$;
revoke all on function public.boh_finance(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_finance(text,jsonb) to service_role;

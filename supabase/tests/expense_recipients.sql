-- ISOLATED RESTORED QA ONLY. All synthetic records and writes roll back.
\set ON_ERROR_STOP on
begin;
set local session_replication_role=replica;
insert into public.boh_records(id,kind,date,payload,updated_at) values
 ('qa-legacy-expense','expense','2026-09-01','{"date":"2026-09-01","amount":100,"account":"Thao personal BIDV","name":""}',now()::text);
set local session_replication_role=origin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-recipient-director','qa-recipient-director','qa-recipient-director@example.invalid','QA Director','Director'),
 ('qa-recipient-finance','qa-recipient-finance','qa-recipient-finance@example.invalid','QA Finance','Finance');
set local role service_role;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject_expense(query text) returns void language plpgsql as $$
declare caught boolean=false;
begin begin execute query; exception when check_violation then caught=true; end;
perform pg_temp.ok(caught,'expense source/recipient guard rejects unsafe cash'); end $$;
do $$
declare account text; original jsonb; args jsonb; result jsonb; doc uuid=gen_random_uuid(); saved jsonb; baseline integer;
begin
 select payload into original from public.boh_records where id='qa-legacy-expense';
 foreach account in array array['Thao personal BIDV','Thao personal MBB','Thao personal VCB','Thảo','Company','Cash','Other person',''] loop
   perform pg_temp.reject_expense(format('insert into public.boh_records(id,kind,date,payload,updated_at) values(%L,''expense'',''2026-09-13'',%L,now()::text)',gen_random_uuid()::text,jsonb_build_object('account',account,'amount',100,'date','2026-09-13','imported',true)));
 end loop;
 args=jsonb_build_object('actorId','qa-recipient-finance','expectedRevision',1,'record',jsonb_build_object('id','qa-legacy-expense','kind','expense','date','2026-09-01','payload',original||'{"reconciled":true,"notes":"Evidence reviewed"}'));
 result=public.boh_store('commit_record',args);
 perform pg_temp.ok((result->>'revision')::int=2 and (result->'payload')-array['reconciled','notes']=original,'legacy expense upsert preserves original source and amount');
 perform pg_temp.reject_expense(format('select public.boh_store(''commit_record'',%L)',jsonb_set(args||'{"expectedRevision":2}','{record,payload,amount}','101')));
 perform pg_temp.reject_expense(format('select public.boh_store(''commit_record'',%L)',jsonb_set(args||'{"expectedRevision":null}','{record,id}','"qa-new-personal-expense"')));
 perform pg_temp.ok(not exists(select 1 from public.boh_records where id='qa-new-personal-expense') and not exists(select 1 from public.boh_activity where record_id='qa-new-personal-expense'),'failed source validation leaves no cash or audit entry');
 insert into public.boh_records(id,kind,date,payload,updated_at) values('qa-recipient-expense','expense','2026-09-13','{"date":"2026-09-13","amount":50,"account":"Company VCB","name":"Sample recipient","recipientBank":"Example bank","recipientAccount":"00123456789"}',now()::text);
 perform pg_temp.ok((select payload->>'recipientAccount'='00123456789' from public.boh_records where id='qa-recipient-expense'),'recipient account is stored as exact text');
 perform pg_temp.reject_expense('update public.boh_records set payload=payload||''{"recipientAccount":1234}'' where id=''qa-recipient-expense''');
 perform pg_temp.reject_expense('update public.boh_records set payload=payload||''{"name":""}'' where id=''qa-recipient-expense''');
 insert into public.boh_fin_documents(id,kind,date,title,amount,status,approved_by,approved_revision,created_by)
 values(doc,'bill','2026-09-13','Synthetic recipient bill',100,'Approved','qa-recipient-director',1,'qa-recipient-finance');
 select count(*) into baseline from public.boh_records where kind='expense';
 args=jsonb_build_object('actorId','qa-recipient-finance','commandId',gen_random_uuid(),'id',doc,'revision',1,'payload',jsonb_build_object('date','2026-09-13','amount',50,'account','Company BIDV','name','Sample recipient','recipientBank','Example bank','recipientAccount','00123456789','category','Other','evidence','Synthetic transfer'));
 perform pg_temp.reject_expense(format('select public.boh_finance_workspace(''fin_pay'',%L)',jsonb_set(args,'{payload,account}','"Thao personal BIDV"')));
 perform pg_temp.reject_expense(format('select public.boh_finance_workspace(''fin_pay'',%L)',jsonb_set(args,'{payload,recipientAccount}','1234')));
 perform pg_temp.ok((select count(*) from public.boh_records where kind='expense')=baseline and not exists(select 1 from public.boh_fin_settlements where document_id=doc),'invalid bill payment rolls back cash and allocation together');
 result=public.boh_finance_workspace('fin_pay',args);
 perform pg_temp.ok(public.boh_finance_workspace('fin_pay',args)=result,'recipient payment retry returns original result');
 select payload into saved from public.boh_records where id=result->>'cashRecordId';
 perform pg_temp.ok(saved->>'account'='Company BIDV' and saved->>'name'='Sample recipient' and saved->>'recipientBank'='Example bank' and saved->>'recipientAccount'='00123456789','approved-bill payment carries all recipient details into its cash entry');
 perform pg_temp.ok((select count(*) from public.boh_records where kind='expense')=baseline+1 and (select sum(amount) from public.boh_fin_settlements where document_id=doc)=50,'recipient details do not duplicate cash or allocations');
 update public.boh_records set payload=payload||'{"reconciled":true}' where id=result->>'cashRecordId';
 perform pg_temp.ok((select payload-'reconciled'=saved-'reconciled' from public.boh_records where id=result->>'cashRecordId'),'reconciliation keeps recipient details');
end $$;
select pg_temp.ok(not has_function_privilege('anon','boh_private.guard_expense_accounts()','EXECUTE'),'anonymous guard access denied');
select pg_temp.ok(not has_function_privilege('authenticated','boh_private.guard_expense_accounts()','EXECUTE'),'browser guard access denied');
rollback;

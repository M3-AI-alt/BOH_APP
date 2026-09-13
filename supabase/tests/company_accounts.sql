-- ISOLATED RESTORED QA ONLY. Never run fixture scripts against production.
\set ON_ERROR_STOP on
begin;
-- Model a legacy row predating the new guard, without altering live/source data.
set local session_replication_role=replica;
insert into public.boh_records(id,kind,date,payload,updated_at) values
 ('qa-legacy-receipt','receipt','2026-09-01','{"date":"2026-09-01","amount":100,"account":"Thao personal BIDV","name":"QA payer"}',now()::text);
set local session_replication_role=origin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-account-owner','qa-account-owner','qa-account-owner@example.invalid','QA owner','Director'),
 ('qa-account-director','qa-account-director','qa-account-director@example.invalid','QA Director','Director'),
 ('qa-account-finance','qa-account-finance','qa-account-finance@example.invalid','QA Finance','Finance'),
 ('qa-account-ta','qa-account-ta','qa-account-ta@example.invalid','QA TA','TA');
set local role service_role;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function pg_temp.reject_receipt(query text) returns void language plpgsql as $$
declare caught boolean=false;
begin begin execute query; exception when check_violation then caught=true; end;
perform pg_temp.ok(caught,'receiving-account guard rejected unsafe cash'); end $$;
do $$
declare account text; original jsonb; shared_id uuid=gen_random_uuid(); args jsonb; result jsonb;
begin
 select payload into original from public.boh_records where id='qa-legacy-receipt';
 foreach account in array array['Thao personal BIDV','Thao personal MBB','Thao personal VCB','Thảo','Company','Cash','Other bank',''] loop
   perform pg_temp.reject_receipt(format('insert into public.boh_records(id,kind,date,payload,updated_at) values(%L,''receipt'',''2026-09-13'',%L,now()::text)',gen_random_uuid()::text,jsonb_build_object('account',account,'amount',100,'date','2026-09-13','imported',true)));
 end loop;
 foreach account in array array['Company BIDV','Company VCB'] loop
   insert into public.boh_records(id,kind,date,payload,updated_at) values('qa-'||account,'receipt','2026-09-13',jsonb_build_object('account',account,'amount',100,'date','2026-09-13'),now()::text);
 end loop;
 perform pg_temp.reject_receipt('update public.boh_records set payload=jsonb_set(payload,''{account}'',''"Thảo"'') where id=''qa-Company BIDV''');
 perform pg_temp.reject_receipt('update public.boh_records set payload=jsonb_set(payload,''{amount}'',''101'') where id=''qa-legacy-receipt''');
 perform pg_temp.reject_receipt('update public.boh_records set date=''2026-09-13'' where id=''qa-legacy-receipt''');
 perform pg_temp.reject_receipt('update public.boh_records set payload=jsonb_set(payload,''{date}'',''"2026-09-13"'') where id=''qa-legacy-receipt''');
 update public.boh_records set payload=payload||'{"reconciled":true}' where id='qa-legacy-receipt';
 perform pg_temp.ok((select payload-'reconciled'=original from public.boh_records where id='qa-legacy-receipt'),'original personal account and amount preserved during reconciliation');
 -- Exercise the actual application upsert, not only direct UPDATE statements.
 args=jsonb_build_object('actorId','qa-account-finance','expectedRevision',1,'record',
   jsonb_build_object('id','qa-legacy-receipt','kind','receipt','date','2026-09-01',
     'payload',original||'{"reconciled":true,"notes":"Evidence reviewed"}'));
 result=public.boh_store('commit_record',args);
 perform pg_temp.ok((result->>'revision')::int=2 and (result->'payload')-array['reconciled','notes']=original,'real save RPC preserves legacy cash while updating its evidence');
 perform pg_temp.reject_receipt(format('select public.boh_store(''commit_record'',%L)',
   jsonb_set(args||'{"expectedRevision":2}','{record,payload,amount}','101')));
 perform pg_temp.reject_receipt(format('select public.boh_store(''commit_record'',%L)',
   jsonb_set(args||'{"expectedRevision":null}','{record,id}','"qa-new-personal-receipt"')));
 perform pg_temp.ok(not exists(select 1 from public.boh_records where id='qa-new-personal-receipt')
   and not exists(select 1 from public.boh_activity where record_id='qa-new-personal-receipt'),'rejected new receipt leaves no cash or activity');
 perform pg_temp.ok((select revision=2 and payload->'amount'='100'::jsonb from public.boh_records where id='qa-legacy-receipt'),'rejected legacy cash change preserves revision and amount');
 args=jsonb_build_object('actorId','qa-account-owner','id',shared_id,'module','receipts','name','Finance work','roles','[]'::jsonb,'spec','{"query":"","facets":{},"columns":[]}'::jsonb);
 perform public.boh_saved_view('view_save',args);
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-account-director","module":"receipts"}'))=0,'another Director cannot read a private personal view');
 perform public.boh_saved_view('view_save',args||'{"revision":1,"roles":["Finance"]}');
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-account-director","module":"receipts"}'))=1,'Director inherits Finance-shared views');
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-account-finance","module":"receipts"}'))=1,'Finance still sees shared view');
 update public.boh_staff set active=false where user_id='qa-account-owner';
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-account-director","module":"receipts"}'))=0,'suspended owner cannot publish inherited views');
end $$;
rollback;

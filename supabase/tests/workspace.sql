-- Isolated database only. Fixtures and all business writes roll back.
\set ON_ERROR_STOP on
begin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-work-director','qa-work-director','work-director@example.invalid','Test director','Director'),
 ('qa-work-finance','qa-work-finance','work-finance@example.invalid','Test finance','Finance'),
 ('qa-work-ta','qa-work-ta','work-ta@example.invalid','Test TA','TA');
set local role service_role;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end; $$;
create function pg_temp.fails(query text,pattern text) returns void language plpgsql as $$
declare caught boolean:=false;
begin
 begin execute query; exception when others then
   if sqlerrm not ilike '%'||pattern||'%' then raise exception 'Wrong failure (% expected): %',pattern,sqlerrm; end if; caught=true;
 end;
 perform pg_temp.assert_true(caught,'reject: '||pattern);
end; $$;
do $$
declare doc uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); draft uuid:=gen_random_uuid(); entry uuid:=gen_random_uuid(); r jsonb; saved jsonb; args jsonb; payment jsonb; baseline int; v int; day text:=(now() at time zone 'Asia/Ho_Chi_Minh')::date::text;
begin
 select count(*) into baseline from public.boh_records where kind='expense';
 insert into public.boh_fin_documents(id,kind,date,title,amount,status,approved_by,approved_revision,created_by)
 values(doc,'bill',day::date,'Synthetic approved bill',100,'Approved','qa-work-director',1,'qa-work-finance');
 args=jsonb_build_object('actorId','qa-work-finance','commandId',cid,'id',doc,'revision',1,'payload',jsonb_build_object('date',day,'amount',60,'account','QA bank','evidence','QA transfer 1','category','Rent'));
 r=public.boh_finance_workspace('fin_pay',args); saved=r; payment=args;
 perform pg_temp.assert_true(r->>'bankVerified'='false','bill payment does not assert bank verification');
 perform pg_temp.assert_true((select count(*) from public.boh_records where kind='expense')=baseline+1,'one payment creates exactly one expense');
 perform pg_temp.assert_true((select sum(amount) from public.boh_fin_settlements where document_id=doc)=60,'payment allocated to original bill');
 perform pg_temp.assert_true((select (payload->>'reconciled')::boolean from public.boh_records where id=r->>'cashRecordId')=false,'cash remains unreconciled');
 perform pg_temp.assert_true(public.boh_finance_workspace('fin_pay',args)=saved,'lost response retry returns original payment');
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',args||jsonb_build_object('commandId',gen_random_uuid())),'Record changed');
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',args||jsonb_build_object('actorId','qa-work-ta')),'insufficient');
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',jsonb_set(args,'{payload,amount}','61')),'reused');
 args=args||jsonb_build_object('commandId',gen_random_uuid(),'revision',2);
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',args),'exceeds');
 args=jsonb_set(args,'{payload,amount}','40');
 r=public.boh_finance_workspace('fin_pay',args);
 perform pg_temp.assert_true((r->>'paid')::numeric=100,'partial payments settle exactly the obligation');
 saved=public.boh_finance('fin_history',jsonb_build_object('actorId','qa-work-finance','id',doc));
 perform pg_temp.assert_true(jsonb_array_length(saved->'activity')=2 and jsonb_array_length(saved->'settlements')=2,'financial history returns actor actions without ambiguous SQL columns');
 perform pg_temp.fails(format('update public.boh_records set payload=payload||%L::jsonb where id=%L','{"amount":1}',r->>'cashRecordId'),'linked');
 update public.boh_records set payload=payload||'{"reconciled":true}' where id=r->>'cashRecordId';
 perform pg_temp.assert_true((select count(*) from public.boh_records where kind='expense')=baseline+2,'verification creates no extra expense');
 insert into public.boh_fin_documents(id,kind,date,title,amount,status,created_by)
 select gen_random_uuid(),'bill',day::date,'QA export '||g,1,'Draft','qa-work-finance' from generate_series(1,55) g;
 r=public.boh_finance_workspace('fin_export',jsonb_build_object('actorId','qa-work-finance','tab','documents','month',left(day,7),'status','Draft'));
 perform pg_temp.assert_true((r->>'total')::integer>=55 and jsonb_array_length(r->'rows')=(r->>'total')::integer,'export includes more than the current 50-row page');
 perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(r->'rows') d where d->>'status'<>'Draft'),'export keeps status filter');
 r=public.boh_finance_workspace('fin_focus',jsonb_build_object('actorId','qa-work-finance','id',doc,'month','2000-01','status','Submitted'));
 perform pg_temp.assert_true(r->'rows'->0->>'id'=doc::text and (r->>'total')::int=1,'Today document opens by permanent ID regardless of page or later status change');
 r=public.boh_finance_workspace('fin_export',jsonb_build_object('actorId','qa-work-finance','id',doc,'month','2000-01','status','Submitted'));
 perform pg_temp.assert_true(r->'rows'->0->>'id'=doc::text and (r->>'total')::int=1 and r->>'month'='','focused export includes only selected document and does not claim the wrong period');
 args=jsonb_build_object('actorId','qa-work-finance','id',draft,'kind','expense','revision',null,'payload',jsonb_build_object('data',jsonb_build_object('description','Unfinished'),'reason',''));
 saved=public.boh_drafts('draft_save',args);
 perform pg_temp.assert_true(public.boh_drafts('draft_save',args)=saved,'identical draft retry does not increase revision');
 perform pg_temp.assert_true(jsonb_array_length(public.boh_drafts('draft_list','{"actorId":"qa-work-director"}'))=0,'director cannot read another account private drafts');
 perform pg_temp.fails(format('select public.boh_drafts(%L,%L)','draft_delete',args||'{"actorId":"qa-work-director","revision":1}'),'insufficient');
 perform pg_temp.fails(format('select public.boh_drafts(%L,%L)','draft_save',args||jsonb_build_object('id',gen_random_uuid(),'kind','student')),'insufficient');
 perform pg_temp.fails(format('select public.boh_drafts(%L,%L)','draft_save',args||'{"actorId":"qa-work-ta"}'),'insufficient');
 perform pg_temp.fails(format('select public.boh_drafts(%L,%L)','draft_save',jsonb_set(args,'{payload,data,description}','"Changed"')),'Draft changed');
 perform pg_temp.assert_true((select count(*) from public.boh_records where kind='expense')=baseline+2,'saved draft never changes cash');
 -- Submission consumes its private draft in the same transaction as record creation.
 args=jsonb_build_object('actorId','qa-work-finance','commandId',entry,'kind','expense','classId','','requestHash',repeat('a',64),'draftId',draft,'draftRevision',1,
   'command',jsonb_build_object('actorId','qa-work-finance','expectedRevision',null,'record',jsonb_build_object('id',entry,'kind','expense','date',day,'payload',jsonb_build_object('date',day,'month',left(day,7),'amount',5,'description','Synthetic expense','account','QA bank'))));
 r=public.boh_entry_command('entry_commit',args);saved=r;
 perform pg_temp.assert_true(not exists(select 1 from public.boh_entry_drafts where id=draft),'submitted draft is consumed atomically');
 perform pg_temp.assert_true(public.boh_entry_command('entry_result',args)=saved and public.boh_entry_command('entry_commit',args)=saved,'entry retries return original record');
 perform pg_temp.assert_true((select count(*) from public.boh_records where id=entry::text)=1,'entry retry does not duplicate record');
 -- The response was lost, then a new private draft was saved. Recovery consumes it.
 perform public.boh_drafts('draft_save',jsonb_build_object('actorId','qa-work-finance','id',draft,'kind','expense','payload','{"data":{"amount":5},"reason":""}'::jsonb));
 perform pg_temp.assert_true(public.boh_entry_command('entry_result',args)=saved,'later private draft can recover previously committed command');
 perform pg_temp.assert_true(not exists(select 1 from public.boh_entry_drafts where id=draft),'recovery consumes the later draft without adding another expense');
 perform pg_temp.fails(format('select public.boh_entry_command(%L,%L)','entry_commit',args||jsonb_build_object('requestHash',repeat('b',64))),'reused');
 perform pg_temp.fails(format('select public.boh_entry_command(%L,%L)','entry_result',args||'{"actorId":"qa-work-ta"}'),'insufficient');
 -- Invalid record revision fails after draft deletion, so both changes must roll back.
 perform public.boh_drafts('draft_save',jsonb_build_object('actorId','qa-work-finance','id',draft,'kind','expense','recordId',entry,'recordRevision',1,'payload','{"data":{"amount":5},"reason":""}'::jsonb));
 args=args||jsonb_build_object('commandId',gen_random_uuid());
 args=jsonb_set(args,'{command,expectedRevision}','999');
 perform pg_temp.fails(format('select public.boh_entry_command(%L,%L)','entry_commit',args),'changed');
 perform pg_temp.assert_true(exists(select 1 from public.boh_entry_drafts where id=draft),'failed operational save keeps private draft');
 perform pg_temp.fails(format('delete from public.boh_records where id=%L',entry),'unfinished draft');
 -- Approval and payment dates are verified independently of input validation in Node.
 args=payment||jsonb_build_object('commandId',gen_random_uuid(),'revision',3);
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',jsonb_set(args,'{payload,date}',to_jsonb((day::date+1)::text))),'future');
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',jsonb_set(args,'{payload,amount}','null')),'whole VND');
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',jsonb_set(args,'{payload,account}',to_jsonb(repeat('a',101)))),'account');
 update public.boh_fin_documents set status='Submitted' where id=doc;
 perform pg_temp.fails(format('select public.boh_finance_workspace(%L,%L)','fin_pay',args),'Approve');
end $$;
-- ACL checks avoid a local Supabase PostgreSQL image crash when switching into
-- anon inside a PL/pgSQL test session. HTTP authentication is tested separately.
select pg_temp.assert_true(not has_function_privilege('anon','public.boh_finance_workspace(text,jsonb)','EXECUTE'),'anonymous finance RPC denied by grant');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.boh_entry_command(text,jsonb)','EXECUTE'),'browser entry RPC denied by grant');
select pg_temp.assert_true(not has_table_privilege('anon','public.boh_entry_drafts','SELECT'),'anonymous drafts table denied by grant');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.boh_entry_drafts','SELECT'),'browser drafts table denied by grant');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.boh_entry_drafts'::regclass),'private draft RLS enabled');
rollback;

-- Run only in an isolated restored database. All synthetic changes roll back.
\set ON_ERROR_STOP on
begin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-upgrade-director','qa-upgrade-director','director@upgrade.invalid','Test director','Director'),
 ('qa-upgrade-finance','qa-upgrade-finance','finance@upgrade.invalid','Test finance','Finance'),
 ('qa-upgrade-ta','qa-upgrade-ta','ta@upgrade.invalid','Test TA','TA');
set local role service_role;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; raise notice 'PASS: %',label; end; $$;
create function pg_temp.write_record(rid text,k text,p jsonb,actor text default 'qa-upgrade-director',rev int default null)
returns jsonb language sql as $$
 select public.boh_store('commit_record',jsonb_build_object('actorId',actor,'expectedRevision',rev,'transferDate','2026-09-12',
  'record',jsonb_build_object('id',rid,'kind',k,'classId',coalesce(p->>'classId',''),'studentId',coalesce(p->>'studentId',''),'date',coalesce(p->>'date',''),'payload',p)));
$$;
create function pg_temp.fin(op text,p jsonb,actor text default 'qa-upgrade-finance') returns jsonb language sql as $$
 select public.boh_finance(op,jsonb_build_object('actorId',actor,'commandId',gen_random_uuid())||p);
$$;
create function pg_temp.fails(query text,pattern text) returns void language plpgsql as $$
declare caught boolean:=false;
begin
 begin execute query; exception when others then
   if sqlerrm not ilike '%'||pattern||'%' then raise exception 'Wrong failure (% expected): %',pattern,sqlerrm; end if;
   caught=true;
 end;
 perform pg_temp.assert_true(caught,'reject: '||pattern);
end; $$;
do $$
<<upgrade>>
declare cash_count bigint; receipts numeric; expenses numeric; r jsonb; saved jsonb; command_id uuid:=gen_random_uuid();
 doc_id uuid:=gen_random_uuid(); journal_id uuid:=gen_random_uuid(); source_id uuid; second_id uuid; batch_id uuid;
 payroll jsonb; date_n text:=to_char(now() at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD');
begin
 select count(*) into cash_count from public.boh_records where kind in ('receipt','expense');
 select sum((payload->>'amount')::numeric) into receipts from public.boh_records where kind='receipt' and payload->>'month'='2026-08' and jsonb_typeof(payload->'amount')='number';
 perform pg_temp.assert_true(receipts=200295000,'August collections reconcile to 200295000 VND');
 select sum((payload->>'amount')::numeric) into expenses from public.boh_records where kind='expense' and payload->>'month' between '2026-01' and '2026-05' and jsonb_typeof(payload->'amount')='number';
 perform pg_temp.assert_true(expenses>0,'January–May expenses retained');
 perform pg_temp.assert_true(not has_table_privilege('authenticated','public.boh_fin_documents','SELECT'),'private financial documents deny browser DB role');
 perform pg_temp.assert_true(not has_function_privilege('authenticated','public.boh_finance(text,jsonb)','EXECUTE'),'accounting RPC denies browser DB role');
 perform pg_temp.fails($q$select public.boh_finance('fin_list','{"actorId":"qa-upgrade-ta"}')$q$,'insufficient');
 perform pg_temp.write_record('qa-class','class','{"classId":"qa-class","name":"Test class","weekdays":[0,3],"color":"#4466ee"}');
 perform pg_temp.write_record('qa-student','student','{"classId":"qa-class","name":"Synthetic student","status":"Active","enrollmentDate":"2026-08-20"}');
 perform pg_temp.assert_true(exists(select 1 from public.boh_records where kind='membership' and student_id='qa-student' and payload->>'from'='2026-08-20'),'backdated enrollment creates correct initial membership');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-overlap','membership','{"studentId":"qa-student","classId":"qa-class","from":"2026-09-01","until":"","schedule":"Regular"}')$q$,'overlapping');
 perform pg_temp.write_record('qa-class-two','class','{"classId":"qa-class-two","name":"Second test class","weekdays":[1,4],"color":"#123456"}');
 perform pg_temp.write_record('qa-member','membership','{"studentId":"qa-student","classId":"qa-class-two","from":"2026-08-20","until":"2026-08-31","schedule":"Regular"}');
 perform pg_temp.write_record('qa-member-next','membership','{"studentId":"qa-student","classId":"qa-class-two","from":"2026-09-01","until":"","schedule":"Regular"}');
 perform pg_temp.assert_true(exists(select 1 from public.boh_records where id='qa-member-next'),'adjacent memberships accepted');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-member','membership','{"studentId":"qa-student","classId":"qa-class","from":"2026-08-20","until":"2026-08-31","schedule":"Regular"}','qa-upgrade-director',1)$q$,'ownership');
 select id into source_id from public.boh_import_rows limit 1; -- no source mutation
 select jsonb_build_object('membershipId',id,'studentId','qa-student','classId','qa-class','date',date_n,'mark','A') into r from public.boh_records where kind='membership' and student_id='qa-student' and class_id='qa-class';
 perform pg_temp.write_record('qa-attendance','attendance',r,'qa-upgrade-ta');
 perform pg_temp.assert_true(exists(select 1 from public.boh_records where id='qa-attendance'),'TA with empty assigned list can mark new class');
 perform pg_temp.fails(format('select pg_temp.write_record(%L,%L,%L::jsonb,%L)','qa-duplicate','attendance',r::text,'qa-upgrade-ta'),'already exists');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-ta-class','class','{"name":"Not permitted"}','qa-upgrade-ta')$q$,'insufficient');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-ta-price','catalogue','{"label":"Not permitted","sessions":18,"price":1}','qa-upgrade-ta')$q$,'insufficient');
 r=jsonb_build_object('studentId','qa-student','classId','qa-class','absenceId','qa-attendance','date',date_n,'status','Completed');
 perform pg_temp.write_record('qa-makeup','makeup',r,'qa-upgrade-ta');
 perform pg_temp.fails(format('select pg_temp.write_record(%L,%L,%L::jsonb,%L)','qa-makeup-two','makeup',r::text,'qa-upgrade-ta'),'already exists');
 perform pg_temp.write_record('qa-support','support',jsonb_build_object('studentId','qa-student','classId','qa-class','date',date_n,'status','Completed'),'qa-upgrade-ta');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-package-missing','package','{"studentId":"qa-student","scope":"class","sessions":24,"startDate":"2026-09-12"}')$q$,'Choose a class');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-catalogue','catalogue','{"label":"Duplicate","sessions":24,"price":100,"active":true}')$q$,'active catalogue');
 insert into public.boh_records(id,kind,date,payload,updated_at) values('close:2026-07','close','','{"month":"2026-07","status":"Closed"}',now()::text) on conflict(id) do update set payload=excluded.payload;
 perform pg_temp.fails($q$select pg_temp.write_record('qa-closed-package','package','{"studentId":"qa-student","scope":"all","sessions":24,"startDate":"2026-07-20"}')$q$,'closed month');
 payroll='{"month":"2026-09","name":"Test employee","gross":1000,"deductions":100,"net":999999,"employerInsurance":0,"status":"Approved"}';
 perform pg_temp.fails(format('select pg_temp.write_record(%L,%L,%L::jsonb,%L)','qa-payroll','payroll',payroll::text,'qa-upgrade-finance'),'insufficient');
 r=pg_temp.write_record('qa-payroll','payroll',payroll);
 perform pg_temp.assert_true((r->'payload'->>'net')::numeric=900 and r->'payload'->>'approvedBy'='qa-upgrade-director','SQL recomputes payroll net and records approver');
 r=pg_temp.write_record('qa-payroll','payroll',payroll||'{"gross":1100}', 'qa-upgrade-finance',1);
 perform pg_temp.assert_true(r->'payload'->>'status'='Draft' and r->'payload'->>'approvedBy' is null,'payroll edits invalidate approval');
 r=pg_temp.write_record('qa-payroll','payroll',payroll,'qa-upgrade-director',2);
 perform pg_temp.write_record('qa-pay-one','expense','{"date":"2026-09-12","month":"2026-09","amount":400,"payrollId":"qa-payroll","description":"Salary","reconciled":true}','qa-upgrade-finance');
 perform pg_temp.write_record('qa-pay-two','expense','{"date":"2026-09-12","month":"2026-09","amount":500,"payrollId":"qa-payroll","description":"Salary","reconciled":true}','qa-upgrade-finance');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-pay-extra','expense','{"date":"2026-09-12","month":"2026-09","amount":1,"payrollId":"qa-payroll"}','qa-upgrade-finance')$q$,'exceed');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-pay-one','expense','{"date":"2026-09-12","month":"2026-09","amount":400,"payrollId":""}','qa-upgrade-finance',1)$q$,'detached');
 perform pg_temp.fails(format('select pg_temp.write_record(%L,%L,%L::jsonb,%L,3)','qa-payroll','payroll',(payroll||'{"gross":1200}')::text,'qa-upgrade-director'),'Paid payroll');
 -- Stage/retry commands without changing cash; duplicate views remain separate evidence.
 r=jsonb_build_object('source','MISA','dataset','Synthetic test','period','2026-09','view','Bank','fileName','test.csv','fileHash','test-sha',
 'rows',jsonb_build_array(jsonb_build_object('externalId','BR-TEST','date','2026-09-12','amount',1000,'name','Test','category','','direction','','reference','','raw',jsonb_build_object('Amount','1.000'))));
 saved=pg_temp.fin('fin_stage',jsonb_build_object('payload',r,'commandId',command_id));
 batch_id=(saved->>'batchId')::uuid;
 perform pg_temp.assert_true(pg_temp.fin('fin_stage',jsonb_build_object('payload',r,'commandId',command_id))=saved,'same command retries return same result');
 saved=pg_temp.fin('fin_stage',jsonb_build_object('payload',r));
 perform pg_temp.assert_true((saved->>'duplicate')::boolean,'same file is not staged twice');
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_stage',jsonb_build_object('payload',r||'{"period":"2026-08"}')::text),'different mapping or period');
 perform pg_temp.fin('fin_stage',jsonb_build_object('payload',r||'{"view":"Sales"}'));
 select x.id into source_id from public.boh_import_rows x where x.batch_id=upgrade.batch_id;
 select x.id into second_id from public.boh_import_rows x where x.batch_id<>upgrade.batch_id and x.external_id='BR-TEST';
 perform pg_temp.assert_true((select count(*) from public.boh_records where kind in ('receipt','expense'))=cash_count+2,'imports do not create any cash records');
 perform pg_temp.write_record('qa-cash','expense','{"date":"2026-09-12","month":"2026-09","amount":1000,"description":"Synthetic cash","reconciled":true}','qa-upgrade-finance');
 perform pg_temp.fin('fin_review',jsonb_build_object('id',source_id,'revision',1,'payload',jsonb_build_object('status','Matched','recordId','qa-cash','note','Test evidence')));
 perform pg_temp.fin('fin_review',jsonb_build_object('id',second_id,'revision',1,'payload',jsonb_build_object('status','Matched','recordId','qa-cash','note','Same transaction in overlapping source view')));
 perform pg_temp.assert_true((select count(*) from public.boh_import_rows where matched_record_id='qa-cash')=2,'overlapping source views may corroborate one cash entry');
 perform pg_temp.fails($q$select pg_temp.write_record('qa-cash','expense','{"date":"2026-09-12","month":"2026-09","amount":2000,"description":"Synthetic cash","reconciled":true}','qa-upgrade-finance',1)$q$,'linked');
 perform pg_temp.fin('fin_review',jsonb_build_object('id',source_id,'revision',2,'payload',jsonb_build_object('status','Needs confirmation','note','Recheck test')));
 perform pg_temp.assert_true(exists(select 1 from public.boh_import_rows where id=source_id and matched_record_id is null),'reopen source review clears match with history');
 -- Typed obligations remain separate, approve current versions only and settle existing cash.
 r=jsonb_build_object('kind','bill','date','2026-09-12','title','Synthetic bill','amount',1000,'lines','[]'::jsonb);
 saved=pg_temp.fin('fin_save',jsonb_build_object('id',doc_id,'payload',r));
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_save',jsonb_build_object('id',doc_id,'revision',99,'payload',r)::text),'Record changed');
 perform pg_temp.fin('fin_action',jsonb_build_object('id',doc_id,'revision',1,'payload','{"action":"submit"}'::jsonb));
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_action',jsonb_build_object('id',doc_id,'revision',2,'payload','{"action":"approve"}'::jsonb)::text),'insufficient');
 perform pg_temp.fin('fin_action',jsonb_build_object('id',doc_id,'revision',2,'payload','{"action":"approve"}'::jsonb),'qa-upgrade-director');
 saved=pg_temp.fin('fin_save',jsonb_build_object('id',doc_id,'revision',3,'payload',r||'{"notes":"Changed terms"}'));
 perform pg_temp.assert_true(saved->>'status'='Draft' and saved->>'approved_by' is null,'editing approved document removes approval');
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_action',jsonb_build_object('id',doc_id,'revision',4,'payload','{"action":"delete"}'::jsonb)::text),'not available');
 perform pg_temp.fin('fin_action',jsonb_build_object('id',doc_id,'revision',4,'payload','{"action":"submit"}'::jsonb));
 perform pg_temp.fin('fin_action',jsonb_build_object('id',doc_id,'revision',5,'payload','{"action":"approve"}'::jsonb),'qa-upgrade-director');
 perform pg_temp.fin('fin_settle',jsonb_build_object('id',doc_id,'revision',6,'payload','{"cashRecordId":"qa-cash","amount":400,"evidence":"Part one"}'::jsonb));
 perform pg_temp.fin('fin_settle',jsonb_build_object('id',doc_id,'revision',7,'payload','{"cashRecordId":"qa-cash","amount":600,"evidence":"Part two"}'::jsonb));
 perform pg_temp.assert_true((select sum(amount) from public.boh_fin_settlements where document_id=doc_id)=1000,'incremental matching settles once without a second expense');
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_settle',jsonb_build_object('id',doc_id,'revision',8,'payload','{"cashRecordId":"qa-cash","amount":1,"evidence":"Overpay"}'::jsonb)::text),'exceed');
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_save',jsonb_build_object('id',doc_id,'revision',8,'payload',r)::text),'Settled');
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb,%L)','fin_action',jsonb_build_object('id',doc_id,'revision',8,'payload','{"action":"post"}'::jsonb)::text,'qa-upgrade-director'),'Posting is locked');
 -- Balanced journals also require declared amount equality, and cannot silently post.
 r=jsonb_build_object('kind','journal','date','2026-09-12','title','Synthetic journal','amount',100,'lines','[{"account":"111","debit":200,"credit":0},{"account":"131","debit":0,"credit":200}]'::jsonb);
 perform pg_temp.fin('fin_save',jsonb_build_object('id',journal_id,'payload',r));
 perform pg_temp.fails(format('select pg_temp.fin(%L,%L::jsonb)','fin_action',jsonb_build_object('id',journal_id,'revision',1,'payload','{"action":"submit"}'::jsonb)::text),'Journal total');
 perform pg_temp.fails($q$select pg_temp.fin('fin_save',jsonb_build_object('id',gen_random_uuid(),'payload','{"kind":"bill","date":"2026-07-12","title":"Closed","amount":1}'::jsonb))$q$,'Month is closed');
 perform pg_temp.assert_true((select count(*) from public.boh_fin_journals)=0,'official accounting posting remains inactive');
 perform pg_temp.assert_true((pg_temp.fin('fin_list','{"tab":"documents","month":"1900-01"}')->>'total')::int=0,'document listing filters the selected month');
 perform pg_temp.assert_true((pg_temp.fin('fin_list','{"tab":"imports","month":"2026-09"}')->>'total')::int=2,'import listing follows source period');
 perform pg_temp.assert_true((select count(*) from public.boh_records where kind in ('receipt','expense'))=cash_count+3,'documents and settlements do not duplicate cash');
end;
$$;
rollback;

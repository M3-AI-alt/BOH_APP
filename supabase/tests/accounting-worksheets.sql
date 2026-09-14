-- Run against an isolated restored database. No production rows are changed.
\set ON_ERROR_STOP on
begin;
select position('accountingMode' in pg_get_functiondef('public.boh_finance(text,jsonb)'::regprocedure))=0 as needs_internal \gset
\if :needs_internal
\ir ../migrations/20260914045027_internal_accounting_only.sql
\endif
\ir ../migrations/20260914085241_accounting_worksheets.sql
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-worksheet-finance','qa-worksheet-finance','finance@worksheet.invalid','Worksheet finance','Finance'),
 ('qa-worksheet-director','qa-worksheet-director','director@worksheet.invalid','Worksheet director','Director'),
 ('qa-worksheet-ta','qa-worksheet-ta','ta@worksheet.invalid','Worksheet TA','TA');
insert into public.boh_records(id,kind,date,payload,updated_at) values ('qa-worksheet-close','close','2096-10-01','{"month":"2096-10","status":"Closed"}',now()::text);
set local role service_role;
do $$
declare args jsonb; source_args jsonb; result jsonb; first_id uuid; records_before bigint; docs_before bigint;
begin
 select count(*) into records_before from public.boh_records;
 select count(*) into docs_before from public.boh_fin_documents;
 args=jsonb_build_object('actorId','qa-worksheet-finance','kind','documents','rows',jsonb_build_array(jsonb_build_object('row',2,'key','QA-BILL-1','label','Test bill','payload',jsonb_build_object('kind','bill','date','2096-09-01','dueDate','','title','Test bill','counterparty','Test supplier','amount',1000,'notes','','lines','[]'::jsonb,'status','Posted','approved_by','forged'))));
 result=public.boh_finance('fin_worksheet_preview',args);
 if result->'rows'->0->>'status'<>'Ready' or (select count(*) from public.boh_fin_documents)<>docs_before then raise exception 'Preview wrote data or failed'; end if;
 -- A closed-period row is rejected while an unrelated valid row can save atomically.
 result=public.boh_finance('fin_worksheet_commit',jsonb_set(args,'{rows}',(args->'rows')||jsonb_build_array(jsonb_set(jsonb_set(args->'rows'->0,'{key}','"QA-CLOSED"'),'{payload,date}','"2096-10-01"'))));
 if result->>'saved'<>'1' then raise exception 'Save failed: %',result; end if;
 if result->>'failed'<>'1' or result->'rows'->1->>'error'<>'Month is closed.' then raise exception 'Closed period bypassed'; end if;
 first_id=(result->'rows'->0->>'id')::uuid;
 if not exists(select 1 from public.boh_fin_documents where id=first_id and status='Draft' and approved_by is null and revision=1) then raise exception 'Import bypassed approval'; end if;
 result=public.boh_finance('fin_worksheet_commit',args||'{"actorId":"qa-worksheet-director"}');
 if result->>'skipped'<>'1' or result->'rows'->0->>'id'<>first_id::text then raise exception 'Retry duplicated or cross-actor reference changed'; end if;
 -- A failed row has no stable reference reservation, so a corrected new draft succeeds.
 result=public.boh_finance('fin_worksheet_commit',jsonb_set(jsonb_set(args,'{rows,0,key}','"QA-CLOSED"'),'{rows,0,payload,date}','"2096-11-01"'));
 if result->>'saved'<>'1' then raise exception 'Retry after partial failure failed'; end if;
 perform public.boh_finance('fin_action',jsonb_build_object('actorId','qa-worksheet-finance','id',result->'rows'->0->>'id','revision',1,'commandId',gen_random_uuid(),'payload','{"action":"delete"}'::jsonb));
 result=public.boh_finance('fin_worksheet_commit',jsonb_set(args,'{rows,0,payload,amount}','1200'));
 if result->>'failed'<>'1' or (select amount from public.boh_fin_documents where id=first_id)<>1000 then raise exception 'Changed reference overwrote document'; end if;
 -- Even when an imported unused draft is deleted, its reference is not silently reused.
 perform public.boh_finance('fin_action',jsonb_build_object('actorId','qa-worksheet-finance','id',first_id,'revision',1,'commandId',gen_random_uuid(),'payload','{"action":"delete"}'::jsonb));
 result=public.boh_finance('fin_worksheet_commit',args);
 if result->>'skipped'<>'1' or exists(select 1 from public.boh_fin_documents where id=first_id) then raise exception 'Deleted draft was resurrected'; end if;
 -- Source evidence permits signed whole VND and never creates cash or documents.
 source_args=jsonb_build_object('actorId','qa-worksheet-finance','kind','source','metadata',jsonb_build_object('source','Spreadsheet','dataset','Worksheet QA','view','Bank evidence','period','2096-09','fileName','first.xlsx'),'rows',jsonb_build_array(jsonb_build_object('row',2,'key','QA-SRC-1','label','Evidence','payload',jsonb_build_object('externalId','QA-SRC-1','date','2096-09-01','amount',-1000,'name','Test','category','','direction','Out','reference','','raw','{}'::jsonb))));
 result=public.boh_finance('fin_worksheet_commit',source_args);
 if result->>'saved'<>'1' then raise exception 'Source save failed: %',result; end if;
 if (select raw->>'_bohWorksheetRow' from public.boh_import_rows where id=(result->'rows'->0->>'id')::uuid)<>'2' then raise exception 'Worksheet source row provenance lost'; end if;
 result=public.boh_finance('fin_worksheet_commit',jsonb_set(source_args,'{metadata,fileName}','"renamed.xlsx"'));
 if result->>'skipped'<>'1' then raise exception 'File rename duplicated evidence'; end if;
 begin
   perform public.boh_finance('fin_worksheet_commit',jsonb_set(source_args,'{metadata,source}','"MISA"'));
   raise exception 'Disallowed provider accepted';
 exception when raise_exception then if sqlerrm<>'Choose Bank, Spreadsheet or Top ID as the source.' then raise; end if; end;
 result=public.boh_finance('fin_worksheet_commit',jsonb_set(jsonb_set(args,'{rows,0,key}','"QA-JOURNAL"'),'{rows,0,payload,kind}','"journal"'));
 if result->>'failed'<>'1' then raise exception 'Unbalanced journal was imported'; end if;
 begin
   perform public.boh_finance('fin_worksheet_preview',args||'{"actorId":"qa-worksheet-ta"}');
   raise exception 'TA allowed';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.boh_records)<>records_before or (select count(*) from public.boh_fin_documents)<>docs_before then raise exception 'Cash or unrelated records changed'; end if;
 raise notice 'Worksheet drafts, evidence, retry protection, non-overwrite, deleted references and role safeguards passed';
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.boh_finance(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','boh_private.accounting_worksheet(text,jsonb)','EXECUTE') or has_table_privilege('authenticated','boh_private.accounting_worksheet_entries','SELECT') then raise exception 'Worksheet data exposed'; end if;
end $$;
rollback;

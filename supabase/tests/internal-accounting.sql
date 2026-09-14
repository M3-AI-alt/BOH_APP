-- Isolated database only; includes and rolls back the proposed migration.
\set ON_ERROR_STOP on
begin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-internal-director','qa-internal-director','director@internal.invalid','Test director','Director'),
 ('qa-internal-finance','qa-internal-finance','finance@internal.invalid','Test finance','Finance'),
 ('qa-internal-ta','qa-internal-ta','ta@internal.invalid','Test TA','TA');
insert into public.boh_import_batches(id,source,dataset,period,view_name,file_name,file_hash,normalization_hash,imported_by)
 values ('00000000-0000-4000-8000-000000009914','MISA','Legacy test','2026-09','Bank','legacy.csv','legacy-qa','legacy-qa','qa-internal-finance');
\ir ../migrations/20260914045027_internal_accounting_only.sql
set local role service_role;
do $$
declare payload jsonb; saved jsonb; result jsonb; source_name text; before_count bigint;
begin
 select count(*) into before_count from public.boh_records;
 foreach source_name in array array['Bank','Spreadsheet','Top ID'] loop
   payload=jsonb_build_object('source',source_name,'dataset','Internal test','period','2026-09','view','Review','fileName','source.csv','fileHash','qa-'||source_name,
     'rows',jsonb_build_array(jsonb_build_object('externalId','QA-1','date','2026-09-01','amount',1000,'name','Sample','category','','direction','','reference','','raw','{}'::jsonb)));
   saved=public.boh_finance('fin_stage',jsonb_build_object('actorId','qa-internal-finance','commandId',gen_random_uuid(),'payload',payload));
   result=public.boh_finance('fin_stage',jsonb_build_object('actorId','qa-internal-finance','commandId',gen_random_uuid(),'payload',payload));
   if result->>'batchId' is distinct from saved->>'batchId' or result->>'duplicate'<>'true' then raise exception 'Import retry duplicated records'; end if;
 end loop;
 begin
   perform public.boh_finance('fin_stage',jsonb_build_object('actorId','qa-internal-finance','commandId',gen_random_uuid(),'payload',payload||'{"source":"MISA"}'));
   raise exception 'Vendor import unexpectedly allowed';
 exception when raise_exception then
   if sqlerrm<>'Choose a bank file or spreadsheet for internal review.' then raise; end if;
 end;
 begin
   insert into public.boh_import_batches(source,dataset,period,view_name,file_name,file_hash,normalization_hash,imported_by)
     values('MISA','Direct test','2026-09','Bank','direct.csv','direct','direct','qa-internal-finance');
   raise exception 'Direct vendor import unexpectedly allowed';
 exception when raise_exception then
   if sqlerrm<>'Choose a bank file or spreadsheet for internal review.' then raise; end if;
 end;
 begin
   update public.boh_import_batches set source='Spreadsheet' where id='00000000-0000-4000-8000-000000009914';
   raise exception 'Legacy provenance unexpectedly relabelled';
 exception when raise_exception then
   if sqlerrm<>'Historical import sources cannot be relabelled.' then raise; end if;
 end;
 if not exists(select 1 from public.boh_import_batches where id='00000000-0000-4000-8000-000000009914' and source='MISA') then raise exception 'Legacy evidence lost'; end if;
 result=public.boh_finance('fin_list','{"actorId":"qa-internal-director"}');
 if result ? 'misa' or result->>'accountingMode' is distinct from 'internal' then raise exception 'Connection metadata remains'; end if;
 perform public.boh_finance('fin_list','{"actorId":"qa-internal-finance"}');
 begin
   perform public.boh_finance('fin_list','{"actorId":"qa-internal-ta"}');
   raise exception 'TA unexpectedly allowed';
 exception when insufficient_privilege then null; end;
 if (select count(*) from public.boh_records)<>before_count then raise exception 'Cash or operational records changed'; end if;
 raise notice 'Internal-only imports, retries, preserved evidence, role checks and unchanged cash passed';
end $$;
reset role;
do $$begin
 if has_function_privilege('anon','public.boh_finance(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.boh_finance(text,jsonb)','EXECUTE') then raise exception 'Public RPC access'; end if;
 if has_table_privilege('authenticated','public.boh_import_batches','SELECT') then raise exception 'Public evidence access'; end if;
end $$;
rollback;

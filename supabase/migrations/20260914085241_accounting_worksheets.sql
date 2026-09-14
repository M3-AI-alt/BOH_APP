-- Stable worksheet references are private import provenance, not a second ledger.
create table boh_private.accounting_worksheet_entries (
 kind text not null check(kind in ('source','documents')), scope text not null,
 entry_key text not null, request_payload jsonb not null, target_id uuid not null,
 created_by text not null, created_at timestamptz not null default now(),
 primary key(kind,scope,entry_key)
);
alter table boh_private.accounting_worksheet_entries enable row level security;
revoke all on boh_private.accounting_worksheet_entries from public,anon,authenticated;
grant select,insert on boh_private.accounting_worksheet_entries to service_role;

create function boh_private.accounting_worksheet(operation text,args jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 member public.boh_staff; prior boh_private.accounting_worksheet_entries;
 k text:=args->>'kind'; m jsonb:=coalesce(args->'metadata','{}'); item jsonb; p jsonb;
 scope_value text:='documents'; key_value text; request_value jsonb; target uuid;
 result jsonb; results jsonb:='[]'; row_result jsonb; normalized jsonb; rows jsonb:=args->'rows';
 saved_n integer:=0; skipped_n integer:=0; failed_n integer:=0; is_commit boolean:=operation='fin_worksheet_commit';
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 if operation not in ('fin_worksheet_preview','fin_worksheet_commit') then raise exception 'Unsupported worksheet operation.'; end if;
 if is_commit then perform pg_advisory_xact_lock(683920261); end if;
 select * into member from public.boh_staff where user_id=args->>'actorId' and active and role in ('Director','Finance') for share;
 if member.id is null then raise insufficient_privilege; end if;
 if k is null or k not in ('source','documents') then raise exception 'Choose an accounting worksheet.'; end if;
 if jsonb_typeof(rows) is distinct from 'array' or jsonb_array_length(rows) not between 1 and 200 then raise exception 'Use up to 200 rows per import.'; end if;
 if k='source' then
   if coalesce(m->>'source','') not in ('Bank','Spreadsheet','Top ID') then raise exception 'Choose Bank, Spreadsheet or Top ID as the source.'; end if;
   if coalesce(m->>'period','') !~ '^\d{4}-(0[1-9]|1[0-2])$' or length(trim(coalesce(m->>'dataset',''))) not between 1 and 200 or length(trim(coalesce(m->>'view',''))) not between 1 and 160 or length(trim(coalesce(m->>'fileName',''))) not between 1 and 250 then raise exception 'Check the source details.'; end if;
   m=jsonb_build_object('source',m->>'source','dataset',trim(m->>'dataset'),'view',trim(m->>'view'),'period',m->>'period','fileName',m->>'fileName');
   scope_value=jsonb_build_array(m->>'source',m->>'dataset',m->>'view')::text;
 end if;
 if exists(select 1 from jsonb_array_elements(rows) r group by r->>'key' having count(*)>1) then raise exception 'Duplicate entry reference in this worksheet.'; end if;
 for item in select value from jsonb_array_elements(rows) loop
   row_result=jsonb_build_object('row',item->'row','key',item->>'key','label',item->>'label');
   begin
     key_value=item->>'key'; p=item->'payload';
     if coalesce(key_value,'') !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$' then raise exception 'Check the entry reference.'; end if;
     if jsonb_typeof(p) is distinct from 'object' or coalesce(p->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'date')::date,'YYYY-MM-DD')<>p->>'date' then raise exception 'Check the document dates.'; end if;
     if jsonb_typeof(p->'amount') is distinct from 'number' or abs((p->>'amount')::numeric)>1000000000000 or trunc((p->>'amount')::numeric)<>(p->>'amount')::numeric then raise exception 'Enter an amount in whole VND.'; end if;
     if k='documents' then
       if coalesce(p->>'kind','') not in ('bill','payroll','refund','journal') or (p->>'amount')::numeric<0 or length(trim(coalesce(p->>'title',''))) not between 1 and 250 or length(coalesce(p->>'counterparty',''))>250 or length(coalesce(p->>'notes',''))>5000 then raise exception 'Check the document details.'; end if;
       if coalesce(p->>'dueDate','')<>'' and (p->>'dueDate' !~ '^\d{4}-\d{2}-\d{2}$' or to_char((p->>'dueDate')::date,'YYYY-MM-DD')<>p->>'dueDate') then raise exception 'Check the document dates.'; end if;
       if jsonb_typeof(p->'lines') is distinct from 'array' then raise exception 'Check journal lines.'; end if;
       if p->>'kind'='journal' or jsonb_array_length(p->'lines')>0 then
         if boh_private.assert_journal(p->'lines')<>(p->>'amount')::numeric then raise exception 'Journal total must equal the document amount.'; end if;
       end if;
       -- Discard fields that might otherwise imply approval, posting or payment.
       normalized=jsonb_build_object('kind',p->>'kind','date',p->>'date','title',trim(p->>'title'),'counterparty',coalesce(p->>'counterparty',''),'amount',p->'amount','dueDate',coalesce(p->>'dueDate',''),'notes',coalesce(p->>'notes',''),'lines',p->'lines');
     else
       if p->>'externalId' is distinct from key_value or length(coalesce(p->>'name',''))>300 or length(coalesce(p->>'category',''))>200 or length(coalesce(p->>'direction',''))>100 or length(coalesce(p->>'reference',''))>1000 or jsonb_typeof(p->'raw') is distinct from 'object' then raise exception 'Check the source row.'; end if;
       normalized=jsonb_build_object('externalId',key_value,'date',p->>'date','amount',p->'amount','name',coalesce(p->>'name',''),'category',coalesce(p->>'category',''),'direction',coalesce(p->>'direction',''),'reference',coalesce(p->>'reference',''),'raw',p->'raw');
     end if;
     request_value=jsonb_build_object('payload',normalized,'metadata',case when k='source' then m-'fileName' else '{}'::jsonb end);
     select * into prior from boh_private.accounting_worksheet_entries e where e.kind=k and e.scope=scope_value and e.entry_key=key_value;
     if prior.entry_key is not null then
       if prior.request_payload<>request_value then raise exception 'This reference already exists with different data. Edit the existing record; imports never overwrite it.'; end if;
       row_result=row_result||jsonb_build_object('status','Already imported','id',prior.target_id);
       skipped_n=skipped_n+1;
     else
       if k='documents' and exists(select 1 from public.boh_records c where c.kind='close' and c.payload->>'status'='Closed' and c.payload->>'month'=left(p->>'date',7)) then raise exception 'Month is closed.'; end if;
       if k='source' and exists(select 1 from public.boh_import_rows r join public.boh_import_batches b on b.id=r.batch_id where r.external_id=key_value and b.source=m->>'source' and b.dataset=m->>'dataset' and b.view_name=m->>'view') then raise exception 'This source reference is already in import review. Review the existing row.'; end if;
       if is_commit then
         if k='documents' then
           target=gen_random_uuid();
           result=public.boh_finance('fin_save',jsonb_build_object('actorId',member.user_id,'commandId',gen_random_uuid(),'id',target,'revision',null,'payload',normalized));
         else
           result=public.boh_finance('fin_stage',jsonb_build_object('actorId',member.user_id,'commandId',gen_random_uuid(),'payload',m||jsonb_build_object('fileHash','worksheet:'||md5(scope_value||':'||key_value),'rows',jsonb_build_array(jsonb_set(normalized,'{raw,_bohWorksheetRow}',coalesce(item->'row','2'::jsonb))))));
           select id into target from public.boh_import_rows where batch_id=(result->>'batchId')::uuid and row_number=1;
         end if;
         insert into boh_private.accounting_worksheet_entries(kind,scope,entry_key,request_payload,target_id,created_by) values(k,scope_value,key_value,request_value,target,member.user_id);
         row_result=row_result||jsonb_build_object('status','Saved','id',target);
         saved_n=saved_n+1;
       else row_result=row_result||jsonb_build_object('status','Ready'); end if;
     end if;
   exception when others then
     -- A failed row rolls back its document, evidence and reference together.
     if sqlstate='42501' then raise; end if;
     row_result=row_result||jsonb_build_object('status',case when is_commit then 'Failed' else 'Needs correction' end,'error',case when sqlstate='P0001' then sqlerrm when sqlstate in ('22007','22008') then 'Check the document dates.' else 'Could not save this row. Review it and retry.' end);
     failed_n=failed_n+1;
   end;
   results=results||jsonb_build_array(row_result);
 end loop;
 return jsonb_build_object('rows',results,'saved',saved_n,'skipped',skipped_n,'failed',failed_n);
end $$;
revoke all on function boh_private.accounting_worksheet(text,jsonb) from public,anon,authenticated;
grant execute on function boh_private.accounting_worksheet(text,jsonb) to service_role;

-- Keep the current finance implementation and safeguards; add a dedicated entry branch.
do $$
declare definition text; marker text:=' if operation=''fin_list'' then';
begin
 select pg_get_functiondef('public.boh_finance(text,jsonb)'::regprocedure) into definition;
 if position(marker in definition)=0 then raise exception 'Finance dispatcher changed; review the worksheet migration.'; end if;
 definition=replace(definition,marker,' if operation in (''fin_worksheet_preview'',''fin_worksheet_commit'') then return boh_private.accounting_worksheet(operation,args); end if;'||E'\n'||marker);
 execute definition;
end $$;

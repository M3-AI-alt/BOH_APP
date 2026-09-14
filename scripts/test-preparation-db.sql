-- Run in an isolated test database with the BOH core and preparation migrations.
begin;
insert into public.boh_staff(id,user_id,email,name,role,active) values
 ('prep-test-director','prep-director','prep-director@example.invalid','Test Director','Director',true),
 ('prep-test-finance','prep-finance','prep-finance@example.invalid','Test Finance','Finance',true),
 ('prep-test-ta','prep-ta','prep-ta@example.invalid','Test TA','TA',true),
 ('prep-test-inactive','prep-inactive','prep-inactive@example.invalid','Inactive Finance','Finance',false);
set local role service_role;
do $$declare result jsonb; args jsonb;
begin
 args=jsonb_build_object('actorId','prep-finance','digest',repeat('a',64),'fileHash',repeat('b',64),'fileName','test.xlsx','payload',jsonb_build_object('financialChanges',0,'rows','[]'::jsonb,'counts','{}'::jsonb));
 result=public.boh_preparation('prep_stage',args);
 if not (result->>'saved')::boolean then raise exception 'Save failed'; end if;
 result=public.boh_preparation('prep_stage',args);
 if not (result->>'reused')::boolean then raise exception 'Retry duplicated review'; end if;
 if (select count(*) from public.boh_preparation_reviews where digest=repeat('a',64))<>1 then raise exception 'Duplicate rows'; end if;
 result=public.boh_preparation('prep_retry',args);
 if result->'payload' is distinct from args->'payload' then raise exception 'Retry did not recover original evidence'; end if;
 result=public.boh_preparation('prep_retry',args||jsonb_build_object('fileHash',repeat('c',64)));
 if result is not null then raise exception 'Different file recovered original batch'; end if;
 result=public.boh_preparation('prep_list','{"actorId":"prep-director"}');
 if (result->>'total')::integer<1 then raise exception 'Director lacks finance access'; end if;
 begin perform public.boh_preparation('prep_list','{"actorId":"prep-ta"}');raise exception 'TA unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.boh_preparation('prep_stage',args||'{"actorId":"prep-inactive"}');raise exception 'Inactive unexpectedly allowed';exception when insufficient_privilege then null;end;
 begin perform public.boh_preparation('post',args);raise exception 'Post unexpectedly allowed';exception when raise_exception then if sqlerrm='Post unexpectedly allowed' then raise; end if;end;
 begin perform public.boh_preparation('prep_stage',jsonb_set(args,'{payload,financialChanges}','1'));raise exception 'Mutation unexpectedly allowed';exception when serialization_failure then null;end;
 begin update public.boh_preparation_reviews set file_name='changed';raise exception 'Update unexpectedly allowed';exception when insufficient_privilege then null;end;
 raise notice 'Preparation database role, retry, immutable-evidence and no-post checks passed';
end $$;
reset role;
do $$begin
 if has_table_privilege('service_role','public.boh_preparation_reviews','UPDATE') or has_table_privilege('service_role','public.boh_preparation_reviews','DELETE') or has_table_privilege('service_role','public.boh_preparation_reviews','TRUNCATE') then raise exception 'Evidence is mutable';end if;
 if has_table_privilege('anon','public.boh_preparation_reviews','SELECT') or has_table_privilege('authenticated','public.boh_preparation_reviews','SELECT') then raise exception 'Public table access unexpectedly allowed';end if;
 if has_function_privilege('anon','public.boh_preparation(text,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.boh_preparation(text,jsonb)','EXECUTE') then raise exception 'Public RPC access unexpectedly allowed';end if;
end $$;
rollback;

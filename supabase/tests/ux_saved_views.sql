-- Synthetic fixtures only. Run against the isolated restored QA database.
\set ON_ERROR_STOP on
begin;
insert into public.boh_staff(id,user_id,email,name,role) values
 ('qa-ux-dir','qa-ux-dir','ux-director@example.invalid','UX director','Director'),
 ('qa-ux-fin','qa-ux-fin','ux-finance@example.invalid','UX finance','Finance'),
 ('qa-ux-ta','qa-ux-ta','ux-ta@example.invalid','UX TA','TA');
set local role service_role;
create function pg_temp.ok(value boolean,label text) returns void language plpgsql as $$begin if value is distinct from true then raise exception 'FAIL %',label; end if; raise notice 'PASS %',label; end$$;
create function pg_temp.reject(query text) returns void language plpgsql as $$declare caught boolean=false; begin begin execute query; exception when others then caught=true; end; perform pg_temp.ok(caught,'rejected unsafe operation'); end$$;
do $$
declare args jsonb; saved jsonb; id uuid=gen_random_uuid();
begin
 args=jsonb_build_object('actorId','qa-ux-dir','id',id,'module','receipts','name','Unmatched cash','roles','[]'::jsonb,'spec','{"query":"","facets":{"reconciliation":["unmatched"]},"columns":["amount"]}'::jsonb);
 saved=public.boh_saved_view('view_save',args);
 perform pg_temp.ok(public.boh_saved_view('view_save',args)=saved,'identical save retry returns original');
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-ux-fin","module":"receipts"}'))=0,'private view hidden');
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_save',args||'{"actorId":"qa-ux-fin","revision":1}'));
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_save',args||'{"revision":99,"name":"Changed"}'));
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_delete',args||'{"revision":99}'));
 args=args||'{"revision":1,"roles":["Finance"]}';
 saved=public.boh_saved_view('view_save',args);
 perform pg_temp.ok((saved->>'revision')::int=2,'share update increments revision');
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-ux-fin","module":"receipts"}'))=1,'shared view visible to allowed finance role');
 perform pg_temp.reject('select public.boh_saved_view(''view_list'',''{"actorId":"qa-ux-ta","module":"receipts"}'')');
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_save',args||jsonb_build_object('id',gen_random_uuid(),'actorId','qa-ux-fin','revision',null)));
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_save',jsonb_set(args,'{spec,columns}','[null]')));
 update public.boh_staff set active=false where user_id='qa-ux-dir';
 perform pg_temp.ok(jsonb_array_length(public.boh_saved_view('view_list','{"actorId":"qa-ux-fin","module":"receipts"}'))=0,'suspended owner shared views hidden');
 perform pg_temp.reject(format('select public.boh_saved_view(%L,%L)','view_save',args));
end$$;
reset role;
select pg_temp.ok(not has_table_privilege('anon','public.boh_saved_views','SELECT,INSERT,UPDATE,DELETE'),'anonymous table access denied');
select pg_temp.ok(not has_function_privilege('anon','public.boh_saved_view(text,jsonb)','EXECUTE'),'anonymous function access denied');
select pg_temp.ok(not has_table_privilege('authenticated','public.boh_saved_views','SELECT,INSERT,UPDATE,DELETE'),'authenticated direct table access denied');
select pg_temp.ok(not has_function_privilege('authenticated','public.boh_saved_view(text,jsonb)','EXECUTE'),'authenticated direct function access denied');
rollback;

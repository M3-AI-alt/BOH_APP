-- These fixtures and every test mutation are rolled back. No real record changes.
begin;
insert into public.boh_staff(id,user_id,email,name,role,class_ids,active) values
 ('sql-verification-director','sql-verification-director','sql-owner@example.test','SQL test','Director','[]',true),
 ('sql-verification-ta','sql-verification-ta','sql-ta@example.test','SQL TA','TA','["sql-class"]',true);
set local role service_role;
do $$
declare result jsonb;
begin
 result=public.boh_store('commit_record','{"actorId":"sql-verification-director","expectedRevision":null,"record":{"id":"sql-test-lead","kind":"lead","payload":{"name":"Synthetic","status":"New"}}}');
 if result->>'revision'<>'1' then raise exception 'Insert revision failed'; end if;
 begin
   perform public.boh_store('commit_record','{"actorId":"sql-verification-director","expectedRevision":0,"record":{"id":"sql-test-lead","kind":"lead","payload":{}}}');
   raise exception 'Conflict was not rejected';
 exception when serialization_failure then null; end;
 begin
   perform public.boh_store('commit_record','{"actorId":"sql-verification-ta","expectedRevision":null,"record":{"id":"sql-test-expense","kind":"expense","payload":{}}}');
   raise exception 'TA finance access was not rejected';
 exception when insufficient_privilege then null; end;
 begin
   perform public.boh_store('commit_record','{"actorId":"sql-verification-ta","expectedRevision":null,"record":{"id":"sql-test-attendance","kind":"attendance","classId":"different-class","payload":{}}}');
   raise exception 'TA other-class access was not rejected';
 exception when insufficient_privilege then null; end;
 if not exists(select 1 from public.boh_activity where record_id='sql-test-lead') then raise exception 'Audit missing'; end if;
end $$;
set local role anon;
do $$ begin
 begin perform public.boh_store('list_records','{}');raise exception 'Anonymous RPC access was not rejected';exception when insufficient_privilege then null;end;
 begin perform 1 from public.boh_records limit 1;raise exception 'Anonymous table access was not rejected';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: transaction, revision conflict, audit, TA class restrictions and anonymous denial' as verification;

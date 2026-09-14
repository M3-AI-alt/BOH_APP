-- BOH is an internal accounting workspace. Keep historical source evidence,
-- but do not accept new vendor-specific migration batches or advertise a connector.
create function boh_private.guard_internal_import_source()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
   if new.source is distinct from old.source then
     raise exception 'Historical import sources cannot be relabelled.';
   end if;
 elsif new.source not in ('Bank','Spreadsheet','Top ID') then
   raise exception 'Choose a bank file or spreadsheet for internal review.';
 end if;
 return new;
end; $$;
revoke all on function boh_private.guard_internal_import_source() from public,anon,authenticated;
grant execute on function boh_private.guard_internal_import_source() to service_role;
create trigger boh_internal_import_source_guard
 before insert or update of source on public.boh_import_batches
 for each row execute function boh_private.guard_internal_import_source();

-- Patch only the old connection-status field and source-entry guard. Preserve
-- subsequent history fixes, payment rules, approvals, posting gates and grants.
do $migration$
declare
 definition text:=pg_get_functiondef('public.boh_finance(text,jsonb)'::regprocedure);
 old_status text:=$find$'misa',jsonb_build_object('connected',false,'officialActivation',false,'state','Registration and reconciled opening balances required')$find$;
 new_status text:=$replace$'accountingMode','internal'$replace$;
 old_stage text:=$find$if operation='fin_stage' then$find$;
 new_stage text:=$replace$if operation='fin_stage' then
   if coalesce(p->>'source','') not in ('Bank','Spreadsheet','Top ID') then
     raise exception 'Choose a bank file or spreadsheet for internal review.';
   end if;$replace$;
begin
 if position(old_status in definition)=0 or position(old_stage in definition)=0 then
   raise exception 'Review the current finance function before applying the internal-only change.';
 end if;
 definition=replace(definition,old_status,new_status);
 definition=replace(definition,old_stage,new_stage);
 execute definition;
end $migration$;

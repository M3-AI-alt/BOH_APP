-- Prospective receiving-account policy. Existing cash/source records are not rewritten.
-- Mirrors lib/receipt-accounts.ts; no personal/unknown account is selectable for new receipts.
create function boh_private.guard_company_receiving_account() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if new.kind <> 'receipt' then return new; end if;
  if new.payload->>'account' in ('Company BIDV','Company VCB') then return new; end if;
  if tg_op='UPDATE' and old.kind='receipt'
    and new.payload->>'account' is not distinct from old.payload->>'account'
    and new.payload->'amount' is not distinct from old.payload->'amount'
    and new.payload->>'date' is not distinct from old.payload->>'date'
    and new.date is not distinct from old.date then
    return new;
  end if;
  raise exception 'Choose Company BIDV or Company VCB. Personal accounts cannot receive new payments.' using errcode='23514';
end $$;
revoke all on function boh_private.guard_company_receiving_account() from public,anon,authenticated;
grant execute on function boh_private.guard_company_receiving_account() to service_role;
-- AFTER is intentional: commit_record uses INSERT ... ON CONFLICT DO UPDATE.
-- Check the actual operation, not its speculative INSERT. A rejection rolls
-- back the entire statement/command, including activity and draft consumption.
create trigger boh_company_receiving_account after insert or update on public.boh_records
for each row execute function boh_private.guard_company_receiving_account();

-- A Director inherits Finance-shared views, but not another person's private views.
-- Retain active-owner, module, ownership, validation and revision checks unchanged.
do $migration$
declare definition text:=pg_get_functiondef('public.boh_saved_view(text,jsonb)'::regprocedure);
  old_sql text:='member.role=any(v.roles) and exists';
  new_sql text:='(member.role=any(v.roles) or (member.role=''Director'' and ''Finance''=any(v.roles))) and exists';
begin
  if position(old_sql in definition)>0 then execute replace(definition,old_sql,new_sql);
  elsif position(new_sql in definition)=0 then raise exception 'Review the saved-view visibility function before migration.';
  end if;
end $migration$;

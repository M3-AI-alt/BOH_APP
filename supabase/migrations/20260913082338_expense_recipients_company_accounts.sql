-- Separate the company cash source from the recipient's bank details.
-- Additive, prospective policy: historical cash rows and balances are untouched.
create function boh_private.guard_expense_accounts() returns trigger
language plpgsql security invoker set search_path='' as $$
declare k text; v jsonb;
begin
  if new.kind <> 'expense' then return new; end if;
  if new.payload->>'account' not in ('Company BIDV','Company VCB')
     or coalesce(new.payload->>'account','')='' then
    if not (tg_op='UPDATE' and old.kind='expense'
      and new.payload->>'account' is not distinct from old.payload->>'account'
      and new.payload->'amount' is not distinct from old.payload->'amount'
      and new.payload->>'date' is not distinct from old.payload->>'date'
      and new.date is not distinct from old.date) then
      raise exception 'Choose Company BIDV or Company VCB as the paying account. Enter personal bank details under Recipient details.' using errcode='23514';
    end if;
  end if;
  foreach k in array array['name','recipientBank','recipientAccount'] loop
    v=new.payload->k;
    if v is not null and v <> 'null'::jsonb and
       (jsonb_typeof(v)<>'string' or length(new.payload->>k)>case when k='name' then 160 else 100 end
        or (new.payload->>k) ~ '[[:cntrl:]]') then
      raise exception 'Recipient details must be text within the permitted length.' using errcode='23514';
    end if;
  end loop;
  if (trim(coalesce(new.payload->>'recipientBank',''))<>'' or trim(coalesce(new.payload->>'recipientAccount',''))<>'')
    and trim(coalesce(new.payload->>'name',''))='' then
    raise exception 'Enter the recipient or account holder name.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function boh_private.guard_expense_accounts() from public,anon,authenticated;
grant execute on function boh_private.guard_expense_accounts() to service_role;
-- AFTER checks the actual insert/update of an upsert, not its speculative insert.
create trigger boh_expense_accounts after insert or update on public.boh_records
for each row execute function boh_private.guard_expense_accounts();

-- Carry recipient details into the one cash entry created by an approved-bill
-- payment. Keep raw JSON types so the trigger rejects numeric account numbers.
-- Existing command retries, approval, balance and transaction locks are unchanged.
do $migration$
declare definition text:=pg_get_functiondef('public.boh_finance_workspace(text,jsonb)'::regprocedure);
  original text:='''name'','''',''notes'','''',''documentId'',doc.id';
  replacement text:='''name'',coalesce(p->''name'',''""''::jsonb),''recipientBank'',coalesce(p->''recipientBank'',''""''::jsonb),''recipientAccount'',coalesce(p->''recipientAccount'',''""''::jsonb),''notes'','''',''documentId'',doc.id';
begin
  if position(original in definition)=0 then raise exception 'Review the bill payment function before migration.'; end if;
  execute replace(definition,original,replacement);
end $migration$;

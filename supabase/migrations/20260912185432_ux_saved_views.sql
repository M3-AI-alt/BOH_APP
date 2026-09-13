create table public.boh_saved_views (
 id uuid primary key,
 owner_id text not null references public.boh_staff(user_id),
 module text not null check(module in ('receipts','expenses','leads','attendance','students','payroll','tasks')),
 name text not null check(length(trim(name)) between 1 and 80),
 roles text[] not null default '{}' check(roles <@ array['Director','Finance','TA']::text[]),
 spec jsonb not null check(jsonb_typeof(spec)='object' and octet_length(spec::text)<=20000),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create index boh_saved_views_owner_module on public.boh_saved_views(owner_id,module);
alter table public.boh_saved_views enable row level security;
revoke all on public.boh_saved_views from public,anon,authenticated;
grant select,insert,update,delete on public.boh_saved_views to service_role;

create function public.boh_saved_view(operation text,args jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare member public.boh_staff; old public.boh_saved_views; result jsonb;
 module_n text:=args->>'module'; roles_n text[]; key_n text; vals jsonb; allowed_keys text[]; allowed_columns text[];
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 perform pg_advisory_xact_lock(683920261);
 select * into member from public.boh_staff where user_id=args->>'actorId' and active for share;
 if member.id is null or module_n is null or module_n not in ('receipts','expenses','leads','attendance','students','payroll','tasks')
   or member.role not in ('Director','Finance','TA') or (member.role='Finance' and module_n='leads')
   or (member.role='TA' and module_n<>'attendance') then raise insufficient_privilege; end if;
 if operation='view_list' then
   select coalesce(jsonb_agg(to_jsonb(v) order by v.name,v.id),'[]') into result from public.boh_saved_views v
     where v.module=module_n and (v.owner_id=member.user_id or (member.role=any(v.roles) and exists(select 1 from public.boh_staff owner where owner.user_id=v.owner_id and owner.active and owner.role='Director')));
   return result;
 end if;
 select * into old from public.boh_saved_views where id=(args->>'id')::uuid for update;
 if old.id is not null and (old.owner_id<>member.user_id or old.module<>module_n) then raise insufficient_privilege; end if;
 if operation='view_delete' then
   if old.id is null then return jsonb_build_object('deleted',true); end if;
   if old.revision is distinct from (args->>'revision')::integer then raise exception 'Saved view changed. Refresh and try again.' using errcode='40001'; end if;
   delete from public.boh_saved_views where id=old.id; return jsonb_build_object('deleted',true);
 end if;
 if operation<>'view_save' then raise exception 'Unsupported saved view action.'; end if;
 if jsonb_typeof(args->'roles') is distinct from 'array' or jsonb_typeof(args->'spec') is distinct from 'object' or octet_length((args->'spec')::text)>20000 then raise exception 'Check the saved view.'; end if;
 select coalesce(array_agg(value),'{}') into roles_n from jsonb_array_elements_text(args->'roles');
 if cardinality(roles_n)>3 or not roles_n <@ array['Director','Finance','TA']::text[]
   or (cardinality(roles_n)>0 and member.role<>'Director')
   or ('TA'=any(roles_n) and module_n<>'attendance')
   or ('Finance'=any(roles_n) and module_n='leads') then raise insufficient_privilege; end if;
 allowed_keys=case module_n when 'receipts' then array['account','purpose','reconciliation','allocation','classId'] when 'expenses' then array['account','category','reconciliation'] when 'leads' then array['status','classId','followUp'] when 'attendance' then array['mark','date'] when 'students' then array['status','coverage'] when 'payroll' then array['status','name'] else array['status','category','assignedTo'] end;
 allowed_columns=case module_n when 'receipts' then array['date','payer','purpose','amount','account','allocation'] when 'expenses' then array['date','category','description','amount','account','reconciliation'] when 'leads' then array['name','contact','class','stage','followUp','notes'] else array[]::text[] end;
 if jsonb_typeof(args->'spec'->'query') is distinct from 'string' or length(args->'spec'->>'query')>200 or jsonb_typeof(args->'spec'->'facets') is distinct from 'object' or jsonb_typeof(args->'spec'->'columns') is distinct from 'array' then raise exception 'Check the saved view.'; end if;
 for key_n,vals in select * from jsonb_each(args->'spec'->'facets') loop
   if not key_n=any(allowed_keys) or jsonb_typeof(vals)<>'array' then raise exception 'Check the saved view.'; end if;
   if jsonb_array_length(vals)>50 or exists(select 1 from jsonb_array_elements(vals) v where jsonb_typeof(v)<>'string' or length(v#>>'{}')>200) then raise exception 'Check the saved view.'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(args->'spec'->'columns') c where jsonb_typeof(c)<>'string' or not (c#>>'{}')=any(allowed_columns)) then raise exception 'Check the saved view.'; end if;
 if old.id is not null and old.name=args->>'name' and old.roles=roles_n and old.spec=args->'spec' then return to_jsonb(old); end if;
 if (old.id is not null and old.revision is distinct from (args->>'revision')::integer) or (old.id is null and args->>'revision' is not null) then raise exception 'Saved view changed. Refresh and try again.' using errcode='40001'; end if;
 if old.id is null and (select count(*) from public.boh_saved_views where owner_id=member.user_id)>=100 then raise exception 'Remove an unused saved view first.'; end if;
 insert into public.boh_saved_views(id,owner_id,module,name,roles,spec) values((args->>'id')::uuid,member.user_id,module_n,args->>'name',roles_n,args->'spec')
 on conflict(id) do update set name=excluded.name,roles=excluded.roles,spec=excluded.spec,revision=boh_saved_views.revision+1,updated_at=now()
 returning to_jsonb(boh_saved_views) into result;
 return result;
end $$;
revoke all on function public.boh_saved_view(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_saved_view(text,jsonb) to service_role;

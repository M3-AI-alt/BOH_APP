-- Immutable preparation evidence, deliberately separate from live ledgers.
create table public.boh_preparation_reviews (
 id uuid primary key default gen_random_uuid(),
 digest text not null unique check(digest ~ '^[a-f0-9]{64}$'),
 file_hash text not null check(file_hash ~ '^[a-f0-9]{64}$'),
 file_name text not null check(length(file_name) between 1 and 250),
 owner_id text not null references public.boh_staff(user_id),
 created_at timestamptz not null default now(),
 payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=4000000),
 check((payload->>'financialChanges') is not distinct from '0'),
 check(jsonb_typeof(payload->'rows') is not distinct from 'array' and jsonb_array_length(payload->'rows')<=2000)
);
create index boh_preparation_reviews_owner on public.boh_preparation_reviews(owner_id,created_at desc);
create index boh_preparation_reviews_created on public.boh_preparation_reviews(created_at desc,id);
alter table public.boh_preparation_reviews enable row level security;
revoke all on public.boh_preparation_reviews from public,anon,authenticated,service_role;
grant select,insert on public.boh_preparation_reviews to service_role;

create function public.boh_preparation(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.boh_staff; result jsonb; existing public.boh_preparation_reviews; saved uuid; off integer; row jsonb; rev integer;
begin
 if current_user<>'service_role' then raise insufficient_privilege; end if;
 select * into member from public.boh_staff where user_id=args->>'actorId' and active for share;
 if member.id is null or member.role not in ('Director','Finance') then raise insufficient_privilege; end if;
 if operation='prep_list' then
   off=coalesce((args->>'offset')::integer,0);
   if off<0 or off>1000000 then raise exception 'Invalid page.'; end if;
   select coalesce(jsonb_agg(to_jsonb(t)),'[]') into result from (
     select id,file_name,created_at,owner_id,payload->'counts' as counts,
       payload->>'sourceDate' as source_date from public.boh_preparation_reviews
     order by created_at desc,id desc limit 25 offset off
   ) t;
   return jsonb_build_object('rows',result,'total',(select count(*) from public.boh_preparation_reviews));
 end if;
 if operation='prep_get' then
   select to_jsonb(r) into result from public.boh_preparation_reviews r where id=(args->>'id')::uuid;
   return result;
 end if;
 if operation='prep_retry' then
   -- Recover an identical successful submission before checking newer source
   -- revisions. The server verifies the workbook signature before this lookup.
   select to_jsonb(r) into result from public.boh_preparation_reviews r
     where digest=args->>'digest' and file_hash=args->>'fileHash';
   return result;
 end if;
 if operation<>'prep_stage' then raise exception 'Preparation reviews cannot post or update live records.'; end if;
 if args->>'digest' !~ '^[a-f0-9]{64}$' or args->>'fileHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid review digest.'; end if;
 -- Serialise only identical submissions. Different workbooks do not block.
 perform pg_advisory_xact_lock(hashtextextended('boh-preparation:'||(args->>'digest'),0));
 select * into existing from public.boh_preparation_reviews where digest=args->>'digest';
 if existing.id is not null then
   if existing.payload is distinct from args->'payload' then raise exception 'Review reference was reused with different data.' using errcode='40001'; end if;
   return jsonb_build_object('id',existing.id,'saved',true,'reused',true,'financialChanges',0);
 end if;
 if args->'payload'->>'financialChanges' is distinct from '0' then raise exception 'Preparation is review-only.'; end if;
 for row in select value from jsonb_array_elements(args->'payload'->'rows') loop
   if row->>'recordId' is not null then
     select revision into rev from public.boh_records where id=row->>'recordId' for share;
     if rev is distinct from (row->>'currentRevision')::integer then
       raise exception 'BOH changed after preview. Preview the preparation workbook again.' using errcode='40001';
     end if;
   end if;
 end loop;
 insert into public.boh_preparation_reviews(digest,file_hash,file_name,owner_id,payload)
 values(args->>'digest',args->>'fileHash',args->>'fileName',member.user_id,args->'payload') returning id into saved;
 return jsonb_build_object('id',saved,'saved',true,'reused',false,'financialChanges',0);
end $$;
revoke all on function public.boh_preparation(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_preparation(text,jsonb) to service_role;

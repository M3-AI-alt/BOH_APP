alter table public.boh_staff add column auth_user_id uuid unique references auth.users(id);
alter table public.boh_staff add column must_change_password boolean not null default true;
alter table public.boh_staff add column credential_version integer not null default 1;
alter table public.boh_staff add column password_change_pending boolean not null default false;
alter table public.boh_staff add column password_change_ticket text;
alter table public.boh_staff add column last_sign_in_at timestamptz;

-- Auth tables are not exposed. Return only a credential-version fingerprint,
-- never a password hash, and only to the private server role.
create schema if not exists boh_private;
revoke all on schema boh_private from public,anon,authenticated;
grant usage on schema boh_private to service_role;
create or replace function boh_private.auth_user_state(uid uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('email',lower(email),'fingerprint',encode(sha256(convert_to(encrypted_password,'UTF8')),'hex'))
 from auth.users where id=uid and deleted_at is null and (banned_until is null or banned_until<=now()) and coalesce(encrypted_password,'')<>'';
$$;
revoke all on function boh_private.auth_user_state(uuid) from public,anon,authenticated;
grant execute on function boh_private.auth_user_state(uuid) to service_role;

create table public.boh_sessions (
 token_hash text primary key check(length(token_hash)=64),
 staff_id text not null references public.boh_staff(id) on delete cascade,
 credential_version integer not null,
 password_fingerprint text not null,
 setup_only boolean not null,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create index boh_sessions_staff_idx on public.boh_sessions(staff_id);
create index boh_sessions_expiry_idx on public.boh_sessions(expires_at);
create table public.boh_auth_limits (
 key_hash text primary key check(length(key_hash)=64),
 attempts integer not null default 0,
 expires_at timestamptz not null
);
alter table public.boh_sessions enable row level security;
alter table public.boh_auth_limits enable row level security;
revoke all on public.boh_sessions,public.boh_auth_limits from public,anon,authenticated;
grant select,insert,update,delete on public.boh_sessions,public.boh_auth_limits to service_role;

create or replace function boh_private.revoke_changed_staff_sessions()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.active is distinct from old.active or new.role is distinct from old.role or new.class_ids is distinct from old.class_ids or new.auth_user_id is distinct from old.auth_user_id or new.email is distinct from old.email then
   delete from public.boh_sessions where staff_id=old.id;
   new.credential_version=old.credential_version+1;
 end if;
 return new;
end;
$$;
revoke all on function boh_private.revoke_changed_staff_sessions() from public,anon,authenticated;
grant execute on function boh_private.revoke_changed_staff_sessions() to service_role;
create trigger boh_staff_access_changed before update of active,role,class_ids,auth_user_id,email on public.boh_staff
for each row execute function boh_private.revoke_changed_staff_sessions();

create or replace function public.boh_auth(operation text,args jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare member public.boh_staff; sess public.boh_sessions; limitrow public.boh_auth_limits;
 result jsonb; token text; ticket text; ttl interval; authstate jsonb;
begin
 if current_user <> 'service_role' then raise insufficient_privilege; end if;
 if operation not in ('auth_session','auth_login_state','auth_team') then
   perform pg_advisory_xact_lock(683920261);
 end if;
 case operation
 when 'auth_rate_limit' then
   delete from public.boh_auth_limits where expires_at<now();
   insert into public.boh_auth_limits(key_hash,attempts,expires_at)
   values(args->>'key',1,now()+interval '15 minutes')
   on conflict(key_hash) do update set attempts=boh_auth_limits.attempts+1
   returning * into limitrow;
   result=jsonb_build_object('allowed',limitrow.attempts<=least(greatest((args->>'limit')::int,1),100),'retryAfter',greatest(1,extract(epoch from limitrow.expires_at-now())::int));
 when 'auth_login_state' then
   select to_jsonb(s)||jsonb_build_object('password_fingerprint',boh_private.auth_user_state(s.auth_user_id)->>'fingerprint') into result from public.boh_staff s where email=lower(trim(args->>'email'));
 when 'auth_create_session' then
   select * into member from public.boh_staff where auth_user_id=(args->>'authUserId')::uuid and active for update;
   if member.id is null or member.password_change_pending or member.credential_version<>(args->>'version')::integer then raise insufficient_privilege; end if;
   authstate=boh_private.auth_user_state(member.auth_user_id);
   if authstate is null or authstate->>'email' is distinct from member.email or authstate->>'fingerprint' is distinct from args->>'passwordFingerprint' then raise insufficient_privilege; end if;
   token=args->>'tokenHash';
   delete from public.boh_sessions where expires_at<now();
   ttl=case when member.must_change_password then interval '20 minutes' else interval '8 hours' end;
   insert into public.boh_sessions(token_hash,staff_id,credential_version,password_fingerprint,setup_only,expires_at)
   values(token,member.id,member.credential_version,authstate->>'fingerprint',member.must_change_password,now()+ttl);
   update public.boh_staff set last_sign_in_at=now() where id=member.id;
   result=jsonb_build_object('mustChangePassword',member.must_change_password,'expiresIn',extract(epoch from ttl)::integer);
 when 'auth_session' then
   select * into sess from public.boh_sessions where token_hash=args->>'tokenHash' and expires_at>now();
   select * into member from public.boh_staff where id=sess.staff_id and active;
   if member.id is null or member.password_change_pending or member.credential_version<>sess.credential_version then return null; end if;
   authstate=boh_private.auth_user_state(member.auth_user_id);
   if authstate is null or authstate->>'email' is distinct from member.email or authstate->>'fingerprint' is distinct from sess.password_fingerprint then return null; end if;
   result=to_jsonb(member)||jsonb_build_object('setup_only',sess.setup_only,'session_expires_at',sess.expires_at);
 when 'auth_revoke_session' then
   delete from public.boh_sessions where token_hash=args->>'tokenHash';
   result=jsonb_build_object('signedOut',true);
 when 'auth_password_begin' then
   select * into sess from public.boh_sessions where token_hash=args->>'tokenHash' and expires_at>now() for update;
   select * into member from public.boh_staff where id=sess.staff_id and active for update;
   if member.id is null or member.password_change_pending or member.credential_version<>sess.credential_version or member.credential_version<>(args->>'version')::integer then raise insufficient_privilege; end if;
   authstate=boh_private.auth_user_state(member.auth_user_id);
   if authstate is null or authstate->>'email' is distinct from member.email or authstate->>'fingerprint' is distinct from sess.password_fingerprint then raise insufficient_privilege; end if;
   ticket=args->>'ticketHash';
   if length(ticket)<>64 then raise insufficient_privilege; end if;
   update public.boh_staff set credential_version=credential_version+1,password_change_pending=true,password_change_ticket=ticket where id=member.id;
   delete from public.boh_sessions where staff_id=member.id;
   result=jsonb_build_object('started',true);
 when 'auth_password_finish' then
   select * into member from public.boh_staff where password_change_ticket=args->>'ticketHash' and password_change_pending and active for update;
   if member.id is null then raise insufficient_privilege; end if;
   authstate=boh_private.auth_user_state(member.auth_user_id);
   if authstate is null or authstate->>'email' is distinct from member.email then raise insufficient_privilege; end if;
   update public.boh_staff set must_change_password=false,password_change_pending=false,password_change_ticket=null where id=member.id;
   insert into public.boh_sessions(token_hash,staff_id,credential_version,password_fingerprint,setup_only,expires_at)
   values(args->>'tokenHash',member.id,member.credential_version,authstate->>'fingerprint',false,now()+interval '8 hours');
   insert into public.boh_activity(id,actor_id,actor_name,action,record_id) values(gen_random_uuid()::text,member.user_id,member.name,'Changed own password',member.id);
   result=jsonb_build_object('expiresIn',28800,'mustChangePassword',false);
 when 'auth_team' then
   if not exists(select 1 from public.boh_staff where user_id=args->>'actorId' and active and role='Director') then raise insufficient_privilege; end if;
   select coalesce(jsonb_agg(to_jsonb(s)),'[]') into result from (
     select id,email,name,role,class_ids,active,auth_user_id is not null as password_ready,must_change_password,last_sign_in_at from public.boh_staff order by created_at
   ) s;
 else raise exception 'Unsupported authentication operation';
 end case;
 return result;
end;
$$;
revoke all on function public.boh_auth(text,jsonb) from public,anon,authenticated;
grant execute on function public.boh_auth(text,jsonb) to service_role;

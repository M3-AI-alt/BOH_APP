-- Synthetic fixtures only; run inside BEGIN / ROLLBACK, after candidate migrations.
insert into auth.users(id,aud,role,email,encrypted_password) values('fbb05d43-510d-4f0f-8ef6-d523cbe32aff','authenticated','authenticated','boh-db-test@example.test','synthetic-password-hash');
insert into public.boh_staff(id,user_id,email,name,role,class_ids,auth_user_id,must_change_password)
values('boh-db-test','boh-db-test','boh-db-test@example.test','Synthetic role test','TA','[]','fbb05d43-510d-4f0f-8ef6-d523cbe32aff',true);
set local role service_role;
do $$
declare state jsonb; r jsonb; i int;
begin
 state=public.boh_auth('auth_login_state','{"email":"boh-db-test@example.test"}');
 r=public.boh_auth('auth_create_session',jsonb_build_object('authUserId',state->>'auth_user_id','version',state->'credential_version','passwordFingerprint',state->>'password_fingerprint','tokenHash',repeat('a',64)));
 if not (r->>'mustChangePassword')::boolean then raise exception 'Temporary password not restricted'; end if;
 r=public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('a',64)));
 if r->>'role'<>'TA' or r->'class_ids'<>'[]'::jsonb or not (r->>'setup_only')::boolean then raise exception 'Wrong scope'; end if;
 begin
  perform public.boh_auth('auth_create_session',jsonb_build_object('authUserId',state->>'auth_user_id','version',0,'passwordFingerprint',state->>'password_fingerprint','tokenHash',repeat('b',64)));
  raise exception 'Stale credential version accepted';
 exception when insufficient_privilege then null; end;
 perform public.boh_auth('auth_password_begin',jsonb_build_object('tokenHash',repeat('a',64),'ticketHash',repeat('c',64),'version',1));
 if public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('a',64))) is not null then raise exception 'Old session survived password begin'; end if;
 begin
  perform public.boh_auth('auth_create_session',jsonb_build_object('authUserId',state->>'auth_user_id','version',1,'passwordFingerprint',state->>'password_fingerprint','tokenHash',repeat('b',64)));
  raise exception 'Concurrent old password login accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform public.boh_auth('auth_password_begin',jsonb_build_object('tokenHash',repeat('a',64),'ticketHash',repeat('d',64),'version',1));
  raise exception 'Concurrent password change accepted';
 exception when insufficient_privilege then null; end;
 perform public.boh_auth('auth_password_finish',jsonb_build_object('ticketHash',repeat('c',64),'tokenHash',repeat('d',64)));
 r=public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('d',64)));
 if (r->>'must_change_password')::boolean or (r->>'setup_only')::boolean then raise exception 'Password finish not activated'; end if;
 update public.boh_staff set active=false where id='boh-db-test';
 if public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('d',64))) is not null then raise exception 'Disabled user retained access'; end if;
 update public.boh_staff set active=true where id='boh-db-test';
 if public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('d',64))) is not null then raise exception 'Re-enable revived old session'; end if;
 for i in 1..11 loop r=public.boh_auth('auth_rate_limit',jsonb_build_object('key',repeat('e',64),'limit',10)); end loop;
 if (r->>'allowed')::boolean then raise exception 'Rate limit not enforced'; end if;
 state=public.boh_auth('auth_login_state','{"email":"boh-db-test@example.test"}');
 perform public.boh_auth('auth_create_session',jsonb_build_object('authUserId',state->>'auth_user_id','version',state->'credential_version','passwordFingerprint',state->>'password_fingerprint','tokenHash',repeat('f',64)));
end; $$;
reset role;
update auth.users set encrypted_password='externally-reset-password-hash' where id='fbb05d43-510d-4f0f-8ef6-d523cbe32aff';
set local role service_role;
do $$ begin
 if public.boh_auth('auth_session',jsonb_build_object('tokenHash',repeat('f',64))) is not null then raise exception 'External reset did not invalidate session'; end if;
end; $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.boh_auth(text,jsonb)','execute') or has_function_privilege('authenticated','public.boh_auth(text,jsonb)','execute') or has_table_privilege('anon','public.boh_sessions','select') or has_function_privilege('anon','boh_private.auth_user_state(uuid)','execute') then raise exception 'Anonymous auth privilege exposed'; end if;
end; $$;
select 'Native authentication transaction checks passed' as result;

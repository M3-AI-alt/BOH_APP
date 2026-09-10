-- Metadata-only reconciliation: source lesson content and balances never change.
create or replace function public.boh_student_link(args jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare staff public.boh_staff; old public.boh_records; student public.boh_records; saved public.boh_records;
begin
 perform pg_advisory_xact_lock(683920261);
 select * into staff from public.boh_staff where user_id=args->>'actorId' and role='Director' and active;
 if staff.id is null then raise insufficient_privilege; end if;
 if length(trim(coalesce(args->>'reason','')))<3 then raise exception 'Explain the source evidence for this match.'; end if;
 select * into old from public.boh_records where id=args->>'id' for update;
 if old.id is null or old.kind not in ('makeup','support') or old.payload->>'historical' is distinct from 'true' then raise exception 'Select an original makeup or support record.'; end if;
 if old.revision is distinct from (args->>'revision')::integer then raise exception 'Record changed. Refresh first.' using errcode='40001'; end if;
 if coalesce(old.student_id,'')<>'' or coalesce(old.payload->>'studentId','')<>'' then raise exception 'This record is already linked. It cannot be reassigned here.'; end if;
 select * into student from public.boh_records where id=args->>'studentId' and kind='student';
 if student.id is null or coalesce(student.payload->>'canonicalStudentId','')<>'' then raise exception 'Choose an existing current student identity.'; end if;
 update public.boh_records set student_id=student.id,
   payload=payload||jsonb_build_object('studentId',student.id,'studentLinkEvidence',left(args->>'reason',1000),'studentLinkedAt',now()::text),
   revision=revision+1,updated_at=now()::text where id=old.id returning * into saved;
 insert into public.boh_activity(id,actor_id,actor_name,action,record_id,before,after)
 values(gen_random_uuid()::text,staff.user_id,staff.name,'Linked source lesson to student · '||left(args->>'reason',1000),old.id,old.payload,saved.payload);
 return to_jsonb(saved);
end $$;
revoke all on function public.boh_student_link(jsonb) from public,anon,authenticated;
grant execute on function public.boh_student_link(jsonb) to service_role;

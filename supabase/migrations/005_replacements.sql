-- Deny access explicitly when a profile has no assigned unit.
create or replace function public.visible_unit(p_unit_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select public.is_admin() or coalesce(p_unit_id=public.current_unit_id(),false);
$$;

-- MVP3: independent slot, immutable outgoing record, shared enrollment.
alter table public.participants add column is_replacement_candidate boolean not null default false;
grant select(is_replacement_candidate) on public.participants to authenticated;
create table public.replacement_requests (
 id uuid primary key default gen_random_uuid(),
 slot_id uuid not null references public.registration_slots(id),
 outgoing_participant_id uuid not null references public.participants(id),
 incoming_participant_id uuid not null unique references public.participants(id),
 outgoing_status text not null,
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','APPROVED','REJECTED','CANCELLED')),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 requested_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 submitted_at timestamptz,
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 check(outgoing_participant_id<>incoming_participant_id)
);
create unique index one_open_replacement_per_slot on public.replacement_requests(slot_id) where status in ('DRAFT','SUBMITTED');
alter table public.replacement_requests enable row level security;
create policy "unit replacement history" on public.replacement_requests for select to authenticated
 using(exists(select 1 from public.registration_slots s where s.id=slot_id and public.visible_unit(s.unit_id)));
revoke insert,update,delete on public.replacement_requests from authenticated;
-- Reassignment must go through the reviewed transaction, not a direct slot update.
drop policy if exists "slots admins write" on public.registration_slots;

create or replace function private.insert_enrollment(p_unit_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare u public.units%rowtype; v_id uuid; v_dni text; v_birth date;
begin
 select * into u from public.units where id=p_unit_id;
 if not found then raise exception 'UNIT_NOT_FOUND'; end if;
 if coalesce(trim(p_data->>'firstName'),'')='' or coalesce(trim(p_data->>'lastName'),'')='' then raise exception 'NAME_REQUIRED'; end if;
 if length(p_data->>'firstName')>100 or length(p_data->>'lastName')>100 then raise exception 'INVALID_PARTICIPANT'; end if;
 v_birth:=nullif(p_data->>'birthDate','')::date;
 if v_birth is null or v_birth>current_date or coalesce(p_data->>'sex','') not in ('Hombre','Mujer') then raise exception 'INVALID_PARTICIPANT'; end if;
 v_dni:=nullif(trim(p_data->>'documentNumber'),'');
 if v_dni is not null and v_dni !~ '^[0-9]{8}$' then raise exception 'INVALID_DNI'; end if;
 -- Serialize enrollment per session to keep duplicate checks atomic.
 perform 1 from public.sessions where id=u.session_id for update;
 if v_dni is not null and exists(select 1 from public.participants where session_id=u.session_id and document_number=v_dni and status not in ('REPLACED','CANCELLED')) then raise exception 'DUPLICATE_DNI'; end if;
 if nullif(p_data->>'email','') is not null and p_data->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'INVALID_PARTICIPANT'; end if;
 if (nullif(trim(p_data->>'guardianFirstName'),'') is null) <> (nullif(trim(p_data->>'guardianLastName'),'') is null) then raise exception 'GUARDIAN_REQUIRED'; end if;
 insert into public.participants(session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_number,phone,email,status)
 values(u.session_id,u.stake_id,u.id,trim(p_data->>'firstName'),nullif(trim(p_data->>'middleName'),''),trim(p_data->>'lastName'),nullif(trim(p_data->>'secondLastName'),''),nullif(trim(p_data->>'preferredName'),''),v_birth,p_data->>'sex',v_dni,nullif(trim(p_data->>'phone'),''),nullif(trim(p_data->>'email'),''),'DOCUMENTS_PENDING') returning id into v_id;
 if nullif(trim(p_data->>'guardianFirstName'),'') is not null then
  insert into public.participant_guardians(participant_id,relationship,first_name,last_name,phone) values(v_id,'Padre/madre/tutor',trim(p_data->>'guardianFirstName'),trim(p_data->>'guardianLastName'),nullif(trim(p_data->>'guardianPhone'),''));
 end if;
 return v_id;
end; $$;
revoke all on function private.insert_enrollment(uuid,jsonb) from public;

create or replace function public.create_enrollment(p_unit_id uuid,p_data jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_id uuid; p public.participants%rowtype;
begin
 if not public.can_manage_session() then raise exception 'NOT_ALLOWED'; end if;
 v_id:=private.insert_enrollment(p_unit_id,p_data);
 select * into p from public.participants where id=v_id;
 insert into public.registration_slots(session_id,stake_id,unit_id,slot_code,sex,current_participant_id)
 values(p.session_id,p.stake_id,p.unit_id,'FSY27-'||replace(v_id::text,'-',''),p.sex,v_id);
 insert into public.audit_logs(user_id,action,entity_type,entity_id) values(auth.uid(),'IMPORT_PARTICIPANT','participant',v_id);
 return v_id;
end; $$;
revoke all on function public.create_enrollment(uuid,jsonb) from public;
grant execute on function public.create_enrollment(uuid,jsonb) to authenticated;
-- Backwards-compatible entry point, using the same validation and insert.
create or replace function public.create_participant_with_slot(p_unit_id uuid,p_first_name text,p_middle_name text,p_last_name text,p_second_last_name text,p_preferred_name text,p_birth_date date,p_sex text,p_document_number text) returns uuid
language sql security definer set search_path=public as $$
 select public.create_enrollment(p_unit_id,jsonb_build_object('firstName',p_first_name,'middleName',p_middle_name,'lastName',p_last_name,'secondLastName',p_second_last_name,'preferredName',p_preferred_name,'birthDate',p_birth_date,'sex',p_sex,'documentNumber',p_document_number));
$$;

create or replace function public.start_replacement(p_outgoing_id uuid,p_data jsonb,p_reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare s public.registration_slots%rowtype; p public.participants%rowtype; v_new uuid; v_request uuid;
begin
 if not exists(select 1 from public.profiles where id=auth.uid() and role in ('UNIT_LEADER','SUPER_ADMIN','SESSION_ADMIN')) then raise exception 'NOT_ALLOWED'; end if;
 select * into s from public.registration_slots where current_participant_id=p_outgoing_id for update;
 if not found or not public.visible_unit(s.unit_id) then raise exception 'NOT_ALLOWED'; end if;
 select * into p from public.participants where id=p_outgoing_id for update;
 if p.status in ('REPLACED','CANCELLED','REPLACEMENT_REQUESTED') or exists(select 1 from public.replacement_requests where slot_id=s.id and status in ('DRAFT','SUBMITTED')) then raise exception 'REPLACEMENT_EXISTS'; end if;
 if not exists(select 1 from public.sessions where id=s.session_id and status='ACTIVE' and deadline>=current_date) then raise exception 'DEADLINE_CLOSED'; end if;
 if coalesce(p_data->>'sex','')<>s.sex or s.sex<>p.sex then raise exception 'SEX_MISMATCH'; end if;
 if coalesce(length(trim(p_reason)),0) not between 1 and 1000 then raise exception 'REASON_REQUIRED'; end if;
 if nullif(trim(p_data->>'guardianFirstName'),'') is null or nullif(trim(p_data->>'guardianLastName'),'') is null then raise exception 'GUARDIAN_REQUIRED'; end if;
 v_new:=private.insert_enrollment(s.unit_id,p_data);
 update public.participants set is_replacement_candidate=true,registration_source='REPLACEMENT' where id=v_new;
 insert into public.replacement_requests(slot_id,outgoing_participant_id,incoming_participant_id,outgoing_status,reason,requested_by)
 values(s.id,p.id,v_new,p.status,trim(p_reason),auth.uid()) returning id into v_request;
 update public.participants set status='REPLACEMENT_REQUESTED',updated_at=now() where id=p.id;
 update public.registration_slots set status='REPLACEMENT_REQUESTED',updated_at=now() where id=s.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,after_json) values(auth.uid(),'START_REPLACEMENT','replacement_request',v_request,jsonb_build_object('outgoing',p.id,'incoming',v_new,'slot',s.id));
 return v_new;
end; $$;
revoke all on function public.start_replacement(uuid,jsonb,text) from public;
grant execute on function public.start_replacement(uuid,jsonb,text) to authenticated;

create or replace function public.transition_replacement(p_request_id uuid,p_action text,p_note text default '') returns void
language plpgsql security definer set search_path=public as $$
declare r public.replacement_requests%rowtype; s public.registration_slots%rowtype; v_required integer; v_ready integer;
begin
 select * into r from public.replacement_requests where id=p_request_id for update;
 if not found then raise exception 'NOT_ALLOWED'; end if;
 select * into s from public.registration_slots where id=r.slot_id for update;
 if not public.visible_unit(s.unit_id) then raise exception 'NOT_ALLOWED'; end if;
 if p_action in ('APPROVED','REJECTED') then
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
 elsif p_action in ('SUBMITTED','CANCELLED') then
  if not exists(select 1 from public.profiles where id=auth.uid() and role in ('UNIT_LEADER','SUPER_ADMIN','SESSION_ADMIN')) then raise exception 'NOT_ALLOWED'; end if;
 else raise exception 'INVALID_TRANSITION'; end if;
 if (p_action='SUBMITTED' and r.status<>'DRAFT') or (p_action in ('APPROVED','REJECTED') and r.status<>'SUBMITTED') or (p_action='CANCELLED' and r.status not in ('DRAFT','SUBMITTED')) then raise exception 'INVALID_TRANSITION'; end if;
 perform 1 from public.participants where id in (r.outgoing_participant_id,r.incoming_participant_id) order by id for update;
 if s.current_participant_id is distinct from r.outgoing_participant_id then raise exception 'SLOT_CHANGED'; end if;
 if exists(select 1 from public.participants where id in (r.outgoing_participant_id,r.incoming_participant_id) and sex<>s.sex) then raise exception 'SEX_MISMATCH'; end if;
 if p_action='SUBMITTED' and not exists(select 1 from public.sessions where id=s.session_id and status='ACTIVE' and deadline>=current_date) then raise exception 'DEADLINE_CLOSED'; end if;
 if p_action in ('SUBMITTED','APPROVED') then
  select count(*) into v_required from public.document_requirements where session_id=s.session_id and required;
  select count(*) into v_ready from public.document_requirements dr join public.documents d on d.participant_id=r.incoming_participant_id and d.document_type=dr.document_type
   where dr.session_id=s.session_id and dr.required and d.current_version_id is not null and (d.status='APPROVED' or (p_action='SUBMITTED' and d.status='UNDER_REVIEW'));
  if v_required=0 or v_ready<v_required then raise exception 'DOCUMENTS_INCOMPLETE'; end if;
 end if;
 if p_action='REJECTED' and coalesce(length(trim(p_note)),0) not between 1 and 1000 then raise exception 'NOTE_REQUIRED'; end if;
 if p_action='APPROVED' then
  update public.participants set status='REPLACED',updated_at=now() where id=r.outgoing_participant_id;
  update public.participants set status='CONFIRMED',is_replacement_candidate=false,updated_at=now() where id=r.incoming_participant_id;
  update public.registration_slots set current_participant_id=r.incoming_participant_id,status='CONFIRMED',updated_at=now() where id=s.id;
 elsif p_action in ('CANCELLED','REJECTED') then
  update public.participants set status=r.outgoing_status,updated_at=now() where id=r.outgoing_participant_id;
  update public.participants set status='CANCELLED',updated_at=now() where id=r.incoming_participant_id;
  update public.registration_slots set status=case when r.outgoing_status='CONFIRMED' then 'CONFIRMED' else 'REGISTERED' end,updated_at=now() where id=s.id;
 end if;
 update public.replacement_requests set status=p_action,submitted_at=case when p_action='SUBMITTED' then now() else submitted_at end,
 reviewed_by=case when p_action in ('APPROVED','REJECTED') then auth.uid() else reviewed_by end,
 reviewed_at=case when p_action in ('APPROVED','REJECTED') then now() else reviewed_at end,review_note=nullif(trim(p_note),'') where id=r.id;
 insert into public.audit_logs(user_id,action,entity_type,entity_id,after_json) values(auth.uid(),'REPLACEMENT_'||p_action,'replacement_request',r.id,jsonb_build_object('status',p_action));
end; $$;
revoke all on function public.transition_replacement(uuid,text,text) from public;
grant execute on function public.transition_replacement(uuid,text,text) to authenticated;

create or replace function public.attach_document_version(p_document_id uuid, p_version_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_participant_id uuid;
  v_unit_id uuid;
begin
  select d.participant_id, p.unit_id into v_participant_id, v_unit_id
  from public.documents d
  join public.participants p on p.id = d.participant_id
  where d.id = p_document_id;

  if v_participant_id is null or not public.visible_unit(v_unit_id) then
    raise exception 'NOT_ALLOWED';
  end if;

  perform 1 from public.participants where id = v_participant_id for update;
  if exists (select 1 from public.participants where id = v_participant_id and status in ('CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED')) then raise exception 'PARTICIPANT_LOCKED'; end if;
  perform 1 from public.documents where id = p_document_id for update;
  if exists (select 1 from public.documents where id = p_document_id and current_version_id = p_version_id) then return; end if;
  if exists (select 1 from public.documents where id = p_document_id and status not in ('PENDING','OBSERVED')) then raise exception 'VERSION_NOT_ALLOWED'; end if;

  if not exists (
    select 1 from public.document_versions v
    where v.id = p_version_id
      and v.document_id = p_document_id
      and v.uploaded_by = auth.uid()
      and v.status = 'UNDER_REVIEW'
      and v.version_number > coalesce((select old.version_number from public.documents d join public.document_versions old on old.id=d.current_version_id where d.id=p_document_id),0)
      and v.storage_path like v_unit_id::text || '/' || v_participant_id::text || '/' || p_document_id::text || '/%'
      and exists (select 1 from storage.objects o where o.bucket_id = 'participant-documents' and o.name = v.storage_path)
  ) then
    raise exception 'VERSION_NOT_ALLOWED';
  end if;

  update public.documents
  set current_version_id = p_version_id, status = 'UNDER_REVIEW', last_observation_note = null, updated_at = now()
  where id = p_document_id;

  perform public.refresh_participant_document_status(v_participant_id);
  perform private.enqueue_analysis(p_version_id);

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'UPLOAD_DOCUMENT', 'document', p_document_id, jsonb_build_object('version_id', p_version_id));
end;
$$;



create or replace function public.confirm_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before public.participants%rowtype;
  v_required integer;
  v_ready integer;
begin
  if not public.is_admin() then
    raise exception 'NOT_ALLOWED';
  end if;

  select * into v_before from public.participants where id = p_participant_id for update;
  if v_before.id is null then raise exception 'PARTICIPANT_NOT_FOUND'; end if;

  if v_before.is_replacement_candidate or v_before.status in ('REPLACED','CANCELLED','REPLACEMENT_REQUESTED') then raise exception 'PARTICIPANT_LOCKED'; end if;

  select count(*) into v_required
  from public.document_requirements
  where session_id = v_before.session_id and required = true;

  select count(*) into v_ready
  from public.document_requirements r
  join public.documents d
    on d.participant_id = p_participant_id
   and d.document_type = r.document_type
   and d.status = 'APPROVED' and d.current_version_id is not null
  where r.session_id = v_before.session_id and r.required = true;

  if v_required = 0 or v_ready < v_required then
    raise exception 'DOCUMENTS_INCOMPLETE';
  end if;

  update public.participants
  set status = 'CONFIRMED', updated_at = now()
  where id = p_participant_id;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), 'CONFIRM_PARTICIPANT', 'participant', p_participant_id, jsonb_build_object('status',v_before.status), jsonb_build_object('status','CONFIRMED'));
end;
$$;

grant execute on function public.confirm_participant(uuid) to authenticated;


-- Authorization metadata is assigned only through the Auth admin API.

create or replace function public.review_document(p_version_id uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path=public as $$
declare v_doc uuid; v_person uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_status is null or p_status not in ('APPROVED','OBSERVED') then raise exception 'INVALID_STATUS'; end if;
  if p_status='OBSERVED' and (nullif(trim(p_note),'') is null or length(p_note)>1000) then raise exception 'NOTE_REQUIRED'; end if;
  select d.id,d.participant_id into v_doc,v_person from public.documents d join public.document_versions v on v.document_id=d.id where v.id=p_version_id;
  perform 1 from public.participants where id=v_person and status not in ('CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED') for update;
  if not found then raise exception 'PARTICIPANT_LOCKED'; end if;
  perform 1 from public.documents where id=v_doc and current_version_id=p_version_id for update;
  if not found then raise exception 'VERSION_NOT_ALLOWED'; end if;
  update public.documents set status=p_status,last_observation_note=case when p_status='OBSERVED' then trim(p_note) end,updated_at=now() where id=v_doc;
  update public.document_versions set status=p_status where id=p_version_id;
  perform public.refresh_participant_document_status(v_person);
  insert into public.audit_logs(user_id,action,entity_type,entity_id,after_json)
  values(auth.uid(),case when p_status='APPROVED' then 'APPROVE_DOCUMENT' else 'OBSERVE_DOCUMENT' end,'document_version',p_version_id,jsonb_build_object('status',p_status,'note',p_note));
end; $$;
revoke all on function public.review_document(uuid,text,text) from public;
grant execute on function public.review_document(uuid,text,text) to authenticated;


create or replace function public.refresh_participant_document_status(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_session_id uuid;
  v_current text;
  v_required integer;
  v_ready integer;
  v_observed integer;
begin
  select unit_id, session_id, status into v_unit_id, v_session_id, v_current
  from public.participants where id = p_participant_id;

  if v_unit_id is null then
    raise exception 'NOT_ALLOWED';
  end if;
  if auth.role() is distinct from 'service_role' and not public.visible_unit(v_unit_id) then
    raise exception 'NOT_ALLOWED';
  end if;

  if v_current in ('CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED') then
    return;
  end if;

  select count(*) into v_required
  from public.document_requirements
  where session_id = v_session_id and required = true;

  select count(*) into v_ready
  from public.document_requirements r
  join public.documents d
    on d.participant_id = p_participant_id
   and d.document_type = r.document_type
   and d.status in ('UNDER_REVIEW','APPROVED')
  where r.session_id = v_session_id and r.required = true;

  select count(*) into v_observed
  from public.documents
  where participant_id = p_participant_id and status = 'OBSERVED';

  update public.participants
  set status = case
    when v_observed > 0 then 'OBSERVED'
    when v_required > 0 and v_ready >= v_required then 'DOCUMENTS_COMPLETE'
    else 'DOCUMENTS_PENDING'
  end,
  updated_at = now()
  where id = p_participant_id;
end;
$$;


create or replace function public.leader_dashboard_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit uuid := public.current_unit_id();
  v_session uuid;
  v_name text;
  v_deadline date;
  v_total integer;
  v_confirmed integer;
  v_attention integer;
  v_review integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  if v_unit is not null then
    select s.id, s.name, s.deadline into v_session, v_name, v_deadline
    from public.units u join public.sessions s on s.id = u.session_id
    where u.id = v_unit;
  elsif public.is_admin() then
    select id, name, deadline into v_session, v_name, v_deadline
    from public.sessions where status = 'ACTIVE' order by year desc, created_at desc limit 1;
  else
    raise exception 'NO_SESSION';
  end if;

  select
    count(*),
    count(*) filter (where status = 'CONFIRMED'),
    count(*) filter (where status in ('REGISTERED','DOCUMENTS_PENDING','OBSERVED')),
    count(*) filter (where status in ('DOCUMENTS_COMPLETE','UNDER_REVIEW','REPLACEMENT_REQUESTED'))
  into v_total, v_confirmed, v_attention, v_review
  from public.participants
  where not is_replacement_candidate and status not in ('REPLACED','CANCELLED') and session_id = v_session and (v_unit is null or unit_id = v_unit);

  return jsonb_build_object(
    'session_id', v_session,
    'session_name', v_name,
    'deadline', v_deadline,
    'total', v_total,
    'confirmed', v_confirmed,
    'attention', v_attention,
    'under_review', v_review
  );
end;
$$;

grant execute on function public.leader_dashboard_summary() to authenticated;

-- Perfil mínimo a partir de metadata de Auth. La creación de usuarios sigue siendo administrativa.

create or replace function public.retry_document_analysis(p_version_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v public.document_versions%rowtype; v_doc public.documents%rowtype;
begin
  select d.* into v_doc from public.documents d join public.document_versions dv on dv.document_id=d.id where dv.id=p_version_id;
  if not exists(select 1 from public.participants p where p.id=v_doc.participant_id and public.visible_unit(p.unit_id) and p.status not in ('CONFIRMED','REPLACED','CANCELLED','REPLACEMENT_REQUESTED')) then raise exception 'NOT_ALLOWED'; end if;
  perform 1 from public.participants where id=v_doc.participant_id for update;
  select * into v_doc from public.documents where id=v_doc.id for update;
  select * into v from public.document_versions where id=p_version_id for update;
  if v_doc.current_version_id is distinct from v.id or v_doc.status<>'UNDER_REVIEW' or v.ai_attempts>=3
    or v.ai_status='COMPLETE' or v.ai_updated_at>now()-interval '2 minutes' then raise exception 'RETRY_NOT_ALLOWED'; end if;
  perform private.enqueue_analysis(p_version_id);
end; $$;
revoke all on function public.retry_document_analysis(uuid) from public;
grant execute on function public.retry_document_analysis(uuid) to authenticated;

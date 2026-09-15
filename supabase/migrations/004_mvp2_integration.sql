-- MVP2 integration: attach first, then asynchronous analysis; humans decide.
-- Run after 001, 002, 003. Existing versions remain available for manual review.
drop trigger if exists document_versions_after_insert on public.document_versions;
revoke all on schema private from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on function public.apply_document_validation(uuid,text,text,jsonb,jsonb,boolean,boolean,text) from service_role;

-- A column revoke cannot override the original table-level SELECT grant.
revoke select on public.participants from authenticated;
grant select (id,session_id,stake_id,unit_id,first_name,middle_name,last_name,second_last_name,preferred_name,birth_date,sex,document_type,document_number_masked,phone,email,registration_source,status,created_at,updated_at) on public.participants to authenticated;

alter table public.document_versions
  add column ai_status text not null default 'UNAVAILABLE' check (ai_status in ('UNAVAILABLE','PENDING','PROCESSING','COMPLETE','FAILED')),
  add column ai_attempts integer not null default 0,
  add column ai_updated_at timestamptz,
  add column ai_result jsonb,
  add column ai_note text;
-- Only the worker may write processing state or extracted content.
revoke insert, update on public.document_versions from authenticated;
grant insert (id,document_id,version_number,storage_path,mime_type,file_size,file_name,uploaded_by,uploaded_at,status) on public.document_versions to authenticated;
revoke select on public.document_versions from authenticated;
grant select (id,document_id,version_number,storage_path,mime_type,file_size,file_name,uploaded_by,uploaded_at,status,ai_status,ai_attempts,ai_updated_at,ai_note) on public.document_versions to authenticated;
drop policy if exists "validations visible by participant unit" on public.document_validations;
create policy "reviewers read extracted data" on public.document_validations for select to authenticated using (public.is_admin());

create or replace function private.enqueue_analysis(p_version_id uuid) returns void
language plpgsql security definer set search_path = public, private, net as $$
declare v_url text; v_key text;
begin
  select value into v_url from private.app_config where key = 'edge_function_url';
  select value into v_key from private.app_config where key = 'service_role_key';
  if v_url is null or v_url like 'PEGAR_%' or v_key is null or v_key like 'PEGAR_%' then
    update public.document_versions set ai_status='UNAVAILABLE', ai_updated_at=now() where id=p_version_id;
    return;
  end if;
  update public.document_versions set ai_status='PENDING', ai_updated_at=now() where id=p_version_id;
  perform net.http_post(url:=v_url, headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key), body:=jsonb_build_object('document_version_id',p_version_id), timeout_milliseconds:=90000);
exception when others then
  update public.document_versions set ai_status='FAILED', ai_updated_at=now() where id=p_version_id;
end; $$;
revoke all on function private.enqueue_analysis(uuid) from public;

create or replace function public.claim_document_analysis(p_version_id uuid) returns integer
language plpgsql security definer set search_path=public as $$
declare v_attempt integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'NOT_ALLOWED'; end if;
  update public.document_versions v set ai_status='PROCESSING',ai_attempts=ai_attempts+1,ai_updated_at=now()
  where v.id=p_version_id and ai_status='PENDING' and ai_attempts<3
    and exists(select 1 from public.documents d where d.current_version_id=v.id and d.status='UNDER_REVIEW')
  returning ai_attempts into v_attempt;
  return v_attempt;
end; $$;
revoke all on function public.claim_document_analysis(uuid) from public;
grant execute on function public.claim_document_analysis(uuid) to service_role;

create or replace function public.finish_document_analysis(p_version_id uuid,p_attempt integer,p_result jsonb,p_note text) returns void
language plpgsql security definer set search_path=public as $$
declare v_doc uuid; v_person uuid;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'NOT_ALLOWED'; end if;
  select d.id,d.participant_id into v_doc,v_person from public.documents d join public.document_versions v on v.document_id=d.id where v.id=p_version_id;
  perform 1 from public.participants where id=v_person for update;
  perform 1 from public.documents where id=v_doc for update;
  update public.document_versions set ai_status=case when p_result is null then 'FAILED' else 'COMPLETE' end,
    ai_result=p_result,ai_note=p_note,ai_updated_at=now()
  where id=p_version_id and ai_status='PROCESSING' and ai_attempts=p_attempt;
  if not found then return; end if;
  if p_result is not null then
    insert into public.document_validations(document_version_id,validation_status,confidence_score,extracted_data_json,issues_json,review_required)
    values(p_version_id,case when p_note is null then 'OK' else 'NEEDS_ATTENTION' end,p_result->>'confidence',p_result,p_result->'problemasCalidad',true);
  end if;
  -- No writes to document decisions: late AI cannot override a human or a replacement.
  insert into public.audit_logs(action,entity_type,entity_id,after_json)
  values(case when p_result is null then 'AI_VALIDATION_FAILED' else 'AI_VALIDATE_DOCUMENT' end,'document_version',p_version_id,jsonb_build_object('attempt',p_attempt));
end; $$;
revoke all on function public.finish_document_analysis(uuid,integer,jsonb,text) from public;
grant execute on function public.finish_document_analysis(uuid,integer,jsonb,text) to service_role;

create or replace function public.retry_document_analysis(p_version_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare v public.document_versions%rowtype; v_doc public.documents%rowtype;
begin
  select d.* into v_doc from public.documents d join public.document_versions dv on dv.document_id=d.id where dv.id=p_version_id;
  if not exists(select 1 from public.participants p where p.id=v_doc.participant_id and public.visible_unit(p.unit_id) and p.status<>'CONFIRMED') then raise exception 'NOT_ALLOWED'; end if;
  perform 1 from public.participants where id=v_doc.participant_id for update;
  select * into v_doc from public.documents where id=v_doc.id for update;
  select * into v from public.document_versions where id=p_version_id for update;
  if v_doc.current_version_id is distinct from v.id or v_doc.status<>'UNDER_REVIEW' or v.ai_attempts>=3
    or v.ai_status='COMPLETE' or v.ai_updated_at>now()-interval '2 minutes' then raise exception 'RETRY_NOT_ALLOWED'; end if;
  perform private.enqueue_analysis(p_version_id);
end; $$;
revoke all on function public.retry_document_analysis(uuid) from public;
grant execute on function public.retry_document_analysis(uuid) to authenticated;

create or replace function public.review_document(p_version_id uuid,p_status text,p_note text) returns void
language plpgsql security definer set search_path=public as $$
declare v_doc uuid; v_person uuid;
begin
  if not public.is_admin() then raise exception 'NOT_ALLOWED'; end if;
  if p_status is null or p_status not in ('APPROVED','OBSERVED') then raise exception 'INVALID_STATUS'; end if;
  if p_status='OBSERVED' and (nullif(trim(p_note),'') is null or length(p_note)>1000) then raise exception 'NOTE_REQUIRED'; end if;
  select d.id,d.participant_id into v_doc,v_person from public.documents d join public.document_versions v on v.document_id=d.id where v.id=p_version_id;
  perform 1 from public.participants where id=v_person and status<>'CONFIRMED' for update;
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
  if exists (select 1 from public.participants where id = v_participant_id and status = 'CONFIRMED') then raise exception 'PARTICIPANT_LOCKED'; end if;
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
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, username, display_name, role, unit_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data->>'role', 'UNIT_LEADER'),
    nullif(new.raw_app_meta_data->>'unit_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;


-- Direct inserts cannot bypass the transactional participant or version flow.
drop policy if exists "participants admins insert" on public.participants;
revoke insert, update on public.documents from authenticated;
grant insert (id,participant_id,document_type,status) on public.documents to authenticated;

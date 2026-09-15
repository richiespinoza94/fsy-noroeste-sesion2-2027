-- FSY 2027 · MVP 2 — Validación documental con IA
-- Implementa el pipeline de la sección 18 del doc maestro a partir de
-- "Tipo de documento" en adelante (la etapa "Seguridad" ya la cubren el
-- límite de tamaño/MIME del bucket definidos en 001_mvp.sql).
--
-- Requiere pg_net (viene habilitado por defecto en proyectos Supabase).

create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1) Tabla document_validations (sección 46 del doc maestro)
-- ---------------------------------------------------------------------
-- Nota sobre "confidence_score": se guarda la BANDA cualitativa
-- ('alta'|'media'|'baja'), no un número. Un modelo de lenguaje no tiene una
-- probabilidad calibrada real que reportar, y mostrar un score numérico
-- falso es justo lo que la sección 17 del doc pide evitar. Se mantiene el
-- nombre de columna del doc por trazabilidad con la sección 46.
create table if not exists public.document_validations (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  validation_type text not null default 'AI_GEMINI',
  validation_status text not null check (validation_status in ('OK', 'NEEDS_ATTENTION')),
  confidence_score text not null check (confidence_score in ('alta', 'media', 'baja')),
  detected_document_type text,
  extracted_data_json jsonb not null default '{}'::jsonb,
  issues_json jsonb not null default '[]'::jsonb,
  review_required boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists document_validations_version_idx
  on public.document_validations(document_version_id, created_at desc);

alter table public.document_validations enable row level security;

create policy "validations visible by participant unit" on public.document_validations for select to authenticated
using (exists (
  select 1
  from public.document_versions v
  join public.documents d on d.id = v.document_id
  join public.participants p on p.id = d.participant_id
  where v.id = document_version_id and public.visible_unit(p.unit_id)
));
-- Sin policy de insert/update/delete para authenticated a propósito: solo
-- apply_document_validation() escribe aquí, y esa función solo la puede
-- ejecutar service_role (ver grant al final).

-- ---------------------------------------------------------------------
-- 2) Nota visible al líder cuando la IA detecta un problema bloqueante
-- ---------------------------------------------------------------------
alter table public.documents add column if not exists last_observation_note text;

-- attach_document_version ya existía (001_mvp.sql); se reemplaza solo para
-- limpiar la nota de una observación anterior cuando se sube una foto nueva.
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

  if not exists (
    select 1 from public.document_versions v
    where v.id = p_version_id
      and v.document_id = p_document_id
      and v.uploaded_by = auth.uid()
      and v.status = 'UNDER_REVIEW'
  ) then
    raise exception 'VERSION_NOT_ALLOWED';
  end if;

  update public.documents
  set current_version_id = p_version_id, status = 'UNDER_REVIEW', last_observation_note = null, updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'UPLOAD_DOCUMENT', 'document', p_document_id, jsonb_build_object('version_id', p_version_id));
end;
$$;

-- refresh_participant_document_status ya existía; se reemplaza solo para
-- permitir que apply_document_validation() (llamada por service_role, sin
-- sesión de usuario) también pueda invocarla. visible_unit() depende de
-- auth.uid(), que es null en una llamada de service_role — sin este bypass
-- explícito la llamada fallaría con NOT_ALLOWED.
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

  if v_current = 'CONFIRMED' then
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

-- ---------------------------------------------------------------------
-- 3) RPC que la Edge Function llama con el resultado ya parseado de Gemini
-- ---------------------------------------------------------------------
-- Decide el efecto en documents/document_versions siguiendo la sección 20:
--   - Problema bloqueante (formato no corresponde, ilegible, páginas
--     faltantes, o campos obligatorios faltantes) -> OBSERVED, con nota
--     humana para el líder. Esto es la IA señalando un problema de calidad,
--     no una decisión de aprobar/rechazar el contenido.
--   - Sin problema bloqueante y review_required=false (solo posible para
--     REGISTRATION_FORM en banda alta — ver puedeAutoValidarse en
--     prompts.ts) -> APPROVED automático.
--   - Cualquier otro caso -> se queda en UNDER_REVIEW; el hallazgo de la IA
--     solo enriquece la bandeja de revisión humana, nunca decide por ella.
create or replace function public.apply_document_validation(
  p_document_version_id uuid,
  p_confidence_band text,
  p_detected_document_type text,
  p_extracted_data jsonb,
  p_issues jsonb,
  p_review_required boolean,
  p_blocking_issue boolean,
  p_observation_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_id uuid;
  v_participant_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_confidence_band not in ('alta','media','baja') then
    raise exception 'INVALID_CONFIDENCE_BAND';
  end if;

  select document_id into v_document_id
  from public.document_versions where id = p_document_version_id;
  if v_document_id is null then raise exception 'VERSION_NOT_FOUND'; end if;

  select participant_id into v_participant_id
  from public.documents where id = v_document_id;

  insert into public.document_validations(
    document_version_id, validation_type, validation_status, confidence_score,
    detected_document_type, extracted_data_json, issues_json, review_required
  ) values (
    p_document_version_id, 'AI_GEMINI',
    case when p_blocking_issue then 'NEEDS_ATTENTION' else 'OK' end,
    p_confidence_band, p_detected_document_type, p_extracted_data, p_issues, p_review_required
  );

  if p_blocking_issue then
    update public.document_versions set status = 'OBSERVED' where id = p_document_version_id;
    update public.documents
    set status = 'OBSERVED', last_observation_note = p_observation_note, updated_at = now()
    where id = v_document_id and current_version_id = p_document_version_id;
  elsif not p_review_required then
    update public.document_versions set status = 'APPROVED' where id = p_document_version_id;
    update public.documents
    set status = 'APPROVED', last_observation_note = null, updated_at = now()
    where id = v_document_id and current_version_id = p_document_version_id;
  end if;

  if v_participant_id is not null then
    perform public.refresh_participant_document_status(v_participant_id);
  end if;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (null, 'AI_VALIDATE_DOCUMENT', 'document_version', p_document_version_id, jsonb_build_object(
    'blocking_issue', p_blocking_issue, 'review_required', p_review_required, 'confidence_band', p_confidence_band
  ));
end;
$$;

revoke all on function public.apply_document_validation(uuid, text, text, jsonb, jsonb, boolean, boolean, text) from public;
grant execute on function public.apply_document_validation(uuid, text, text, jsonb, jsonb, boolean, boolean, text) to service_role;

-- ---------------------------------------------------------------------
-- 4) Config privada para el trigger (no expuesta por la API: PostgREST
--    solo expone el esquema "public", así que un esquema aparte basta para
--    ocultarla, sin depender solo de RLS).
-- ---------------------------------------------------------------------
create schema if not exists private;

create table if not exists private.app_config (
  key text primary key,
  value text not null
);

-- Completa estos dos valores a mano después de desplegar la Edge Function
-- (nunca los subas al repo con el valor real puesto):
--   edge_function_url   -> https://TU_PROYECTO.supabase.co/functions/v1/validate-document
--   service_role_key    -> la Service Role key de tu proyecto (Settings > API)
insert into private.app_config(key, value) values
  ('edge_function_url', 'PEGAR_URL_DE_LA_EDGE_FUNCTION'),
  ('service_role_key', 'PEGAR_SERVICE_ROLE_KEY')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- 5) Trigger asíncrono: al subir una versión nueva, encola la validación
--    IA sin bloquear el insert (sección 39 — "no bloquear upload").
-- ---------------------------------------------------------------------
create or replace function private.notify_document_uploaded()
returns trigger
language plpgsql
security definer
set search_path = public, private, net
as $$
declare
  v_url text;
  v_service_key text;
begin
  select value into v_url from private.app_config where key = 'edge_function_url';
  select value into v_service_key from private.app_config where key = 'service_role_key';

  if v_url is null or v_url = 'PEGAR_URL_DE_LA_EDGE_FUNCTION' or v_service_key is null or v_service_key = 'PEGAR_SERVICE_ROLE_KEY' then
    raise warning 'private.app_config sin configurar: se omitió la validación IA para document_version %', new.id;
    return new;
  end if;

  begin
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_service_key),
      body := jsonb_build_object('document_version_id', new.id)
    );
  exception when others then
    -- Un fallo al encolar la petición nunca debe tumbar el upload del líder.
    raise warning 'No se pudo encolar la validación IA para document_version %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists document_versions_after_insert on public.document_versions;
create trigger document_versions_after_insert
after insert on public.document_versions
for each row execute function private.notify_document_uploaded();

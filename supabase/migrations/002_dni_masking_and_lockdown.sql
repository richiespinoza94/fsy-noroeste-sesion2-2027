-- FSY 2027 · MVP 1 · Parche de seguridad post-revisión
-- 1) El DNI ya no viaja completo al cliente: se calcula enmascarado en Postgres.
-- 2) Se cierra la policy que permitía a un admin confirmar por UPDATE directo,
--    saltándose la validación de documentos completos que vive en confirm_participant().

-- 1) DNI enmascarado -------------------------------------------------------

alter table public.participants
  add column if not exists document_number_masked text
  generated always as (
    case
      when document_number is not null and length(document_number) >= 2
        then 'DNI ••••••' || right(document_number, 2)
      else 'DNI pendiente'
    end
  ) stored;

-- Nadie autenticado puede leer el número completo por API; solo el
-- valor ya enmascarado. La creación (INSERT) sigue permitida vía
-- create_participant_with_slot, que corre con permisos de owner.
revoke select (document_number) on public.participants from authenticated;

-- 2) Cierre de bypass en confirmación ---------------------------------------

-- Ningún flujo del frontend hace UPDATE directo sobre participants: todas las
-- mutaciones pasan por funciones security definer (create_participant_with_slot,
-- confirm_participant, refresh_participant_document_status), que sí validan
-- reglas de negocio. Esta policy quedaba abierta sin uso y permitía que un
-- admin confirmara por UPDATE directo sin pasar por confirm_participant().
drop policy if exists "participants admins update" on public.participants;

-- Si en el futuro se necesita edición administrativa de datos del participante
-- (por ejemplo corregir un nombre mal escrito), debe implementarse como una
-- función security definer nueva con su propia validación — no reabrir esta
-- policy genérica.

-- 3) DNI duplicado en la misma sesión ---------------------------------------

create or replace function public.create_participant_with_slot(
  p_unit_id uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_second_last_name text,
  p_preferred_name text,
  p_birth_date date,
  p_sex text,
  p_document_number text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_stake_id uuid;
  v_participant_id uuid;
  v_document_number text;
begin
  if not public.can_manage_session() then
    raise exception 'NOT_ALLOWED';
  end if;
  if coalesce(trim(p_first_name), '') = '' or coalesce(trim(p_last_name), '') = '' then
    raise exception 'NAME_REQUIRED';
  end if;
  if p_birth_date is null or p_sex not in ('Hombre','Mujer') then
    raise exception 'INVALID_PARTICIPANT';
  end if;

  v_document_number := nullif(trim(p_document_number), '');
  if v_document_number is not null and v_document_number !~ '^[0-9]{8}$' then
    raise exception 'INVALID_DNI';
  end if;

  select session_id, stake_id into v_session_id, v_stake_id
  from public.units where id = p_unit_id;
  if v_session_id is null then raise exception 'UNIT_NOT_FOUND'; end if;

  if v_document_number is not null and exists (
    select 1 from public.participants
    where session_id = v_session_id and document_number = v_document_number
  ) then
    raise exception 'DUPLICATE_DNI';
  end if;

  insert into public.participants(
    session_id, stake_id, unit_id, first_name, middle_name, last_name, second_last_name,
    preferred_name, birth_date, sex, document_number, registration_source, status
  ) values (
    v_session_id, v_stake_id, p_unit_id, trim(p_first_name), nullif(trim(p_middle_name), ''),
    trim(p_last_name), nullif(trim(p_second_last_name), ''), nullif(trim(p_preferred_name), ''),
    p_birth_date, p_sex, v_document_number, 'MANUAL_IMPORT', 'DOCUMENTS_PENDING'
  ) returning id into v_participant_id;

  insert into public.registration_slots(session_id, stake_id, unit_id, slot_code, sex, current_participant_id, status)
  values (v_session_id, v_stake_id, p_unit_id, 'FSY27-' || upper(substr(replace(v_participant_id::text, '-', ''), 1, 10)), p_sex, v_participant_id, 'REGISTERED');

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'IMPORT_PARTICIPANT', 'participant', v_participant_id, jsonb_build_object('unit_id', p_unit_id, 'source', 'MANUAL_IMPORT'));

  return v_participant_id;
end;
$$;

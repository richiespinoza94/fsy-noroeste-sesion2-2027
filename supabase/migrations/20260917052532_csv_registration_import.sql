-- Original answers stay separate from operational participant lists.
create table public.registration_forms (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  source_answers jsonb not null check (jsonb_typeof(source_answers) = 'object'),
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now()
);
alter table public.registration_forms enable row level security;
revoke all on public.registration_forms from public, anon, authenticated;
grant select on public.registration_forms to authenticated;
create policy "registration answers administrators only" on public.registration_forms
for select to authenticated using (public.can_manage_session());

create function public.import_registration_csv(p_session_id uuid, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; k text; sid uuid; uid uuid; pid uuid; dob date;
  added integer := 0; skipped integer := 0; row_number integer := 1;
begin
  if auth.uid() is null or not coalesce(public.can_manage_session(),false) then raise exception 'NOT_ALLOWED'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then raise exception 'INVALID_CSV'; end if;
  if jsonb_array_length(p_rows) not between 1 and 500 or octet_length(p_rows::text) > 4000000 then raise exception 'CSV_LIMIT'; end if;
  -- Serialize imports for this session, including retries after a lost response.
  perform 1 from public.sessions where id=p_session_id and status in ('DRAFT','ACTIVE') for update;
  if not found then raise exception 'SESSION_NOT_FOUND'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    if jsonb_typeof(r) <> 'object' then raise exception 'INVALID_CSV_ROW %', row_number; end if;
    if not (r ?& array['Estaca','Barrio','Nombre de pila','Apellido','Nombre preferido','Fecha de nacimiento','Sexo','Tipo de solicitud','Teléfono','Correo electrónico','Contacto emergencia 1 nombre','Contacto emergencia 1 correo','Contacto emergencia 1 teléfono','Contacto emergencia 2 nombre','Contacto emergencia 2 correo','Contacto emergencia 2 teléfono','Obispo','Información médica','Información alimentaria','Talla de camiseta','Grupo sanguíneo y RH','Alergias','Tratamiento médico','Diabetes o asma','Seguro médico','Acepta condiciones y conducta','Nombre del firmante','Referencia de firma']) then raise exception 'MISSING_CSV_COLUMNS %',row_number; end if;
    if exists(select 1 from jsonb_each(r) where jsonb_typeof(value)<>'string') then raise exception 'INVALID_CSV_ROW %',row_number; end if;
    foreach k in array array['Estaca','Barrio','Nombre de pila','Apellido','Fecha de nacimiento','Sexo','Tipo de solicitud'] loop
      if coalesce(btrim(r->>k),'')='' then raise exception 'MISSING_CSV_FIELD % %',row_number,k; end if;
    end loop;
    if btrim(r->>'Tipo de solicitud') <> 'Participante' then raise exception 'PARTICIPANTS_ONLY %',row_number; end if;
    if btrim(r->>'Sexo') not in ('Hombre','Mujer') or btrim(r->>'Fecha de nacimiento') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_CSV_ROW %',row_number; end if;
    dob := btrim(r->>'Fecha de nacimiento')::date;
    if dob > current_date then raise exception 'INVALID_CSV_ROW %',row_number; end if;
    if exists(select 1 from public.registration_forms f join public.participants p on p.id=f.participant_id where p.session_id=p_session_id and f.source_answers=r) then
      skipped:=skipped+1; continue;
    end if;
    if exists(select 1 from public.participants p where p.session_id=p_session_id and lower(btrim(p.first_name))=lower(btrim(r->>'Nombre de pila')) and lower(btrim(p.last_name))=lower(btrim(r->>'Apellido')) and p.birth_date=dob) then
      raise exception 'POSSIBLE_DUPLICATE %',row_number;
    end if;
    select id into sid from public.stakes where session_id=p_session_id and lower(btrim(name))=lower(btrim(r->>'Estaca')) order by created_at limit 1;
    if sid is null then insert into public.stakes(session_id,name) values(p_session_id,btrim(r->>'Estaca')) returning id into sid; end if;
    select id into uid from public.units where session_id=p_session_id and stake_id=sid and lower(btrim(name))=lower(btrim(r->>'Barrio')) order by created_at limit 1;
    if uid is null then insert into public.units(session_id,stake_id,name) values(p_session_id,sid,btrim(r->>'Barrio')) returning id into uid; end if;
    pid := public.create_participant_with_slot(uid,btrim(r->>'Nombre de pila'),null,btrim(r->>'Apellido'),null,nullif(btrim(r->>'Nombre preferido'),''),dob,btrim(r->>'Sexo'),null);
    update public.participants set phone=nullif(btrim(r->>'Teléfono'),''),email=nullif(btrim(r->>'Correo electrónico'),''),registration_source='CSV_IMPORT' where id=pid;
    insert into public.registration_forms(participant_id,source_answers,imported_by) values(pid,r,auth.uid());
    added:=added+1;
  end loop;
  return jsonb_build_object('imported',added,'skipped',skipped);
end;
$$;
revoke all on function public.import_registration_csv(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.import_registration_csv(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';

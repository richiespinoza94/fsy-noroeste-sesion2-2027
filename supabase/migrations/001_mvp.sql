-- FSY 2027 · MVP 1
-- Base mínima segura para líderes de unidad, expedientes y revisión.

create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  deadline date not null,
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','CLOSED')),
  created_at timestamptz not null default now()
);

create table if not exists public.stakes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  stake_id uuid not null references public.stakes(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  display_name text not null,
  role text not null check (role in ('SUPER_ADMIN','SESSION_ADMIN','STAKE_COORDINATOR','UNIT_LEADER','REVIEWER','SUPPORT')),
  unit_id uuid references public.units(id),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  stake_id uuid not null references public.stakes(id),
  unit_id uuid not null references public.units(id),
  first_name text not null,
  middle_name text,
  last_name text not null,
  second_last_name text,
  preferred_name text,
  birth_date date not null,
  sex text not null check (sex in ('Hombre','Mujer')),
  document_type text default 'DNI',
  document_number text,
  phone text,
  email text,
  registration_source text not null default 'MANUAL_IMPORT',
  status text not null default 'REGISTERED' check (status in (
    'REGISTERED','DOCUMENTS_PENDING','DOCUMENTS_COMPLETE','UNDER_REVIEW','OBSERVED','CONFIRMED',
    'REPLACEMENT_REQUESTED','REPLACED','CANCELLED'
  )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_slots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  stake_id uuid not null references public.stakes(id),
  unit_id uuid not null references public.units(id),
  slot_code text not null unique,
  sex text not null check (sex in ('Hombre','Mujer')),
  current_participant_id uuid references public.participants(id),
  status text not null default 'REGISTERED' check (status in ('REGISTERED','CONFIRMED','REPLACEMENT_REQUESTED','REPLACED','CANCELLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.participant_guardians (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  relationship text,
  first_name text not null,
  last_name text not null,
  document_type text default 'DNI',
  document_number text,
  phone text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.document_requirements (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  document_type text not null check (document_type in (
    'REGISTRATION_FORM','IMAGE_AUTHORIZATION','MEDICAL_AUTHORIZATION','PARTICIPANT_DNI_FRONT',
    'PARTICIPANT_DNI_BACK','GUARDIAN_DNI_FRONT','GUARDIAN_DNI_BACK'
  )),
  required boolean not null default true,
  sort_order integer not null default 0,
  unique (session_id, document_type)
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  document_type text not null check (document_type in (
    'REGISTRATION_FORM','IMAGE_AUTHORIZATION','MEDICAL_AUTHORIZATION','PARTICIPANT_DNI_FRONT',
    'PARTICIPANT_DNI_BACK','GUARDIAN_DNI_FRONT','GUARDIAN_DNI_BACK'
  )),
  current_version_id uuid,
  status text not null default 'PENDING' check (status in ('PENDING','UNDER_REVIEW','OBSERVED','APPROVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, document_type)
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 12582912),
  file_name text not null,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  status text not null default 'UNDER_REVIEW' check (status in ('UNDER_REVIEW','OBSERVED','APPROVED')),
  unique (document_id, version_number)
);

alter table public.documents
  drop constraint if exists documents_current_version_id_fkey;
alter table public.documents
  add constraint documents_current_version_id_fkey foreign key (current_version_id) references public.document_versions(id);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists participants_unit_status_idx on public.participants(unit_id, status);
create index if not exists participants_session_status_idx on public.participants(session_id, status);
create index if not exists documents_participant_idx on public.documents(participant_id);
create index if not exists document_versions_document_idx on public.document_versions(document_id, version_number desc);

create or replace function public.current_unit_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select unit_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('SUPER_ADMIN','SESSION_ADMIN','REVIEWER')
  );
$$;

create or replace function public.can_manage_session()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('SUPER_ADMIN','SESSION_ADMIN')
  );
$$;

create or replace function public.visible_unit(p_unit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or p_unit_id = public.current_unit_id();
$$;

create or replace function public.visible_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.units u
    where u.id = public.current_unit_id() and u.session_id = p_session_id
  );
$$;

grant execute on function public.current_unit_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_manage_session() to authenticated;
grant execute on function public.visible_unit(uuid) to authenticated;
grant execute on function public.visible_session(uuid) to authenticated;

alter table public.sessions enable row level security;
alter table public.stakes enable row level security;
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.participants enable row level security;
alter table public.registration_slots enable row level security;
alter table public.participant_guardians enable row level security;
alter table public.document_requirements enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.audit_logs enable row level security;

create policy "sessions visible to session users" on public.sessions for select to authenticated
using (public.visible_session(id));

create policy "stakes visible to session users" on public.stakes for select to authenticated
using (public.visible_session(session_id));

create policy "units visible to unit or admins" on public.units for select to authenticated
using (public.visible_unit(id) or public.is_admin());

create policy "profiles self or admins" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "participants visible by unit" on public.participants for select to authenticated
using (public.visible_unit(unit_id));

create policy "participants admins insert" on public.participants for insert to authenticated
with check (public.can_manage_session());

create policy "participants admins update" on public.participants for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "slots visible by unit" on public.registration_slots for select to authenticated
using (public.visible_unit(unit_id));

create policy "slots admins write" on public.registration_slots for all to authenticated
using (public.can_manage_session()) with check (public.can_manage_session());

create policy "guardians visible by participant unit" on public.participant_guardians for select to authenticated
using (exists (
  select 1 from public.participants p
  where p.id = participant_id and public.visible_unit(p.unit_id)
));

create policy "requirements visible by session" on public.document_requirements for select to authenticated
using (public.visible_session(session_id));

create policy "requirements admins write" on public.document_requirements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "documents visible by participant unit" on public.documents for select to authenticated
using (exists (
  select 1 from public.participants p
  where p.id = participant_id and public.visible_unit(p.unit_id)
));

create policy "leaders create pending documents" on public.documents for insert to authenticated
with check (
  status = 'PENDING'
  and exists (
    select 1 from public.participants p
    where p.id = participant_id and public.visible_unit(p.unit_id)
  )
);

create policy "versions visible by participant unit" on public.document_versions for select to authenticated
using (exists (
  select 1
  from public.documents d
  join public.participants p on p.id = d.participant_id
  where d.id = document_id and public.visible_unit(p.unit_id)
));

create policy "leaders upload versions" on public.document_versions for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and status = 'UNDER_REVIEW'
  and exists (
    select 1
    from public.documents d
    join public.participants p on p.id = d.participant_id
    where d.id = document_id and public.visible_unit(p.unit_id)
  )
);

create policy "audit visible to admins" on public.audit_logs for select to authenticated
using (public.is_admin());

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
  set current_version_id = p_version_id, status = 'UNDER_REVIEW', updated_at = now()
  where id = p_document_id;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'UPLOAD_DOCUMENT', 'document', p_document_id, jsonb_build_object('version_id', p_version_id));
end;
$$;

grant execute on function public.attach_document_version(uuid, uuid) to authenticated;

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

  if v_unit_id is null or not public.visible_unit(v_unit_id) then
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

grant execute on function public.refresh_participant_document_status(uuid) to authenticated;

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

  if nullif(trim(p_document_number), '') is not null and trim(p_document_number) !~ '^[0-9]{8}$' then
    raise exception 'INVALID_DNI';
  end if;

  select session_id, stake_id into v_session_id, v_stake_id
  from public.units where id = p_unit_id;
  if v_session_id is null then raise exception 'UNIT_NOT_FOUND'; end if;

  insert into public.participants(
    session_id, stake_id, unit_id, first_name, middle_name, last_name, second_last_name,
    preferred_name, birth_date, sex, document_number, registration_source, status
  ) values (
    v_session_id, v_stake_id, p_unit_id, trim(p_first_name), nullif(trim(p_middle_name), ''),
    trim(p_last_name), nullif(trim(p_second_last_name), ''), nullif(trim(p_preferred_name), ''),
    p_birth_date, p_sex, nullif(trim(p_document_number), ''), 'MANUAL_IMPORT', 'DOCUMENTS_PENDING'
  ) returning id into v_participant_id;

  insert into public.registration_slots(session_id, stake_id, unit_id, slot_code, sex, current_participant_id, status)
  values (v_session_id, v_stake_id, p_unit_id, 'FSY27-' || upper(substr(replace(v_participant_id::text, '-', ''), 1, 10)), p_sex, v_participant_id, 'REGISTERED');

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_json)
  values (auth.uid(), 'IMPORT_PARTICIPANT', 'participant', v_participant_id, jsonb_build_object('unit_id', p_unit_id, 'source', 'MANUAL_IMPORT'));

  return v_participant_id;
end;
$$;

grant execute on function public.create_participant_with_slot(uuid, text, text, text, text, text, date, text, text) to authenticated;

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
   and d.status in ('UNDER_REVIEW','APPROVED')
  where r.session_id = v_before.session_id and r.required = true;

  if v_required = 0 or v_ready < v_required then
    raise exception 'DOCUMENTS_INCOMPLETE';
  end if;

  update public.documents
  set status = 'APPROVED', updated_at = now()
  where participant_id = p_participant_id and status = 'UNDER_REVIEW';

  update public.participants
  set status = 'CONFIRMED', updated_at = now()
  where id = p_participant_id;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, before_json, after_json)
  values (auth.uid(), 'CONFIRM_PARTICIPANT', 'participant', p_participant_id, to_jsonb(v_before), jsonb_build_object('status','CONFIRMED'));
end;
$$;

grant execute on function public.confirm_participant(uuid) to authenticated;

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
    count(*) filter (where status in ('DOCUMENTS_COMPLETE','UNDER_REVIEW'))
  into v_total, v_confirmed, v_attention, v_review
  from public.participants
  where session_id = v_session and (v_unit is null or unit_id = v_unit);

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
    coalesce(new.raw_user_meta_data->>'role', 'UNIT_LEADER'),
    nullif(new.raw_user_meta_data->>'unit_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Storage privado. Ruta esperada: <unit_id>/<participant_id>/<document_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'participant-documents',
  'participant-documents',
  false,
  12582912,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents storage read" on storage.objects;
create policy "documents storage read" on storage.objects for select to authenticated
using (
  bucket_id = 'participant-documents'
  and public.visible_unit(((storage.foldername(name))[1])::uuid)
);

drop policy if exists "documents storage upload" on storage.objects;
create policy "documents storage upload" on storage.objects for insert to authenticated
with check (
  bucket_id = 'participant-documents'
  and public.visible_unit(((storage.foldername(name))[1])::uuid)
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp','pdf')
);

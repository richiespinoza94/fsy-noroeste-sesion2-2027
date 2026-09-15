-- Datos organizacionales de ejemplo. No crea usuarios de Auth.
insert into public.sessions (id, name, year, deadline, status)
values ('20270000-0000-4000-8000-000000000002', 'FSY Lima Noroeste · Sesión 2 · 2027', 2027, '2027-07-12', 'ACTIVE')
on conflict (id) do nothing;

insert into public.stakes (id, session_id, name)
values ('20270000-0000-4000-8000-000000000101', '20270000-0000-4000-8000-000000000002', 'Estaca Ventanilla')
on conflict (id) do nothing;

insert into public.units (id, session_id, stake_id, name)
values ('20270000-0000-4000-8000-000000000201', '20270000-0000-4000-8000-000000000002', '20270000-0000-4000-8000-000000000101', 'Barrio Ventanilla')
on conflict (id) do nothing;

insert into public.document_requirements(session_id, document_type, required, sort_order)
values
  ('20270000-0000-4000-8000-000000000002', 'REGISTRATION_FORM', true, 10),
  ('20270000-0000-4000-8000-000000000002', 'IMAGE_AUTHORIZATION', true, 20),
  ('20270000-0000-4000-8000-000000000002', 'MEDICAL_AUTHORIZATION', true, 30),
  ('20270000-0000-4000-8000-000000000002', 'PARTICIPANT_DNI_FRONT', true, 40),
  ('20270000-0000-4000-8000-000000000002', 'PARTICIPANT_DNI_BACK', true, 50),
  ('20270000-0000-4000-8000-000000000002', 'GUARDIAN_DNI_FRONT', true, 60),
  ('20270000-0000-4000-8000-000000000002', 'GUARDIAN_DNI_BACK', true, 70)
on conflict (session_id, document_type) do update set required = excluded.required, sort_order = excluded.sort_order;

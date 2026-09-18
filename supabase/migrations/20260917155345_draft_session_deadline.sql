-- A draft can be prepared before the deadline is decided.
alter table public.sessions alter column deadline drop not null;
alter table public.sessions add constraint active_session_needs_deadline check (status <> 'ACTIVE' or deadline is not null);
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
    from public.sessions where status in ('ACTIVE','DRAFT') order by (status='ACTIVE') desc, year desc, created_at desc limit 1;
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

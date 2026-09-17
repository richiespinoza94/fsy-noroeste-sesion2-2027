-- One assigned account per unit. Unassigned Auth profiles remain possible
-- while the administrator completes provisioning.
create unique index one_leader_account_per_unit on public.profiles(unit_id)
where role = 'UNIT_LEADER' and unit_id is not null;

-- Supervisors review documents; only administrators configure requirements.
drop policy if exists "requirements admins write" on public.document_requirements;
create policy "requirements administrators write" on public.document_requirements
for all to authenticated using (public.can_manage_session()) with check (public.can_manage_session());

-- Request status workflow migration
-- Adds business-friendly request statuses for admin triage visibility.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'client_requests_status_check'
  ) then
    alter table public.client_requests drop constraint client_requests_status_check;
  end if;
end $$;

alter table if exists public.client_requests
  alter column status set default 'new';

update public.client_requests
set status = 'new'
where status = 'open';

update public.client_requests
set status = 'viewed'
where status = 'in_progress';

alter table public.client_requests
  add constraint client_requests_status_check
  check (
    status in (
      'new',
      'viewed',
      'read',
      'awaiting_assignee',
      'assigned',
      'resolved',
      'closed'
    )
  );

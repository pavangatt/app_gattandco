-- Sprint 2 approval workflow migration
-- Makes assignment approval state pending by default for new assignment creation.

alter table if exists public.assignments
  alter column approval_state set default 'pending_approval';

update public.assignments
set approval_state = 'pending_approval'
where approval_state is null;

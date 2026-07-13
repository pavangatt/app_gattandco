-- Sprint 3 archival completeness migration
-- Adds archive support for assignment lifecycle audits and tracks purge counts.

alter table if exists public.assignment_lifecycle_audits
  add column if not exists archived_at timestamptz;

alter table if exists public.archive_purge_logs
  add column if not exists assignment_lifecycle_audits_deleted int not null default 0;

create index if not exists idx_assignment_lifecycle_audits_archived_at
  on public.assignment_lifecycle_audits(archived_at);

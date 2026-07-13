-- Sprint 8 reminder and messaging automation migration
-- Adds reminder settings persistence and seeds default template toggles.

create table if not exists public.reminder_automation_settings (
  template_key text primary key check (template_key in ('visit_reminder_d1', 'backfilled_visit_notice', 'family_monthly_update')),
  enabled boolean not null default true,
  updated_by bigint references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_reminder_automation_settings_enabled
  on public.reminder_automation_settings(enabled);

insert into public.reminder_automation_settings (template_key, enabled)
values
  ('visit_reminder_d1', true),
  ('backfilled_visit_notice', true),
  ('family_monthly_update', false)
on conflict (template_key) do nothing;

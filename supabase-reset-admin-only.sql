-- Admin-only reset for Gatt & Co
-- Purpose:
-- 1) Remove all operational demo/live entries
-- 2) Keep only a single Admin account
--
-- Seed admin login:
-- user_id: admin01
-- email: admin01@demo.gattandco.local
-- password: 1234567890

begin;

truncate table
  public.archive_purge_logs,
  public.notification_action_logs,
  public.client_family_contact_audits,
  public.client_family_contacts,
  public.client_requests,
  public.visit_status_checks,
  public.buddy_location_logs,
  public.visit_sessions,
  public.visit_tasks,
  public.visits,
  public.short_term_visit_slots,
  public.assignment_lifecycle_audits,
  public.care_plan_services,
  public.assignments,
  public.elderly_client_access,
  public.elderly_members,
  public.reminder_automation_settings,
  public.users
restart identity cascade;

insert into public.users (
  user_id,
  full_name,
  email,
  phone,
  address,
  client_onboarding_type,
  password_hash,
  role,
  is_active
)
values (
  'admin01',
  'Nisha Rao',
  'admin01@demo.gattandco.local',
  '9000000000',
  'Central Admin Office, Bengaluru',
  null,
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'admin',
  true
);

commit;

-- Minimal reset + seed for Gatt & Co
-- Purpose:
-- 1) Remove all existing data from operational tables
-- 2) Create a compact, valid dataset for flow visualization
--
-- Resulting seed shape (core flow tables):
-- - users: 10 (1 admin, 4 buddies, 5 clients)
-- - elderly_members: 10
-- - assignments: 10
-- - care_plan_services: 10
-- - assignment_lifecycle_audits: 10
-- - visits: 10
-- - visit_tasks: 10
-- - visit_sessions: 10
-- - visit_status_checks: 10
-- - buddy_location_logs: 10
-- - client_requests: 10
-- - client_family_contacts: 10
-- - client_family_contact_audits: 10
-- - notification_action_logs: 10
--
-- Reminder settings are reset to the 3 valid template keys.
--
-- Seed login password for all users: 1234567890
-- BCrypt hash for the password above:
-- $2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22

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
  public.assignment_lifecycle_audits,
  public.care_plan_services,
  public.assignments,
  public.elderly_client_access,
  public.elderly_members,
  public.reminder_automation_settings,
  public.users
restart identity cascade;

-- 1) Users (10 rows)
insert into public.users (user_id, full_name, email, phone, address, client_onboarding_type, password_hash, role, is_active)
values
  ('admin01', 'Admin User', 'admin01@demo.gattandco.local', '9000000000', 'HQ Office', null, '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22', 'admin', true);

insert into public.users (user_id, full_name, email, phone, address, client_onboarding_type, password_hash, role, is_active)
select
  format('buddy%02s', i),
  format('Buddy %s', i),
  format('buddy%02s@demo.gattandco.local', i),
  format('91000000%02s', i),
  format('Buddy Block %s, Bengaluru', i),
  null,
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'buddy',
  true
from generate_series(1, 4) as gs(i);

insert into public.users (user_id, full_name, email, phone, address, client_onboarding_type, password_hash, role, is_active)
select
  format('client%02s', i),
  format('Client %s', i),
  format('client%02s@demo.gattandco.local', i),
  format('92000000%02s', i),
  format('Client Street %s, Bengaluru', i),
  case when i % 2 = 0 then 'self_service' else 'kin_requested' end,
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'client',
  true
from generate_series(1, 5) as gs(i);

-- 2) Elderly members (10 rows, 2 per client)
with clients as (
  select id, row_number() over (order by id) as client_rn
  from public.users
  where role = 'client'
),
slots as (
  select c.id as client_id, c.client_rn, s.slot
  from clients c
  cross join generate_series(1, 2) as s(slot)
)
insert into public.elderly_members (
  client_id,
  full_name,
  gender,
  age,
  blood_group,
  medical_notes,
  allergies,
  address,
  emergency_contact_name,
  emergency_contact_phone,
  care_start_date,
  is_active
)
select
  client_id,
  format('Elderly %s-%s', client_rn, slot),
  case when (client_rn + slot) % 2 = 0 then 'Female' else 'Male' end,
  68 + ((client_rn + slot) % 12),
  case when (client_rn + slot) % 4 = 0 then 'A+' when (client_rn + slot) % 4 = 1 then 'B+' when (client_rn + slot) % 4 = 2 then 'O+' else 'AB+' end,
  case when slot = 1 then 'BP monitoring' else 'Diabetes monitoring' end,
  case when slot = 2 then 'Dust allergy' else 'None' end,
  format('Care Address %s-%s, Bengaluru', client_rn, slot),
  format('Family Contact %s', client_rn),
  format('9300000%03s', ((client_rn - 1) * 2 + slot)),
  current_date - (((client_rn - 1) * 2 + slot) * interval '3 day'),
  true
from slots;

-- 3) Assignments (10 rows)
with buddies as (
  select id, row_number() over (order by id) as buddy_rn
  from public.users
  where role = 'buddy'
),
elders as (
  select id, row_number() over (order by id) as elder_rn
  from public.elderly_members
),
admin_user as (
  select id from public.users where role = 'admin' limit 1
)
insert into public.assignments (
  buddy_id,
  elderly_id,
  status,
  term_type,
  service_plan_type,
  approval_state,
  care_shift,
  monthly_visit_plan,
  planned_visit_duration_minutes,
  service_for_client_id,
  start_date,
  end_date,
  extension_end_date,
  admin_notes,
  created_by
)
select
  b.id as buddy_id,
  e.id as elderly_id,
  'active' as status,
  case when e.elder_rn % 2 = 0 then 'long' else 'short' end as term_type,
  case when e.elder_rn % 2 = 0 then 'long_term' else 'short_term' end as service_plan_type,
  'approved' as approval_state,
  case when e.elder_rn % 2 = 0
    then case (e.elder_rn % 3)
      when 0 then 'morning_10h'
      when 1 then 'night_10h'
      else 'full_day'
    end
    else null
  end as care_shift,
  case when e.elder_rn % 2 = 1 then (array[3,6,9])[1 + (e.elder_rn % 3)] else null end as monthly_visit_plan,
  case when e.elder_rn % 2 = 1 then (case when e.elder_rn % 3 = 0 then 90 else 60 end) else null end as planned_visit_duration_minutes,
  em.client_id as service_for_client_id,
  current_date - (e.elder_rn * interval '2 day') as start_date,
  case when e.elder_rn % 2 = 0 then current_date + (20 * interval '1 day') else null end as end_date,
  null as extension_end_date,
  format('Minimal demo assignment #%s', e.elder_rn),
  (select id from admin_user)
from elders e
join public.elderly_members em on em.id = e.id
join buddies b on b.buddy_rn = ((e.elder_rn - 1) % 4) + 1;

-- 4) Care plan services (10 rows, one per assignment)
with assignment_rows as (
  select id, row_number() over (order by id) as rn
  from public.assignments
)
insert into public.care_plan_services (assignment_id, service_code, service_name, is_required)
select
  a.id,
  codes.service_code,
  codes.service_name,
  true
from assignment_rows a
join lateral (
  select *
  from (
    values
      ('walking_companion', 'Walking companion'),
      ('conversation_emotional_support', 'Conversation and emotional support'),
      ('hospital_accompaniment', 'Hospital accompaniment'),
      ('medicine_pickup', 'Medicine pickup'),
      ('grocery_shopping_assistance', 'Grocery shopping assistance'),
      ('technology_help', 'Technology help'),
      ('monthly_family_updates', 'Monthly family updates')
  ) as svc(service_code, service_name)
  order by service_code
  offset ((a.rn - 1) % 7)
  limit 1
) as codes on true;

-- 5) Assignment lifecycle audits (10 rows)
insert into public.assignment_lifecycle_audits (assignment_id, from_status, to_status, actor_user_id, notes)
select
  a.id,
  null,
  'approved',
  (select id from public.users where role = 'admin' limit 1),
  'Approved during minimal reset seed'
from public.assignments a
order by a.id;

-- 6) Visits (10 rows)
insert into public.visits (
  buddy_id,
  elderly_id,
  assignment_id,
  scheduled_date,
  visit_status,
  arrival_time,
  departure_time,
  arrival_lat_lng,
  status_check,
  buddy_notes,
  client_visible_notes
)
select
  a.buddy_id,
  a.elderly_id,
  a.id,
  current_date - ((row_number() over (order by a.id) - 1) * interval '1 day') as scheduled_date,
  case
    when row_number() over (order by a.id) in (3, 8) then 'missed'
    when row_number() over (order by a.id) in (5) then 'in_progress'
    else 'completed'
  end as visit_status,
  (current_date - ((row_number() over (order by a.id) - 1) * interval '1 day'))::timestamptz + interval '09:15',
  (current_date - ((row_number() over (order by a.id) - 1) * interval '1 day'))::timestamptz + interval '10:05',
  format('%s,%s', 12.950000 + (a.id * 0.001), 77.560000 + (a.id * 0.001)),
  case when row_number() over (order by a.id) in (3, 8) then 'Attention needed' else 'Good' end,
  format('Visit note for assignment %s', a.id),
  'Visit update available for client.'
from public.assignments a
order by a.id;

-- 7) Visit tasks (10 rows, one per visit)
insert into public.visit_tasks (
  visit_id,
  task_name,
  task_category,
  status,
  measured_value,
  measured_unit,
  buddy_remarks,
  client_visible_remarks,
  carry_forward_reason,
  updated_at
)
select
  v.id,
  case when row_number() over (order by v.id) % 2 = 0 then 'Medication check' else 'Vitals update' end,
  case when row_number() over (order by v.id) % 2 = 0 then 'medication' else 'vitals' end,
  case when v.visit_status = 'missed' then 'carried_forward' else 'completed' end,
  case when row_number() over (order by v.id) % 2 = 0 then 'Taken' else '120/80' end,
  case when row_number() over (order by v.id) % 2 = 0 then '' else 'mmHg' end,
  case when v.visit_status = 'missed' then 'Carried to next visit' else 'Completed during visit' end,
  case when v.visit_status = 'missed' then 'Pending, visit missed' else 'Task completed' end,
  case when v.visit_status = 'missed' then 'Client unavailable at scheduled window' else null end,
  now()
from public.visits v
order by v.id;

-- 8) Visit sessions (10 rows)
insert into public.visit_sessions (
  assignment_id,
  visit_id,
  session_date,
  intime,
  outtime,
  entry_notes,
  exit_notes,
  backfilled,
  backfill_reason
)
select
  v.assignment_id,
  v.id,
  v.scheduled_date,
  v.arrival_time,
  v.departure_time,
  'Entered home and started care session.',
  'Exited after care checklist completion.',
  case when row_number() over (order by v.id) = 7 then true else false end,
  case when row_number() over (order by v.id) = 7 then 'Retroactive entry for missed live update' else null end
from public.visits v
order by v.id;

-- 9) Visit status checks (10 rows)
insert into public.visit_status_checks (
  visit_id,
  check_type,
  severity,
  metric_name,
  metric_value,
  notes,
  recorded_by,
  recorded_at
)
select
  v.id,
  'general',
  case when v.visit_status = 'missed' then 'attention' else 'good' end,
  'Daily wellness',
  case when v.visit_status = 'missed' then 'Follow-up needed' else 'Stable' end,
  case when v.visit_status = 'missed' then 'Could not perform full check due to missed visit.' else 'No immediate concerns.' end,
  v.buddy_id,
  now() - ((row_number() over (order by v.id)) * interval '2 hour')
from public.visits v
order by v.id;

-- 10) Buddy location logs (10 rows)
insert into public.buddy_location_logs (
  buddy_id,
  elderly_id,
  visit_id,
  latitude,
  longitude,
  accuracy_m,
  source,
  recorded_at
)
select
  v.buddy_id,
  v.elderly_id,
  v.id,
  round((12.940000 + (v.id * 0.001))::numeric, 6),
  round((77.550000 + (v.id * 0.001))::numeric, 6),
  8.50,
  'gps',
  now() - ((row_number() over (order by v.id)) * interval '90 minute')
from public.visits v
order by v.id;

-- 11) Client requests (10 rows)
with elders as (
  select id, client_id, row_number() over (order by id) as rn
  from public.elderly_members
)
insert into public.client_requests (user_id, elderly_id, request_type, message, status, created_at, resolved_at)
select
  e.client_id,
  e.id,
  case (e.rn % 3)
    when 0 then 'task_request'
    when 1 then 'feedback'
    else 'special_care'
  end,
  format('Request %s for elderly record %s', e.rn, e.id),
  case
    when e.rn in (1, 2) then 'new'
    when e.rn in (3, 4) then 'viewed'
    when e.rn in (5, 6) then 'assigned'
    when e.rn in (7, 8) then 'resolved'
    else 'closed'
  end,
  now() - (e.rn * interval '5 hour'),
  case when e.rn >= 7 then now() - (e.rn * interval '2 hour') else null end
from elders e
order by e.id;

-- 12) Family contacts (10 rows, 2 per client, exactly one primary/client)
with clients as (
  select id, row_number() over (order by id) as client_rn
  from public.users
  where role = 'client'
),
elders as (
  select id, client_id, row_number() over (partition by client_id order by id) as elder_slot
  from public.elderly_members
),
contact_rows as (
  select
    c.id as client_id,
    c.client_rn,
    gs.slot,
    e.id as elderly_id
  from clients c
  join generate_series(1, 2) as gs(slot) on true
  join elders e on e.client_id = c.id and e.elder_slot = gs.slot
)
insert into public.client_family_contacts (
  client_id,
  elderly_id,
  contact_name,
  relation_label,
  phone,
  whatsapp_opt_in,
  is_primary
)
select
  cr.client_id,
  cr.elderly_id,
  format('Family %s-%s', cr.client_rn, cr.slot),
  case when cr.slot = 1 then 'Daughter/Son' else 'Sibling' end,
  format('940000%04s', ((cr.client_rn - 1) * 2 + cr.slot)),
  true,
  case when cr.slot = 1 then true else false end
from contact_rows cr
order by cr.client_rn, cr.slot;

-- 13) Family contact audits (10 rows)
insert into public.client_family_contact_audits (
  family_contact_id,
  client_id,
  elderly_id,
  actor_user_id,
  action_type,
  contact_name,
  relation_label,
  phone,
  whatsapp_opt_in,
  is_primary,
  created_at
)
select
  c.id,
  c.client_id,
  c.elderly_id,
  (select id from public.users where role = 'admin' limit 1),
  'created',
  c.contact_name,
  c.relation_label,
  c.phone,
  c.whatsapp_opt_in,
  c.is_primary,
  now() - ((row_number() over (order by c.id)) * interval '1 hour')
from public.client_family_contacts c
order by c.id;

-- 14) Notification action logs (10 rows)
insert into public.notification_action_logs (
  client_id,
  family_contact_id,
  actor_user_id,
  recipient_role,
  recipient_name,
  recipient_phone,
  channel,
  template_key,
  message_preview,
  created_at
)
select
  c.client_id,
  c.id,
  (select id from public.users where role = 'admin' limit 1),
  case when c.is_primary then 'family' else 'client' end,
  c.contact_name,
  c.phone,
  case when row_number() over (order by c.id) % 2 = 0 then 'whatsapp' else 'notify' end,
  case
    when row_number() over (order by c.id) % 3 = 0 then 'family_monthly_update'
    when row_number() over (order by c.id) % 3 = 1 then 'visit_reminder_d1'
    else 'backfilled_visit_notice'
  end,
  format('Notification preview for contact %s', c.id),
  now() - ((row_number() over (order by c.id)) * interval '40 minute')
from public.client_family_contacts c
order by c.id;

-- 15) Reminder automation settings (3 valid rows)
insert into public.reminder_automation_settings (template_key, enabled, updated_by)
values
  ('visit_reminder_d1', true, (select id from public.users where role = 'admin' limit 1)),
  ('backfilled_visit_notice', true, (select id from public.users where role = 'admin' limit 1)),
  ('family_monthly_update', false, (select id from public.users where role = 'admin' limit 1))
on conflict (template_key) do update
set
  enabled = excluded.enabled,
  updated_by = excluded.updated_by,
  updated_at = now();

commit;

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
  public.short_term_visit_slots,
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
  ('admin01', 'Nisha Rao', 'admin01@demo.gattandco.local', '9000000000', 'Central Admin Office, Bengaluru', null, '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22', 'admin', true);

with buddy_seed as (
  select *
  from (
    values
      (1, 'Arjun Mehta', 'Indiranagar, Bengaluru'),
      (2, 'Priya Nair', 'JP Nagar, Bengaluru'),
      (3, 'Rahul Verma', 'Whitefield, Bengaluru'),
      (4, 'Sneha Iyer', 'HSR Layout, Bengaluru')
  ) as t(i, full_name, address)
)
insert into public.users (user_id, full_name, email, phone, address, client_onboarding_type, password_hash, role, is_active)
select
  ('buddy' || lpad(bs.i::text, 2, '0')),
  bs.full_name,
  ('buddy' || lpad(bs.i::text, 2, '0') || '@demo.gattandco.local'),
  ('91000000' || lpad(bs.i::text, 2, '0')),
  bs.address,
  null,
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'buddy',
  true
from buddy_seed bs;

with client_seed as (
  select *
  from (
    values
      (1, 'Anita Sharma', 'Koramangala, Bengaluru', 'kin_requested'),
      (2, 'Vikram Joshi', 'Malleshwaram, Bengaluru', 'self_service'),
      (3, 'Meera Menon', 'Banashankari, Bengaluru', 'kin_requested'),
      (4, 'Karan Patel', 'Hebbal, Bengaluru', 'self_service'),
      (5, 'Pooja Kulkarni', 'Sarjapur Road, Bengaluru', 'kin_requested')
  ) as t(i, full_name, address, onboarding)
)
insert into public.users (user_id, full_name, email, phone, address, client_onboarding_type, password_hash, role, is_active)
select
  ('client' || lpad(cs.i::text, 2, '0')),
  cs.full_name,
  ('client' || lpad(cs.i::text, 2, '0') || '@demo.gattandco.local'),
  ('92000000' || lpad(cs.i::text, 2, '0')),
  cs.address,
  cs.onboarding,
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'client',
  true
from client_seed cs;

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
),
slot_rows as (
  select
    s.client_id,
    s.client_rn,
    s.slot,
    row_number() over (order by s.client_rn, s.slot) as rn
  from slots s
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
  sr.client_id,
  case sr.rn
    when 1 then 'Savitri Sharma'
    when 2 then 'Raghav Sharma'
    when 3 then 'Leela Joshi'
    when 4 then 'Mahesh Joshi'
    when 5 then 'Devika Menon'
    when 6 then 'Gopal Menon'
    when 7 then 'Kamala Patel'
    when 8 then 'Harish Patel'
    when 9 then 'Usha Kulkarni'
    else 'Mohan Kulkarni'
  end,
  case when (sr.client_rn + sr.slot) % 2 = 0 then 'Female' else 'Male' end,
  66 + ((sr.rn * 2) % 16),
  case when sr.rn % 4 = 0 then 'A+' when sr.rn % 4 = 1 then 'B+' when sr.rn % 4 = 2 then 'O+' else 'AB+' end,
  case
    when sr.rn in (1, 4, 8) then 'BP monitoring and evening walk support'
    when sr.rn in (2, 5, 9) then 'Diabetes and diet tracking'
    else 'Post-surgery mobility support'
  end,
  case when sr.rn in (3, 7) then 'Dust allergy' else 'None' end,
  case sr.rn
    when 1 then '4th Block, Koramangala, Bengaluru'
    when 2 then '4th Block, Koramangala, Bengaluru'
    when 3 then '8th Cross, Malleshwaram, Bengaluru'
    when 4 then '8th Cross, Malleshwaram, Bengaluru'
    when 5 then '3rd Stage, Banashankari, Bengaluru'
    when 6 then '3rd Stage, Banashankari, Bengaluru'
    when 7 then 'Outer Ring Road, Hebbal, Bengaluru'
    when 8 then 'Outer Ring Road, Hebbal, Bengaluru'
    when 9 then 'Kaikondrahalli, Sarjapur Road, Bengaluru'
    else 'Kaikondrahalli, Sarjapur Road, Bengaluru'
  end,
  case
    when sr.client_rn = 1 then 'Anita Sharma'
    when sr.client_rn = 2 then 'Vikram Joshi'
    when sr.client_rn = 3 then 'Meera Menon'
    when sr.client_rn = 4 then 'Karan Patel'
    else 'Pooja Kulkarni'
  end,
  ('9300000' || lpad(sr.rn::text, 3, '0')),
  current_date - (sr.rn * interval '3 day'),
  true
from slot_rows sr;

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
  case (row_number() over (order by a.id))
    when 1 then 'Morning mobility support and medication reminder completed.'
    when 2 then 'Assisted with breakfast and hydration checks.'
    when 3 then 'Follow-up needed, client not available at scheduled time.'
    when 4 then 'Vitals captured and caregiver coordination done.'
    when 5 then 'In-progress home support, pending checkout update.'
    when 6 then 'Light physiotherapy session completed.'
    when 7 then 'Hospital follow-up preparation support completed.'
    when 8 then 'Missed due to family emergency, reschedule requested.'
    when 9 then 'Evening care routine completed smoothly.'
    else 'General wellness check completed.'
  end,
  case
    when row_number() over (order by a.id) in (3, 8) then 'Visit could not be completed; follow-up is planned.'
    else 'Visit update shared with family and client.'
  end
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
  case (e.rn % 5)
    when 0 then 'Need evening caregiver support for next two days.'
    when 1 then 'Please arrange medicine pickup before tomorrow morning.'
    when 2 then 'Requesting feedback call regarding weekly progress.'
    when 3 then 'Need help with hospital follow-up visit scheduling.'
    else 'Please update care notes for family review.'
  end,
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
),
contact_ranked as (
  select
    cr.*,
    row_number() over (order by cr.client_rn, cr.slot) as rn
  from contact_rows cr
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
  case cr.rn
    when 1 then 'Rohit Sharma'
    when 2 then 'Kavya Sharma'
    when 3 then 'Neha Joshi'
    when 4 then 'Amit Joshi'
    when 5 then 'Sanjay Menon'
    when 6 then 'Asha Menon'
    when 7 then 'Ritu Patel'
    when 8 then 'Nitin Patel'
    when 9 then 'Ajay Kulkarni'
    else 'Rekha Kulkarni'
  end,
  case
    when cr.slot = 1 then 'Daughter/Son'
    when cr.client_rn in (2, 4) then 'Spouse'
    else 'Sibling'
  end,
  ('940000' || lpad(cr.rn::text, 4, '0')),
  true,
  case when cr.slot = 1 then true else false end
from contact_ranked cr
order by cr.client_rn, cr.slot;

-- Defensive cleanup to guarantee no accidental whitespace in key identity fields.
update public.users
set
  user_id = regexp_replace(coalesce(user_id, ''), '\\s+', '', 'g'),
  email = regexp_replace(coalesce(email, ''), '\\s+', '', 'g'),
  phone = regexp_replace(coalesce(phone, ''), '\\s+', '', 'g');

update public.client_family_contacts
set
  phone = regexp_replace(coalesce(phone, ''), '\\s+', '', 'g');

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

-- 16) Optional edge-case mode for QA flow testing
-- Set apply_edge_cases to false if you want the plain baseline dataset only.
do $$
declare
  apply_edge_cases boolean := true;
begin
  if not apply_edge_cases then
    return;
  end if;

  -- Assignment edge cases: paused, rejected, rescheduled.
  with ranked_assignments as (
    select id, row_number() over (order by id) as rn
    from public.assignments
  )
  update public.assignments a
  set
    status = case
      when ra.rn = 1 then 'paused'
      when ra.rn = 2 then 'paused'
      else a.status
    end,
    approval_state = case
      when ra.rn = 2 then 'rejected'
      when ra.rn = 3 then 'rescheduled'
      else a.approval_state
    end,
    admin_notes = case
      when ra.rn = 1 then 'Edge case: temporarily paused by admin for QA'
      when ra.rn = 2 then 'Edge case: rejected for missing documents'
      when ra.rn = 3 then 'Edge case: rescheduled by care coordinator'
      else a.admin_notes
    end
  from ranked_assignments ra
  where a.id = ra.id;

  insert into public.assignment_lifecycle_audits (assignment_id, from_status, to_status, actor_user_id, notes)
  select
    a.id,
    'approved',
    case
      when ra.rn = 1 then 'paused'
      when ra.rn = 2 then 'rejected'
      when ra.rn = 3 then 'rescheduled'
      else 'approved'
    end,
    (select id from public.users where role = 'admin' limit 1),
    'Edge case transition seeded for validation.'
  from public.assignments a
  join (
    select id, row_number() over (order by id) as rn
    from public.assignments
  ) ra on ra.id = a.id
  where ra.rn in (1, 2, 3);

  -- Visit edge cases: cancelled and scheduled future row.
  with ranked_visits as (
    select id, row_number() over (order by id) as rn
    from public.visits
  )
  update public.visits v
  set
    visit_status = case
      when rv.rn = 1 then 'cancelled'
      when rv.rn = 2 then 'scheduled'
      else v.visit_status
    end,
    buddy_notes = case
      when rv.rn = 1 then 'Edge case: cancelled due to caregiver unavailability.'
      when rv.rn = 2 then 'Edge case: upcoming scheduled visit for tomorrow.'
      else v.buddy_notes
    end,
    client_visible_notes = case
      when rv.rn = 1 then 'Visit cancelled and family notified.'
      when rv.rn = 2 then 'Visit is scheduled and pending start.'
      else v.client_visible_notes
    end,
    scheduled_date = case
      when rv.rn = 2 then current_date + interval '1 day'
      else v.scheduled_date
    end
  from ranked_visits rv
  where v.id = rv.id;

  -- Task edge case aligned with cancelled visit.
  with ranked_tasks as (
    select id, row_number() over (order by id) as rn
    from public.visit_tasks
  )
  update public.visit_tasks t
  set
    status = case when rt.rn = 1 then 'skipped' else t.status end,
    buddy_remarks = case when rt.rn = 1 then 'Edge case: task skipped because visit was cancelled.' else t.buddy_remarks end,
    client_visible_remarks = case when rt.rn = 1 then 'Task skipped due to cancelled visit.' else t.client_visible_remarks end,
    carry_forward_reason = case when rt.rn = 1 then 'Visit cancellation' else t.carry_forward_reason end
  from ranked_tasks rt
  where t.id = rt.id;

  -- Request edge cases: include read + awaiting_assignee explicitly.
  with ranked_requests as (
    select id, row_number() over (order by id) as rn
    from public.client_requests
  )
  update public.client_requests r
  set
    status = case
      when rr.rn = 1 then 'new'
      when rr.rn = 2 then 'viewed'
      when rr.rn = 3 then 'read'
      when rr.rn = 4 then 'awaiting_assignee'
      when rr.rn in (5, 6) then 'assigned'
      when rr.rn in (7, 8) then 'resolved'
      else 'closed'
    end,
    resolved_at = case
      when rr.rn >= 7 then now() - (rr.rn * interval '1 hour')
      else null
    end,
    message = case
      when rr.rn = 3 then 'Edge case: request marked as read, waiting for assignment.'
      when rr.rn = 4 then 'Edge case: awaiting assignee due to shift handover.'
      else r.message
    end
  from ranked_requests rr
  where r.id = rr.id;
end
$$;

commit;

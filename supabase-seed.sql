-- Demo seed data for Gatt and Co
-- Safe to re-run: it uses upserts and existence checks.
-- Default password for seeded users: 1234567890

begin;

-- 1) Seed users
insert into public.users (full_name, email, phone, password_hash, role, is_active)
values (
  'Admin',
  'admin@demo.gattandco.local',
  '9000000000',
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'admin',
  true
)
on conflict (email) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = true;

insert into public.users (full_name, email, phone, password_hash, role, is_active)
select
  format('Buddy %s', gs.i),
  format('buddy%02s@demo.gattandco.local', gs.i),
  format('91000000%02s', gs.i),
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'buddy',
  true
from generate_series(1, 5) as gs(i)
on conflict (email) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = true;

insert into public.users (full_name, email, phone, password_hash, role, is_active)
select
  format('Client %s', gs.i),
  format('client%02s@demo.gattandco.local', gs.i),
  format('92000000%02s', gs.i),
  '$2a$10$FnJZ7jO5Ui7WSQ0.Tn02g.e3GlJNXw.Ld/j6OhidoqCoi8r7/sL22',
  'client',
  true
from generate_series(1, 20) as gs(i)
on conflict (email) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  password_hash = excluded.password_hash,
  role = excluded.role,
  is_active = true;

-- 2) Seed elderly profiles (1 profile per client)
with client_rows as (
  select id, row_number() over (order by id) as rn
  from public.users
  where role = 'client' and email like 'client%@demo.gattandco.local'
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
  c.id,
  format('Elderly Person %s', c.rn),
  case when c.rn % 2 = 0 then 'Female' else 'Male' end,
  65 + (c.rn % 21),
  case
    when c.rn % 4 = 0 then 'A+'
    when c.rn % 4 = 1 then 'B+'
    when c.rn % 4 = 2 then 'O+'
    else 'AB+'
  end,
  case
    when c.rn % 3 = 0 then 'Diabetes monitoring'
    when c.rn % 3 = 1 then 'BP monitoring'
    else 'Post-surgery support'
  end,
  case when c.rn % 5 = 0 then 'Dust allergy' else 'None' end,
  format('House %s, Main Street, Bengaluru', c.rn),
  format('Client %s', c.rn),
  format('92000000%02s', c.rn),
  current_date - ((c.rn % 120) * interval '1 day'),
  true
from client_rows c
where not exists (
  select 1 from public.elderly_members em where em.client_id = c.id
);

-- Keep profile labels current for existing seed records.
with client_rows as (
  select id, row_number() over (order by id) as rn
  from public.users
  where role = 'client' and email like 'client%@demo.gattandco.local'
)
update public.elderly_members em
set
  full_name = format('Elderly Person %s', c.rn),
  updated_at = now()
from client_rows c
where em.client_id = c.id;

-- 3) Optional extra daughter/son access (secondary viewers)
with em as (
  select id, row_number() over (order by id) as rn
  from public.elderly_members
  where full_name like 'Elderly Person %'
),
clients as (
  select id, row_number() over (order by id) as rn
  from public.users
  where role = 'client' and email like 'client%@demo.gattandco.local'
),
pairs as (
  select em.id as elderly_id, c2.id as client_user_id
  from em
  join clients c1 on c1.rn = em.rn
  join clients c2 on c2.rn = case when c1.rn = 20 then 1 else c1.rn + 1 end
  where em.rn <= 8
)
insert into public.elderly_client_access (elderly_id, client_user_id, relation_label, is_primary)
select p.elderly_id, p.client_user_id, 'Daughter/Son', false
from pairs p
on conflict (elderly_id, client_user_id) do nothing;

-- 4) Seed active assignments (round-robin buddy allocation)
with buddies as (
  select id, row_number() over (order by id) as rn
  from public.users
  where role = 'buddy' and email like 'buddy%@demo.gattandco.local'
),
elders as (
  select id, row_number() over (order by id) as rn
  from public.elderly_members
  where full_name like 'Elderly Person %'
),
admin_row as (
  select id from public.users where role = 'admin' and email = 'admin@demo.gattandco.local' limit 1
),
assigned as (
  select
    e.id as elderly_id,
    b.id as buddy_id,
    case when e.rn % 2 = 0 then 'long' else 'short' end as term_type,
    current_date - ((e.rn % 20) * interval '1 day') as start_date,
    (select id from admin_row) as admin_id
  from elders e
  join buddies b on b.rn = ((e.rn - 1) % 5) + 1
)
insert into public.assignments (buddy_id, elderly_id, status, term_type, start_date, created_by, admin_notes)
select a.buddy_id, a.elderly_id, 'active', a.term_type, a.start_date, a.admin_id, 'Auto-seeded assignment'
from assigned a
where not exists (
  select 1 from public.assignments x
  where x.buddy_id = a.buddy_id and x.elderly_id = a.elderly_id and x.status = 'active'
);

-- 5) Seed 30 days of daily visits for active assignments
with active_assignments as (
  select id as assignment_id, buddy_id, elderly_id
  from public.assignments
  where status = 'active'
),
days as (
  select (current_date - gs.i) as visit_date, gs.i as day_offset
  from generate_series(0, 29) as gs(i)
),
visits_to_insert as (
  select
    aa.assignment_id,
    aa.buddy_id,
    aa.elderly_id,
    d.visit_date,
    d.day_offset,
    (d.visit_date::timestamptz + interval '09:00' + ((aa.elderly_id % 45) * interval '1 minute')) as arrival_time,
    (d.visit_date::timestamptz + interval '10:00' + ((aa.elderly_id % 45) * interval '1 minute')) as departure_time,
    format('%s,%s',
      round((12.940000 + (aa.elderly_id % 50) * 0.001 + d.day_offset * 0.0001)::numeric, 6),
      round((77.550000 + (aa.buddy_id % 50) * 0.001 + d.day_offset * 0.0001)::numeric, 6)
    ) as arrival_lat_lng,
    case
      when d.day_offset % 11 = 0 then 'Weak'
      when d.day_offset % 7 = 0 then 'Attention needed'
      else 'Good'
    end as status_check,
    case
      when d.day_offset % 11 = 0 then 'Follow-up required tomorrow.'
      when d.day_offset % 7 = 0 then 'Medication and hydration reinforced.'
      else 'Routine care completed.'
    end as buddy_notes,
    case when d.day_offset % 9 = 0 then 'in_progress' else 'completed' end as visit_status
  from active_assignments aa
  cross join days d
)
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
  v.buddy_id,
  v.elderly_id,
  v.assignment_id,
  v.visit_date,
  v.visit_status,
  v.arrival_time,
  v.departure_time,
  v.arrival_lat_lng,
  v.status_check,
  v.buddy_notes,
  'Daily visit completed. Health and comfort reviewed.'
from visits_to_insert v
where not exists (
  select 1 from public.visits x
  where x.buddy_id = v.buddy_id
    and x.elderly_id = v.elderly_id
    and x.scheduled_date = v.visit_date
);

-- 6) Seed tasks per visit (with carry-forward behavior)
with visit_rows as (
  select id, elderly_id, scheduled_date
  from public.visits
  where scheduled_date >= current_date - interval '29 days'
),
base_tasks as (
  select
    v.id as visit_id,
    'Medication check'::text as task_name,
    case when extract(day from v.scheduled_date)::int % 6 = 0 then 'carried_forward' else 'completed' end as status,
    case when extract(day from v.scheduled_date)::int % 6 = 0 then '' else 'On time' end as measured_value,
    'Taken'::text as measured_unit,
    case when extract(day from v.scheduled_date)::int % 6 = 0 then 'Deferred to next visit' else 'Medication administered' end as buddy_remarks,
    case when extract(day from v.scheduled_date)::int % 6 = 0 then 'Pending due to sleep cycle' else null end as carry_forward_reason
  from visit_rows v
  union all
  select
    v.id as visit_id,
    'Vitals update'::text as task_name,
    'completed'::text as status,
    format('%s/%s', 118 + (v.elderly_id % 12), 76 + (v.elderly_id % 8)) as measured_value,
    'mmHg'::text as measured_unit,
    'Vitals stable'::text as buddy_remarks,
    null::text as carry_forward_reason
  from visit_rows v
)
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
  t.visit_id,
  t.task_name,
  case when t.task_name = 'Vitals update' then 'vitals' else 'medication' end,
  t.status,
  t.measured_value,
  t.measured_unit,
  t.buddy_remarks,
  case when t.status = 'completed' then 'Completed as planned' else 'Carried to next visit' end,
  t.carry_forward_reason,
  now()
from base_tasks t
where not exists (
  select 1 from public.visit_tasks x
  where x.visit_id = t.visit_id and x.task_name = t.task_name
);

-- 7) Seed structured status checks
with visit_rows as (
  select id, buddy_id, scheduled_date
  from public.visits
  where scheduled_date >= current_date - interval '29 days'
)
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
  case when extract(day from v.scheduled_date)::int % 10 = 0 then 'attention' else 'good' end,
  'Daily wellness',
  case when extract(day from v.scheduled_date)::int % 10 = 0 then 'Needs follow-up' else 'Stable' end,
  case when extract(day from v.scheduled_date)::int % 10 = 0 then 'Requested follow-up call with family.' else 'No concerns.' end,
  v.buddy_id,
  (v.scheduled_date::timestamptz + interval '10:05')
from visit_rows v
where not exists (
  select 1 from public.visit_status_checks s
  where s.visit_id = v.id and s.check_type = 'general'
);

-- 8) Seed location logs (arrival + departure points)
with visit_rows as (
  select id, buddy_id, elderly_id, arrival_time, departure_time
  from public.visits
  where scheduled_date >= current_date - interval '29 days'
),
arrival_rows as (
  select
    v.id as visit_id,
    v.buddy_id,
    v.elderly_id,
    split_part(v2.arrival_lat_lng, ',', 1)::numeric as latitude,
    split_part(v2.arrival_lat_lng, ',', 2)::numeric as longitude,
    v.arrival_time as recorded_at,
    'arrival'::text as source
  from visit_rows v
  join public.visits v2 on v2.id = v.id
  where v2.arrival_lat_lng is not null
),
departure_rows as (
  select
    v.id as visit_id,
    v.buddy_id,
    v.elderly_id,
    split_part(v2.arrival_lat_lng, ',', 1)::numeric + 0.0002 as latitude,
    split_part(v2.arrival_lat_lng, ',', 2)::numeric + 0.0002 as longitude,
    coalesce(v.departure_time, v.arrival_time + interval '55 minutes') as recorded_at,
    'departure'::text as source
  from visit_rows v
  join public.visits v2 on v2.id = v.id
  where v2.arrival_lat_lng is not null
)
insert into public.buddy_location_logs (visit_id, buddy_id, elderly_id, latitude, longitude, accuracy_m, source, recorded_at)
select r.visit_id, r.buddy_id, r.elderly_id, r.latitude, r.longitude, 12.5, r.source, r.recorded_at
from (
  select * from arrival_rows
  union all
  select * from departure_rows
) r
where not exists (
  select 1 from public.buddy_location_logs l
  where l.visit_id = r.visit_id and l.source = r.source
);

-- 9) Seed client requests
with clients as (
  select id, row_number() over (order by id) as rn
  from public.users
  where role = 'client' and email like 'client%@demo.gattandco.local'
),
elderly as (
  select id, client_id
  from public.elderly_members
)
insert into public.client_requests (user_id, elderly_id, request_type, message, status)
select
  c.id,
  e.id,
  case when c.rn % 3 = 0 then 'special_care' when c.rn % 3 = 1 then 'task_request' else 'feedback' end,
  case
    when c.rn % 3 = 0 then 'Please monitor mobility support closely this week.'
    when c.rn % 3 = 1 then 'Kindly add evening hydration reminder.'
    else 'Thank you team, please continue same schedule.'
  end,
  case when c.rn % 4 = 0 then 'in_progress' else 'open' end
from clients c
join elderly e on e.client_id = c.id
where not exists (
  select 1 from public.client_requests r
  where r.user_id = c.id and r.message like '%schedule%'
);

commit;

-- Quick test logins (all password: 1234567890)
-- admin@demo.gattandco.local
-- buddy01@demo.gattandco.local
-- client01@demo.gattandco.local

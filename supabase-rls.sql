-- Optional Row Level Security policies for direct Supabase access.
-- If your app only uses backend service-role keys, these are not mandatory.

-- Assumes users.auth_user_id maps to auth.users.id.

create or replace function public.current_user_row()
returns public.users
language sql
stable
as $$
  select u.*
  from public.users u
  where u.auth_user_id = auth.uid()
  limit 1
$$;

alter table public.users enable row level security;
alter table public.elderly_members enable row level security;
alter table public.elderly_client_access enable row level security;
alter table public.assignments enable row level security;
alter table public.visits enable row level security;
alter table public.visit_tasks enable row level security;
alter table public.buddy_location_logs enable row level security;
alter table public.visit_status_checks enable row level security;
alter table public.client_requests enable row level security;

-- USERS

drop policy if exists users_self_or_admin_select on public.users;
create policy users_self_or_admin_select on public.users
for select
using (
  auth.uid() = auth_user_id
  or (public.current_user_row()).role = 'admin'
);

-- ELDERLY MEMBERS

drop policy if exists elderly_admin_all on public.elderly_members;
create policy elderly_admin_all on public.elderly_members
for all
using ((public.current_user_row()).role = 'admin')
with check ((public.current_user_row()).role = 'admin');

drop policy if exists elderly_buddy_assigned_select on public.elderly_members;
create policy elderly_buddy_assigned_select on public.elderly_members
for select
using (
  (public.current_user_row()).role = 'buddy'
  and exists (
    select 1 from public.assignments a
    where a.elderly_id = elderly_members.id
      and a.buddy_id = (public.current_user_row()).id
      and a.status = 'active'
  )
);

drop policy if exists elderly_client_own_select on public.elderly_members;
create policy elderly_client_own_select on public.elderly_members
for select
using (
  (public.current_user_row()).role = 'client'
  and (
    elderly_members.client_id = (public.current_user_row()).id
    or exists (
      select 1 from public.elderly_client_access eca
      where eca.elderly_id = elderly_members.id
        and eca.client_user_id = (public.current_user_row()).id
    )
  )
);

-- ASSIGNMENTS

drop policy if exists assignments_admin_all on public.assignments;
create policy assignments_admin_all on public.assignments
for all
using ((public.current_user_row()).role = 'admin')
with check ((public.current_user_row()).role = 'admin');

drop policy if exists assignments_buddy_select on public.assignments;
create policy assignments_buddy_select on public.assignments
for select
using (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
);

drop policy if exists assignments_client_select on public.assignments;
create policy assignments_client_select on public.assignments
for select
using (
  (public.current_user_row()).role = 'client'
  and elderly_id in (
    select em.id
    from public.elderly_members em
    where em.client_id = (public.current_user_row()).id
       or exists (
         select 1 from public.elderly_client_access eca
         where eca.elderly_id = em.id
           and eca.client_user_id = (public.current_user_row()).id
       )
  )
);

-- VISITS

drop policy if exists visits_admin_all on public.visits;
create policy visits_admin_all on public.visits
for all
using ((public.current_user_row()).role = 'admin')
with check ((public.current_user_row()).role = 'admin');

drop policy if exists visits_buddy_select_update on public.visits;
create policy visits_buddy_select_update on public.visits
for select
using (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
);

create policy visits_buddy_update on public.visits
for update
using (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
)
with check (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
);

drop policy if exists visits_client_select on public.visits;
create policy visits_client_select on public.visits
for select
using (
  (public.current_user_row()).role = 'client'
  and elderly_id in (
    select em.id
    from public.elderly_members em
    where em.client_id = (public.current_user_row()).id
       or exists (
         select 1 from public.elderly_client_access eca
         where eca.elderly_id = em.id
           and eca.client_user_id = (public.current_user_row()).id
       )
  )
);

-- TASKS

drop policy if exists visit_tasks_admin_all on public.visit_tasks;
create policy visit_tasks_admin_all on public.visit_tasks
for all
using ((public.current_user_row()).role = 'admin')
with check ((public.current_user_row()).role = 'admin');

drop policy if exists visit_tasks_buddy_select_update_insert on public.visit_tasks;
create policy visit_tasks_buddy_select on public.visit_tasks
for select
using (
  (public.current_user_row()).role = 'buddy'
  and exists (
    select 1 from public.visits v
    where v.id = visit_tasks.visit_id
      and v.buddy_id = (public.current_user_row()).id
  )
);

create policy visit_tasks_buddy_insert on public.visit_tasks
for insert
with check (
  (public.current_user_row()).role = 'buddy'
  and exists (
    select 1 from public.visits v
    where v.id = visit_tasks.visit_id
      and v.buddy_id = (public.current_user_row()).id
  )
);

create policy visit_tasks_buddy_update on public.visit_tasks
for update
using (
  (public.current_user_row()).role = 'buddy'
  and exists (
    select 1 from public.visits v
    where v.id = visit_tasks.visit_id
      and v.buddy_id = (public.current_user_row()).id
  )
)
with check (
  (public.current_user_row()).role = 'buddy'
  and exists (
    select 1 from public.visits v
    where v.id = visit_tasks.visit_id
      and v.buddy_id = (public.current_user_row()).id
  )
);

drop policy if exists visit_tasks_client_select on public.visit_tasks;
create policy visit_tasks_client_select on public.visit_tasks
for select
using (
  (public.current_user_row()).role = 'client'
  and exists (
    select 1
    from public.visits v
    join public.elderly_members em on em.id = v.elderly_id
    where v.id = visit_tasks.visit_id
      and (
        em.client_id = (public.current_user_row()).id
        or exists (
          select 1 from public.elderly_client_access eca
          where eca.elderly_id = em.id
            and eca.client_user_id = (public.current_user_row()).id
        )
      )
  )
);

-- LOCATION LOGS

drop policy if exists location_admin_all on public.buddy_location_logs;
create policy location_admin_all on public.buddy_location_logs
for all
using ((public.current_user_row()).role = 'admin')
with check ((public.current_user_row()).role = 'admin');

create policy location_buddy_insert_select on public.buddy_location_logs
for select
using (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
);

create policy location_buddy_insert on public.buddy_location_logs
for insert
with check (
  (public.current_user_row()).role = 'buddy'
  and buddy_id = (public.current_user_row()).id
);

create policy location_client_select on public.buddy_location_logs
for select
using (
  (public.current_user_row()).role = 'client'
  and elderly_id in (
    select em.id
    from public.elderly_members em
    where em.client_id = (public.current_user_row()).id
       or exists (
         select 1 from public.elderly_client_access eca
         where eca.elderly_id = em.id
           and eca.client_user_id = (public.current_user_row()).id
       )
  )
);

-- Introduce user_id login and enforce unique login credentials.
-- Run in Supabase SQL Editor on existing deployments.

alter table if exists public.users
  add column if not exists user_id text;

-- Normalize existing phones to digits only for consistent uniqueness/login.
update public.users
set phone = regexp_replace(coalesce(phone, ''), '\\D', '', 'g')
where phone is not null;

-- Backfill user_id where missing.
update public.users
set user_id = lower(regexp_replace(coalesce(nullif(full_name, ''), 'user'), '[^a-zA-Z0-9]+', '_', 'g'))
where user_id is null or btrim(user_id) = '';

-- Resolve user_id duplicates deterministically.
with ranked as (
  select id, lower(user_id) as normalized_user_id, row_number() over (partition by lower(user_id) order by id) as rn
  from public.users
)
update public.users as u
set user_id = case
  when r.rn = 1 then r.normalized_user_id
  else r.normalized_user_id || '_' || u.id::text
end
from ranked as r
where u.id = r.id;

-- Ensure lower-case storage for stable matching.
update public.users
set user_id = lower(user_id);

alter table if exists public.users
  alter column user_id set not null;

-- Unique constraints/indexes for credentials.
create unique index if not exists uq_users_user_id_lower on public.users (lower(user_id));
create unique index if not exists uq_users_email_lower on public.users (lower(email));
create unique index if not exists uq_users_phone_digits on public.users ((regexp_replace(phone, '\\D', '', 'g')))
where phone is not null and btrim(phone) <> '';

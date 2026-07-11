-- Adds address storage for buddy/client user profiles.
-- Run this in Supabase SQL Editor for existing deployments.

alter table if exists public.users
  add column if not exists address text default '';

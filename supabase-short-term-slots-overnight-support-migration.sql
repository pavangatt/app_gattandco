-- Allows short-term slots to cross midnight by removing end_time > start_time check.

begin;

do $$
declare
  constraint_row record;
begin
  for constraint_row in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'short_term_visit_slots'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%end_time > start_time%'
  loop
    execute format('alter table public.short_term_visit_slots drop constraint %I', constraint_row.conname);
  end loop;
end $$;

commit;

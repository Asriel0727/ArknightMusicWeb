-- Run this migration on an existing activity archive database.
-- It deliberately does not create or replace tables, RLS, or policies.

alter table public.recruitment_pools add column if not exists slug text;
alter table public.recruitment_pools add column if not exists image_url text;

-- Existing manually entered pools need a unique, non-empty value before the
-- synchronization key can be added. Do not infer a title-based slug here: an
-- id-based value cannot collide with generated pool slugs.
update public.recruitment_pools
set slug = concat('legacy-', id::text)
where slug is null or slug = '';

alter table public.recruitment_pools alter column slug set not null;

alter table public.recruitment_pool_operators
  add column if not exists operator_data jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'recruitment_pools_activity_server_slug_unique'
      and conrelid = 'public.recruitment_pools'::regclass
  ) then
    alter table public.recruitment_pools
      add constraint recruitment_pools_activity_server_slug_unique
      unique (activity_id, server, slug);
  end if;
end $$;

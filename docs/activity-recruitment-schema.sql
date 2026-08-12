-- 活動、卡池與角色取得方式共用的資料模型。
-- 伺服器代碼：cn = 陸服、global = 國際服、tw = 繁中服。

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_i18n jsonb not null default '{}'::jsonb,
  type text not null,
  image_url text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_type_check check (type in ('side_story', 'intermezzi', 'collaboration', 'campaign', 'anniversary', 'other'))
);

create table if not exists public.activity_windows (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  server text not null check (server in ('cn', 'global', 'tw')),
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activity_windows_server_time_unique unique (activity_id, server, start_at),
  constraint activity_windows_time_check check (end_at is null or end_at > start_at)
);

create table if not exists public.recruitment_pools (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete set null,
  slug text not null,
  kind text not null check (kind in ('standard', 'kernel', 'limited', 'event')),
  name_i18n jsonb not null default '{}'::jsonb,
  image_url text,
  server text not null check (server in ('cn', 'global', 'tw')),
  start_at timestamptz not null,
  end_at timestamptz,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_pools_time_check check (end_at is null or end_at > start_at),
  constraint recruitment_pools_activity_server_slug_unique unique (activity_id, server, slug)
);

create table if not exists public.recruitment_pool_operators (
  recruitment_pool_id uuid not null references public.recruitment_pools(id) on delete cascade,
  operator_id text not null,
  identity text not null check (identity in ('featured', 'off_banner', 'limited', 'free')),
  operator_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (recruitment_pool_id, operator_id, identity)
);

create table if not exists public.operator_acquisition_records (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid references public.activities(id) on delete set null,
  operator_id text not null,
  operator_name_i18n jsonb not null default '{}'::jsonb,
  acquisition_type text not null check (acquisition_type in ('event_reward', 'shop', 'login', 'mission', 'other')),
  server text not null check (server in ('cn', 'global', 'tw')),
  source_url text,
  created_at timestamptz not null default now()
);

create index if not exists activity_windows_server_start_idx on public.activity_windows (server, start_at desc);
create index if not exists recruitment_pools_server_start_idx on public.recruitment_pools (server, start_at desc);
create index if not exists recruitment_pools_activity_idx on public.recruitment_pools (activity_id);
create index if not exists operator_acquisition_records_activity_server_idx on public.operator_acquisition_records (activity_id, server);

alter table public.activities enable row level security;
alter table public.activity_windows enable row level security;
alter table public.recruitment_pools enable row level security;
alter table public.recruitment_pool_operators enable row level security;
alter table public.operator_acquisition_records enable row level security;

drop policy if exists "Public activities are readable" on public.activities;
create policy "Public activities are readable" on public.activities for select using (true);
drop policy if exists "Public activity windows are readable" on public.activity_windows;
create policy "Public activity windows are readable" on public.activity_windows for select using (true);
drop policy if exists "Public recruitment pools are readable" on public.recruitment_pools;
create policy "Public recruitment pools are readable" on public.recruitment_pools for select using (true);
drop policy if exists "Public recruitment pool operators are readable" on public.recruitment_pool_operators;
create policy "Public recruitment pool operators are readable" on public.recruitment_pool_operators for select using (true);
drop policy if exists "Public operator acquisitions are readable" on public.operator_acquisition_records;
create policy "Public operator acquisitions are readable" on public.operator_acquisition_records for select using (true);

-- Existing installations created before pool synchronization need these columns
-- and the unique key used by the REST upsert. Run this section once after the
-- schema above. Legacy rows receive a stable id-based slug and remain intact.
alter table public.recruitment_pools add column if not exists slug text;
alter table public.recruitment_pools add column if not exists image_url text;
update public.recruitment_pools
set slug = concat('legacy-', id::text)
where slug is null or slug = '';
alter table public.recruitment_pools alter column slug set not null;
alter table public.recruitment_pool_operators
  add column if not exists operator_data jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'recruitment_pools_activity_server_slug_unique'
  ) then
    alter table public.recruitment_pools
      add constraint recruitment_pools_activity_server_slug_unique
      unique (activity_id, server, slug);
  end if;
end $$;

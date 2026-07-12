create table if not exists public.operator_release_dates (
  operator_key text not null,
  server text not null check (server in ('cn', 'global', 'tw')),
  operator_name text not null,
  character_id text,
  cn_name text,
  tw_name text,
  jp_name text,
  kr_name text,
  event_name text,
  release_at timestamptz not null,
  is_cn boolean not null default false,
  source_url text not null default 'https://arknights.wiki.gg/wiki/Operator/List',
  updated_at timestamptz not null default now(),
  primary key (operator_key, server)
);

alter table public.operator_release_dates add column if not exists character_id text;
alter table public.operator_release_dates add column if not exists cn_name text;
alter table public.operator_release_dates add column if not exists tw_name text;
alter table public.operator_release_dates add column if not exists jp_name text;
alter table public.operator_release_dates add column if not exists kr_name text;

create index if not exists operator_release_dates_character_server_idx
  on public.operator_release_dates (character_id, server);

create index if not exists operator_release_dates_server_release_idx
  on public.operator_release_dates (server, release_at desc);

alter table public.operator_release_dates enable row level security;

drop policy if exists "Public operator release dates are readable"
  on public.operator_release_dates;
create policy "Public operator release dates are readable"
  on public.operator_release_dates for select
  using (true);

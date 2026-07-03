create table if not exists public.user_playlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_playlist_songs (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.user_playlists(id) on delete cascade,
  song_cid text not null,
  sort_order integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (playlist_id, song_cid)
);

create table if not exists public.user_favorite_songs (
  user_id uuid not null,
  song_cid text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, song_cid)
);

create table if not exists public.user_character_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_character_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.user_character_lists(id) on delete cascade,
  character_id text not null,
  sort_order integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  unique (list_id, character_id)
);

create index if not exists idx_user_playlists_user_id
  on public.user_playlists(user_id);

create index if not exists idx_user_favorite_songs_user_id
  on public.user_favorite_songs(user_id);

create index if not exists idx_user_character_lists_user_id
  on public.user_character_lists(user_id);

alter table public.user_playlists enable row level security;
alter table public.user_playlist_songs enable row level security;
alter table public.user_favorite_songs enable row level security;
alter table public.user_character_lists enable row level security;
alter table public.user_character_list_items enable row level security;

-- This project uses Worker-issued sessions, not Supabase Auth sessions.
-- The frontend never writes these tables directly; the Worker uses the service role key.
-- RLS stays enabled so anon/authenticated Supabase clients cannot access rows by default.

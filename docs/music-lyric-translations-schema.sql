create table if not exists public.music_lyric_translations (
  song_cid text not null,
  lyrics_hash text not null,
  source_locale text not null default 'auto',
  target_locale text not null,
  source_lyrics text not null default '',
  translated_lyrics text not null default '',
  translations jsonb not null default '[]'::jsonb,
  line_count integer not null default 0,
  provider text not null default 'google-translate',
  schema_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (song_cid, lyrics_hash, target_locale),
  constraint music_lyric_translations_target_locale_check
    check (target_locale in ('zh-TW', 'zh-CN', 'en', 'ja', 'ko')),
  constraint music_lyric_translations_json_check
    check (jsonb_typeof(translations) = 'array'),
  constraint music_lyric_translations_line_count_check
    check (line_count >= 0 and jsonb_array_length(translations) = line_count)
);

alter table public.music_lyric_translations
  add column if not exists source_lyrics text not null default '',
  add column if not exists translated_lyrics text not null default '';

create index if not exists music_lyric_translations_song_idx
  on public.music_lyric_translations (song_cid, updated_at desc);

create index if not exists music_lyric_translations_locale_idx
  on public.music_lyric_translations (target_locale, updated_at desc);

alter table public.music_lyric_translations enable row level security;

revoke all on table public.music_lyric_translations from anon, authenticated;
grant all on table public.music_lyric_translations to service_role;

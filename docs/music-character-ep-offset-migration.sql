-- Character EP video intro calibration.
-- Run this once in Supabase after the music_character_ep_videos table exists.

alter table public.music_character_ep_videos
  add column if not exists video_offset_seconds numeric(8,3) not null default 0
  constraint music_character_ep_videos_video_offset_seconds_check
  check (video_offset_seconds >= 0 and video_offset_seconds <= 3600);

-- Existing PRTS-curated Bilibili videos currently use the shared ~5-second
-- logo-intro estimate. Adjust individual rows after visual verification.
update public.music_character_ep_videos
set video_offset_seconds = 5
where author_mid = 'prts:music'
  and source_url like 'https://www.bilibili.com/%'
  and video_offset_seconds = 0;

comment on column public.music_character_ep_videos.video_offset_seconds is
  'Seconds to skip at the start of the embedded video so its content aligns with the song audio.';

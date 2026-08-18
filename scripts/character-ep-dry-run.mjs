import { findSongMatch, isExplicitEpTitle } from './character-ep-matching.mjs';

const sourceHandle = String(process.env.YOUTUBE_EP_SOURCE_HANDLE || 'rivervworkshop').trim().replace(/^@/, '');
const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!youtubeApiKey) throw new Error('YOUTUBE_API_KEY is required.');
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

async function getJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function getSupabaseRows(table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: supabaseServiceRoleKey, authorization: `Bearer ${supabaseServiceRoleKey}` },
  });
  if (!response.ok) throw new Error(`Supabase ${table} read failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function getYoutubeVideos() {
  const base = 'https://www.googleapis.com/youtube/v3';
  const channel = await getJson(
    `${base}/channels?part=contentDetails&forHandle=${encodeURIComponent(sourceHandle)}&key=${encodeURIComponent(youtubeApiKey)}`,
    'YouTube channel lookup',
  );
  const uploadsPlaylistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error(`YouTube channel @${sourceHandle} was not found or has no uploads playlist.`);

  const videos = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ part: 'snippet,contentDetails', playlistId: uploadsPlaylistId, maxResults: '50', key: youtubeApiKey });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await getJson(`${base}/playlistItems?${params}`, 'YouTube uploads lookup');
    for (const item of page.items || []) {
      const videoId = item.contentDetails?.videoId || item.snippet?.resourceId?.videoId;
      if (!videoId || item.snippet?.title === 'Private video') continue;
      videos.push({
        videoId,
        title: item.snippet?.title || '',
        publishedAt: item.contentDetails?.videoPublishedAt || item.snippet?.publishedAt || null,
      });
    }
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return videos;
}

function isManualMatch(video) {
  return video?.raw?.matchSource === 'manual';
}

const [songs, existingVideos, videos] = await Promise.all([
  getSupabaseRows('music_songs', 'select=id,name&limit=2000'),
  getSupabaseRows('music_character_ep_videos', 'select=bvid,song_id,is_visible,match_score,author_mid,raw&limit=2000'),
  getYoutubeVideos(),
]);

const existingByVideoId = new Map(existingVideos.map((video) => [String(video.bvid), video]));
const epVideos = videos.filter((video) => isExplicitEpTitle(video.title));
const corrections = [];
const reactivations = [];
const manualProtected = [];
const unmatchedEpVideos = [];

for (const video of epVideos) {
  const match = findSongMatch(video.title, songs);
  const existing = existingByVideoId.get(String(video.videoId));
  const existingSongId = existing?.song_id ? String(existing.song_id) : '';

  if (!match) {
    unmatchedEpVideos.push({ videoId: video.videoId, title: video.title });
    continue;
  }

  if (isManualMatch(existing) && existingSongId && existingSongId !== match.songId) {
    manualProtected.push({
      videoId: video.videoId,
      title: video.title,
      existingSongId,
      suggestedSongId: match.songId,
      suggestedSongName: match.songName,
      score: match.score,
    });
  } else if (existingSongId && existingSongId !== match.songId) {
    corrections.push({
      videoId: video.videoId,
      title: video.title,
      existingSongId,
      suggestedSongId: match.songId,
      suggestedSongName: match.songName,
      score: match.score,
    });
  } else if (existingSongId === match.songId && !existing?.is_visible) {
    reactivations.push({
      videoId: video.videoId,
      title: video.title,
      songId: match.songId,
      songName: match.songName,
      score: match.score,
    });
  }
}

const epVideoIds = new Set(epVideos.map((video) => String(video.videoId)));
const staleYoutubeRows = existingVideos
  .filter((video) => (
    String(video.author_mid || '').toLowerCase() === `youtube:@${sourceHandle}`.toLowerCase()
    && !epVideoIds.has(String(video.bvid))
  ))
  .map((video) => ({ videoId: video.bvid, songId: video.song_id || null }));

console.log(JSON.stringify({
  mode: 'dry-run',
  writesPerformed: false,
  scannedVideos: videos.length,
  explicitEpCandidates: epVideos.length,
  autoMatchedEpVideos: epVideos.length - unmatchedEpVideos.length,
  automaticCorrections: corrections,
  reactivations,
  manualProtected,
  unmatchedEpVideos,
  staleYoutubeRows,
}, null, 2));

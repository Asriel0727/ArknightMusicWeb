import { findSongMatch, isExplicitEpTitle } from './character-ep-matching.mjs';

const sourceHandle = String(process.env.YOUTUBE_EP_SOURCE_HANDLE || 'rivervworkshop').trim().replace(/^@/, '');
const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const applyChanges = process.argv.includes('--apply');

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

async function upsertVideos(rows) {
  if (!rows.length) return;
  const response = await fetch(`${supabaseUrl}/rest/v1/music_character_ep_videos?on_conflict=id`, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) throw new Error(`Supabase character EP upsert failed: ${response.status} ${await response.text()}`);
}

async function hideStaleVideos(videoIds) {
  if (!videoIds.length) return;
  const params = new URLSearchParams({
    author_mid: `eq.youtube:@${sourceHandle}`,
    bvid: `in.(${videoIds.join(',')})`,
  });
  const response = await fetch(`${supabaseUrl}/rest/v1/music_character_ep_videos?${params}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
      'content-type': 'application/json',
      prefer: 'return=minimal',
    },
    body: JSON.stringify({ is_visible: false, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`Supabase stale Character EP hide failed: ${response.status} ${await response.text()}`);
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
        coverUrl: item.snippet?.thumbnails?.high?.url || item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '',
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
const epVideos = videos.map((video) => {
  const explicitEp = isExplicitEpTitle(video.title);
  const autoMatch = findSongMatch(video.title, songs, explicitEp
    ? undefined
    : { loose: true, minimumScore: 88, minimumGap: 6 });
  return {
    ...video,
    autoMatch,
    matchKind: explicitEp ? 'explicit-ep' : 'title-match',
  };
}).filter((video) => video.matchKind === 'explicit-ep' || Boolean(video.autoMatch));
const corrections = [];
const reactivations = [];
const manualProtected = [];
const unmatchedEpVideos = [];
const plannedRows = [];

for (const video of epVideos) {
  const match = video.autoMatch;
  const existing = existingByVideoId.get(String(video.videoId));
  const existingSongId = existing?.song_id ? String(existing.song_id) : '';

  const shouldPreserveManualMatch = isManualMatch(existing) && existingSongId && existingSongId !== match?.songId;
  const resolvedMatch = shouldPreserveManualMatch
    ? { songId: existingSongId, score: existing.match_score || 100, visible: existing.is_visible }
    : match;

  if (!match) {
    unmatchedEpVideos.push({ videoId: video.videoId, title: video.title, matchKind: video.matchKind });
  } else if (shouldPreserveManualMatch) {
    manualProtected.push({
      videoId: video.videoId,
      title: video.title,
      existingSongId,
      suggestedSongId: match.songId,
      suggestedSongName: match.songName,
      score: match.score,
      matchKind: video.matchKind,
    });
  } else if (existingSongId && existingSongId !== match.songId) {
    corrections.push({
      videoId: video.videoId,
      title: video.title,
      existingSongId,
      suggestedSongId: match.songId,
      suggestedSongName: match.songName,
      score: match.score,
      matchKind: video.matchKind,
    });
  } else if (existingSongId === match.songId && !existing?.is_visible) {
    reactivations.push({
      videoId: video.videoId,
      title: video.title,
      songId: match.songId,
      songName: match.songName,
      score: match.score,
      matchKind: video.matchKind,
    });
  }

  plannedRows.push({
    id: video.videoId,
    bvid: video.videoId,
    song_id: resolvedMatch?.songId || null,
    title: video.title,
    cover_url: video.coverUrl || null,
    author_mid: `youtube:@${sourceHandle}`,
    source_url: `https://www.youtube.com/watch?v=${video.videoId}`,
    is_visible: resolvedMatch?.visible ?? Boolean(resolvedMatch),
    match_score: resolvedMatch?.score || 0,
    raw: {
      ...video,
      platform: 'youtube',
      channelHandle: sourceHandle,
      matchSource: shouldPreserveManualMatch ? 'manual' : 'auto',
      matchKind: video.matchKind,
    },
    updated_at: new Date().toISOString(),
    published_at: video.publishedAt,
  });
}

const epVideoIds = new Set(epVideos.map((video) => String(video.videoId)));
const staleYoutubeRows = existingVideos
  .filter((video) => (
    String(video.author_mid || '').toLowerCase() === `youtube:@${sourceHandle}`.toLowerCase()
    && !epVideoIds.has(String(video.bvid))
  ))
  .map((video) => ({ videoId: video.bvid, songId: video.song_id || null }));
const staleAutoVideoIds = existingVideos
  .filter((video) => (
    String(video.author_mid || '').toLowerCase() === `youtube:@${sourceHandle}`.toLowerCase()
    && !epVideoIds.has(String(video.bvid))
    && !isManualMatch(video)
  ))
  .map((video) => String(video.bvid));

console.log(JSON.stringify({
  mode: applyChanges ? 'apply' : 'dry-run',
  writesPerformed: applyChanges,
  scannedVideos: videos.length,
  matchedCandidates: epVideos.length,
  explicitEpCandidates: epVideos.filter((video) => video.matchKind === 'explicit-ep').length,
  relaxedTitleCandidates: epVideos.filter((video) => video.matchKind === 'title-match').length,
  autoMatchedVideos: epVideos.length - unmatchedEpVideos.length,
  automaticCorrections: corrections,
  reactivations,
  manualProtected,
  unmatchedEpVideos,
  staleYoutubeRows,
}, null, 2));

if (applyChanges) {
  await upsertVideos(plannedRows);
  await hideStaleVideos(staleAutoVideoIds);
  console.log(`Applied ${plannedRows.length} EP rows and hid ${staleAutoVideoIds.length} stale auto-matched YouTube rows.`);
} else {
  console.log('No database rows were changed. Re-run with --apply only after reviewing this report.');
}

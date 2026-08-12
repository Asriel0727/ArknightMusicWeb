const sourceHandle = String(process.env.YOUTUBE_EP_SOURCE_HANDLE || 'rivervworkshop').trim().replace(/^@/, '');
const youtubeApiKey = String(process.env.YOUTUBE_API_KEY || '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');

if (!sourceHandle) throw new Error('YOUTUBE_EP_SOURCE_HANDLE is required.');
if (!youtubeApiKey) throw new Error('YOUTUBE_API_KEY is required.');
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/角色ep|characterep|明日方舟|arknights|塞壬唱片|monstersiren|rivervworkshop|official|musicvideo|fullversion|完整版|官方|音樂錄影帶|歌曲|主題曲/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function diceSimilarity(left, right) {
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;
  const pairs = new Map();
  for (let index = 0; index < left.length - 1; index += 1) {
    const pair = left.slice(index, index + 2);
    pairs.set(pair, (pairs.get(pair) || 0) + 1);
  }
  let shared = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const pair = right.slice(index, index + 2);
    const count = pairs.get(pair) || 0;
    if (count) {
      shared += 1;
      pairs.set(pair, count - 1);
    }
  }
  return (2 * shared) / (left.length + right.length - 2);
}

function getTitleVariants(title) {
  const source = String(title || '');
  const variants = new Set([normalizeMatchText(source)]);
  // 常見格式："Arknights EP - Song Name [Full Version]"。
  for (const part of source.split(/[-–—|｜:：]/)) variants.add(normalizeMatchText(part));
  for (const quoted of source.matchAll(/[《「『\"'【\[]([^》」』\"'】\]]+)[》」』\"'】\]]/g)) {
    variants.add(normalizeMatchText(quoted[1]));
  }
  return [...variants].filter((variant) => variant.length >= 2);
}

function findSongMatch(title, songs) {
  const titleVariants = getTitleVariants(title);
  if (!titleVariants.length) return null;

  const candidates = [];
  for (const song of songs) {
    const normalizedSong = normalizeMatchText(song.name);
    if (normalizedSong.length < 2) continue;
    const similarity = Math.max(...titleVariants.map((variant) => {
      if (variant.includes(normalizedSong) || normalizedSong.includes(variant)) return 1;
      return diceSimilarity(variant, normalizedSong);
    }));
    candidates.push({ songId: String(song.id), score: Math.round(similarity * 100), songName: song.name });
  }
  candidates.sort((left, right) => right.score - left.score);
  const [best, runnerUp] = candidates;
  // 只有非常接近、且明顯勝過第二名時才自動公開，避免錯連到相似歌曲。
  if (!best || best.score < 82 || (runnerUp && best.score - runnerUp.score < 8)) return null;
  return best;
}

async function getJson(url, label) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  if (payload?.error) throw new Error(`${label} failed: ${payload.error.message || 'unknown error'}`);
  return payload;
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
  } while (pageToken && videos.length < 500);
  return videos;
}

const videos = await getYoutubeVideos();
const characterEps = videos.filter((video) => /角色\s*EP|character\s*EP|《?明日方舟》?\s*EP|arknights\s*EP/i.test(video.title));
const [songs, existingVideos] = await Promise.all([
  getSupabaseRows('music_songs', 'select=id,name&limit=2000'),
  getSupabaseRows('music_character_ep_videos', 'select=bvid,song_id,is_visible,match_score&limit=2000'),
]);
const existingByVideoId = new Map(existingVideos.map((video) => [video.bvid, video]));
const updatedAt = new Date().toISOString();
const rows = characterEps.map((video) => {
  const existing = existingByVideoId.get(video.videoId);
  const match = existing?.song_id
    ? { songId: existing.song_id, score: existing.match_score || 100, visible: existing.is_visible }
    : findSongMatch(video.title, songs);
  return {
    id: video.videoId,
    // Keep the existing column name for backward compatibility; it now stores the platform video ID.
    bvid: video.videoId,
    song_id: match?.songId || null,
    title: video.title,
    cover_url: video.coverUrl || null,
    author_mid: `youtube:@${sourceHandle}`,
    source_url: `https://www.youtube.com/watch?v=${video.videoId}`,
    is_visible: match?.visible ?? Boolean(match),
    match_score: match?.score || 0,
    raw: { ...video, platform: 'youtube', channelHandle: sourceHandle },
    updated_at: updatedAt,
    published_at: video.publishedAt,
  };
});
await upsertVideos(rows);
const matched = rows.filter((row) => row.is_visible).length;
console.log(`Character EP sync complete (YouTube): scanned=${videos.length}, found=${characterEps.length}, matched=${matched}, stored=${rows.length}`);
const unmatchedTitles = rows.filter((row) => !row.is_visible).map((row) => row.title);
if (unmatchedTitles.length) {
  console.warn(`Character EP titles needing review: ${unmatchedTitles.join(' | ')}`);
}

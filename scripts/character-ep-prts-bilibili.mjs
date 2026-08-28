import { chromium } from 'playwright';
import { findSongMatch, normalizeMatchText } from './character-ep-matching.mjs';
import { getPrtsCharacterEpEntries } from './prts-character-ep-source.mjs';

const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const applyChanges = process.argv.includes('--apply');
const sourceKey = 'prts:music';

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

function isManualMatch(video) {
  return video?.raw?.matchSource === 'manual';
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
  const params = new URLSearchParams({ author_mid: `eq.${sourceKey}`, bvid: `in.(${videoIds.join(',')})` });
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

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"');
}

async function getBilibiliVideoFromPrtsPage(request, entry) {
  if (!entry.songPageUrl) return null;

  const response = await request.get(entry.songPageUrl);
  if (!response.ok()) throw new Error(`PRTS song page request failed: ${response.status()}`);
  const html = decodeHtml(await response.text());
  const iframeUrl = html.match(/(?:https?:)?\/\/player\.bilibili\.com\/player\.html\?[^"'<>\s]+/i)?.[0];
  if (!iframeUrl) return null;

  const playerUrl = new URL(iframeUrl.startsWith('//') ? `https:${iframeUrl}` : iframeUrl);
  const bvid = playerUrl.searchParams.get('bvid') || '';
  const aid = playerUrl.searchParams.get('aid') || '';
  const videoId = bvid || aid;
  if (!videoId) return null;

  return {
    videoId,
    videoIdType: bvid ? 'bvid' : 'aid',
    sourceUrl: `https://www.bilibili.com/video/${bvid || `av${aid}`}/`,
  };
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

function findExactSongForPrtsEntry(entry, songs) {
  const normalizedTitles = new Set(entry.titles.map(normalizeMatchText).filter((title) => title.length >= 2));
  const exact = songs.find((song) => normalizedTitles.has(normalizeMatchText(song.name)));
  if (exact) return { songId: String(exact.id), songName: exact.name, score: 100 };

  const matches = entry.titles.map((title) => findSongMatch(title, songs)).filter(Boolean);
  const best = matches.sort((left, right) => right.score - left.score)[0];
  return best?.score === 100 ? best : null;
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();
  const [prtsEntries, songs, existingVideos] = await Promise.all([
    getPrtsCharacterEpEntries(page),
    getSupabaseRows('music_songs', 'select=id,name&limit=2000'),
    getSupabaseRows('music_character_ep_videos', 'select=bvid,song_id,is_visible,match_score,author_mid,raw&limit=2000'),
  ]);
  const prtsVideoResults = await mapWithConcurrency(prtsEntries, 6, async (entry) => {
    try {
      return { entry, video: await getBilibiliVideoFromPrtsPage(context.request, entry) };
    } catch (error) {
      return { entry, error: error.message };
    }
  });
  const existingByBvid = new Map(existingVideos.map((video) => [String(video.bvid), video]));
  const unmatchedSongs = [];
  const unmatchedVideos = [];
  const prtsPageFailures = [];
  const rows = [];

  for (const result of prtsVideoResults) {
    const { entry, video } = result;
    if (result.error) {
      prtsPageFailures.push({ ...entry, error: result.error });
      continue;
    }
    const song = findExactSongForPrtsEntry(entry, songs);
    if (!song) {
      unmatchedSongs.push(entry);
      continue;
    }
    if (!video) {
      unmatchedVideos.push({ ...entry, song });
      continue;
    }
    const existing = existingByBvid.get(video.videoId);
    const shouldPreserveManualMatch = isManualMatch(existing) && existing?.song_id && String(existing.song_id) !== song.songId;
    rows.push({
      id: `prts:bili:${video.videoIdType}:${video.videoId}`,
      bvid: video.videoId,
      song_id: shouldPreserveManualMatch ? existing.song_id : song.songId,
      title: entry.titleText,
      cover_url: null,
      author_mid: sourceKey,
      source_url: video.sourceUrl,
      is_visible: shouldPreserveManualMatch ? existing.is_visible : true,
      match_score: shouldPreserveManualMatch ? existing.match_score || 100 : 100,
      raw: {
        platform: 'bilibili',
        matchSource: 'prts',
        prts: { titleText: entry.titleText, titles: entry.titles, mvCharacters: entry.mvCharacters, songPageUrl: entry.songPageUrl },
        videoIdType: video.videoIdType,
      },
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    });
  }

  const matchedBvids = new Set(rows.map((row) => row.bvid));
  const staleAutoVideoIds = existingVideos
    .filter((video) => video.author_mid === sourceKey && !matchedBvids.has(String(video.bvid)) && !isManualMatch(video))
    .map((video) => String(video.bvid));

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    writesPerformed: applyChanges,
    source: 'PRTS MV角色 → PRTS song-page Bilibili iframe',
    prtsCharacterEntries: prtsEntries.length,
    matchedVideos: rows.length,
    unmatchedPrtsSongs: unmatchedSongs,
    prtsSongsWithoutBilibiliVideo: unmatchedVideos,
    prtsPageFailures,
    stalePrtsRows: staleAutoVideoIds,
  }, null, 2));

  if (applyChanges) {
    await upsertVideos(rows);
    await hideStaleVideos(staleAutoVideoIds);
    console.log(`Applied ${rows.length} PRTS/Bilibili Character EP rows and hid ${staleAutoVideoIds.length} stale automatic PRTS rows.`);
  }
} finally {
  await browser.close();
}

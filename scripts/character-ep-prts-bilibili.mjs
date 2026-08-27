import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { findSongMatch, normalizeMatchText } from './character-ep-matching.mjs';
import { getPrtsCharacterEpEntries } from './prts-character-ep-source.mjs';

const sourceUid = String(process.env.BILIBILI_EP_SOURCE_UID || '161775300').trim();
const sessdata = String(process.env.BILIBILI_SESSDATA || '');
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const applyChanges = process.argv.includes('--apply');
const sourceKey = `bilibili:${sourceUid}`;

if (!/^\d+$/.test(sourceUid)) throw new Error('BILIBILI_EP_SOURCE_UID must be numeric.');
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function getMixinKey(imageKey, subKey) {
  return mixinKeyEncTab.map((index) => `${imageKey}${subKey}`[index]).join('').slice(0, 32);
}

function isManualMatch(video) {
  return ['manual', 'prts'].includes(video?.raw?.matchSource);
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

async function getBilibiliVideos(page) {
  const navResponse = await page.request.get('https://api.bilibili.com/x/web-interface/nav');
  if (!navResponse.ok()) throw new Error(`Bilibili nav API failed: ${navResponse.status()}`);
  const nav = await navResponse.json();
  const imageKey = nav?.data?.wbi_img?.img_url?.split('/').pop()?.split('.')[0] || '';
  const subKey = nav?.data?.wbi_img?.sub_url?.split('/').pop()?.split('.')[0] || '';
  if (!imageKey || !subKey) throw new Error('Bilibili nav API did not provide WBI signing keys.');

  const videos = [];
  let pageNumber = 1;
  let pageCount = 1;
  do {
    const params = new URLSearchParams({
      mid: sourceUid,
      ps: '100',
      pn: String(pageNumber),
      order: 'pubdate',
      platform: 'web',
      web_location: '1550101',
      wts: String(Math.floor(Date.now() / 1000)),
    });
    const query = [...params.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.replace(/[!'()*]/g, ''))}`)
      .join('&');
    params.set('w_rid', createHash('md5').update(`${query}${getMixinKey(imageKey, subKey)}`).digest('hex'));

    const response = await page.request.get(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`);
    if (!response.ok()) throw new Error(`Bilibili video API failed: ${response.status()}`);
    const payload = await response.json();
    if (payload?.code !== 0) throw new Error(`Bilibili video API returned ${payload?.code}: ${payload?.message || 'unknown error'}`);

    const list = payload?.data?.list?.vlist || [];
    videos.push(...list.map((video) => ({
      bvid: video.bvid,
      title: video.title || '',
      coverUrl: video.pic || '',
      publishedAt: video.created ? new Date(video.created * 1000).toISOString() : null,
    })).filter((video) => video.bvid));
    // Bilibili's `count` is the total video count, not the number of pages.
    pageCount = Math.max(1, Math.ceil(Number(payload?.data?.page?.count || 0) / 100));
    pageNumber += 1;
  } while (pageNumber <= pageCount);

  return videos;
}

function findExactSongForPrtsEntry(entry, songs) {
  const normalizedTitles = new Set(entry.titles.map(normalizeMatchText).filter((title) => title.length >= 2));
  const exact = songs.find((song) => normalizedTitles.has(normalizeMatchText(song.name)));
  if (exact) return { songId: String(exact.id), songName: exact.name, score: 100 };

  const matches = entry.titles.map((title) => findSongMatch(title, songs)).filter(Boolean);
  const best = matches.sort((left, right) => right.score - left.score)[0];
  return best?.score === 100 ? best : null;
}

function findBilibiliVideoForPrtsEntry(entry, videos) {
  const variants = entry.titles.map(normalizeMatchText).filter((title) => title.length >= 2);
  const candidates = videos.map((video) => {
    const normalizedVideo = normalizeMatchText(video.title);
    const score = Math.max(...variants.map((title) => {
      if (title === normalizedVideo) return 100;
      return normalizedVideo.includes(title) || title.includes(normalizedVideo) ? 96 : 0;
    }));
    return { video, score };
  }).filter((candidate) => candidate.score >= 96);

  candidates.sort((left, right) => (
    right.score - left.score || String(right.video.publishedAt || '').localeCompare(String(left.video.publishedAt || ''))
  ));
  return candidates[0] || null;
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    locale: 'zh-CN',
    viewport: { width: 1440, height: 1100 },
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  if (sessdata) {
    await context.addCookies([{ name: 'SESSDATA', value: sessdata, domain: '.bilibili.com', path: '/', secure: true }]);
  }

  const page = await context.newPage();
  const [prtsEntries, videos, songs, existingVideos] = await Promise.all([
    getPrtsCharacterEpEntries(page),
    getBilibiliVideos(page),
    getSupabaseRows('music_songs', 'select=id,name&limit=2000'),
    getSupabaseRows('music_character_ep_videos', 'select=bvid,song_id,is_visible,match_score,author_mid,raw&limit=2000'),
  ]);
  const existingByBvid = new Map(existingVideos.map((video) => [String(video.bvid), video]));
  const unmatchedSongs = [];
  const unmatchedVideos = [];
  const rows = [];

  for (const entry of prtsEntries) {
    const song = findExactSongForPrtsEntry(entry, songs);
    if (!song) {
      unmatchedSongs.push(entry);
      continue;
    }
    const videoMatch = findBilibiliVideoForPrtsEntry(entry, videos);
    if (!videoMatch) {
      unmatchedVideos.push({ ...entry, song });
      continue;
    }
    const existing = existingByBvid.get(videoMatch.video.bvid);
    const shouldPreserveManualMatch = isManualMatch(existing) && existing?.song_id && String(existing.song_id) !== song.songId;
    rows.push({
      id: `bili:${videoMatch.video.bvid}`,
      bvid: videoMatch.video.bvid,
      song_id: shouldPreserveManualMatch ? existing.song_id : song.songId,
      title: videoMatch.video.title,
      cover_url: videoMatch.video.coverUrl || null,
      author_mid: sourceKey,
      source_url: `https://www.bilibili.com/video/${videoMatch.video.bvid}/`,
      is_visible: shouldPreserveManualMatch ? existing.is_visible : true,
      match_score: shouldPreserveManualMatch ? existing.match_score || 100 : videoMatch.score,
      raw: {
        ...videoMatch.video,
        platform: 'bilibili',
        matchSource: 'prts',
        prts: { titleText: entry.titleText, titles: entry.titles, mvCharacters: entry.mvCharacters },
      },
      updated_at: new Date().toISOString(),
      published_at: videoMatch.video.publishedAt,
    });
  }

  const matchedBvids = new Set(rows.map((row) => row.bvid));
  const staleAutoVideoIds = existingVideos
    .filter((video) => video.author_mid === sourceKey && !matchedBvids.has(String(video.bvid)) && !isManualMatch(video))
    .map((video) => String(video.bvid));

  console.log(JSON.stringify({
    mode: applyChanges ? 'apply' : 'dry-run',
    writesPerformed: applyChanges,
    source: 'PRTS MV角色 → Bilibili official uploader',
    prtsCharacterEntries: prtsEntries.length,
    bilibiliVideosScanned: videos.length,
    matchedVideos: rows.length,
    unmatchedPrtsSongs: unmatchedSongs,
    prtsSongsWithoutBilibiliVideo: unmatchedVideos,
    staleBilibiliRows: staleAutoVideoIds,
  }, null, 2));

  if (applyChanges) {
    await upsertVideos(rows);
    await hideStaleVideos(staleAutoVideoIds);
    console.log(`Applied ${rows.length} PRTS/Bilibili Character EP rows and hid ${staleAutoVideoIds.length} stale automatic Bilibili rows.`);
  }
} finally {
  await browser.close();
}

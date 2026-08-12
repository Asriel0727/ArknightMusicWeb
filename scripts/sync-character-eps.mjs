import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const sourceUid = String(process.env.BILIBILI_EP_SOURCE_UID || '161775300').trim();
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const sessdata = String(process.env.BILIBILI_SESSDATA || '');

if (!/^\d+$/.test(sourceUid)) throw new Error('BILIBILI_EP_SOURCE_UID must be numeric.');
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

function normalizeMatchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/角色ep|characterep|明日方舟|arknights|塞壬唱片|monstersiren/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function findSongMatch(title, songs) {
  const normalizedTitle = normalizeMatchText(title);
  if (!normalizedTitle) return null;

  let match = null;
  for (const song of songs) {
    const normalizedSong = normalizeMatchText(song.name);
    if (normalizedSong.length < 2) continue;
    if (normalizedTitle.includes(normalizedSong) || normalizedSong.includes(normalizedTitle)) {
      if (!match || normalizedSong.length > match.score) {
        match = { songId: String(song.id), score: normalizedSong.length };
      }
    }
  }
  return match;
}

async function getSupabaseRows(table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      authorization: `Bearer ${supabaseServiceRoleKey}`,
    },
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

// B 站個人空間的 HTML 是前端動態載入，而且在 GitHub Runner 常常不會渲染影片卡。
// 改用同一個公開頁面使用的 WBI API，避免把「頁面沒有卡片」誤判為「沒有影片」。
const mixinKeyEncTab = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

function getMixinKey(imageKey, subKey) {
  const source = `${imageKey}${subKey}`;
  return mixinKeyEncTab.map((index) => source[index]).join('').slice(0, 32);
}

async function getBilibiliVideos(page) {
  const navResponse = await page.request.get('https://api.bilibili.com/x/web-interface/nav');
  if (!navResponse.ok()) throw new Error(`Bilibili nav API failed: ${navResponse.status()}`);
  const nav = await navResponse.json();
  const imageUrl = nav?.data?.wbi_img?.img_url || '';
  const subUrl = nav?.data?.wbi_img?.sub_url || '';
  const imageKey = imageUrl.split('/').pop()?.split('.')[0] || '';
  const subKey = subUrl.split('/').pop()?.split('.')[0] || '';
  if (!imageKey || !subKey) throw new Error('Bilibili nav API did not provide WBI signing keys.');

  const params = new URLSearchParams({
    mid: sourceUid,
    ps: '100',
    pn: '1',
    order: 'pubdate',
    platform: 'web',
    web_location: '1550101',
    wts: String(Math.floor(Date.now() / 1000)),
  });
  const query = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value.replace(/[!'()*]/g, ''))}`)
    .join('&');
  params.set('w_rid', createHash('md5').update(`${query}${getMixinKey(imageKey, subKey)}`).digest('hex'));

  const response = await page.request.get(`https://api.bilibili.com/x/space/wbi/arc/search?${params}`);
  if (!response.ok()) throw new Error(`Bilibili video API failed: ${response.status()}`);
  const payload = await response.json();
  if (payload?.code !== 0) throw new Error(`Bilibili video API returned code ${payload?.code}: ${payload?.message || 'unknown error'}`);
  return (payload?.data?.list?.vlist || []).map((video) => ({
    bvid: video.bvid,
    title: video.title || '',
    coverUrl: video.pic || '',
  })).filter((video) => video.bvid);
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
  await page.goto(`https://space.bilibili.com/${sourceUid}/upload/video`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForTimeout(5_000);

  const pageText = await page.locator('body').innerText();
  if (/错误[：:]?\s*412|安全风控|security control/i.test(pageText)) {
    throw new Error('Bilibili returned an anti-abuse response. Set the BILIBILI_SESSDATA secret and retry.');
  }

  const videos = await getBilibiliVideos(page);

  const characterEps = videos.filter((video) => /角色\s*EP|character\s*EP|《?明日方舟》?\s*EP|arknights\s*EP/i.test(video.title));
  const [songs, existingVideos] = await Promise.all([
    getSupabaseRows('music_songs', 'select=id,name&limit=2000'),
    getSupabaseRows('music_character_ep_videos', 'select=bvid,song_id,is_visible,match_score&limit=2000'),
  ]);
  const existingByBvid = new Map(existingVideos.map((video) => [video.bvid, video]));
  const updatedAt = new Date().toISOString();
  const rows = characterEps.map((video) => {
    const existing = existingByBvid.get(video.bvid);
    const match = existing?.song_id
      ? { songId: existing.song_id, score: existing.match_score || 100, visible: existing.is_visible }
      : findSongMatch(video.title, songs);
    return {
      id: video.bvid,
      bvid: video.bvid,
      song_id: match?.songId || null,
      title: video.title,
      cover_url: video.coverUrl || null,
      author_mid: sourceUid,
      source_url: `https://www.bilibili.com/video/${video.bvid}/`,
      is_visible: match?.visible ?? Boolean(match),
      match_score: match?.score || 0,
      raw: video,
      updated_at: updatedAt,
    };
  });
  await upsertVideos(rows);
  const matched = rows.filter((row) => row.is_visible).length;
  console.log(`Character EP sync complete: scanned=${videos.length}, found=${characterEps.length}, matched=${matched}, stored=${rows.length}`);
} finally {
  await browser.close();
}

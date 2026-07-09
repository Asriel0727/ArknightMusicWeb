const EXCEL_BASE =
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';

const IMAGE_BASE =
  'https://raw.githubusercontent.com/PuppiizSunniiz/Arknight-Images/main';
const IMAGE_MIRROR_ACESHIP =
  'https://raw.githubusercontent.com/Aceship/Arknight-Images/main';
const IMAGE_MIRROR_RESOURCE =
  'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main';
const IMAGE_MIRROR_DYNAMIC =
  'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts';

const MUSIC_API_ORIGIN = 'https://monstersiren-web-api.vercel.app';
const DEFAULT_PUBLIC_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const RECRUIT_OPERATORS_KEY = 'recruit:operators:v3';
const RECRUIT_OPERATOR_DETAIL_KEY_PREFIX = 'recruit:operator:v3:';
const MUSIC_CACHE_PREFIX = 'music:api:v1:';
const MUSIC_SONG_DETAIL_CURSOR_KEY = `${MUSIC_CACHE_PREFIX}prewarm:song-detail-cursor`;
const MUSIC_ALBUM_DETAIL_CURSOR_KEY = `${MUSIC_CACHE_PREFIX}prewarm:album-detail-cursor`;
const LYRICS_TRANSLATION_CACHE_PREFIX = 'lyricsTranslation:server:v1:';
const USER_ACCOUNT_KEY_PREFIX = 'userAccount:v1:';
const USER_SESSION_KEY_PREFIX = 'userSession:v1:';
const USER_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATION_LINE_SEPARATOR = '\n';
const MAX_TRANSLATION_BATCH_TEXT_LENGTH = 4200;
const SUPPORTED_TRANSLATION_LOCALES = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);
const DEFAULT_APP_ORIGIN = 'https://molly27molly.github.io/ArknightMusicWeb/';
const DEFAULT_SUPABASE_URL = 'https://rdneemerltoxlfosazcz.supabase.co';
const DEFAULT_SONG_DETAIL_PREWARM_LIMIT = 10;
const MAX_SONG_DETAIL_PREWARM_LIMIT = 10;
const DEFAULT_ALBUM_DETAIL_PREWARM_LIMIT = 5;
const MAX_ALBUM_DETAIL_PREWARM_LIMIT = 5;
const MUSIC_SONG_DETAIL_MAX_AGE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const publicApiBase = getPublicApiBase(request, env);

    if (request.method === 'OPTIONS') {
      return corsResponse();
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'arknights-recruit-api',
        supabaseConfigured: hasSupabaseConfig(env),
        time: new Date().toISOString(),
      });
    }

    const userResponse = await handleUserApiRequest(request, env, url);
    if (userResponse) {
      return userResponse;
    }

    const shareResponse = await handleSongSharePage(request, env, url);
    if (shareResponse) {
      return shareResponse;
    }

    const musicResponse = await handleMusicApiRequest(request, env, url);
    if (musicResponse) {
      return musicResponse;
    }

    if (url.pathname === '/proxy-image') {
      return proxyMusicAsset(request, 'image');
    }

    if (url.pathname === '/proxy-lyrics') {
      return proxyMusicAsset(request, 'lyrics');
    }

    if (url.pathname === '/proxy-audio') {
      return proxyMusicAsset(request, 'audio');
    }

    if (url.pathname === '/api/admin/sync-music') {
      const unauthorized = requireAdminToken(request, env);
      if (unauthorized) {
        return unauthorized;
      }

      const detailLimit = parseMusicPrewarmLimit(url.searchParams.get('songDetailLimit'));
      const albumDetailLimit = parseAlbumPrewarmLimit(url.searchParams.get('albumDetailLimit'));
      const result = await syncMusicCache(env, {
        songDetailLimit: detailLimit,
        albumDetailLimit,
      });
      return json({
        ok: true,
        ...result,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/admin/music-cache-status') {
      const unauthorized = requireAdminToken(request, env);
      if (unauthorized) {
        return unauthorized;
      }

      const status = await getMusicCacheStatus(env);
      return json({
        ok: true,
        ...status,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/admin/sync') {
      const unauthorized = requireAdminToken(request, env);
      if (unauthorized) {
        return unauthorized;
      }

      const data = await buildRecruitOperators(publicApiBase);
      await env.ARKNIGHTS_DATA.put(RECRUIT_OPERATORS_KEY, JSON.stringify(data));

      return json({
        ok: true,
        synced: RECRUIT_OPERATORS_KEY,
        count: data.operators.length,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/admin/prewarm-music-albums') {
      const unauthorized = requireAdminToken(request, env);
      if (unauthorized) {
        return unauthorized;
      }

      const limit = parseAlbumPrewarmLimit(url.searchParams.get('limit'));
      const albums = await fetchMusicJson('/api/albums');
      await writeSupabaseCache(env, `${MUSIC_CACHE_PREFIX}albums`, albums.data, albums.sourceUrl);
      await upsertSupabaseRows(env, 'music_albums', normalizeMusicAlbumRows(albums.data));
      const result = await prewarmMusicAlbumDetails(env, albums.data, { limit });

      return json({
        ok: true,
        ...result,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/admin/prewarm-details') {
      const unauthorized = requireAdminToken(request, env);
      if (unauthorized) {
        return unauthorized;
      }

      const offset = Math.max(0, Number(url.searchParams.get('offset') || 0));
      const limit = Math.min(80, Math.max(1, Number(url.searchParams.get('limit') || 50)));
      const result = await prewarmRecruitOperatorDetails(env, publicApiBase, {
        offset,
        limit,
      });

      return json({
        ok: true,
        ...result,
        time: new Date().toISOString(),
      });
    }

    if (url.pathname === '/api/recruit/operators') {
      const cached = await env.ARKNIGHTS_DATA.get(RECRUIT_OPERATORS_KEY, 'json');

      if (cached) {
        return json(cached, 200, 3600);
      }

      const data = await buildRecruitOperators(publicApiBase);
      await env.ARKNIGHTS_DATA.put(RECRUIT_OPERATORS_KEY, JSON.stringify(data));

      return json(data, 200, 3600);
    }

    if (url.pathname === '/api/recruit/image') {
      return proxyRecruitImage(request);
    }

    if (url.pathname.startsWith('/api/recruit/operators/')) {
      const charId = decodeURIComponent(url.pathname.replace('/api/recruit/operators/', ''));
      const key = `${RECRUIT_OPERATOR_DETAIL_KEY_PREFIX}${charId}`;

      const cached = await env.ARKNIGHTS_DATA.get(key, 'json');
      if (cached) {
        return json(cached, 200, 3600);
      }

      const data = await getRecruitOperatorDetail(charId, publicApiBase);

      if (data.ok) {
        await env.ARKNIGHTS_DATA.put(key, JSON.stringify(data));
      }

      return json(data, 200, 3600);
    }

      return json({ ok: false, error: 'Not found', path: url.pathname }, 404);
    } catch (error) {
      console.error('Worker request failed:', error);
      return json(
        {
          ok: false,
          error: error?.message || 'Worker request failed',
        },
        500
      );
    }
  },

  async scheduled(event, env, ctx) {
    const data = await buildRecruitOperators(env.RECRUIT_API_BASE || DEFAULT_PUBLIC_API_BASE);
    await env.ARKNIGHTS_DATA.put(RECRUIT_OPERATORS_KEY, JSON.stringify(data));
    if (hasSupabaseConfig(env)) {
      ctx.waitUntil(
        syncMusicCache(env, {
          songDetailLimit: 10,
          albumDetailLimit: 5,
        }).catch((error) => {
          console.warn('Music cache sync failed:', error.message);
        })
      );
    }
    console.info({
      message: 'Recruit operators synced by cron',
      count: data.operators.length,
      time: new Date().toISOString(),
    });
  },
};

function requireAdminToken(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!env.SYNC_TOKEN || token !== env.SYNC_TOKEN) {
    return json(
      {
        ok: false,
        error: 'Unauthorized',
      },
      401
    );
  }

  return null;
}

function getSupabaseUrl(env) {
  return (env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/$/, '');
}

function hasSupabaseConfig(env) {
  return Boolean(getSupabaseUrl(env) && env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseAuthKey(env) {
  return env.SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
}

function parseMusicPrewarmLimit(rawLimit) {
  if (rawLimit == null || rawLimit === '') {
    return DEFAULT_SONG_DETAIL_PREWARM_LIMIT;
  }

  const limit = Number(rawLimit);
  if (!Number.isFinite(limit)) {
    return DEFAULT_SONG_DETAIL_PREWARM_LIMIT;
  }

  return Math.min(
    MAX_SONG_DETAIL_PREWARM_LIMIT,
    Math.max(0, Math.floor(limit))
  );
}

function parseAlbumPrewarmLimit(rawLimit) {
  if (rawLimit == null || rawLimit === '') {
    return DEFAULT_ALBUM_DETAIL_PREWARM_LIMIT;
  }

  const limit = Number(rawLimit);
  if (!Number.isFinite(limit)) {
    return DEFAULT_ALBUM_DETAIL_PREWARM_LIMIT;
  }

  return Math.min(
    MAX_ALBUM_DETAIL_PREWARM_LIMIT,
    Math.max(0, Math.floor(limit))
  );
}

function supabaseHeaders(env, extraHeaders = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extraHeaders,
  };
}

async function readSupabaseCache(env, key) {
  if (!hasSupabaseConfig(env)) {
    return null;
  }

  const endpoint = `${getSupabaseUrl(env)}/rest/v1/music_cache?key=eq.${encodeURIComponent(
    key
  )}&select=key,data,source,updated_at&limit=1`;
  const response = await fetch(endpoint, {
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    console.warn('Supabase cache read failed:', response.status, key);
    return null;
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

async function writeSupabaseCache(env, key, data, source) {
  if (!hasSupabaseConfig(env)) {
    return false;
  }

  const endpoint = `${getSupabaseUrl(env)}/rest/v1/music_cache`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(env, {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    }),
    body: JSON.stringify({
      key,
      data,
      source,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    console.warn('Supabase cache write failed:', response.status, key);
    return false;
  }

  return true;
}

async function upsertSupabaseRows(env, tableName, rows) {
  if (!hasSupabaseConfig(env) || !Array.isArray(rows) || rows.length === 0) {
    return {
      ok: false,
      count: 0,
      skipped: true,
    };
  }

  const endpoint = `${getSupabaseUrl(env)}/rest/v1/${tableName}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: supabaseHeaders(env, {
      'content-type': 'application/json',
      prefer: 'resolution=merge-duplicates',
    }),
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    console.warn('Supabase normalized upsert failed:', tableName, response.status);
    return {
      ok: false,
      count: rows.length,
      status: response.status,
    };
  }

  return {
    ok: true,
    count: rows.length,
  };
}

async function countSupabaseRows(env, tableName, filters = {}, selectColumn = 'id') {
  if (!hasSupabaseConfig(env)) {
    return null;
  }

  const params = new URLSearchParams({
    select: selectColumn,
    limit: '1',
  });

  Object.entries(filters).forEach(([key, value]) => {
    params.set(key, value);
  });

  const endpoint = `${getSupabaseUrl(env)}/rest/v1/${tableName}?${params.toString()}`;
  const response = await fetch(endpoint, {
    method: 'HEAD',
    headers: supabaseHeaders(env, {
      prefer: 'count=exact',
    }),
  });

  if (!response.ok) {
    console.warn('Supabase count failed:', tableName, response.status);
    return null;
  }

  return parseContentRangeTotal(response.headers.get('content-range'));
}

async function supabaseRestRequest(env, tableName, options = {}) {
  const endpoint = `${getSupabaseUrl(env)}/rest/v1/${tableName}${options.query || ''}`;
  const response = await fetch(endpoint, {
    method: options.method || 'GET',
    headers: supabaseHeaders(env, {
      'content-type': 'application/json',
      prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    }),
    body: options.body == null ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Supabase ${tableName} failed: ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}

async function readLatestSupabaseRow(env, tableName, selectColumns) {
  if (!hasSupabaseConfig(env)) {
    return null;
  }

  const params = new URLSearchParams({
    select: selectColumns,
    order: 'updated_at.desc',
    limit: '1',
  });
  const endpoint = `${getSupabaseUrl(env)}/rest/v1/${tableName}?${params.toString()}`;
  const response = await fetch(endpoint, {
    headers: supabaseHeaders(env),
  });

  if (!response.ok) {
    console.warn('Supabase latest row read failed:', tableName, response.status);
    return null;
  }

  const rows = await response.json();
  return rows?.[0] || null;
}

function parseContentRangeTotal(contentRange) {
  const total = String(contentRange || '').split('/').pop();
  const count = Number(total);

  return Number.isFinite(count) ? count : null;
}

async function fetchMusicJson(sourcePath) {
  const sourceUrl = `${MUSIC_API_ORIGIN}${sourcePath}`;
  const response = await fetch(sourceUrl, {
    cf: {
      cacheTtl: 900,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`Music API failed: ${response.status} ${sourceUrl}`);
  }

  return {
    data: await response.json(),
    sourceUrl,
  };
}

function getMusicAlbumList(payload) {
  return Array.isArray(payload?.data) ? payload.data : [];
}

function getMusicSongList(payload) {
  return Array.isArray(payload?.data?.list) ? payload.data.list : [];
}

function normalizeMusicAlbumRows(payload, options = {}) {
  const includeDetailFields = options.includeDetailFields === true;

  return getMusicAlbumList(payload)
    .filter((album) => album?.cid)
    .map((album) => {
      const row = {
        id: String(album.cid),
        name: String(album.name || ''),
        artists: album.artistes || album.artists || [],
        cover_url: album.coverUrl || null,
        cover_de_url: album.coverDeUrl || null,
        updated_at: new Date().toISOString(),
      };

      if (includeDetailFields) {
        row.intro = album.intro || null;
        row.belong = album.belong || null;
        row.raw = album;
      }

      return row;
    });
}

function normalizeMusicAlbumDetailRow(payload) {
  const album = payload?.data;
  if (!album?.cid) {
    return [];
  }

  return normalizeMusicAlbumRows({
    data: [album],
  }, {
    includeDetailFields: true,
  });
}

function normalizeMusicSongListRows(payload) {
  return getMusicSongList(payload)
    .filter((song) => song?.cid)
    .map((song) => ({
      id: String(song.cid),
      name: String(song.name || ''),
      artists: song.artistes || song.artists || [],
      raw: song,
      updated_at: new Date().toISOString(),
    }));
}

function normalizeMusicAlbumSongRows(payload) {
  const album = payload?.data;
  const songs = Array.isArray(album?.songs) ? album.songs : [];

  return songs
    .filter((song) => song?.cid)
    .map((song) => ({
      id: String(song.cid),
      album_id: album.cid ? String(album.cid) : null,
      name: String(song.name || ''),
      artists: song.artistes || song.artists || album.artistes || album.artists || [],
      raw: song,
      updated_at: new Date().toISOString(),
    }));
}

function normalizeMusicSongDetailRow(payload) {
  const song = payload?.data;
  if (!song?.cid) {
    return [];
  }

  return [
    {
      id: String(song.cid),
      album_id: song.albumCid ? String(song.albumCid) : null,
      name: String(song.name || ''),
      artists: song.artistes || song.artists || [],
      source_url: song.sourceUrl || null,
      lyric_url: song.lyricUrl || null,
      mv_url: song.mvUrl || null,
      mv_cover_url: song.mvCoverUrl || null,
      raw: song,
      updated_at: new Date().toISOString(),
    },
  ];
}

async function getMusicJson(env, key, sourcePath) {
  const cached = await readSupabaseCache(env, key);
  if (cached?.data) {
    return {
      data: cached.data,
      source: 'supabase',
      updatedAt: cached.updated_at,
    };
  }

  const fetched = await fetchMusicJson(sourcePath);
  await writeSupabaseCache(env, key, fetched.data, fetched.sourceUrl);
  await upsertSupabaseRows(env, 'music_songs', normalizeMusicSongDetailRow(fetched.data));

  return {
    data: fetched.data,
    source: 'origin',
    updatedAt: new Date().toISOString(),
  };
}

async function getMusicSongJson(env, key, sourcePath) {
  const cached = await readSupabaseCache(env, key);
  if (cached?.data && isFreshSupabaseRow(cached, MUSIC_SONG_DETAIL_MAX_AGE_MS)) {
    return {
      data: cached.data,
      source: 'supabase',
      updatedAt: cached.updated_at,
    };
  }

  const fetched = await fetchMusicJson(sourcePath);
  await writeSupabaseCache(env, key, fetched.data, fetched.sourceUrl);

  return {
    data: fetched.data,
    source: cached?.data ? 'origin-refresh' : 'origin',
    updatedAt: new Date().toISOString(),
  };
}

function isFreshSupabaseRow(row, maxAgeMs) {
  if (!row?.updated_at) {
    return false;
  }

  const updatedAt = Date.parse(row.updated_at);
  if (!Number.isFinite(updatedAt)) {
    return false;
  }

  return Date.now() - updatedAt <= maxAgeMs;
}

async function handleSongSharePage(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }

  const match = url.pathname.match(/^\/share\/song\/([^/]+)$/);
  if (!match) {
    return null;
  }

  const songId = decodeURIComponent(match[1]);
  const appUrl = buildSharedSongAppUrl(request, url, songId);
  let song = {};
  let album = null;

  try {
    const fullSong = await getFullSongJson(request, env, songId);
    song = fullSong.data?.data?.song || {};
    album = fullSong.data?.data?.album || null;
  } catch (error) {
    console.warn('Share page song lookup failed:', songId, error.message);
  }

  const title = song.name
    ? `${song.name} | Monster Siren Records`
    : 'Monster Siren Records';
  const description = album?.name
    ? `Listen from ${album.name}`
    : 'Listen to this Arknights music track.';
  const image = album?.coverDeUrl || album?.coverUrl || song.coverDeUrl || song.coverUrl || '';
  const publicApiBase = getPublicApiBase(request, env);
  const imageUrl = image ? proxyMusicAssetUrl(image, publicApiBase, 'image') : '';
  const html = renderSongShareHtml({
    title,
    description,
    imageUrl,
    shareUrl: url.toString(),
    appUrl,
  });

  return new Response(request.method === 'HEAD' ? null : html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=900',
      'access-control-allow-origin': '*',
    },
  });
}

function buildSharedSongAppUrl(request, url, songId) {
  const rawApp = url.searchParams.get('app') || DEFAULT_APP_ORIGIN;
  let appUrl;

  try {
    appUrl = new URL(rawApp);
    if (appUrl.protocol !== 'https:' && appUrl.protocol !== 'http:') {
      throw new Error('Invalid app protocol');
    }
  } catch {
    appUrl = new URL(DEFAULT_APP_ORIGIN);
  }

  appUrl.searchParams.set('song', songId);
  return appUrl.toString();
}

function renderSongShareHtml({ title, description, imageUrl, shareUrl, appUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImageUrl = escapeHtml(imageUrl);
  const safeShareUrl = escapeHtml(shareUrl);
  const safeAppUrl = escapeHtml(appUrl);

  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safeTitle}</title>
  <meta name="description" content="${safeDescription}">
  <meta property="og:type" content="music.song">
  <meta property="og:title" content="${safeTitle}">
  <meta property="og:description" content="${safeDescription}">
  <meta property="og:url" content="${safeShareUrl}">
  ${safeImageUrl ? `<meta property="og:image" content="${safeImageUrl}">` : ''}
  <meta name="twitter:card" content="${safeImageUrl ? 'summary_large_image' : 'summary'}">
  <meta name="twitter:title" content="${safeTitle}">
  <meta name="twitter:description" content="${safeDescription}">
  ${safeImageUrl ? `<meta name="twitter:image" content="${safeImageUrl}">` : ''}
  <link rel="canonical" href="${safeAppUrl}">
  <meta http-equiv="refresh" content="0;url=${safeAppUrl}">
</head>
<body>
  <p><a href="${safeAppUrl}">Open song</a></p>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function handleUserApiRequest(request, env, url) {
  if (!url.pathname.startsWith('/api/auth') && !url.pathname.startsWith('/api/user')) {
    return null;
  }

  if (!hasSupabaseConfig(env)) {
    return json({ ok: false, error: 'Supabase is not configured' }, 503);
  }

  if (url.pathname === '/api/auth/sign-up') {
    return handleKeySignUp(request, env);
  }

  if (url.pathname === '/api/auth/sign-in') {
    return handleKeySignIn(request, env);
  }

  const auth = await getAuthenticatedUser(request, env);
  if (!auth.ok) {
    return json({ ok: false, error: auth.error }, auth.status || 401);
  }

  if (url.pathname === '/api/auth/user') {
    return json({ ok: true, user: auth.user });
  }

  if (url.pathname === '/api/user/favorite-songs') {
    return handleFavoriteSongsRequest(request, env, auth.user, url);
  }

  const playlistMatch = url.pathname.match(/^\/api\/user\/playlists(?:\/([^/]+))?(?:\/songs)?$/);
  if (playlistMatch) {
    const playlistId = playlistMatch[1] ? decodeURIComponent(playlistMatch[1]) : '';
    const isSongsRoute = url.pathname.endsWith('/songs');
    return handlePlaylistRequest(request, env, auth.user, playlistId, isSongsRoute);
  }

  const characterListMatch = url.pathname.match(/^\/api\/user\/character-lists(?:\/([^/]+))?(?:\/items)?$/);
  if (characterListMatch) {
    const listId = characterListMatch[1] ? decodeURIComponent(characterListMatch[1]) : '';
    const isItemsRoute = url.pathname.endsWith('/items');
    return handleCharacterListRequest(request, env, auth.user, listId, isItemsRoute);
  }

  return json({ ok: false, error: 'Not found' }, 404);
}

async function handleKeySignUp(request, env) {
  if (request.method !== 'POST') {
    return methodNotAllowed('POST');
  }

  const body = await readJsonBody(request);
  const loginKey = normalizeLoginKey(body.loginKey || body.email);
  const password = String(body.password || '');
  const validation = validateLoginCredentials(loginKey, password);
  if (validation) {
    return json({ ok: false, error: validation }, 400);
  }

  const accountKey = getUserAccountKey(loginKey);
  const existing = await env.ARKNIGHTS_DATA.get(accountKey, 'json');
  if (existing) {
    return json({ ok: false, error: 'Login key already exists' }, 409);
  }

  const salt = randomBase64Url(16);
  const passwordHash = await hashPassword(password, salt);
  const user = {
    id: crypto.randomUUID(),
    loginKey,
    createdAt: new Date().toISOString(),
  };
  const account = {
    ...user,
    salt,
    passwordHash,
  };
  await env.ARKNIGHTS_DATA.put(accountKey, JSON.stringify(account));

  const session = await createUserSession(env, user);
  return json({ ok: true, session });
}

async function handleKeySignIn(request, env) {
  if (request.method !== 'POST') {
    return methodNotAllowed('POST');
  }

  const body = await readJsonBody(request);
  const loginKey = normalizeLoginKey(body.loginKey || body.email);
  const password = String(body.password || '');
  const validation = validateLoginCredentials(loginKey, password);
  if (validation) {
    return json({ ok: false, error: validation }, 400);
  }

  const account = await env.ARKNIGHTS_DATA.get(getUserAccountKey(loginKey), 'json');
  if (!account) {
    return json({ ok: false, error: 'Invalid login key or password' }, 401);
  }

  const passwordHash = await hashPassword(password, account.salt);
  if (passwordHash !== account.passwordHash) {
    return json({ ok: false, error: 'Invalid login key or password' }, 401);
  }

  const session = await createUserSession(env, {
    id: account.id,
    loginKey: account.loginKey,
    createdAt: account.createdAt,
  });
  return json({ ok: true, session });
}

async function createUserSession(env, user) {
  const token = randomBase64Url(32);
  const session = {
    access_token: token,
    token_type: 'bearer',
    expires_in: USER_SESSION_TTL_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + USER_SESSION_TTL_SECONDS,
    user,
  };
  const sessionKey = await getUserSessionKey(token);
  await env.ARKNIGHTS_DATA.put(sessionKey, JSON.stringify(session), {
    expirationTtl: USER_SESSION_TTL_SECONDS,
  });
  return session;
}

function normalizeLoginKey(value) {
  return String(value || '').trim().toLowerCase();
}

function validateLoginCredentials(loginKey, password) {
  if (!/^[a-z0-9_-]{3,32}$/.test(loginKey)) {
    return 'Login key must be 3-32 characters: a-z, 0-9, _ or -';
  }

  if (password.length < 6) {
    return 'Password must be at least 6 characters';
  }

  return '';
}

function getUserAccountKey(loginKey) {
  return `${USER_ACCOUNT_KEY_PREFIX}${loginKey}`;
}

async function getUserSessionKey(token) {
  return `${USER_SESSION_KEY_PREFIX}${await sha256Hex(token)}`;
}

async function hashPassword(password, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    keyMaterial,
    256
  );
  return bytesToBase64Url(new Uint8Array(bits));
}

function randomBase64Url(size) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function getAuthenticatedUser(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return { ok: false, status: 401, error: 'Login required' };
  }

  const session = await env.ARKNIGHTS_DATA.get(await getUserSessionKey(token), 'json');
  if (!session?.user) {
    return { ok: false, status: 401, error: 'Invalid session' };
  }

  return { ok: true, user: session.user };
}

async function handleFavoriteSongsRequest(request, env, user, url) {
  if (request.method === 'GET') {
    const rows = await supabaseRestRequest(
      env,
      'user_favorite_songs',
      { query: `?user_id=eq.${encodeURIComponent(user.id)}&select=*&order=created_at.desc` }
    );
    return json({ ok: true, favorites: rows || [] });
  }

  if (request.method === 'POST') {
    const body = await readJsonBody(request);
    const songCid = String(body.songCid || body.song_cid || '').trim();
    if (!songCid) {
      return json({ ok: false, error: 'songCid is required' }, 400);
    }

    const rows = await supabaseRestRequest(env, 'user_favorite_songs', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: { user_id: user.id, song_cid: songCid },
    });
    return json({ ok: true, favorite: rows?.[0] || null });
  }

  if (request.method === 'DELETE') {
    const songCid = url.searchParams.get('songCid') || '';
    if (!songCid) {
      return json({ ok: false, error: 'songCid is required' }, 400);
    }

    await supabaseRestRequest(env, 'user_favorite_songs', {
      method: 'DELETE',
      query: `?user_id=eq.${encodeURIComponent(user.id)}&song_cid=eq.${encodeURIComponent(songCid)}`,
      prefer: 'return=minimal',
    });
    return json({ ok: true });
  }

  return methodNotAllowed('GET, POST, DELETE');
}

async function handlePlaylistRequest(request, env, user, playlistId, isSongsRoute) {
  if (isSongsRoute) {
    const playlist = await getOwnedRow(env, 'user_playlists', playlistId, user.id);
    if (!playlist) {
      return json({ ok: false, error: 'Playlist not found' }, 404);
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      const songCid = String(body.songCid || body.song_cid || '').trim();
      if (!songCid) {
        return json({ ok: false, error: 'songCid is required' }, 400);
      }

      const rows = await supabaseRestRequest(env, 'user_playlist_songs', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          playlist_id: playlistId,
          song_cid: songCid,
          sort_order: Number(body.sortOrder || body.sort_order || 0),
          note: body.note || null,
        },
      });
      return json({ ok: true, item: rows?.[0] || null });
    }

    if (request.method === 'DELETE') {
      const songCid = new URL(request.url).searchParams.get('songCid') || '';
      if (!songCid) {
        return json({ ok: false, error: 'songCid is required' }, 400);
      }

      await supabaseRestRequest(env, 'user_playlist_songs', {
        method: 'DELETE',
        query: `?playlist_id=eq.${encodeURIComponent(playlistId)}&song_cid=eq.${encodeURIComponent(songCid)}`,
        prefer: 'return=minimal',
      });
      return json({ ok: true });
    }
  }

  if (request.method === 'GET' && !playlistId) {
    const rows = await supabaseRestRequest(
      env,
      'user_playlists',
      { query: `?user_id=eq.${encodeURIComponent(user.id)}&select=*,songs:user_playlist_songs(*)&order=updated_at.desc` }
    );
    return json({ ok: true, playlists: rows || [] });
  }

  if (request.method === 'POST' && !playlistId) {
    const body = await readJsonBody(request);
    const name = String(body.name || '').trim();
    if (!name) {
      return json({ ok: false, error: 'name is required' }, 400);
    }

    const rows = await supabaseRestRequest(env, 'user_playlists', {
      method: 'POST',
      body: {
        user_id: user.id,
        name,
        description: body.description || null,
        visibility: body.visibility || 'private',
      },
    });
    return json({ ok: true, playlist: rows?.[0] || null });
  }

  if (playlistId && request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const rows = await supabaseRestRequest(env, 'user_playlists', {
      method: 'PATCH',
      query: `?id=eq.${encodeURIComponent(playlistId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      body: {
        name: body.name,
        description: body.description,
        visibility: body.visibility,
        updated_at: new Date().toISOString(),
      },
    });
    return json({ ok: true, playlist: rows?.[0] || null });
  }

  if (playlistId && request.method === 'DELETE') {
    await supabaseRestRequest(env, 'user_playlists', {
      method: 'DELETE',
      query: `?id=eq.${encodeURIComponent(playlistId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      prefer: 'return=minimal',
    });
    return json({ ok: true });
  }

  return methodNotAllowed('GET, POST, PATCH, DELETE');
}

async function handleCharacterListRequest(request, env, user, listId, isItemsRoute) {
  if (isItemsRoute) {
    const list = await getOwnedRow(env, 'user_character_lists', listId, user.id);
    if (!list) {
      return json({ ok: false, error: 'Character list not found' }, 404);
    }

    if (request.method === 'POST') {
      const body = await readJsonBody(request);
      const characterId = String(body.characterId || body.character_id || '').trim();
      if (!characterId) {
        return json({ ok: false, error: 'characterId is required' }, 400);
      }

      const rows = await supabaseRestRequest(env, 'user_character_list_items', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: {
          list_id: listId,
          character_id: characterId,
          sort_order: Number(body.sortOrder || body.sort_order || 0),
          note: body.note || null,
        },
      });
      return json({ ok: true, item: rows?.[0] || null });
    }

    if (request.method === 'DELETE') {
      const characterId = new URL(request.url).searchParams.get('characterId') || '';
      await supabaseRestRequest(env, 'user_character_list_items', {
        method: 'DELETE',
        query: `?list_id=eq.${encodeURIComponent(listId)}&character_id=eq.${encodeURIComponent(characterId)}`,
        prefer: 'return=minimal',
      });
      return json({ ok: true });
    }
  }

  if (request.method === 'GET' && !listId) {
    const rows = await supabaseRestRequest(
      env,
      'user_character_lists',
      { query: `?user_id=eq.${encodeURIComponent(user.id)}&select=*,items:user_character_list_items(*)&order=updated_at.desc` }
    );
    return json({ ok: true, lists: rows || [] });
  }

  if (request.method === 'POST' && !listId) {
    const body = await readJsonBody(request);
    const name = String(body.name || '').trim();
    if (!name) {
      return json({ ok: false, error: 'name is required' }, 400);
    }

    const rows = await supabaseRestRequest(env, 'user_character_lists', {
      method: 'POST',
      body: {
        user_id: user.id,
        name,
        description: body.description || null,
      },
    });
    return json({ ok: true, list: rows?.[0] || null });
  }

  if (listId && request.method === 'PATCH') {
    const body = await readJsonBody(request);
    const rows = await supabaseRestRequest(env, 'user_character_lists', {
      method: 'PATCH',
      query: `?id=eq.${encodeURIComponent(listId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      body: {
        name: body.name,
        description: body.description,
        updated_at: new Date().toISOString(),
      },
    });
    return json({ ok: true, list: rows?.[0] || null });
  }

  if (listId && request.method === 'DELETE') {
    await supabaseRestRequest(env, 'user_character_lists', {
      method: 'DELETE',
      query: `?id=eq.${encodeURIComponent(listId)}&user_id=eq.${encodeURIComponent(user.id)}`,
      prefer: 'return=minimal',
    });
    return json({ ok: true });
  }

  return methodNotAllowed('GET, POST, PATCH, DELETE');
}

async function getOwnedRow(env, tableName, id, userId) {
  if (!id) {
    return null;
  }

  const rows = await supabaseRestRequest(env, tableName, {
    query: `?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=*&limit=1`,
  });
  return rows?.[0] || null;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function handleMusicApiRequest(request, env, url) {
  if (url.pathname === '/api/lyrics/translate') {
    if (request.method !== 'POST') {
      return methodNotAllowed('POST');
    }

    return handleLyricsTranslateRequest(request, env);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return null;
  }

  const routes = [
    {
      pattern: /^\/api\/albums$/,
      cacheKey: `${MUSIC_CACHE_PREFIX}albums`,
      sourcePath: '/api/albums',
    },
    {
      pattern: /^\/api\/songs$/,
      cacheKey: `${MUSIC_CACHE_PREFIX}songs`,
      sourcePath: '/api/songs',
    },
  ];

  for (const route of routes) {
    if (route.pattern.test(url.pathname)) {
      const result = await getMusicJson(env, route.cacheKey, route.sourcePath);
      return json(result.data, 200, 900, {
        'x-data-source': result.source,
        'x-cache-updated-at': result.updatedAt || '',
      });
    }
  }

  const fullSongMatch = url.pathname.match(/^\/api\/song\/([^/]+)\/full$/);
  if (fullSongMatch) {
    const songId = decodeURIComponent(fullSongMatch[1]);
    const result = await getFullSongJson(request, env, songId);
    return json(result.data, 200, 900, {
      'x-data-source': result.source,
      'x-cache-updated-at': result.updatedAt || '',
    });
  }

  if (url.pathname === '/api/search') {
    const result = await searchMusicJson(env, url.searchParams.get('q') || '');
    return json(result, 200, 300);
  }

  const albumMatch = url.pathname.match(/^\/api\/album\/([^/]+)\/detail$/);
  if (albumMatch) {
    const albumId = decodeURIComponent(albumMatch[1]);
    const result = await getMusicJson(
      env,
      `${MUSIC_CACHE_PREFIX}album:${albumId}`,
      `/api/album/${encodeURIComponent(albumId)}/detail`
    );
    await upsertSupabaseRows(env, 'music_albums', normalizeMusicAlbumDetailRow(result.data));
    await upsertSupabaseRows(env, 'music_songs', normalizeMusicAlbumSongRows(result.data));
    return json(result.data, 200, 900, {
      'x-data-source': result.source,
      'x-cache-updated-at': result.updatedAt || '',
    });
  }

  const songMatch = url.pathname.match(/^\/api\/song\/([^/]+)$/);
  if (songMatch) {
    const songId = decodeURIComponent(songMatch[1]);
    const result = await getMusicSongJson(
      env,
      `${MUSIC_CACHE_PREFIX}song:${songId}`,
      `/api/song/${encodeURIComponent(songId)}`
    );
    return json(result.data, 200, 900, {
      'x-data-source': result.source,
      'x-cache-updated-at': result.updatedAt || '',
    });
  }

  return null;
}

async function getFullSongJson(request, env, songId) {
  const publicApiBase = getPublicApiBase(request, env);
  const songResult = await getMusicSongJson(
    env,
    `${MUSIC_CACHE_PREFIX}song:${songId}`,
    `/api/song/${encodeURIComponent(songId)}`
  );
  const song = songResult.data?.data || {};
  let album = null;
  let albumSource = '';

  if (song.albumCid) {
    try {
      const albumResult = await getMusicJson(
        env,
        `${MUSIC_CACHE_PREFIX}album:${song.albumCid}`,
        `/api/album/${encodeURIComponent(song.albumCid)}/detail`
      );
      album = albumResult.data?.data || null;
      albumSource = albumResult.source;
      await upsertSupabaseRows(env, 'music_albums', normalizeMusicAlbumDetailRow(albumResult.data));
      await upsertSupabaseRows(env, 'music_songs', normalizeMusicAlbumSongRows(albumResult.data));
    } catch (error) {
      console.warn('Full song album lookup failed:', song.albumCid, error.message);
    }
  }

  const lyricsText = song.lyricUrl
    ? await fetchLyricsText(song.lyricUrl).catch((error) => {
        console.warn('Full song lyrics lookup failed:', songId, error.message);
        return '';
      })
    : '';

  return {
    data: {
      ok: true,
      data: {
        song,
        album,
        lyricsText,
        assets: {
          coverUrl: song.coverUrl ? proxyMusicAssetUrl(song.coverUrl, publicApiBase, 'image') : '',
          coverDeUrl: song.coverDeUrl ? proxyMusicAssetUrl(song.coverDeUrl, publicApiBase, 'image') : '',
          albumCoverUrl: album?.coverUrl ? proxyMusicAssetUrl(album.coverUrl, publicApiBase, 'image') : '',
          albumCoverDeUrl: album?.coverDeUrl ? proxyMusicAssetUrl(album.coverDeUrl, publicApiBase, 'image') : '',
          audioUrl: song.sourceUrl ? proxyMusicAssetUrl(song.sourceUrl, publicApiBase, 'audio') : '',
          lyricUrl: song.lyricUrl ? proxyMusicAssetUrl(song.lyricUrl, publicApiBase, 'lyrics') : '',
        },
      },
    },
    source: albumSource ? `${songResult.source}+${albumSource}` : songResult.source,
    updatedAt: songResult.updatedAt,
  };
}

async function fetchLyricsText(rawUrl) {
  if (!isAllowedMusicAssetUrl(rawUrl, 'lyrics')) {
    return '';
  }

  const response = await fetch(rawUrl, {
    cf: {
      cacheTtl: 60 * 60 * 6,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    return '';
  }

  return response.text();
}

function proxyMusicAssetUrl(rawUrl, publicApiBase, type) {
  const proxyPath = type === 'audio'
    ? '/proxy-audio'
    : type === 'lyrics'
      ? '/proxy-lyrics'
      : '/proxy-image';
  return `${publicApiBase}${proxyPath}?url=${encodeURIComponent(rawUrl)}`;
}

async function searchMusicJson(env, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return {
      ok: true,
      query: '',
      albums: [],
      songs: [],
      count: 0,
    };
  }

  const [albumsResult, songsResult] = await Promise.all([
    getMusicJson(env, `${MUSIC_CACHE_PREFIX}albums`, '/api/albums'),
    getMusicJson(env, `${MUSIC_CACHE_PREFIX}songs`, '/api/songs'),
  ]);
  const albums = getMusicAlbumList(albumsResult.data);
  const songs = getMusicSongList(songsResult.data);
  const matchedAlbums = albums
    .filter((album) => musicItemMatches(album, normalizedQuery))
    .slice(0, 50);
  const matchedSongs = songs
    .filter((song) => musicItemMatches(song, normalizedQuery))
    .slice(0, 50);

  return {
    ok: true,
    query,
    albums: matchedAlbums,
    songs: matchedSongs,
    count: matchedAlbums.length + matchedSongs.length,
  };
}

function musicItemMatches(item, normalizedQuery) {
  const haystack = normalizeSearchText([
    item?.name,
    item?.cid,
    ...(item?.artistes || item?.artists || []),
  ].filter(Boolean).join(' '));
  return haystack.includes(normalizedQuery);
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

async function handleLyricsTranslateRequest(request, env) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid JSON body' }, 400);
  }

  const targetLocale = normalizeTranslationLocale(payload.locale || payload.targetLocale);
  const lines = normalizeTranslationLines(payload);
  if (lines.length === 0) {
    return json({
      ok: true,
      targetLocale,
      translations: [],
      translation: '',
    });
  }

  const translatedLines = await translateServerLines(env, lines, targetLocale);
  const translations = translatedLines.map((line) => line.translation || '');

  return json({
    ok: true,
    targetLocale,
    translations,
    translation: translations[0] || '',
  }, 200, 3600);
}

function normalizeTranslationLines(payload) {
  if (Array.isArray(payload.lines)) {
    return payload.lines
      .slice(0, 200)
      .map((line, index) => ({
        index,
        text: String(line?.text || line || '').trim(),
      }));
  }

  const text = String(payload.text || '').trim();
  return text ? [{ index: 0, text }] : [];
}

async function translateServerLines(env, lines, targetLocale) {
  const result = lines.map((line) => ({
    ...line,
    sourceLocale: detectTranslationSourceLocale(line.text, targetLocale),
    translation: '',
  }));
  const translatableLines = [];

  for (const line of result) {
    if (shouldSkipServerTranslation(line.text, line.sourceLocale, targetLocale)) {
      continue;
    }

    const cached = await readServerTranslationCache(env, line.text, line.sourceLocale, targetLocale);
    if (cached != null) {
      line.translation = cached;
      continue;
    }

    translatableLines.push(line);
  }

  for (const batch of createServerTranslationBatches(translatableLines)) {
    try {
      const translatedParts = await translateServerBatch(batch, targetLocale);
      for (let index = 0; index < batch.length; index += 1) {
        const line = batch[index];
        const translation = translatedParts[index] || '';
        if (isInvalidServerTranslation(line.text, translation, line.sourceLocale, targetLocale)) {
          line.translation = '';
          continue;
        }

        line.translation = translation;
        await writeServerTranslationCache(env, line.text, line.sourceLocale, targetLocale, translation);
      }
    } catch (error) {
      console.warn('Server lyric translation batch failed:', error.message);
    }
  }

  return result;
}

function createServerTranslationBatches(lines) {
  const batches = [];
  let currentBatch = [];
  let currentLength = 0;
  let currentSourceLocale = '';

  for (const line of lines) {
    const nextLength = currentLength + line.text.length + TRANSLATION_LINE_SEPARATOR.length;
    if (
      currentBatch.length > 0 &&
      (nextLength > MAX_TRANSLATION_BATCH_TEXT_LENGTH || line.sourceLocale !== currentSourceLocale)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
      currentSourceLocale = '';
    }

    currentSourceLocale = line.sourceLocale;
    currentBatch.push(line);
    currentLength += line.text.length + TRANSLATION_LINE_SEPARATOR.length;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function translateServerBatch(batch, targetLocale) {
  const text = batch.map((line) => line.text).join(TRANSLATION_LINE_SEPARATOR);
  const sourceLocale = batch[0]?.sourceLocale || 'auto';
  const params = new URLSearchParams({
    client: 'gtx',
    sl: sourceLocale,
    tl: targetLocale,
    dt: 't',
    q: text,
  });
  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  return readGoogleTranslateResponse(data).split(TRANSLATION_LINE_SEPARATOR);
}

function readGoogleTranslateResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    return '';
  }

  return data[0]
    .map((part) => (Array.isArray(part) ? part[0] : ''))
    .filter(Boolean)
    .join('')
    .trim();
}

function normalizeTranslationLocale(locale) {
  return SUPPORTED_TRANSLATION_LOCALES.has(locale) ? locale : 'zh-TW';
}

function detectTranslationSourceLocale(text, targetLocale) {
  const sample = String(text || '').trim();
  if (!sample) {
    return 'auto';
  }

  const hasLatin = /[a-z]/i.test(sample);
  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff]/i.test(sample);
  const hasHangul = /[\uac00-\ud7af]/i.test(sample);
  const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff]/i.test(sample);

  if ((targetLocale === 'zh-TW' || targetLocale === 'zh-CN') && hasLatin) {
    return 'en';
  }

  if (hasKana) {
    return 'ja';
  }

  if (hasHangul) {
    return 'ko';
  }

  if (hasLatin) {
    return 'en';
  }

  if (hasHan) {
    return 'zh';
  }

  return 'auto';
}

function shouldSkipServerTranslation(text, sourceLocale, targetLocale) {
  const sample = String(text || '').trim();
  if (!sample) {
    return true;
  }

  if ((targetLocale === 'zh-TW' || targetLocale === 'zh-CN') && sourceLocale === 'zh') {
    return true;
  }

  return sourceLocale === targetLocale;
}

function isInvalidServerTranslation(sourceText, translation, sourceLocale, targetLocale) {
  if (!translation) {
    return true;
  }

  if (sourceLocale !== 'en' || (targetLocale !== 'zh-TW' && targetLocale !== 'zh-CN')) {
    return false;
  }

  return String(sourceText || '').trim().toLowerCase() === String(translation || '').trim().toLowerCase();
}

async function readServerTranslationCache(env, text, sourceLocale, targetLocale) {
  if (!env.ARKNIGHTS_DATA) {
    return null;
  }

  const key = await getServerTranslationCacheKey(text, sourceLocale, targetLocale);
  return env.ARKNIGHTS_DATA.get(key);
}

async function writeServerTranslationCache(env, text, sourceLocale, targetLocale, translation) {
  if (!env.ARKNIGHTS_DATA) {
    return;
  }

  const key = await getServerTranslationCacheKey(text, sourceLocale, targetLocale);
  await env.ARKNIGHTS_DATA.put(key, translation, {
    expirationTtl: 60 * 60 * 24 * 90,
  });
}

async function getServerTranslationCacheKey(text, sourceLocale, targetLocale) {
  const digest = await sha256Hex(`${sourceLocale}:${targetLocale}:${text}`);
  return `${LYRICS_TRANSLATION_CACHE_PREFIX}${digest}`;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function syncMusicCache(env, options = {}) {
  if (!hasSupabaseConfig(env)) {
    return {
      synced: [],
      supabaseConfigured: false,
      warning: 'SUPABASE_SERVICE_ROLE_KEY is not configured.',
    };
  }

  const synced = [];
  const songDetailLimit =
    options.songDetailLimit ?? DEFAULT_SONG_DETAIL_PREWARM_LIMIT;
  const albumDetailLimit =
    options.albumDetailLimit ?? DEFAULT_ALBUM_DETAIL_PREWARM_LIMIT;
  const albums = await fetchMusicJson('/api/albums');
  await writeSupabaseCache(env, `${MUSIC_CACHE_PREFIX}albums`, albums.data, albums.sourceUrl);
  const normalizedAlbums = normalizeMusicAlbumRows(albums.data);
  const albumTableResult = await upsertSupabaseRows(env, 'music_albums', normalizedAlbums);
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}albums`,
    count: Array.isArray(albums.data?.data) ? albums.data.data.length : null,
  });
  synced.push({
    table: 'music_albums',
    ...albumTableResult,
  });
  const albumDetails = await prewarmMusicAlbumDetails(env, albums.data, {
    limit: albumDetailLimit,
  });
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}album:{albumId}`,
    ...albumDetails,
  });

  const songs = await fetchMusicJson('/api/songs');
  await writeSupabaseCache(env, `${MUSIC_CACHE_PREFIX}songs`, songs.data, songs.sourceUrl);
  const normalizedSongs = normalizeMusicSongListRows(songs.data);
  const songTableResult = await upsertSupabaseRows(env, 'music_songs', normalizedSongs);
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}songs`,
    count: Array.isArray(songs.data?.data?.list) ? songs.data.data.list.length : null,
  });
  synced.push({
    table: 'music_songs',
    ...songTableResult,
  });

  const songDetails = await prewarmMusicSongDetails(env, songs.data, {
    limit: songDetailLimit,
  });
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}song:{songId}`,
    ...songDetails,
  });

  return {
    synced,
    supabaseConfigured: true,
  };
}

async function getMusicCacheStatus(env) {
  if (!hasSupabaseConfig(env)) {
    return {
      supabaseConfigured: false,
      warning: 'SUPABASE_SERVICE_ROLE_KEY is not configured.',
    };
  }

  const [
    albumCount,
    albumWithIntroCount,
    albumWithCoverCount,
    songCount,
    songWithAlbumCount,
    songWithoutAlbumCount,
    songWithSourceCount,
    songWithoutSourceCount,
    songWithLyricCount,
    songWithMvCount,
    cacheEntryCount,
    latestAlbum,
    latestSong,
    latestCacheEntry,
    songCursor,
    albumCursor,
  ] = await Promise.all([
    countSupabaseRows(env, 'music_albums'),
    countSupabaseRows(env, 'music_albums', { intro: 'not.is.null' }),
    countSupabaseRows(env, 'music_albums', { cover_url: 'not.is.null' }),
    countSupabaseRows(env, 'music_songs'),
    countSupabaseRows(env, 'music_songs', { album_id: 'not.is.null' }),
    countSupabaseRows(env, 'music_songs', { album_id: 'is.null' }),
    countSupabaseRows(env, 'music_songs', { source_url: 'not.is.null' }),
    countSupabaseRows(env, 'music_songs', { source_url: 'is.null' }),
    countSupabaseRows(env, 'music_songs', { lyric_url: 'not.is.null' }),
    countSupabaseRows(env, 'music_songs', { mv_url: 'not.is.null' }),
    countSupabaseRows(env, 'music_cache', { key: `like.${MUSIC_CACHE_PREFIX}*` }, 'key'),
    readLatestSupabaseRow(env, 'music_albums', 'id,name,updated_at'),
    readLatestSupabaseRow(env, 'music_songs', 'id,name,updated_at'),
    readLatestSupabaseRow(env, 'music_cache', 'key,updated_at'),
    readSupabaseCache(env, MUSIC_SONG_DETAIL_CURSOR_KEY),
    readSupabaseCache(env, MUSIC_ALBUM_DETAIL_CURSOR_KEY),
  ]);

  return {
    supabaseConfigured: true,
    albums: {
      total: albumCount,
      withIntro: albumWithIntroCount,
      withCover: albumWithCoverCount,
      latestUpdatedAt: latestAlbum?.updated_at || null,
      latestUpdatedId: latestAlbum?.id || null,
      latestUpdatedName: latestAlbum?.name || null,
    },
    songs: {
      total: songCount,
      withAlbumId: songWithAlbumCount,
      withoutAlbumId: songWithoutAlbumCount,
      withSourceUrl: songWithSourceCount,
      withoutSourceUrl: songWithoutSourceCount,
      withLyricUrl: songWithLyricCount,
      withMvUrl: songWithMvCount,
      latestUpdatedAt: latestSong?.updated_at || null,
      latestUpdatedId: latestSong?.id || null,
      latestUpdatedName: latestSong?.name || null,
    },
    cache: {
      musicEntryCount: cacheEntryCount,
      latestUpdatedAt: latestCacheEntry?.updated_at || null,
      latestUpdatedKey: latestCacheEntry?.key || null,
    },
    cursors: {
      songDetails: songCursor?.data || null,
      albumDetails: albumCursor?.data || null,
    },
  };
}

async function prewarmMusicSongDetails(env, songsPayload, options = {}) {
  const songs = Array.isArray(songsPayload?.data?.list)
    ? songsPayload.data.list
    : [];
  const limit = Math.max(0, Math.floor(options.limit ?? DEFAULT_SONG_DETAIL_PREWARM_LIMIT));

  if (songs.length === 0 || limit === 0) {
    return {
      attempted: 0,
      stored: 0,
      errors: 0,
      total: songs.length,
      nextIndex: 0,
      done: songs.length === 0,
    };
  }

  const cursorRow = await readSupabaseCache(env, MUSIC_SONG_DETAIL_CURSOR_KEY);
  const startIndex = normalizeCursorIndex(cursorRow?.data?.nextIndex, songs.length);
  const candidates = buildCircularBatch(songs, startIndex, limit);
  let stored = 0;
  let errors = 0;

  for (const item of candidates) {
    const songId = item.item?.cid;
    if (!songId) {
      continue;
    }

    try {
      const detail = await fetchMusicJson(`/api/song/${encodeURIComponent(songId)}`);
      await writeSupabaseCache(
        env,
        `${MUSIC_CACHE_PREFIX}song:${songId}`,
        detail.data,
        detail.sourceUrl
      );
      await upsertSupabaseRows(
        env,
        'music_songs',
        normalizeMusicSongDetailRow(detail.data)
      );
      stored += 1;
    } catch (error) {
      errors += 1;
      console.warn('Music song detail prewarm failed:', songId, error.message);
    }
  }

  const nextIndex = songs.length === 0
    ? 0
    : (startIndex + candidates.length) % songs.length;
  const wrapped = didCircularBatchWrap(startIndex, candidates.length, songs.length);
  await writeSupabaseCache(
    env,
    MUSIC_SONG_DETAIL_CURSOR_KEY,
    {
      nextIndex,
      total: songs.length,
      lastBatchSize: candidates.length,
      lastStored: stored,
      lastErrors: errors,
      lastWrapped: wrapped,
      updatedAt: new Date().toISOString(),
    },
    'worker:sync-music'
  );

  return {
    attempted: candidates.length,
    stored,
    errors,
    total: songs.length,
    startIndex,
    nextIndex,
    wrapped,
    done: wrapped,
  };
}

async function prewarmMusicAlbumDetails(env, albumsPayload, options = {}) {
  const albums = getMusicAlbumList(albumsPayload);
  const limit = Math.max(0, Math.floor(options.limit ?? DEFAULT_ALBUM_DETAIL_PREWARM_LIMIT));

  if (albums.length === 0 || limit === 0) {
    return {
      attempted: 0,
      stored: 0,
      errors: 0,
      total: albums.length,
      nextIndex: 0,
      done: albums.length === 0,
    };
  }

  const cursorRow = await readSupabaseCache(env, MUSIC_ALBUM_DETAIL_CURSOR_KEY);
  const startIndex = normalizeCursorIndex(cursorRow?.data?.nextIndex, albums.length);
  const candidates = buildCircularBatch(albums, startIndex, limit);
  let stored = 0;
  let errors = 0;

  for (const item of candidates) {
    const cid = item.item?.cid;
    if (!cid) {
      continue;
    }

    try {
      const detail = await fetchMusicJson(`/api/album/${encodeURIComponent(cid)}/detail`);
      await writeSupabaseCache(
        env,
        `${MUSIC_CACHE_PREFIX}album:${cid}`,
        detail.data,
        detail.sourceUrl
      );
      await upsertSupabaseRows(env, 'music_albums', normalizeMusicAlbumDetailRow(detail.data));
      await upsertSupabaseRows(env, 'music_songs', normalizeMusicAlbumSongRows(detail.data));
      stored += 1;
    } catch (error) {
      errors += 1;
      console.warn('Music album detail prewarm failed:', cid, error.message);
    }
  }

  const nextIndex = albums.length === 0
    ? 0
    : (startIndex + candidates.length) % albums.length;
  const wrapped = didCircularBatchWrap(startIndex, candidates.length, albums.length);
  await writeSupabaseCache(
    env,
    MUSIC_ALBUM_DETAIL_CURSOR_KEY,
    {
      nextIndex,
      total: albums.length,
      lastBatchSize: candidates.length,
      lastStored: stored,
      lastErrors: errors,
      lastWrapped: wrapped,
      updatedAt: new Date().toISOString(),
    },
    'worker:prewarm-music-albums'
  );

  return {
    synced: 'music:album-details',
    attempted: candidates.length,
    stored,
    errors,
    total: albums.length,
    startIndex,
    nextIndex,
    wrapped,
    done: wrapped,
  };
}

function normalizeCursorIndex(rawIndex, total) {
  if (total <= 0) {
    return 0;
  }

  const index = Number(rawIndex);
  if (!Number.isFinite(index)) {
    return 0;
  }

  return Math.min(total - 1, Math.max(0, Math.floor(index)));
}

function buildCircularBatch(items, startIndex, limit) {
  const cappedLimit = Math.min(items.length, Math.max(0, limit));
  const batch = [];

  for (let offset = 0; offset < cappedLimit; offset += 1) {
    const index = (startIndex + offset) % items.length;
    batch.push({
      index,
      item: items[index],
    });
  }

  return batch;
}

function didCircularBatchWrap(startIndex, batchSize, total) {
  if (total <= 0 || batchSize <= 0) {
    return total === 0;
  }

  return startIndex + batchSize >= total;
}

async function buildRecruitOperators(publicApiBase) {
  const [characterTable, teamTable] = await Promise.all([
    fetchJson(`${EXCEL_BASE}/character_table.json`),
    fetchJson(`${EXCEL_BASE}/handbook_team_table.json`),
  ]);

  const operators = Object.entries(characterTable)
    .filter(([id, char]) => {
      return (
        id.startsWith('char_') &&
        char.name &&
        char.rarity != null &&
        char.profession !== 'TOKEN' &&
        char.profession !== 'TRAP' &&
        char.isNotObtainable !== true
      );
    })
    .map(([id, char]) => {
      const factionId = resolveFactionId(char);
      return {
        id,
        name: char.name,
        appellation: char.appellation || '',
        profession: char.profession || '',
        rarity: parseRarity(char.rarity),
        factionId,
        factionName: teamTable?.[factionId]?.powerName || factionId || '',
        avatarUrl: proxyImageUrl(getAvatarUrls(id)[0], publicApiBase, getAvatarUrls(id).slice(1)),
      };
    })
    .sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));

  return {
    ok: true,
    count: operators.length,
    operators,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    cf: {
      cacheTtl: 3600,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${url}`);
  }

  return response.json();
}

async function getRecruitOperatorDetail(charId, publicApiBase) {
  const [characterTable, skinTable, teamTable, charwordTable] = await Promise.all([
    fetchJson(`${EXCEL_BASE}/character_table.json`),
    fetchJson(`${EXCEL_BASE}/skin_table.json`),
    fetchJson(`${EXCEL_BASE}/handbook_team_table.json`),
    fetchJson(`${EXCEL_BASE}/charword_table.json`),
  ]);

  return buildRecruitOperatorDetailFromTables(
    charId,
    characterTable,
    skinTable,
    teamTable,
    charwordTable,
    publicApiBase
  );
}

function buildRecruitOperatorDetailFromTables(
  charId,
  characterTable,
  skinTable,
  teamTable,
  charwordTable,
  publicApiBase
) {
  const char = characterTable[charId];

  if (!char) {
    return {
      ok: false,
      error: 'Operator not found',
      id: charId,
    };
  }

  const factionId = resolveFactionId(char);

  return {
    ok: true,
    operator: {
      id: charId,
      name: char.name,
      appellation: char.appellation || '',
      profession: char.profession || '',
      rarity: parseRarity(char.rarity),
      factionId,
      factionName: teamTable?.[factionId]?.powerName || factionId || '',
      traitDescription: getTraitDescription(char),
      recruitVoiceText: getRecruitVoiceText(charId, charwordTable),
      portraits: getPortraits(charId, char, skinTable, publicApiBase),
      avatarUrl: proxyImageUrl(getAvatarUrls(charId)[0], publicApiBase, getAvatarUrls(charId).slice(1)),
    },
  };
}

async function prewarmRecruitOperatorDetails(env, publicApiBase, options = {}) {
  const offset = options.offset || 0;
  const limit = options.limit || 50;
  const [operatorsData, characterTable, skinTable, teamTable, charwordTable] = await Promise.all([
    buildRecruitOperators(publicApiBase),
    fetchJson(`${EXCEL_BASE}/character_table.json`),
    fetchJson(`${EXCEL_BASE}/skin_table.json`),
    fetchJson(`${EXCEL_BASE}/handbook_team_table.json`),
    fetchJson(`${EXCEL_BASE}/charword_table.json`),
  ]);

  await env.ARKNIGHTS_DATA.put(RECRUIT_OPERATORS_KEY, JSON.stringify(operatorsData));

  const batch = operatorsData.operators.slice(offset, offset + limit);
  let stored = 0;
  let skipped = 0;
  const errors = [];

  for (const operator of batch) {
    try {
      const detail = buildRecruitOperatorDetailFromTables(
        operator.id,
        characterTable,
        skinTable,
        teamTable,
        charwordTable,
        publicApiBase
      );

      if (!detail.ok) {
        skipped += 1;
        continue;
      }

      await env.ARKNIGHTS_DATA.put(
        `${RECRUIT_OPERATOR_DETAIL_KEY_PREFIX}${operator.id}`,
        JSON.stringify(detail)
      );
      stored += 1;
    } catch (error) {
      errors.push({
        id: operator.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    synced: 'recruit:operator-details',
    operators: operatorsData.operators.length,
    offset,
    limit,
    nextOffset: offset + batch.length,
    done: offset + batch.length >= operatorsData.operators.length,
    stored,
    skipped,
    errors: errors.slice(0, 10),
    errorCount: errors.length,
  };
}

function getTraitDescription(char) {
  const candidates = char?.trait?.candidates || [];
  const lastCandidate = candidates[candidates.length - 1];

  return cleanText(
    lastCandidate?.overrideDescripton ||
      lastCandidate?.additionalDescription ||
      char?.description ||
      ''
  );
}

function getRecruitVoiceText(charId, charwordTable) {
  const words = Object.values(charwordTable?.charWords || {}).filter((word) => {
    return word?.charId === charId && word.voiceText;
  });

  const recruitWord =
    words.find((word) => /干员报到|幹員報到|報到|报到/.test(String(word.voiceTitle || ''))) ||
    words.find((word) => word.voiceId === 'CN_011');

  return cleanText(recruitWord?.voiceText || '');
}

function getPortraits(charId, char, skinTable, publicApiBase) {
  const portraits = [];
  const displaySkins = char.displaySkins || [];
  const phases = char.phases || [];

  if (phases.length > 1) {
    const phase1 = phases[1];
    const elite1Skin =
      displaySkins.find((skin) => {
        return skin.portraitId && (skin.portraitId.includes('_1') || skin.portraitId.includes('#1'));
      }) || displaySkins[0];

    const portraitId = elite1Skin?.portraitId || phase1.displayId || `${charId}_1`;

    portraits.push({
      name: '精英一',
      portraitId,
      skinId: null,
      urls: getPortraitUrls(portraitId, [
        `${charId}_1+`,
        `${charId}_1`,
        `${charId}#1`,
        phase1.displayId,
      ], publicApiBase),
    });
  }

  if (phases.length > 2) {
    const phase2 = phases[2];
    const elite2Skin =
      displaySkins.find((skin) => {
        return skin.portraitId && (skin.portraitId.includes('_2') || skin.portraitId.includes('#2'));
      }) || displaySkins[1];

    const portraitId = elite2Skin?.portraitId || phase2.displayId || `${charId}_2`;

    portraits.push({
      name: '精英二',
      portraitId,
      skinId: null,
      urls: getPortraitUrls(portraitId, [], publicApiBase),
    });
  }

  const elitePortraitIds = new Set(portraits.map((portrait) => portrait.portraitId).filter(Boolean));

  const costumeRows = Object.values(skinTable?.charSkins || {})
    .filter((skin) => {
      if (!skin || skin.charId !== charId) {
        return false;
      }

      const skinGroupId = skin.displaySkin?.skinGroupId;
      if (typeof skinGroupId === 'string' && skinGroupId.startsWith('ILLUST_')) {
        return false;
      }

      if (!skin.portraitId || elitePortraitIds.has(skin.portraitId)) {
        return false;
      }

      return true;
    })
    .map((skin) => {
      const displaySkin = skin.displaySkin || {};
      const label = displaySkin.skinName || displaySkin.skinGroupName || skin.skinId || skin.portraitId;

      return {
        skinId: skin.skinId,
        portraitId: skin.portraitId,
        name: `時裝 - ${label}`,
        sortId: typeof displaySkin.sortId === 'number' ? displaySkin.sortId : 0,
      };
    })
    .sort((a, b) => {
      return a.sortId - b.sortId || String(a.skinId).localeCompare(String(b.skinId));
    });

  const seenPortraits = new Set();

  costumeRows.forEach((row) => {
    if (seenPortraits.has(row.portraitId)) {
      return;
    }

    seenPortraits.add(row.portraitId);

    portraits.push({
      name: row.name,
      portraitId: row.portraitId,
      skinId: row.skinId,
      urls: getPortraitUrls(row.portraitId, [], publicApiBase),
    });
  });

  return portraits;
}

function getPortraitUrls(portraitId, alternativeIds = [], publicApiBase) {
  const ids = [portraitId, ...alternativeIds].filter(Boolean);
  const urls = [];

  ids.forEach((id) => {
    const encodedId = encodeURIComponent(id);

    const rawUrls = [
      `${IMAGE_MIRROR_RESOURCE}/charportraits/${encodedId}.png`,
      `${IMAGE_MIRROR_DYNAMIC}/charportraits/${encodedId}.png`,
      `${IMAGE_MIRROR_ACESHIP}/characters/${encodedId}.png`,
      `${IMAGE_BASE}/characters/${encodedId}.png`,
      `https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main/portraits/${encodedId}.png`
    ];

    urls.push(proxyImageUrl(rawUrls[0], publicApiBase, rawUrls.slice(1)));
  });

  return urls;
}

function getAvatarUrls(charId) {
  const encodedId = encodeURIComponent(charId);
  return [
    `${IMAGE_MIRROR_RESOURCE}/avatar/${encodedId}.png`,
    `${IMAGE_MIRROR_DYNAMIC}/charavatars/${encodedId}.png`,
    `${IMAGE_MIRROR_ACESHIP}/avatars/${encodedId}.png`,
    `${IMAGE_BASE}/avatars/${encodedId}.png`,
  ];
}

function getPublicApiBase(request, env) {
  return (env.RECRUIT_API_BASE || new URL(request.url).origin || DEFAULT_PUBLIC_API_BASE).replace(/\/$/, '');
}

function proxyImageUrl(rawUrl, publicApiBase, fallbackUrls = []) {
  const base = (publicApiBase || DEFAULT_PUBLIC_API_BASE).replace(/\/$/, '');
  const params = new URLSearchParams({ url: rawUrl });
  fallbackUrls.filter(Boolean).forEach((url) => params.append('alt', url));
  return `${base}/api/recruit/image?${params.toString()}`;
}

function isAllowedImageUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'raw.githubusercontent.com' &&
      /\.(png|jpg|jpeg|webp)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function proxyRecruitImage(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
        'access-control-allow-origin': '*',
      },
    });
  }

  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url') || '';
  const fallbackUrls = requestUrl.searchParams.getAll('alt').filter(Boolean);
  const candidateUrls = sortRecruitImageCandidates([rawUrl, ...fallbackUrls].filter(Boolean));

  if (candidateUrls.length === 0 || candidateUrls.some((url) => !isAllowedImageUrl(url))) {
    return json({ ok: false, error: 'Invalid image url' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return request.method === 'HEAD' ? new Response(null, cached) : cached;
  }

  let upstream = null;
  let failedStatus = 502;

  for (const candidateUrl of candidateUrls) {
    const candidateResponse = await fetch(candidateUrl, {
      cf: {
        cacheTtl: 60 * 60 * 24 * 30,
        cacheEverything: true,
      },
    });

    if (candidateResponse.ok) {
      upstream = candidateResponse;
      break;
    }

    failedStatus = candidateResponse.status;
  }

  if (!upstream) {
    return new Response('Image not found', {
      status: failedStatus,
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    });
  }

  const response = new Response(upstream.body, upstream);
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('cache-control', 'public, max-age=2592000, immutable');
  response.headers.delete('set-cookie');

  await cache.put(cacheKey, response.clone());
  return request.method === 'HEAD' ? new Response(null, response) : response;
}

function sortRecruitImageCandidates(urls) {
  return urls
    .map((url, index) => ({ url, index, priority: getRecruitImagePriority(url) }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map((entry) => entry.url);
}

function getRecruitImagePriority(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const value = `${url.hostname}${url.pathname}`;

    if (value.includes('yuanyan3060/ArknightsGameResource')) return 0;
    if (value.includes('ArknightsAssets/ArknightsAssets')) return 1;
    if (value.includes('Aceship/Arknight-Images')) return 2;
    if (value.includes('PuppiizSunniiz/Arknight-Images')) return 3;
    if (value.includes('ak-cn-archive/arknights-operator-image')) return 4;
    return 10;
  } catch {
    return 10;
  }
}

function isAllowedMusicAssetUrl(rawUrl, type) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') {
      return false;
    }

    if (type === 'image') {
      return /\.(png|jpg|jpeg|webp)$/i.test(url.pathname);
    }

    if (type === 'lyrics') {
      return /\.(lrc|txt)$/i.test(url.pathname);
    }

    if (type === 'audio') {
      return /^res\d*\.hycdn\.cn$/i.test(url.hostname) &&
        /\.(mp3|wav|flac|m4a|ogg)$/i.test(url.pathname);
    }

    return false;
  } catch {
    return false;
  }
}

async function proxyMusicAsset(request, type) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: {
        allow: 'GET, HEAD',
        'access-control-allow-origin': '*',
      },
    });
  }

  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get('url') || '';

  if (!isAllowedMusicAssetUrl(rawUrl, type)) {
    return json({ ok: false, error: 'Invalid asset url' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const shouldUseManualCache = type !== 'audio' && !request.headers.get('range');
  const cached = shouldUseManualCache ? await cache.match(cacheKey) : null;
  if (cached) {
    return request.method === 'HEAD' ? new Response(null, cached) : cached;
  }

  const cacheTtl = type === 'image' ? 60 * 60 * 24 * 30 : 60 * 60 * 6;
  const upstreamHeaders = new Headers();
  const range = request.headers.get('range');
  if (range) {
    upstreamHeaders.set('range', range);
  }

  const upstream = await fetch(rawUrl, {
    headers: upstreamHeaders,
    cf: {
      cacheTtl,
      cacheEverything: true,
    },
  });

  if (!upstream.ok) {
    return new Response('Asset not found', {
      status: upstream.status,
      headers: {
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=300',
      },
    });
  }

  const response = new Response(upstream.body, upstream);
  response.headers.set('access-control-allow-origin', '*');
  response.headers.set('accept-ranges', response.headers.get('accept-ranges') || 'bytes');
  response.headers.set(
    'cache-control',
    type === 'image' ? 'public, max-age=2592000, immutable' : 'public, max-age=21600'
  );
  response.headers.delete('set-cookie');

  if (shouldUseManualCache) {
    await cache.put(cacheKey, response.clone());
  }

  return request.method === 'HEAD' ? new Response(null, response) : response;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\\n/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\{.*?\}/g, '')
    .trim();
}

function parseRarity(rarity) {
  if (typeof rarity === 'number') {
    return rarity;
  }

  const match = String(rarity).match(/TIER_(\d+)/);
  if (match) {
    return Number(match[1]) - 1;
  }

  return 0;
}

function resolveFactionId(char) {
  const power = char.mainPower;

  if (power && typeof power === 'object') {
    return power.teamId || power.groupId || power.nationId || '';
  }

  return char.teamId || char.groupId || char.nationId || 'rhodes';
}

function json(data, status = 200, cacheSeconds = 0, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
      ...extraHeaders,
    },
  });
}

function corsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
      'access-control-max-age': '86400',
    },
  });
}

function methodNotAllowed(allow) {
  return new Response('Method not allowed', {
    status: 405,
    headers: {
      allow,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, HEAD, POST, PATCH, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type, authorization',
    },
  });
}

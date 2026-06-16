const EXCEL_BASE =
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';

const IMAGE_BASE =
  'https://raw.githubusercontent.com/PuppiizSunniiz/Arknight-Images/main';

const MUSIC_API_ORIGIN = 'https://monstersiren-web-api.vercel.app';
const DEFAULT_PUBLIC_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const RECRUIT_OPERATORS_KEY = 'recruit:operators:v2';
const RECRUIT_OPERATOR_DETAIL_KEY_PREFIX = 'recruit:operator:v2:';
const MUSIC_CACHE_PREFIX = 'music:api:v1:';
const MUSIC_SONG_DETAIL_CURSOR_KEY = `${MUSIC_CACHE_PREFIX}prewarm:song-detail-cursor`;
const DEFAULT_SUPABASE_URL = 'https://rdneemerltoxlfosazcz.supabase.co';
const DEFAULT_SONG_DETAIL_PREWARM_LIMIT = 10;
const MAX_SONG_DETAIL_PREWARM_LIMIT = 10;
const MUSIC_SONG_DETAIL_MAX_AGE_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicApiBase = getPublicApiBase(request, env);

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'arknights-recruit-api',
        supabaseConfigured: hasSupabaseConfig(env),
        time: new Date().toISOString(),
      });
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
      const result = await syncMusicCache(env, {
        songDetailLimit: detailLimit,
      });
      return json({
        ok: true,
        ...result,
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
  },

  async scheduled(event, env, ctx) {
    const data = await buildRecruitOperators(env.RECRUIT_API_BASE || DEFAULT_PUBLIC_API_BASE);
    await env.ARKNIGHTS_DATA.put(RECRUIT_OPERATORS_KEY, JSON.stringify(data));
    if (hasSupabaseConfig(env)) {
      ctx.waitUntil(
        syncMusicCache(env, {
          songDetailLimit: 10,
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

async function handleMusicApiRequest(request, env, url) {
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

  const albumMatch = url.pathname.match(/^\/api\/album\/([^/]+)\/detail$/);
  if (albumMatch) {
    const albumId = decodeURIComponent(albumMatch[1]);
    const result = await getMusicJson(
      env,
      `${MUSIC_CACHE_PREFIX}album:${albumId}`,
      `/api/album/${encodeURIComponent(albumId)}/detail`
    );
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
  const albums = await fetchMusicJson('/api/albums');
  await writeSupabaseCache(env, `${MUSIC_CACHE_PREFIX}albums`, albums.data, albums.sourceUrl);
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}albums`,
    count: Array.isArray(albums.data?.data) ? albums.data.data.length : null,
  });

  const songs = await fetchMusicJson('/api/songs');
  await writeSupabaseCache(env, `${MUSIC_CACHE_PREFIX}songs`, songs.data, songs.sourceUrl);
  synced.push({
    key: `${MUSIC_CACHE_PREFIX}songs`,
    count: Array.isArray(songs.data?.data?.list) ? songs.data.data.list.length : null,
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
    const songId = item.song?.cid;
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
      stored += 1;
    } catch (error) {
      errors += 1;
      console.warn('Music song detail prewarm failed:', songId, error.message);
    }
  }

  const nextIndex = songs.length === 0
    ? 0
    : (startIndex + candidates.length) % songs.length;
  await writeSupabaseCache(
    env,
    MUSIC_SONG_DETAIL_CURSOR_KEY,
    {
      nextIndex,
      total: songs.length,
      lastBatchSize: candidates.length,
      lastStored: stored,
      lastErrors: errors,
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
    done: candidates.length >= songs.length || nextIndex === 0,
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
      song: items[index],
    });
  }

  return batch;
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
        avatarUrl: proxyImageUrl(`${IMAGE_BASE}/avatars/${id}.png`, publicApiBase),
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
      avatarUrl: proxyImageUrl(`${IMAGE_BASE}/avatars/${charId}.png`, publicApiBase),
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
      `${IMAGE_BASE}/characters/${encodedId}.png`,
      `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/charportraits/${encodedId}.png`,
      `https://raw.githubusercontent.com/Aceship/Arknight-Images/main/characters/${encodedId}.png`,
      `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charportraits/${encodedId}.png`,
      `https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main/portraits/${encodedId}.png`
    ];

    urls.push(...rawUrls.map((url) => proxyImageUrl(url, publicApiBase)));
  });

  return urls;
}

function getPublicApiBase(request, env) {
  return (env.RECRUIT_API_BASE || new URL(request.url).origin || DEFAULT_PUBLIC_API_BASE).replace(/\/$/, '');
}

function proxyImageUrl(rawUrl, publicApiBase) {
  const base = (publicApiBase || DEFAULT_PUBLIC_API_BASE).replace(/\/$/, '');
  return `${base}/api/recruit/image?url=${encodeURIComponent(rawUrl)}`;
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

  if (!isAllowedImageUrl(rawUrl)) {
    return json({ ok: false, error: 'Invalid image url' }, 400);
  }

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if (cached) {
    return request.method === 'HEAD' ? new Response(null, cached) : cached;
  }

  const upstream = await fetch(rawUrl, {
    cf: {
      cacheTtl: 60 * 60 * 24 * 30,
      cacheEverything: true,
    },
  });

  if (!upstream.ok) {
    return new Response('Image not found', {
      status: upstream.status,
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
      'cache-control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
      ...extraHeaders,
    },
  });
}

import { fetchWithCache } from './cache.js';
import { parseLRC } from '../utils/lyrics.js';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import {
  toTraditionalGameDataText,
  transformMusicApiPayload,
} from '../utils/s2tApiText.js';
import {
  getGameDataExcelBase,
  getCnGameDataExcelBase,
  getGameDataFolder,
  getApiBuiltLabels,
  getCurrentUiLocale,
  setGameDataFolderFromUiLocale,
  shouldApplyS2tGameData,
} from './gameDataSource.js';
import { resolveFactionId } from '../utils/faction.js';
import {
  factionIdToLogoKey,
  professionToClassSlug,
  RECRUIT_FACTION_LOGO_OPTIONS,
} from '../utils/recruitCard.js';
import {
  getLocalFactionLogoUrl,
  getLocalItemIconUrl,
  getLocalProfessionIconUrl,
  getLocalOperatorPortraitUrl,
  getLocalSkillIconUrl,
  loadOperatorAssetManifest,
} from './operatorAssetManifest.js';

const DEFAULT_MUSIC_API_ORIGIN = 'https://arknights-recruit-api.molly27molly.workers.dev';
export const API_ORIGIN = (
  import.meta.env.VITE_MUSIC_API_ORIGIN || DEFAULT_MUSIC_API_ORIGIN
).replace(/\/$/, '');
/** 專輯／歌曲等 JSON API（Express 掛在 /api） */
const API_BASE = `${API_ORIGIN}/api`;
const DEFAULT_RECRUIT_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const RECRUIT_API_BASE = (
  import.meta.env.VITE_RECRUIT_API_BASE || DEFAULT_RECRUIT_API_BASE
).replace(/\/$/, '');
const recruitmentCalculatorCache = new Map();
const recruitReleaseRequestCache = new Map();
const RECRUIT_CALCULATOR_BROWSER_CACHE_PREFIX = 'recruit-calculator:v3:';
const RECRUIT_RELEASE_BROWSER_CACHE_PREFIX = 'recruit-releases:v1:';
const ACTIVITY_BROWSER_CACHE_PREFIX = 'activities:v1:';
const RECRUIT_CALCULATOR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RECRUIT_RELEASE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const ACTIVITY_CACHE_TTL_MS = 15 * 60 * 1000;
const ALBUM_DETAIL_BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;
/** 圖片／歌詞 proxy 在網站根路徑（/api/proxy-* 會 404） */

function readRecruitBrowserCache(key) {
  try {
    if (typeof window === 'undefined') return null;
    const cached = JSON.parse(window.localStorage.getItem(key) || 'null');
    return cached && Number.isFinite(cached.savedAt) ? cached : null;
  } catch {
    return null;
  }
}

function writeRecruitBrowserCache(key, value) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    console.warn('Recruit browser cache write failed:', error);
  }
}

/** 歌曲詳情記憶體快取（切歌／重播會重複請求同一 cid） */
const SONG_DETAILS_CACHE_TTL_MS = 45 * 60 * 1000;
const songDetailsCache = new Map();

/** 歌詞快取鍵版本（路徑修正後需重取，避免舊的「proxy 404 → 空歌詞」快取） */
const LYRICS_CACHE_KEY_PREFIX = 'v2:';

/** 歌詞記憶體快取（同一首多次開播放器不重打 proxy） */
const LYRICS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const lyricsCache = new Map();

/** handbook_team_table：依 nationId 顯示陣營名（隨 excel 基底切換而失效） */
let handbookTeamTableCache = { base: '', data: null };

const GAME_DATA_CACHE_TTL_MS = 60 * 60 * 1000;
const gameDataTableCache = new Map();
const gameDataTableLoading = new Map();

async function getGameDataJson(url, fallback) {
  const cached = gameDataTableCache.get(url);
  if (cached && Date.now() - cached.cachedAt < GAME_DATA_CACHE_TTL_MS) {
    return cached.data;
  }

  if (!gameDataTableLoading.has(url)) {
    const loading = fetch(url, { cache: 'force-cache' })
      .then((response) => {
        if (!response.ok) throw new Error(`GameData request failed: ${response.status}`);
        return response.json();
      })
      .then((data) => {
        gameDataTableCache.set(url, { data, cachedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        if (fallback !== undefined) return fallback;
        throw error;
      })
      .finally(() => {
        gameDataTableLoading.delete(url);
      });
    gameDataTableLoading.set(url, loading);
  }

  return gameDataTableLoading.get(url);
}

async function getHandbookTeamTable() {
  const base = getGameDataExcelBase();
  if (handbookTeamTableCache.base === base && handbookTeamTableCache.data) {
    return handbookTeamTableCache.data;
  }
  const data = await getGameDataJson(`${base}/handbook_team_table.json`, {});
  handbookTeamTableCache = { base, data };
  return data;
}

function factionIdToDisplayName(factionId, teamTable) {
  if (!factionId) return '';
  const entry = teamTable?.[factionId];
  if (!entry) return String(factionId);
  const raw = entry.powerName || entry.powerCode || factionId;
  return toTraditionalGameDataText(String(raw));
}

/** 將當前遊戲資料語系下的陣營名稱合併進 vue-i18n（依 UI 語系切換） */
export async function syncFactionI18nMessages(i18n) {
  const i18nTarget = i18n.global || i18n;
  const uiLocale =
    typeof i18nTarget.locale === 'string' ? i18nTarget.locale : i18nTarget.locale.value;
  setGameDataFolderFromUiLocale(uiLocale);
  handbookTeamTableCache = { base: '', data: null };
  const table = await getHandbookTeamTable();
  const nation = {};
  for (const [id, entry] of Object.entries(table)) {
    if (!id || id === 'none') continue;
    const raw = entry?.powerName || entry?.powerCode;
    if (raw) nation[id] = toTraditionalGameDataText(String(raw));
  }
  i18nTarget.mergeLocaleMessage(uiLocale, { nation });
  return table;
}

/**
 * 獲取所有專輯列表
 * @returns {Promise<Array>} 專輯列表
 */
export async function fetchAlbums() {
  const response = await fetch(`${API_BASE}/albums`);
  if (!response.ok) throw new Error('Network response was not ok');
  const { data } = await response.json();
  return transformMusicApiPayload(data);
}

/**
 * 獲取專輯詳情
 * @param {string} albumId - 專輯ID
 * @returns {Promise<Object>} 專輯詳情
 */
export async function fetchAlbumDetails(albumId) {
  const { data } = await fetchWithCache(`${API_BASE}/album/${albumId}/detail`, {
    maxAgeMs: ALBUM_DETAIL_BROWSER_CACHE_TTL_MS,
  });
  return transformMusicApiPayload(data);
}

/**
 * 獲取所有歌曲列表
 * @returns {Promise<Array>} 歌曲列表
 */
export async function fetchSongs() {
  const response = await fetch(`${API_BASE}/songs`);
  if (!response.ok) throw new Error('無法獲取歌曲列表');
  const { data } = await response.json();
  return transformMusicApiPayload(data.list);
}

/**
 * 獲取歌曲詳情
 * @param {string} songId - 歌曲ID
 * @returns {Promise<Object>} 歌曲詳情
 */
export async function fetchSongDetails(songId) {
  const hit = songDetailsCache.get(songId);
  if (hit && Date.now() - hit.t < SONG_DETAILS_CACHE_TTL_MS) {
    return transformMusicApiPayload(JSON.parse(JSON.stringify(hit.data)));
  }
  const response = await fetch(`${API_BASE}/song/${songId}`);
  if (!response.ok) throw new Error('Network response was not ok');
  const { data } = await response.json();
  songDetailsCache.set(songId, { data, t: Date.now() });
  return transformMusicApiPayload(JSON.parse(JSON.stringify(data)));
}

export async function fetchFullSongDetails(songId) {
  const response = await fetch(`${API_BASE}/song/${encodeURIComponent(songId)}/full`);
  if (!response.ok) throw new Error('Network response was not ok');

  const { data } = await response.json();
  const normalized = transformMusicApiPayload(data);
  const lyricsText = data?.lyricsText || '';

  return {
    song: normalized?.song || {},
    album: normalized?.album || null,
    lyrics: lyricsText ? parseLRC(lyricsText) : [],
    assets: normalized?.assets || {},
  };
}

export async function searchMusic(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) {
    return { albums: [], songs: [], count: 0 };
  }

  const response = await fetch(`${API_BASE}/search?q=${encodeURIComponent(normalizedQuery)}`);
  if (!response.ok) throw new Error('Network response was not ok');
  const data = await response.json();

  return {
    ...data,
    albums: transformMusicApiPayload(data.albums || []),
    songs: transformMusicApiPayload(data.songs || []),
  };
}

export async function translateLyricsOnServer(lines, locale, songId = '') {
  const response = await fetch(`${API_BASE}/lyrics/translate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      locale,
      songId,
      lines: lines.map((line) => ({ text: line.text || '' })),
    }),
  });

  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  return response.json();
}

export async function translateTextOnServer(text, locale) {
  const response = await fetch(`${API_BASE}/lyrics/translate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      locale,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.translation || '';
}

export function createSongShareUrl(songId, appUrl = window.location.href) {
  if (!songId) return '';

  return `${API_ORIGIN}/share/song/${encodeURIComponent(songId)}?app=${encodeURIComponent(appUrl)}`;
}

/**
 * 獲取歌詞
 * @param {string} lyricUrl - 歌詞URL
 * @returns {Promise<Array>} 解析後的歌詞數組
 */
function mapLyricLinesForUi(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line) => ({
    ...line,
    text: String(line.text || ''),
  }));
}

export async function fetchLyrics(lyricUrl) {
  if (!lyricUrl) {
    return [];
  }

  const cacheKey = LYRICS_CACHE_KEY_PREFIX + lyricUrl;
  const cacheHit = lyricsCache.get(cacheKey);
  if (cacheHit && Date.now() - cacheHit.t < LYRICS_CACHE_TTL_MS) {
    return mapLyricLinesForUi(cacheHit.lines);
  }

  try {
    const proxyUrl = `${API_ORIGIN}/proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      if (response.status === 404) {
        lyricsCache.set(cacheKey, { lines: [], t: Date.now() });
        return [];
      }
      throw new Error(`HTTP錯誤! 狀態碼: ${response.status}`);
    }
    const lrcText = await response.text();
    const parsedLyrics = parseLRC(lrcText);
    lyricsCache.set(cacheKey, { lines: parsedLyrics, t: Date.now() });
    return mapLyricLinesForUi(parsedLyrics);
  } catch (error) {
    console.warn('歌詞加載失敗:', error.message);
    return [];
  }
}

/**
 * 獲取代理圖片URL
 * @param {string} imageUrl - 原始圖片URL
 * @returns {string} 代理後的圖片URL
 */
export function getProxyImageUrl(imageUrl) {
  if (!imageUrl) return '';

  const normalizedUrl = String(imageUrl);
  if (
    normalizedUrl.startsWith('/') ||
    normalizedUrl.startsWith('./') ||
    normalizedUrl.startsWith('../') ||
    normalizedUrl.startsWith('data:') ||
    normalizedUrl.startsWith('blob:')
  ) {
    return normalizedUrl;
  }

  if (
    normalizedUrl.startsWith(`${API_ORIGIN}/proxy-image`) ||
    normalizedUrl.startsWith('/proxy-image') ||
    normalizedUrl.startsWith(`${API_ORIGIN}/api/recruit/image`) ||
    normalizedUrl.startsWith('/api/recruit/image')
  ) {
    return normalizedUrl;
  }

  return `${API_ORIGIN}/proxy-image?url=${encodeURIComponent(normalizedUrl)}`;
}

export function getProxyAudioUrl(audioUrl) {
  if (!audioUrl) return '';
  return `${API_ORIGIN}/proxy-audio?url=${encodeURIComponent(audioUrl)}`;
}

// ========== 明日方舟角色相關 API ==========

/** 角色頭像／立繪／道具圖等主要圖床（較完整，優先使用） */
const ARKNIGHT_IMAGES_BASE =
  'https://raw.githubusercontent.com/PuppiizSunniiz/Arknight-Images/main';
/** 與上者路徑相同的備援鏡像 */
const ARKNIGHT_IMAGES_MIRROR_ACESHIP =
  'https://raw.githubusercontent.com/Aceship/Arknight-Images/main';

/** 招募卡：陣營 logo（Arknight-Images/factions） */
export function getRecruitFactionLogoUrl(logoKey) {
  return getLocalFactionLogoUrl(logoKey);
}

/** 招募卡：職業 icon（Arknight-Images/classes） */
export function getRecruitProfessionIconUrl(profession) {
  return getLocalProfessionIconUrl(profession);
}

export { RECRUIT_FACTION_LOGO_OPTIONS, factionIdToLogoKey, professionToClassSlug };

/** skin_table 快取有效時間（毫秒），過期後下次取得詳情會重新下載 */
const SKIN_TABLE_CACHE_TTL_MS = 60 * 60 * 1000;
const CHARWORD_TABLE_CACHE_TTL_MS = 60 * 60 * 1000;

/** skin_table 體積大，用記憶體＋進行中共用 Promise 快取（避免 sessionStorage 配額與重複下載） */
let skinTableMemoryCache;
let skinTableCachedAt = 0;
let skinTableLoadingPromise;
let charwordTableMemoryCache;
let charwordTableCachedAt = 0;
let charwordTableLoadingPromise;

/** 切換遊戲資料語系時清空，避免混用舊快取 */
export function invalidateArknightsCaches() {
  skinTableMemoryCache = undefined;
  skinTableCachedAt = 0;
  skinTableLoadingPromise = undefined;
  charwordTableMemoryCache = undefined;
  charwordTableCachedAt = 0;
  charwordTableLoadingPromise = undefined;
  handbookTeamTableCache = { base: '', data: null };
  gameDataTableCache.clear();
  gameDataTableLoading.clear();
  songDetailsCache.clear();
  lyricsCache.clear();
}

function isSkinTableCacheFresh() {
  return (
    skinTableMemoryCache != null &&
    typeof skinTableMemoryCache === 'object' &&
    skinTableMemoryCache.charSkins &&
    Date.now() - skinTableCachedAt < SKIN_TABLE_CACHE_TTL_MS
  );
}

async function getSkinTableShared() {
  if (isSkinTableCacheFresh()) {
    return skinTableMemoryCache;
  }
  if (!skinTableLoadingPromise) {
    skinTableLoadingPromise = fetch(`${getGameDataExcelBase()}/skin_table.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.charSkins) {
          skinTableMemoryCache = data;
          skinTableCachedAt = Date.now();
        } else {
          skinTableMemoryCache = null;
          skinTableCachedAt = Date.now();
        }
        return skinTableMemoryCache;
      })
      .catch(() => {
        skinTableMemoryCache = null;
        skinTableCachedAt = Date.now();
        return null;
      })
      .finally(() => {
        skinTableLoadingPromise = null;
      });
  }
  return skinTableLoadingPromise;
}

function isCharwordTableCacheFresh() {
  return (
    charwordTableMemoryCache != null &&
    typeof charwordTableMemoryCache === 'object' &&
    charwordTableMemoryCache.charWords &&
    Date.now() - charwordTableCachedAt < CHARWORD_TABLE_CACHE_TTL_MS
  );
}

async function getCharwordTableShared() {
  if (isCharwordTableCacheFresh()) {
    return charwordTableMemoryCache;
  }
  if (!charwordTableLoadingPromise) {
    charwordTableLoadingPromise = fetch(`${getGameDataExcelBase()}/charword_table.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.charWords) {
          charwordTableMemoryCache = data;
          charwordTableCachedAt = Date.now();
        } else {
          charwordTableMemoryCache = null;
          charwordTableCachedAt = Date.now();
        }
        return charwordTableMemoryCache;
      })
      .catch(() => {
        charwordTableMemoryCache = null;
        charwordTableCachedAt = Date.now();
        return null;
      })
      .finally(() => {
        charwordTableLoadingPromise = null;
      });
  }
  return charwordTableLoadingPromise;
}

function resolveRecruitVoiceText(charId, charwordTable) {
  const words = Object.values(charwordTable?.charWords || {}).filter(
    (word) => word?.charId === charId && word.voiceText
  );
  const recruitWord =
    words.find((word) => /干员报到|幹員報到|報到|报到/.test(String(word.voiceTitle || ''))) ||
    words.find((word) => word.voiceId === 'CN_011');

  if (!recruitWord?.voiceText) {
    return '';
  }

  return toTraditionalGameDataText(
    normalizeEscapedNewlines(String(recruitWord.voiceText))
  );
}

// 多個圖片來源（按優先順序）
const AVATAR_SOURCES = [
  (id) => `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/${id}.png`,
  (id) => `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charavatars/${id}.png`,
  (id) => `${ARKNIGHT_IMAGES_MIRROR_ACESHIP}/avatars/${id}.png`,
  (id) => `${ARKNIGHT_IMAGES_BASE}/avatars/${id}.png`,
];

/** 幹員顯示名：簡中表多有 name；YoStar 表常見 name 為空但 appellation 有值，列表／詳情需一致 */
function resolveCharacterTableDisplayName(char) {
  const n = char?.name != null ? String(char.name).trim() : '';
  if (n) return n;
  const a = char?.appellation != null ? String(char.appellation).trim() : '';
  return a;
}

async function fetchRecruitApiJson(path) {
  const response = await fetch(`${RECRUIT_API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Recruit API failed: ${response.status}`);
  }
  const data = await response.json();
  if (data?.ok === false) {
    throw new Error(data.error || 'Recruit API returned an error');
  }
  return data;
}

function normalizeWorkerOperator(operator) {
  const factionId = normalizeWorkerFactionId(operator.factionId);
  const factionName = normalizeWorkerFactionName(operator.factionName || operator.nationName, factionId);
  return {
    id: operator.id,
    name: toTraditionalGameDataText(operator.name || ''),
    appellation: operator.appellation || '',
    profession: operator.profession || 'PIONEER',
    rarity: operator.rarity ?? 0,
    position: operator.position || '',
    tagList: (operator.tagList || []).map((tag) => toTraditionalGameDataText(tag)),
    nation: operator.nation || factionId,
    factionId,
    factionOrder: operator.factionOrder ?? 9999,
    releaseOrder: operator.releaseOrder ?? 0,
    nationName: toTraditionalGameDataText(factionName),
    avatarUrl: operator.avatarUrl || AVATAR_SOURCES[0](operator.id),
  };
}

function normalizeWorkerFactionId(rawFactionId) {
  if (!rawFactionId) return '';
  if (typeof rawFactionId === 'object') {
    return rawFactionId.teamId || rawFactionId.groupId || rawFactionId.nationId || '';
  }
  return String(rawFactionId);
}

function normalizeWorkerFactionName(rawFactionName, fallback) {
  if (!rawFactionName) return fallback || '';
  if (typeof rawFactionName === 'object') {
    return rawFactionName.powerName || rawFactionName.teamId || rawFactionName.groupId || rawFactionName.nationId || fallback || '';
  }
  return String(rawFactionName);
}

function shouldUseRecruitWorkerApi() {
  const locale = getCurrentUiLocale();
  return locale === 'zh-TW' || locale === 'zh-CN';
}

export async function fetchRecruitCharacters() {
  let operators;
  try {
    if (shouldUseRecruitWorkerApi()) {
      const [data, sourceResponse] = await Promise.all([
        fetchRecruitApiJson('/api/recruit/operators'),
        fetch(`${getGameDataExcelBase()}/character_table.json`),
      ]);
      if (!Array.isArray(data.operators)) {
        throw new Error('Recruit API operators payload is invalid');
      }
      const sourceTable = sourceResponse.ok ? await sourceResponse.json() : {};
      const releaseOrder = new Map(Object.keys(sourceTable).map((id, index) => [id, index]));
      operators = data.operators.map((operator) => normalizeWorkerOperator({
        ...operator,
        releaseOrder: releaseOrder.get(operator.id) ?? 0,
      }));

      // Worker 的角色清單是可快取快照，更新可能落後於最新 GameData。
      // 直接合併本次已下載的 character_table，讓新角色不必等 Worker 手動重建快取才出現在角色頁與招募卡製作器。
      const existingSourceIds = new Set(operators.map((operator) => operator.id));
      for (const [id, char] of Object.entries(sourceTable)) {
        if (
          existingSourceIds.has(id)
          || !id.startsWith('char_')
          || !resolveCharacterTableDisplayName(char)
          || char.rarity == null
          || char.isNotObtainable === true
          || char.profession === 'TOKEN'
          || char.profession === 'TRAP'
        ) {
          continue;
        }

        operators.push(normalizeWorkerOperator({
          id,
          ...char,
          factionId: resolveFactionId(char),
          releaseOrder: releaseOrder.get(id) ?? 0,
        }));
        existingSourceIds.add(id);
      }
    } else {
      operators = await fetchCharacters();
    }
  } catch (error) {
    console.warn('Recruit API operators fallback to local source:', error);
    operators = await fetchCharacters();
  }

  try {
    const locale = getCurrentUiLocale();
    const server = locale === 'zh-TW' ? 'tw' : locale === 'zh-CN' ? 'cn' : 'global';
    const releaseResults = await Promise.allSettled([
      fetchRecruitApiJson(`/api/recruit/releases?server=${server}`),
      server === 'cn' ? Promise.resolve(null) : fetchRecruitApiJson('/api/recruit/releases?server=cn'),
      fetchRecruitApiJson('/api/recruit/operators'),
      fetchRecruitApiJson('/api/recruit/operator-catalog'),
    ]);
    const releaseData = releaseResults[0].status === 'fulfilled'
      ? releaseResults[0].value
      : { releases: [] };
    const cnReleaseData = releaseResults[1].status === 'fulfilled'
      ? releaseResults[1].value
      : null;
    const cnData = releaseResults[2].status === 'fulfilled'
      ? releaseResults[2].value
      : { operators: [] };
    const catalogData = releaseResults[3].status === 'fulfilled'
      ? releaseResults[3].value
      : { operators: [] };
    releaseResults.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.warn('Recruit release request failed:', index, result.reason);
      }
    });
    const releaseRows = releaseData.releases || [];
    const cnReleaseRows = cnReleaseData?.releases || releaseRows;
    const releaseMap = buildOperatorReleaseMap(releaseRows);
    const cnReleaseMap = buildOperatorReleaseMap(cnReleaseRows);
    const catalogMap = new Map((catalogData.operators || []).map((row) => [
      normalizeReleaseLookupName(row.operator_name), row,
    ]));
    const now = Date.now();
    const activeServerRelease = releaseRows
      .filter((row) => Number.isFinite(Date.parse(row.release_at)) && Date.parse(row.release_at) <= now)
      .sort((a, b) => Date.parse(b.release_at) - Date.parse(a.release_at))[0] || null;
    const progressEventName = activeServerRelease?.event_name || '';
    const progressCutoffCn = cnReleaseRows
      .filter((row) => row.event_name === progressEventName)
      .reduce((latest, row) => Math.max(latest, Date.parse(row.release_at) || 0), 0);
    const localizedIds = new Set(operators.map((operator) => operator.id));
    const existingIds = new Set(operators.map((operator) => operator.id));
    for (const rawOperator of cnData.operators || []) {
      if (existingIds.has(rawOperator.id)) continue;
      const fallback = normalizeWorkerOperator(rawOperator);
      const release = findOperatorRelease(cnReleaseMap, fallback);
      operators.push({
        ...fallback,
        name: release
          ? (getLocalizedWikiOperatorName(release, locale) || release.operator_name || fallback.appellation)
          : (fallback.appellation || fallback.name),
      });
      existingIds.add(fallback.id);
    }

    return operators.map((operator) => {
      const release = findOperatorRelease(releaseMap, operator);
      const cnRelease = findOperatorRelease(cnReleaseMap, operator);
      const timestamp = release?.release_at ? Date.parse(release.release_at) : NaN;
      const cnTimestamp = cnRelease?.release_at ? Date.parse(cnRelease.release_at) : NaN;
      const catalogEntry = catalogMap.get(normalizeReleaseLookupName(operator.appellation))
        || catalogMap.get(normalizeReleaseLookupName(operator.name));
      const releasedByActivityProgress = server !== 'cn'
        && progressCutoffCn > 0
        && Number.isFinite(cnTimestamp)
        && cnTimestamp <= progressCutoffCn;
      const releasedByLocalizedGameData = server === 'global' && localizedIds.has(operator.id);
      const releasedByCatalog = server !== 'cn'
        && !cnRelease
        && catalogEntry
        && catalogEntry.is_cn !== '1';
      return {
        ...operator,
        releaseAt: release?.release_at || null,
        cnReleaseAt: cnRelease?.release_at || null,
        releaseServer: server,
        progressEventName,
        isReleased: server === 'cn'
          || releasedByActivityProgress
          || (Number.isFinite(timestamp) && timestamp <= now)
          || releasedByLocalizedGameData
          || releasedByCatalog,
      };
    });
  } catch (error) {
    console.warn('Operator release dates unavailable:', error);
    return operators;
  }
}

export async function fetchRecruitReleaseSnapshot(server) {
  const normalized = ['cn', 'tw', 'global'].includes(server) ? server : 'global';
  const cacheKey = `${RECRUIT_RELEASE_BROWSER_CACHE_PREFIX}${normalized}`;
  const cached = readRecruitBrowserCache(cacheKey);
  const cacheAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;

  if (Array.isArray(cached?.releases) && cacheAge < RECRUIT_RELEASE_CACHE_TTL_MS) {
    return { releases: cached.releases, source: 'browser-cache', stale: false };
  }

  if (!recruitReleaseRequestCache.has(normalized)) {
    const request = fetchRecruitApiJson(`/api/recruit/releases?server=${normalized}`)
      .then((data) => {
        const releases = Array.isArray(data.releases) ? data.releases : [];
        if (releases.length === 0) {
          throw new Error('Recruit release payload is empty');
        }
        writeRecruitBrowserCache(cacheKey, { savedAt: Date.now(), releases });
        return { releases, source: 'network', stale: false };
      })
      .catch((error) => {
        console.warn('Recruit release API unavailable:', error);
        if (Array.isArray(cached?.releases) && cached.releases.length > 0) {
          return { releases: cached.releases, source: 'browser-cache', stale: true };
        }
        return { releases: [], source: 'unavailable', stale: true };
      })
      .finally(() => recruitReleaseRequestCache.delete(normalized));
    recruitReleaseRequestCache.set(normalized, request);
  }

  return recruitReleaseRequestCache.get(normalized);
}

export async function fetchRecruitReleaseDates(server) {
  const snapshot = await fetchRecruitReleaseSnapshot(server);
  return snapshot.releases;
}

export async function fetchActivities(server) {
  const normalized = ['cn', 'tw', 'global'].includes(server) ? server : 'global';
  const cacheKey = `${ACTIVITY_BROWSER_CACHE_PREFIX}${normalized}`;
  const cached = readRecruitBrowserCache(cacheKey);
  const cacheAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;

  if (Array.isArray(cached?.activities) && cacheAge < ACTIVITY_CACHE_TTL_MS) {
    return { activities: cached.activities, source: 'browser-cache', stale: false };
  }

  try {
    const data = await fetchRecruitApiJson(`/api/activities?server=${encodeURIComponent(normalized)}`);
    const activities = Array.isArray(data.activities) ? data.activities : [];
    writeRecruitBrowserCache(cacheKey, { savedAt: Date.now(), activities });
    return { activities, source: 'network', stale: false };
  } catch (error) {
    console.warn('Activity API unavailable:', error);
    return {
      activities: Array.isArray(cached?.activities) ? cached.activities : [],
      source: cached?.activities ? 'browser-cache' : 'unavailable',
      stale: Boolean(cached?.activities),
    };
  }
}

export async function fetchRecruitmentOperators(server, locale) {
  const normalizedLocale = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'].includes(locale)
    ? locale
    : 'en';
  const pool = server === 'global' ? 'global' : 'cn';
  const requestKey = `${pool}:${normalizedLocale}`;

  const cacheKey = `${RECRUIT_CALCULATOR_BROWSER_CACHE_PREFIX}${requestKey}`;
  const cached = readRecruitBrowserCache(cacheKey);
  const cacheAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;

  if (
    !recruitmentCalculatorCache.has(normalizedLocale)
    && Array.isArray(cached?.operators)
    && cached.operators.length > 0
    && cacheAge < RECRUIT_CALCULATOR_CACHE_TTL_MS
  ) {
    recruitmentCalculatorCache.set(normalizedLocale, Promise.resolve(cached.operators));
  }

  if (!recruitmentCalculatorCache.has(requestKey)) {
    const request = fetchRecruitApiJson(
      `/api/recruit/calculator?pool=${encodeURIComponent(pool)}&locale=${encodeURIComponent(normalizedLocale)}`
    ).then((data) => {
      if (!Array.isArray(data.operators) || data.operators.length === 0) {
        throw new Error('Recruit calculator payload is invalid');
      }
      const maximumRarity = Math.max(...data.operators.map((operator) => Number(operator.rarity) || 0));
      const operators = maximumRarity <= 5
        ? data.operators.map((operator) => ({
            ...operator,
            rarity: (Number(operator.rarity) || 0) + 1,
          }))
        : data.operators;
      writeRecruitBrowserCache(cacheKey, {
        savedAt: Date.now(),
        operators,
      });
      return operators;
    }).catch((error) => {
      if (Array.isArray(cached?.operators) && cached.operators.length > 0) {
        console.warn('Recruit calculator API unavailable; using stale browser cache:', error);
        return cached.operators;
      }
      recruitmentCalculatorCache.delete(requestKey);
      throw error;
    });
    recruitmentCalculatorCache.set(requestKey, request);
  }

  return recruitmentCalculatorCache.get(requestKey);
}

function normalizeReleaseLookupName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function buildOperatorReleaseMap(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row.character_id) map.set(`id:${row.character_id}`, row);
    map.set(`name:${normalizeReleaseLookupName(row.operator_name)}`, row);
  }
  return map;
}

function findOperatorRelease(map, operator) {
  return map.get(`id:${operator.id}`)
    || map.get(`name:${normalizeReleaseLookupName(operator.appellation)}`)
    || map.get(`name:${normalizeReleaseLookupName(operator.name)}`)
    || null;
}

function getLocalizedWikiOperatorName(release, locale) {
  const safeName = (value) => {
    const name = String(value || '').trim();
    if (
      !name
      || name.length > 80
      || /^[|*{}\[]/.test(name)
      || /https?:\/\//i.test(name)
      || /^\w+\s*=/.test(name)
    ) return '';
    return name;
  };
  const operatorName = safeName(release.operator_name);
  if (locale === 'zh-TW') return safeName(release.tw_name) || safeName(release.cn_name) || operatorName;
  if (locale === 'zh-CN') return safeName(release.cn_name) || operatorName;
  if (locale === 'ja') return safeName(release.jp_name) || operatorName;
  if (locale === 'ko') return safeName(release.kr_name) || operatorName;
  return operatorName;
}

/**
 * 獲取所有角色數據
 * @returns {Promise<Array>} 角色列表
 */
export async function fetchCharacters() {
  try {
    const [response, teamTable] = await Promise.all([
      fetch(`${getGameDataExcelBase()}/character_table.json`),
      getHandbookTeamTable(),
    ]);
    if (!response.ok) throw new Error('無法獲取角色數據');
    const data = await response.json();
    
    // 解析稀有度函數
    const parseRarity = (rarity) => {
      if (typeof rarity === 'number') {
        return rarity; // 已經是數字 0-5
      }
      if (typeof rarity === 'string') {
        // 處理 TIER_1, TIER_2 等格式
        const match = rarity.match(/TIER_(\d+)/);
        if (match) {
          return parseInt(match[1]) - 1; // TIER_1 -> 0, TIER_2 -> 1, ...
        }
        // 嘗試直接轉換為數字
        const num = parseInt(rarity);
        if (!isNaN(num)) {
          return num;
        }
      }
      return 0; // 默認值
    };
    
    // 轉換為數組並過濾出可用的幹員（排除敵人、召喚物等）
    const characters = Object.entries(data)
      .filter(([id, char]) => {
        // 只保留真正的幹員（以 char_ 開頭，且有可顯示名稱與稀有度）
        if (
          !id.startsWith('char_') ||
          !resolveCharacterTableDisplayName(char) ||
          char.rarity == null ||
          char.profession === 'TOKEN' ||
          char.profession === 'TRAP'
        ) {
          return false;
        }
        // character_table：isNotObtainable === true 表示無法取得至幹員列表（劇情/NPC/預載等）
        if (char.isNotObtainable === true) {
          return false;
        }
        return true;
      })
      .map(([id, char], releaseOrder) => {
        const rarity = parseRarity(char.rarity);
        const factionId = resolveFactionId(char);
        const factionOrder = factionId ? (teamTable[factionId]?.orderNum ?? 9999) : 9999;
        return {
          id,
          name: toTraditionalGameDataText(resolveCharacterTableDisplayName(char)),
          appellation: char.appellation, // 代號/英文名
          profession: char.profession,   // 職業
          rarity: rarity,                // 稀有度 (0-5 對應 1-6星)
          position: char.position,       // 位置 (MELEE/RANGED)
          tagList: (char.tagList || []).map((tag) => toTraditionalGameDataText(tag)),   // 標籤
          nation: char.nationId,
          factionId,
          factionOrder,
          releaseOrder,
          nationName: factionIdToDisplayName(factionId, teamTable),
          // 使用第一個圖片來源
          avatarUrl: AVATAR_SOURCES[0](id)
        };
      })
      .sort((a, b) => b.rarity - a.rarity); // 按稀有度排序
    
    return characters;
  } catch (error) {
    console.error('獲取角色資料失敗:', error);
    throw error;
  }
}

/**
 * 獲取角色頭像URL列表（所有可能的來源）
 * @param {string} charId - 角色ID
 * @returns {string[]} 頭像URL列表
 */
export function getCharacterAvatarUrls(charId) {
  return AVATAR_SOURCES.map(source => source(charId));
}

/**
 * 獲取角色頭像URL（主要來源）
 * @param {string} charId - 角色ID
 * @returns {string} 頭像URL
 */
export function getCharacterAvatarUrl(charId) {
  return AVATAR_SOURCES[0](charId);
}

/**
 * 獲取角色頭像備用URL（指定索引）
 * @param {string} charId - 角色ID
 * @param {number} index - 來源索引
 * @returns {string|null} 備用頭像URL
 */
export function getCharacterAvatarFallbackUrl(charId, index = 1) {
  if (index < AVATAR_SOURCES.length) {
    return AVATAR_SOURCES[index](charId);
  }
  return null;
}

// 清理描述中的特殊標籤並替換變量（保留換行，供前端 pre-line 顯示）
function cleanDescription(text, blackboard = []) {
  if (!text) return '';

  let result = normalizeEscapedNewlines(text);

  // 建立變量映射
  const varMap = {};
  if (blackboard && blackboard.length > 0) {
    blackboard.forEach(item => {
      if (item.key) {
        // 處理百分比
        let value = item.value;
        if (Math.abs(value) < 10 && value !== Math.floor(value)) {
          value = (value * 100).toFixed(0) + '%';
        } else if (value > 0 && item.key.toLowerCase().includes('prob')) {
          value = (value * 100).toFixed(0) + '%';
        }
        varMap[item.key.toLowerCase()] = value;
      }
    });
  }

  result = result
    .replace(/<@[^>]+>/g, '') // 移除 <@xxx> 開始標籤
    .replace(/<\/>/g, '') // 移除 </> 結束標籤
    .replace(/<\$[^>]+>/g, '') // 移除 <$xxx> 標籤
    .replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, varName) => {
      const key = varName.toLowerCase();
      if (varMap[key] !== undefined) {
        return String(varMap[key]);
      }
      return '';
    });

  // 逐行收斂空白，保留換行
  const trimmed = result
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trimEnd())
    .join('\n')
    .trim();
  return toTraditionalGameDataText(trimmed);
}

function normalizeHandbookStoryText(handbook) {
  if (!handbook || !Array.isArray(handbook.storyTextAudio)) {
    return handbook;
  }
  return {
    ...handbook,
    storyTextAudio: handbook.storyTextAudio.map((story) => ({
      ...story,
      storyTitle: story.storyTitle
        ? toTraditionalGameDataText(normalizeEscapedNewlines(String(story.storyTitle)))
        : story.storyTitle,
      stories: Array.isArray(story.stories)
        ? story.stories.map((s) => ({
            ...s,
            storyText: toTraditionalGameDataText(
              normalizeEscapedNewlines(s?.storyText || '')
            ),
          }))
        : story.stories,
    })),
  };
}

// 格式化潛能提升效果
function formatPotentialBuff(buff) {
  if (!buff || !buff.attributes) return null;
  
  const modifiers = buff.attributes.attributeModifiers;
  if (!modifiers || modifiers.length === 0) return null;
  
  const typeNames = getApiBuiltLabels().potential;
  
  return modifiers.map(mod => {
    const typeName = typeNames[mod.attributeType] || mod.attributeType;
    const value = mod.value > 0 ? `+${mod.value}` : mod.value;
    return `${typeName} ${value}`;
  }).join(', ');
}

function parseCharacterRarity(rarity) {
  if (typeof rarity === 'number') return rarity;
  if (typeof rarity === 'string') {
    const match = rarity.match(/TIER_(\d+)/);
    if (match) return parseInt(match[1]) - 1;
    const num = parseInt(rarity);
    if (!isNaN(num)) return num;
  }
  return 0;
}

function getPortraitUrls(portraitId, alternativeIds = []) {
  if (!portraitId) return [];

  const allIds = [portraitId, ...alternativeIds].filter(Boolean);
  const urls = [];

  allIds.forEach(id => {
    const enc = encodeURIComponent(id);
    urls.push(
      `${ARKNIGHT_IMAGES_BASE}/characters/${enc}.png`,
      `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/charportraits/${enc}.png`,
      `${ARKNIGHT_IMAGES_MIRROR_ACESHIP}/characters/${enc}.png`,
      `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charportraits/${enc}.png`,
      `https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main/portraits/${enc}.png`
    );
  });

  return urls;
}

function getLocalFirstPortraitUrls(operatorId, portraitId, alternativeIds = []) {
  const ids = [...new Set([portraitId, ...alternativeIds].filter(Boolean))];
  return [...new Set([
    ...ids.map((id) => getLocalOperatorPortraitUrl(operatorId, id)).filter(Boolean),
    ...getPortraitUrls(portraitId, alternativeIds),
  ])];
}

function resolveCharacterPortraits(charId, charData, skinTable) {
  const portraits = [];
  const displaySkins = charData.displaySkins || [];
  const eliteLabels = getApiBuiltLabels();

  if (!charData.phases || charData.phases.length <= 1) {
    const initialSkin = Object.values(skinTable?.charSkins || {}).find((skin) => (
      skin?.charId === charId
      && skin.portraitId
      && String(skin.displaySkin?.skinGroupId || '').startsWith('ILLUST_')
    ));
    const portraitId = initialSkin?.portraitId || charData.phases?.[0]?.displayId || `${charId}_1`;
    portraits.push({
      name: eliteLabels.portraitFallback,
      portraitId,
      urls: getLocalFirstPortraitUrls(charId, portraitId, [`${charId}_1`]),
      skinId: null
    });
  }

  if (charData.phases && charData.phases.length > 1) {
    const phase1 = charData.phases[1];
    const elite1Skin = displaySkins.find(skin =>
      skin.portraitId && (skin.portraitId.includes('_1') || skin.portraitId.includes('#1'))
    ) || displaySkins[0];
    const displayId1 = elite1Skin?.portraitId || phase1.displayId || `${charId}_1`;
    const alternativeIds1 = [
      `${charId}_1+`,
      `${charId}_1`,
      `${charId}#1`,
      phase1.displayId
    ].filter(id => id && id !== displayId1);

    portraits.push({
      name: eliteLabels.elite1,
      portraitId: displayId1,
      urls: getLocalFirstPortraitUrls(charId, displayId1, alternativeIds1),
      skinId: null
    });
  }

  if (charData.phases && charData.phases.length > 2) {
    const phase2 = charData.phases[2];
    const elite2Skin = displaySkins.find(skin =>
      skin.portraitId && (skin.portraitId.includes('_2') || skin.portraitId.includes('#2'))
    ) || displaySkins[1];
    const displayId2 = elite2Skin?.portraitId || phase2.displayId || `${charId}_2`;

    portraits.push({
      name: eliteLabels.elite2,
      portraitId: displayId2,
      urls: getLocalFirstPortraitUrls(charId, displayId2),
      skinId: null
    });
  }

  const elitePortraitIds = new Set(portraits.map(p => p.portraitId).filter(Boolean));
  const charSkinsMap = skinTable?.charSkins;
  if (charSkinsMap && typeof charSkinsMap === 'object') {
    const costumeRows = [];

    for (const skin of Object.values(charSkinsMap)) {
      if (!skin || skin.charId !== charId) continue;
      const gid = skin.displaySkin?.skinGroupId;
      if (typeof gid === 'string' && gid.startsWith('ILLUST_')) continue;

      const portraitId = skin.portraitId;
      if (!portraitId || elitePortraitIds.has(portraitId)) continue;

      const ds = skin.displaySkin || {};
      const rawLabel = [ds.skinName, ds.skinGroupName].find(Boolean) || skin.skinId || portraitId;
      let labelStr = String(rawLabel);
      if (shouldApplyS2tGameData()) {
        labelStr = toTraditionalGameDataText(labelStr);
      }
      const lb = getApiBuiltLabels();
      const tabName =
        getGameDataFolder() === 'zh_CN'
          ? labelStr.startsWith('時裝')
            ? labelStr
            : `時裝 - ${labelStr}`
          : `${lb.costumePrefix}${labelStr}`;

      costumeRows.push({
        skinId: skin.skinId,
        portraitId,
        tabName,
        sortId: typeof ds.sortId === 'number' ? ds.sortId : 0
      });
    }

    costumeRows.sort((a, b) => a.sortId - b.sortId || String(a.skinId).localeCompare(String(b.skinId)));

    const seenPortrait = new Set();
    for (const row of costumeRows) {
      if (seenPortrait.has(row.portraitId)) continue;
      seenPortrait.add(row.portraitId);
      portraits.push({
        name: row.tabName,
        portraitId: row.portraitId,
        urls: getLocalFirstPortraitUrls(charId, row.portraitId),
        skinId: row.skinId
      });
    }
  }

  return portraits;
}

async function fetchRecruitCharacterDetailsFromGameData(charId) {
  try {
    const excel = getGameDataExcelBase();
    const [charTable, skinTable, teamTable, charwordTable] = await Promise.all([
      getGameDataJson(`${excel}/character_table.json`),
      getSkinTableShared(),
      getHandbookTeamTable(),
      getCharwordTableShared(),
    ]);

    const charData = charTable[charId];
    if (!charData) throw new Error('角色不存在');

    let traitDescription = '';
    if (charData.trait && charData.trait.candidates && charData.trait.candidates.length > 0) {
      const lastCandidate = charData.trait.candidates[charData.trait.candidates.length - 1];
      traitDescription = cleanDescription(lastCandidate.overrideDescripton || lastCandidate.additionalDescription || '', lastCandidate.blackboard || []);
    }
    if (!traitDescription && charData.description) {
      traitDescription = cleanDescription(charData.description);
    }

    return {
      id: charId,
      name: toTraditionalGameDataText(resolveCharacterTableDisplayName(charData)),
      appellation: charData.appellation,
      profession: charData.profession,
      rarity: parseCharacterRarity(charData.rarity),
      factionId: resolveFactionId(charData),
      nationName: factionIdToDisplayName(resolveFactionId(charData), teamTable),
      portraits: resolveCharacterPortraits(charId, charData, skinTable),
      traitDescription: traitDescription,
      recruitVoiceText: resolveRecruitVoiceText(charId, charwordTable),
      avatarUrl: AVATAR_SOURCES[0](charId)
    };
  } catch (error) {
    console.error('獲取招募卡角色資料失敗:', error);
    throw error;
  }
}

export async function fetchRecruitCharacterDetails(charId) {
  // 招募卡是圖片編輯功能，正確立繪比單次點選的快取命中更重要。
  // 固定讀最新 GameData，避免 Worker 的角色詳情快取尚未重建時回傳舊圖或缺圖。
  return fetchRecruitCharacterDetailsFromGameData(charId);
}

/**
 * 獲取角色詳細資料
 * @param {string} charId - 角色ID
 * @returns {Promise<Object>} 角色詳細資料
 */
export async function fetchCharacterDetails(charId, excelOverride = '') {
  try {
    // 並行獲取所有需要的數據
    const excel = excelOverride || getGameDataExcelBase();
    const [charTable, skillTable, buildingData, uniequipTable, handbookInfo, itemTable, rangeTable, skinTable, teamTable, charwordTable] = await Promise.all([
      getGameDataJson(`${excel}/character_table.json`),
      getGameDataJson(`${excel}/skill_table.json`, {}),
      getGameDataJson(`${excel}/building_data.json`, {}),
      getGameDataJson(`${excel}/uniequip_table.json`, {}),
      getGameDataJson(`${excel}/handbook_info_table.json`, {}),
      getGameDataJson(`${excel}/item_table.json`, {}),
      getGameDataJson(`${excel}/range_table.json`, {}),
      getGameDataJson(`${excel}/skin_table.json`, {}),
      getGameDataJson(`${excel}/handbook_team_table.json`, {}),
      getGameDataJson(`${excel}/charword_table.json`, {}),
      loadOperatorAssetManifest().catch(() => null),
    ]);

    const charData = charTable[charId];
    if (!charData) throw new Error('角色不存在');
    
    // 解析稀有度
    const parseRarity = (rarity) => {
      if (typeof rarity === 'number') return rarity;
      if (typeof rarity === 'string') {
        const match = rarity.match(/TIER_(\d+)/);
        if (match) return parseInt(match[1]) - 1;
        const num = parseInt(rarity);
        if (!isNaN(num)) return num;
      }
      return 0;
    };
    
    const rarity = parseRarity(charData.rarity);
    
    // 獲取材料信息的輔助函數
    const getItemInfo = (itemId) => {
      const item = itemTable?.items?.[itemId];
      const iconId = item?.iconId || itemId;
      const iconUrls = [
        getLocalItemIconUrl(iconId),
        `${ARKNIGHT_IMAGES_BASE}/items/${iconId}.png`,
      ].filter(Boolean);
      return {
        id: itemId,
        name: toTraditionalGameDataText(item?.name || itemId),
        iconId,
        rarity: item?.rarity || 0,
        iconUrl: iconUrls[0] || '',
        iconUrls,
      };
    };
    
    // 處理技能（更詳細）
    const skills = [];
    if (charData.skills && skillTable) {
      for (const skillRef of charData.skills) {
        const skillId = skillRef.skillId || skillRef;
        const skill = skillTable[skillId];
        if (skill) {
          // 取得最高等級的技能數據
          const levels = skill.levels || [];
          const maxLevel = levels[levels.length - 1] || {};
          const blackboard = maxLevel.blackboard || [];
          skills.push({
            id: skillId,
            name: toTraditionalGameDataText(
              maxLevel.name || skill.skillId || getApiBuiltLabels().unknownSkill
            ),
            description: cleanDescription(maxLevel.description || '', blackboard),
            skillType: maxLevel.skillType || '',
            spData: maxLevel.spData || {},
            duration: maxLevel.duration || 0,
            blackboard: blackboard,
            rangeId: maxLevel.rangeId || '',
            iconId: skill.iconId || skillId,
            iconUrls: [
              getLocalSkillIconUrl(skill.iconId || skillId),
              `${ARKNIGHT_IMAGES_BASE}/skills/skill_icon_${skill.iconId || skillId}.png`,
            ].filter(Boolean),
          });
        }
      }
    }
    
    // 處理天賦（更詳細，清理標籤，傳入 blackboard）
    const talents = (charData.talents || []).map(talent => {
      const candidates = (talent.candidates || []).map(candidate => ({
        name: toTraditionalGameDataText(candidate.name || ''),
        description: cleanDescription(candidate.description || '', candidate.blackboard || []),
        unlockCondition: candidate.unlockCondition || {},
        requiredPotentialRank: candidate.requiredPotentialRank || 0,
        prefabKey: candidate.prefabKey || '',
        rangeId: candidate.rangeId || ''
      }));
      return {
        candidates: candidates
      };
    });
    
    // 處理潛能提升（格式化顯示）
    const potentialRanks = (charData.potentialRanks || []).map((rank, index) => ({
      type: rank.type || '',
      description: cleanDescription(rank.description || ''),
      buffDescription: formatPotentialBuff(rank.buff),
      equivalentCost: rank.equivalentCost || null
    }));
    
    // 處理精英化材料（包含材料名稱和圖片）
    const evolveCosts = [];
    if (charData.phases) {
      charData.phases.forEach((phase, index) => {
        if (index > 0 && phase.evolveCost) {
          evolveCosts.push({
            phase: index,
            cost: phase.evolveCost.map(cost => ({
              ...getItemInfo(cost.id),
              count: cost.count,
              type: cost.type
            }))
          });
        }
      });
    }
    
    // 處理技能升級材料（包含材料名稱和圖片）
    const skillUpgradeCosts = [];
    if (charData.allSkillLvlup) {
      charData.allSkillLvlup.forEach((upgrade, index) => {
        skillUpgradeCosts.push({
          level: index + 2,
          lvlUpCost: (upgrade.lvlUpCost || []).map(cost => ({
            ...getItemInfo(cost.id),
            count: cost.count,
            type: cost.type
          })),
          unlockCond: upgrade.unlockCond || {}
        });
      });
    }
    
    // 處理後勤技能（從 chars 中獲取）
    const buildingSkills = [];
    if (buildingData?.chars && buildingData.chars[charId]) {
      const charBuildingInfo = buildingData.chars[charId];
      if (charBuildingInfo.buffChar) {
        charBuildingInfo.buffChar.forEach(buffInfo => {
          if (buffInfo.buffData) {
            buffInfo.buffData.forEach(buff => {
              const buffDetail = buildingData.buffs?.[buff.buffId];
              if (buffDetail) {
                buildingSkills.push({
                  id: buff.buffId,
                  name: toTraditionalGameDataText(buffDetail.buffName || ''),
                  description: cleanDescription(buffDetail.description || ''),
                  roomType: buffDetail.roomType || '',
                  buffCategory: buffDetail.buffCategory || '',
                  skillIcon: buffDetail.skillIcon || '',
                  sortId: buffDetail.sortId || 0,
                  cond: buff.cond || {}
                });
              }
            });
          }
        });
      }
    }
    
    // 處理模組（從 equipDict 中根據 charId 篩選）
    const modules = [];
    if (uniequipTable?.equipDict) {
      Object.entries(uniequipTable.equipDict).forEach(([equipId, equipData]) => {
        if (equipData.charId === charId && !equipId.startsWith('uniequip_001_')) {
          modules.push({
            id: equipId,
            uniEquipName: toTraditionalGameDataText(equipData.uniEquipName || ''),
            uniEquipDesc: cleanDescription(equipData.uniEquipDesc || ''),
            uniEquipIcon: equipId,
            uniEquipIconType: equipData.uniEquipIcon || '',
            uniEquipGetTime: equipData.uniEquipGetTime || 0,
            typeName1: toTraditionalGameDataText(equipData.typeName1 || ''),
            typeName2: toTraditionalGameDataText(equipData.typeName2 || ''),
            typeIcon: equipData.typeIcon || '',
            equipShiningColor: equipData.equipShiningColor || '',
            unlockEvolvePhase: equipData.unlockEvolvePhase || 0,
            unlockLevel: equipData.unlockLevel || 1,
            unlockFavorPoint: equipData.unlockFavorPoint || 0,
            missionList: equipData.missionList || [],
            story: cleanDescription(equipData.uniEquipDesc || ''),
            itemCost: equipData.itemCost || {}
          });
        }
      });
    }
    
    // 處理幹員檔案
    const handbookData = normalizeHandbookStoryText(handbookInfo?.handbookDict?.[charId] || {});
    
    // 立繪檔名可能含 # 等字元，需編碼後再放入 URL path（否則 # 會被當成 fragment）
    const encodePortraitFileId = (id) => encodeURIComponent(id);

    // 獲取立繪 URL（使用多個來源和備用 URL）
    const getPortraitUrls = (portraitId, alternativeIds = []) => {
      if (!portraitId) return [];

      // 合併主要 ID 和備用 ID
      const allIds = [portraitId, ...alternativeIds].filter(Boolean);
      const urls = [];

      // 為每個 ID 生成所有來源的 URL
      allIds.forEach(id => {
        const enc = encodePortraitFileId(id);
        urls.push(
          `${ARKNIGHT_IMAGES_BASE}/characters/${enc}.png`,
          `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/charportraits/${enc}.png`,
          `${ARKNIGHT_IMAGES_MIRROR_ACESHIP}/characters/${enc}.png`,
          `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charportraits/${enc}.png`,
          `https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main/portraits/${enc}.png`
        );
      });

      return urls;
    };
    
    // 構建立繪列表（不包含初始：精一、精二 + skin_table 時裝）
    const portraits = [];
    const displaySkins = charData.displaySkins || [];

    if (!charData.phases || charData.phases.length <= 1) {
      const initialSkin = Object.values(skinTable?.charSkins || {}).find((skin) => (
        skin?.charId === charId
        && skin.portraitId
        && String(skin.displaySkin?.skinGroupId || '').startsWith('ILLUST_')
      ));
      const portraitId = initialSkin?.portraitId || charData.phases?.[0]?.displayId || `${charId}_1`;
      portraits.push({
        name: getApiBuiltLabels().portraitFallback,
        portraitId,
        urls: getLocalFirstPortraitUrls(charId, portraitId, [`${charId}_1`]),
        skinId: null
      });
    }

    // 精一立繪
    const eliteLabels = getApiBuiltLabels();

    if (charData.phases && charData.phases.length > 1) {
      const phase1 = charData.phases[1];
      let displayId1 = null;
      if (displaySkins.length > 0) {
        const elite1Skin = displaySkins.find(skin =>
          skin.portraitId && (skin.portraitId.includes('_1') || skin.portraitId.includes('#1'))
        ) || displaySkins[0];
        displayId1 = elite1Skin?.portraitId;
      }
      if (!displayId1) {
        displayId1 = phase1.displayId || `${charId}_1`;
      }
      const alternativeIds1 = [
        `${charId}_1+`,
        `${charId}_1`,
        `${charId}#1`,
        phase1.displayId
      ].filter(id => id && id !== displayId1);

      portraits.push({
        name: eliteLabels.elite1,
        portraitId: displayId1,
        urls: getLocalFirstPortraitUrls(charId, displayId1, alternativeIds1),
        skinId: null
      });
    }

    // 精二立繪
    if (charData.phases && charData.phases.length > 2) {
      const phase2 = charData.phases[2];
      let displayId2 = null;
      if (displaySkins.length > 1) {
        const elite2Skin = displaySkins.find(skin =>
          skin.portraitId && (skin.portraitId.includes('_2') || skin.portraitId.includes('#2'))
        ) || displaySkins[1];
        displayId2 = elite2Skin?.portraitId;
      }
      if (!displayId2) {
        displayId2 = phase2.displayId || `${charId}_2`;
      }

      portraits.push({
        name: eliteLabels.elite2,
        portraitId: displayId2,
        urls: getLocalFirstPortraitUrls(charId, displayId2),
        skinId: null
      });
    }

    const elitePortraitIds = new Set(portraits.map(p => p.portraitId).filter(Boolean));

    // 時裝：charSkins 內 charId 相符者，排除預設戰鬥立繪群 ILLUST_*（對應初始／精一／精二美術）
    const charSkinsMap = skinTable?.charSkins;
    if (charSkinsMap && typeof charSkinsMap === 'object') {
      const isDefaultSkinGroup = (gid) => typeof gid === 'string' && gid.startsWith('ILLUST_');
      const costumeRows = [];

      for (const skin of Object.values(charSkinsMap)) {
        if (!skin || skin.charId !== charId) continue;
        const gid = skin.displaySkin?.skinGroupId;
        if (isDefaultSkinGroup(gid)) continue;

        const portraitId = skin.portraitId;
        if (!portraitId || elitePortraitIds.has(portraitId)) continue;

        const ds = skin.displaySkin || {};
        const rawLabel = [ds.skinName, ds.skinGroupName].find(Boolean) || skin.skinId || portraitId;
        let labelStr = String(rawLabel);
        if (shouldApplyS2tGameData()) {
          labelStr = toTraditionalGameDataText(labelStr);
        }
        const lb = getApiBuiltLabels();
        const tabName =
          getGameDataFolder() === 'zh_CN'
            ? labelStr.startsWith('時裝')
              ? labelStr
              : `時裝 · ${labelStr}`
            : `${lb.costumePrefix}${labelStr}`;

        costumeRows.push({
          skinId: skin.skinId,
          portraitId,
          tabName,
          sortId: typeof ds.sortId === 'number' ? ds.sortId : 0
        });
      }

      costumeRows.sort((a, b) => a.sortId - b.sortId || String(a.skinId).localeCompare(String(b.skinId)));

      const seenPortrait = new Set();
      for (const row of costumeRows) {
        if (seenPortrait.has(row.portraitId)) continue;
        seenPortrait.add(row.portraitId);

        portraits.push({
          name: row.tabName,
          portraitId: row.portraitId,
          urls: getLocalFirstPortraitUrls(charId, row.portraitId),
          skinId: row.skinId
        });
      }
    }

    // 獲取攻擊範圍數據
    const getRangeData = (rangeId) => {
      if (!rangeId || !rangeTable[rangeId]) return null;
      const range = rangeTable[rangeId];
      return {
        id: rangeId,
        direction: range.direction || 1,
        grids: range.grids || []
      };
    };
    
    // 獲取各階段的攻擊範圍
    const phaseRanges = [];
    if (charData.phases) {
      charData.phases.forEach((phase, index) => {
        const rangeData = getRangeData(phase.rangeId);
        if (rangeData) {
          phaseRanges.push({
            phase: index,
            ...rangeData
          });
        }
      });
    }
    
    // 處理特性描述（從 trait 中獲取最終候選的描述）
    let traitDescription = '';
    if (charData.trait && charData.trait.candidates && charData.trait.candidates.length > 0) {
      const lastCandidate = charData.trait.candidates[charData.trait.candidates.length - 1];
      traitDescription = cleanDescription(lastCandidate.overrideDescripton || lastCandidate.additionalDescription || '', lastCandidate.blackboard || []);
    }
    // 如果沒有 trait，使用 description
    if (!traitDescription && charData.description) {
      traitDescription = cleanDescription(charData.description);
    }
    
    const recruitVoiceText = resolveRecruitVoiceText(charId, charwordTable);

    return {
      id: charId,
      name: toTraditionalGameDataText(resolveCharacterTableDisplayName(charData)),
      appellation: charData.appellation,
      profession: charData.profession,
      subProfessionId: charData.subProfessionId || '',
      rarity: rarity,
      position: charData.position,
      tagList: (charData.tagList || []).map((tag) => toTraditionalGameDataText(tag)),
      nation: charData.nationId,
      factionId: resolveFactionId(charData),
      nationName: factionIdToDisplayName(resolveFactionId(charData), teamTable),
      description: toTraditionalGameDataText(
        normalizeEscapedNewlines(charData.itemUsage || charData.itemDesc || '')
      ),
      itemUsage: toTraditionalGameDataText(normalizeEscapedNewlines(charData.itemUsage || '')),
      itemDesc: toTraditionalGameDataText(normalizeEscapedNewlines(charData.itemDesc || '')),
      itemObtainApproach: toTraditionalGameDataText(
        normalizeEscapedNewlines(charData.itemObtainApproach || '')
      ),
      
      // 1. 干员信息（立繪）
      portraits: portraits,
      
      // 2. 特性
      traitDescription: traitDescription,
      recruitVoiceText: recruitVoiceText,
      
      // 3. 獲得方式
      obtainApproach: toTraditionalGameDataText(
        normalizeEscapedNewlines(charData.itemObtainApproach || '')
      ),
      
      // 4. 屬性（各等級）
      phases: charData.phases || [],
      
      // 5. 攻擊範圍
      phaseRanges: phaseRanges,
      
      // 6. 天賦
      talents: talents,
      
      // 7. 潛能提升
      potentialRanks: potentialRanks,
      
      // 8. 技能
      skills: skills,
      
      // 9. 後勤技能
      buildingSkills: buildingSkills,
      
      // 10. 精英化材料
      evolveCosts: evolveCosts,
      
      // 11. 技能升級材料
      skillUpgradeCosts: skillUpgradeCosts,
      
      // 12. 模組
      modules: modules,
      
      // 13. 幹員檔案
      handbook: handbookData,
      
      avatarUrl: AVATAR_SOURCES[0](charId)
    };
  } catch (error) {
    if (!excelOverride && getGameDataExcelBase() !== getCnGameDataExcelBase()) {
      console.warn('Localized character detail missing; falling back to CN GameData:', charId);
      return fetchCharacterDetails(charId, getCnGameDataExcelBase());
    }
    console.error('獲取角色詳情失敗:', error);
    throw error;
  }
}

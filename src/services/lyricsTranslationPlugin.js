const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATION_CACHE_PREFIX = 'lyricsTranslation:v1:';
const REQUEST_DELAY_MS = 120;
const MAX_TEXT_LENGTH = 450;

const memoryCache = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTargetLocale(locale) {
  if (locale === 'zh-CN') {
    return 'zh-CN';
  }

  return 'zh-TW';
}

function getCacheKey(text, targetLocale) {
  return `${TRANSLATION_CACHE_PREFIX}${targetLocale}:${text}`;
}

function readCachedTranslation(text, targetLocale) {
  const cacheKey = getCacheKey(text, targetLocale);
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached != null) {
      memoryCache.set(cacheKey, cached);
      return cached;
    }
  } catch {
    // localStorage can be unavailable in privacy-restricted contexts.
  }

  return null;
}

function writeCachedTranslation(text, targetLocale, translation) {
  const cacheKey = getCacheKey(text, targetLocale);
  memoryCache.set(cacheKey, translation);

  try {
    localStorage.setItem(cacheKey, translation);
  } catch {
    // Ignore quota and storage availability errors.
  }
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

async function translateText(text, targetLocale) {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    return '';
  }

  const cached = readCachedTranslation(trimmedText, targetLocale);
  if (cached != null) {
    return cached;
  }

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: targetLocale,
    dt: 't',
    q: trimmedText.slice(0, MAX_TEXT_LENGTH),
  });

  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  const translation = readGoogleTranslateResponse(data);
  writeCachedTranslation(trimmedText, targetLocale, translation);
  await sleep(REQUEST_DELAY_MS);
  return translation;
}

export async function translateLyricLines(lines, locale) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }

  const targetLocale = normalizeTargetLocale(locale);
  const result = lines.map((line) => ({
    ...line,
    translation: line.translation || '',
  }));

  for (let i = 0; i < result.length; i += 1) {
    const line = result[i];
    if (!line.text || line.translation) {
      continue;
    }

    try {
      line.translation = await translateText(line.text, targetLocale);
    } catch (error) {
      console.warn('Lyric translation failed:', error.message);
      line.translation = '';
    }
  }

  return result;
}

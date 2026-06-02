const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATION_CACHE_PREFIX = 'lyricsTranslation:v1:';
const LINE_SEPARATOR = '\n';
const MAX_BATCH_TEXT_LENGTH = 4200;

const memoryCache = new Map();

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

function createLyricBatches(lines) {
  const batches = [];
  let currentBatch = [];
  let currentLength = 0;

  lines.forEach((line, index) => {
    const text = String(line.text || '').trim();
    if (!text) {
      return;
    }

    const nextLength = currentLength + text.length + LINE_SEPARATOR.length;
    if (currentBatch.length > 0 && nextLength > MAX_BATCH_TEXT_LENGTH) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }

    currentBatch.push({ index, text });
    currentLength += text.length + LINE_SEPARATOR.length;
  });

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function translateBatch(batch, targetLocale) {
  const text = batch.map((line) => line.text).join(LINE_SEPARATOR);
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    return [];
  }

  const cached = readCachedTranslation(trimmedText, targetLocale);
  if (cached != null) {
    return cached.split(LINE_SEPARATOR);
  }

  const params = new URLSearchParams({
    client: 'gtx',
    sl: 'auto',
    tl: targetLocale,
    dt: 't',
    q: trimmedText,
  });

  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  const translation = readGoogleTranslateResponse(data);
  writeCachedTranslation(trimmedText, targetLocale, translation);
  return translation.split(LINE_SEPARATOR);
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

  const batches = createLyricBatches(result);
  for (const batch of batches) {
    try {
      const translations = await translateBatch(batch, targetLocale);
      batch.forEach((line, index) => {
        result[line.index].translation = translations[index] || '';
      });
    } catch (error) {
      console.warn('Lyric translation failed:', error.message);
    }
  }

  return result;
}

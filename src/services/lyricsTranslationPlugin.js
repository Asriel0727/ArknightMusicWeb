import OpenCC from 'opencc-js';

const GOOGLE_TRANSLATE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const TRANSLATION_CACHE_PREFIX = 'lyricsTranslation:v2:';
const LINE_SEPARATOR = '\n';
const MAX_BATCH_TEXT_LENGTH = 4200;
const SUPPORTED_LOCALES = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);

const cnToTw = OpenCC.Converter({ from: 'cn', to: 'twp' });
const twToCn = OpenCC.Converter({ from: 'tw', to: 'cn' });

const memoryCache = new Map();

function normalizeTargetLocale(locale) {
  return SUPPORTED_LOCALES.has(locale) ? locale : 'zh-TW';
}

function sampleLyricsText(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return '';
  }

  return lines
    .map((line) => String(line?.text || '').trim())
    .filter(Boolean)
    .slice(0, 24)
    .join('\n');
}

function detectLyricsLocale(lines, targetLocale) {
  const sample = sampleLyricsText(lines);
  if (!sample) {
    return null;
  }

  const hasHangul = /[\uac00-\ud7af]/i.test(sample);
  if (hasHangul) {
    return 'ko';
  }

  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff]/i.test(sample);
  if (hasKana) {
    return 'ja';
  }

  const hasHan = /[\u3400-\u4dbf\u4e00-\u9fff]/i.test(sample);
  if (hasHan) {
    if (targetLocale === 'zh-CN') {
      return twToCn(sample) === sample ? 'zh-CN' : 'zh-TW';
    }
    if (targetLocale === 'zh-TW') {
      return cnToTw(sample) === sample ? 'zh-TW' : 'zh-CN';
    }
    return 'zh';
  }

  const hasLatin = /[a-z]/i.test(sample);
  if (hasLatin) {
    return 'en';
  }

  return null;
}

function shouldSkipTranslation(lines, targetLocale) {
  const sourceLocale = detectLyricsLocale(lines, targetLocale);
  if (!sourceLocale) {
    return false;
  }

  if (targetLocale === 'zh-TW' || targetLocale === 'zh-CN') {
    return sourceLocale === targetLocale;
  }
  return sourceLocale === targetLocale;
}

function shouldSkipLineTranslation(text, targetLocale) {
  return shouldSkipTranslation([{ text }], targetLocale);
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

    currentBatch.push({ index: line.sourceIndex ?? index, text });
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
    translation: '',
  }));

  const translatableLines = result
    .map((line, index) => ({
      ...line,
      sourceIndex: index,
    }))
    .filter((line) => {
      const text = String(line.text || '').trim();
      return text && !shouldSkipLineTranslation(text, targetLocale);
    });

  const batches = createLyricBatches(translatableLines);

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

export async function translateTextBlock(text, locale) {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    return '';
  }

  const targetLocale = normalizeTargetLocale(locale);
  const pseudoLines = [{ text: trimmedText }];

  if (shouldSkipTranslation(pseudoLines, targetLocale)) {
    return trimmedText;
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
    q: trimmedText,
  });

  const response = await fetch(`${GOOGLE_TRANSLATE_ENDPOINT}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Translate request failed: ${response.status}`);
  }

  const data = await response.json();
  const translation = readGoogleTranslateResponse(data);
  writeCachedTranslation(trimmedText, targetLocale, translation);
  return translation;
}

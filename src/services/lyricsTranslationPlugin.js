import {
  translateLyricsOnServer,
  translateTextOnServer,
} from './api.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';

const SUPPORTED_LOCALES = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);
const lyricTranslationPromiseCache = new Map();
const lyricTranslationFailureCache = new Map();
const LYRIC_TRANSLATION_FAILURE_COOLDOWN_MS = 60 * 1000;
const GOOGLE_TRANSLATE_ENDPOINTS = [
  'https://translate.googleapis.com/translate_a/single',
  'https://translate.google.com/translate_a/single',
];
const MAX_TRANSLATION_BATCH_TEXT_LENGTH = 4200;

function normalizeTargetLocale(locale) {
  return SUPPORTED_LOCALES.has(locale) ? locale : 'zh-TW';
}

function getSourceText(line) {
  return String(line?.sourceText || line?.text || '');
}

function getLyricTranslationCacheKey(lines, targetLocale, songId) {
  return [
    songId || 'anonymous',
    targetLocale,
    lines.map(getSourceText).join('\u001f'),
  ].join('\u001e');
}

function requestLyricTranslations(lines, targetLocale, songId) {
  const cacheKey = getLyricTranslationCacheKey(lines, targetLocale, songId);
  const failedAt = lyricTranslationFailureCache.get(cacheKey);
  if (failedAt) {
    if (Date.now() - failedAt < LYRIC_TRANSLATION_FAILURE_COOLDOWN_MS) {
      return Promise.reject(new Error('Translation service is temporarily rate limited'));
    }
    lyricTranslationFailureCache.delete(cacheKey);
  }

  if (!lyricTranslationPromiseCache.has(cacheKey)) {
    const sourceLines = lines.map((line) => ({
      ...line,
      text: getSourceText(line),
    }));
    const request = translateLyricsOnServer(sourceLines, targetLocale, songId)
      .then((data) => {
        if (data?.ok === false) {
          throw new Error(data.error || 'Translation service unavailable');
        }
        const translations = Array.isArray(data.translations) ? data.translations : [];
        if (data?.translatableCount > 0 && data?.translatedCount === 0) {
          throw new Error(data.error || 'Translation service returned no translated lines');
        }
        if (!translations.some((translation) => String(translation || '').trim())) {
          lyricTranslationPromiseCache.delete(cacheKey);
        } else {
          lyricTranslationFailureCache.delete(cacheKey);
        }
        return translations;
      })
      .catch((error) => {
        lyricTranslationPromiseCache.delete(cacheKey);
        lyricTranslationFailureCache.set(cacheKey, Date.now());
        throw error;
      });
    lyricTranslationPromiseCache.set(cacheKey, request);
  }
  return lyricTranslationPromiseCache.get(cacheKey);
}

export async function prefetchLyricLines(lines, locale, songId = '') {
  if (!Array.isArray(lines) || lines.length === 0 || !songId) return;
  try {
    await requestLyricTranslations(lines, normalizeTargetLocale(locale), songId);
  } catch (error) {
    console.warn('Lyric translation prefetch failed:', error.message);
  }
}

export async function translateLyricLines(lines, locale, songId = '') {
  if (!Array.isArray(lines) || lines.length === 0) {
    return [];
  }

  const targetLocale = normalizeTargetLocale(locale);
  const result = lines.map((line) => ({
    ...line,
    sourceText: getSourceText(line),
    text: normalizeChineseMusicText(getSourceText(line), targetLocale),
    translation: '',
  }));

  try {
    let translations = await requestLyricTranslations(lines, targetLocale, songId);
    if (!translations.some((translation) => String(translation || '').trim())) {
      translations = await requestLyricTranslations(lines, targetLocale, songId);
    }

    return result.map((line, index) => ({
      ...line,
      translation: translations[index] || '',
    }));
  } catch (error) {
    try {
      const translations = await translateLyricLinesInBrowser(lines, targetLocale);
      const hasTranslation = translations.some((translation) => String(translation || '').trim());
      const hasTranslatableLine = lines.some((line) => {
        const text = getSourceText(line);
        return !shouldSkipBrowserTranslation(text, detectSourceLocale(text), targetLocale);
      });
      if (!hasTranslation && hasTranslatableLine) {
        throw new Error('Browser translation fallback returned no translated lines');
      }

      const cacheKey = getLyricTranslationCacheKey(lines, targetLocale, songId);
      lyricTranslationFailureCache.delete(cacheKey);
      lyricTranslationPromiseCache.set(cacheKey, Promise.resolve(translations));
      return result.map((line, index) => ({
        ...line,
        translation: translations[index] || '',
      }));
    } catch (fallbackError) {
      console.warn('Lyric translation failed:', error.message);
      console.warn('Browser lyric translation fallback failed:', fallbackError.message);
      throw error;
    }
  }
}

function detectSourceLocale(text) {
  const sample = String(text || '').trim();
  if (/[\u3040-\u30ff\u31f0-\u31ff]/i.test(sample)) return 'ja';
  if (/[\uac00-\ud7af]/i.test(sample)) return 'ko';
  if (/[\u3400-\u4dbf\u4e00-\u9fff]/i.test(sample)) return 'zh';
  if (/[a-z]/i.test(sample)) return 'en';
  return 'auto';
}

function shouldSkipBrowserTranslation(text, sourceLocale, targetLocale) {
  if (!String(text || '').trim()) return true;
  if ((targetLocale === 'zh-TW' || targetLocale === 'zh-CN') && sourceLocale === 'zh') return true;
  return sourceLocale === targetLocale;
}

function createBrowserTranslationBatches(lines, targetLocale) {
  const batches = [];
  let currentBatch = [];
  let currentLength = 0;
  let currentSourceLocale = '';

  for (const line of lines) {
    const text = getSourceText(line);
    const sourceLocale = detectSourceLocale(text);
    if (shouldSkipBrowserTranslation(text, sourceLocale, targetLocale)) continue;

    const nextLength = currentLength + text.length + 1;
    if (currentBatch.length > 0 && (nextLength > MAX_TRANSLATION_BATCH_TEXT_LENGTH || sourceLocale !== currentSourceLocale)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLength = 0;
    }

    currentSourceLocale = sourceLocale;
    currentBatch.push({ index: line.index, text, sourceLocale });
    currentLength += text.length + 1;
  }

  if (currentBatch.length > 0) batches.push(currentBatch);
  return batches;
}

function readGoogleTranslateResponse(data) {
  if (!Array.isArray(data) || !Array.isArray(data[0])) return '';
  return data[0].map((part) => (Array.isArray(part) ? part[0] : '')).filter(Boolean).join('').trim();
}

async function requestBrowserTranslationBatch(batch, targetLocale) {
  const text = batch.map((line) => line.text).join('\n');
  const sourceLocale = batch[0]?.sourceLocale || 'auto';
  const errors = [];

  for (const endpoint of GOOGLE_TRANSLATE_ENDPOINTS) {
    const params = new URLSearchParams({ client: 'gtx', sl: sourceLocale, tl: targetLocale, dt: 't', q: text });
    try {
      const response = await fetch(`${endpoint}?${params.toString()}`);
      if (!response.ok) {
        errors.push(`HTTP ${response.status}`);
        continue;
      }
      const parts = readGoogleTranslateResponse(await response.json()).split('\n');
      if (parts.length === batch.length) return parts;
      errors.push(`line count mismatch: expected ${batch.length}, got ${parts.length}`);
    } catch (error) {
      errors.push(error?.message || 'request failed');
    }
  }

  throw new Error(`Browser translation fallback failed: ${[...new Set(errors)].join('; ').slice(0, 200)}`);
}

async function translateLyricLinesInBrowser(lines, targetLocale) {
  const indexedLines = lines.map((line, index) => ({ ...line, index }));
  const translations = Array(lines.length).fill('');

  for (const batch of createBrowserTranslationBatches(indexedLines, targetLocale)) {
    const translatedParts = await requestBrowserTranslationBatch(batch, targetLocale);
    batch.forEach((line, index) => { translations[line.index] = translatedParts[index] || ''; });
  }

  return translations;
}

export async function translateTextBlock(text, locale) {
  const trimmedText = String(text || '').trim();
  if (!trimmedText) {
    return '';
  }

  try {
    return await translateTextOnServer(trimmedText, normalizeTargetLocale(locale));
  } catch (error) {
    console.warn('Text translation failed:', error.message);
    return '';
  }
}

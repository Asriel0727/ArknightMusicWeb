import {
  translateLyricsOnServer,
  translateTextOnServer,
} from './api.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';

const SUPPORTED_LOCALES = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);
const lyricTranslationPromiseCache = new Map();

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
  if (!lyricTranslationPromiseCache.has(cacheKey)) {
    const sourceLines = lines.map((line) => ({
      ...line,
      text: getSourceText(line),
    }));
    const request = translateLyricsOnServer(sourceLines, targetLocale, songId)
      .then((data) => {
        const translations = Array.isArray(data.translations) ? data.translations : [];
        if (!translations.some((translation) => String(translation || '').trim())) {
          lyricTranslationPromiseCache.delete(cacheKey);
        }
        return translations;
      })
      .catch((error) => {
        lyricTranslationPromiseCache.delete(cacheKey);
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
    console.warn('Lyric translation failed:', error.message);
    return result;
  }
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

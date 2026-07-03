import {
  translateLyricsOnServer,
  translateTextOnServer,
} from './api.js';

const SUPPORTED_LOCALES = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);

function normalizeTargetLocale(locale) {
  return SUPPORTED_LOCALES.has(locale) ? locale : 'zh-TW';
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

  try {
    const data = await translateLyricsOnServer(result, targetLocale);
    const translations = Array.isArray(data.translations) ? data.translations : [];

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

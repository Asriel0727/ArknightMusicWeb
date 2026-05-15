import OpenCC from 'opencc-js';
import { shouldApplyS2tGameData, shouldApplyS2tMusicApi } from '../services/gameDataSource.js';

let converter;

function getConverter() {
  if (!converter) {
    converter = OpenCC.Converter({ from: 'cn', to: 'twp' });
  }
  return converter;
}

function runS2t(str) {
  try {
    return getConverter()(str);
  } catch {
    return str;
  }
}

/** 明日方舟表格（簡中來源）→ 台灣繁體 */
export function toTraditionalGameDataText(input) {
  if (input == null || input === '') return input == null ? '' : String(input);
  const s = typeof input === 'string' ? input : String(input);
  if (!shouldApplyS2tGameData() || !s) return s;
  return runS2t(s);
}

/** 塞壬音樂 API 等簡中文案 → 台灣繁體 */
export function toTraditionalMusicApiText(input) {
  if (input == null || input === '') return input == null ? '' : String(input);
  const s = typeof input === 'string' ? input : String(input);
  if (!shouldApplyS2tMusicApi() || !s) return s;
  return runS2t(s);
}

const MUSIC_PAYLOAD_SKIP = new Set([
  'cid',
  'albumCid',
  'coverUrl',
  'coverDeUrl',
  'sourceUrl',
  'lyricUrl',
  'audioUrl',
  'iconId',
  'skinId',
]);

function isSkippableMusicKey(key) {
  if (MUSIC_PAYLOAD_SKIP.has(key)) return true;
  if (/url$/i.test(key) || /Url$/.test(key)) return true;
  return false;
}

/**
 * 遞迴轉換音樂 API 回傳物件中的字串（略過 URL／ID 欄位）。
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
export function transformMusicApiPayload(value, depth = 0) {
  if (!shouldApplyS2tMusicApi()) return value;
  if (value == null) return value;
  if (depth > 14) return value;
  if (typeof value === 'string') return toTraditionalMusicApiText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.map((item) => transformMusicApiPayload(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (isSkippableMusicKey(k)) {
        out[k] = v;
        continue;
      }
      out[k] = transformMusicApiPayload(v, depth + 1);
    }
    return out;
  }
  return value;
}

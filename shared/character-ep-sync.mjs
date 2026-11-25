import { getVerifiedAudioSyncOffset } from './character-ep-audio-sync.mjs';

export const CHARACTER_EP_SYNC_SCHEMA_VERSION = 1;
export const CHARACTER_EP_SYNC_SOURCES = Object.freeze({
  MEASURED: 'audio-correlation',
  MANUAL: 'manual',
  NONE: null,
});

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getManualOffset(characterEp) {
  const candidates = [
    characterEp?.sync?.manualOffsetSeconds,
    characterEp?.manualOffsetSeconds,
  ];
  for (const candidate of candidates) {
    const value = finiteNumber(candidate);
    if (value !== null && Math.abs(value) <= 60) return value;
  }
  return null;
}

/**
 * Resolve one public synchronization result for both the Worker and the UI.
 * Legacy audioSync is accepted during the migration, but the old numeric
 * videoOffsetSeconds fallback is intentionally not treated as verified data.
 */
export function resolveCharacterEpSync(characterEp = {}) {
  // Vue 的 characterEp 在載入資料前會是 null；先正規化，避免 setup
  // 階段讀取 songId 時直接拋出例外，導致整個 PlayerView 無法掛載。
  const normalizedCharacterEp = characterEp && typeof characterEp === 'object'
    ? characterEp
    : {};
  const identity = {
    songId: normalizedCharacterEp.songId,
    videoId: normalizedCharacterEp.bvid || normalizedCharacterEp.videoId,
  };
  const manualOffsetSeconds = getManualOffset(normalizedCharacterEp);
  const measuredOffsetSeconds = getVerifiedAudioSyncOffset(normalizedCharacterEp.audioSync, identity);

  if (manualOffsetSeconds !== null) {
    return {
      schemaVersion: CHARACTER_EP_SYNC_SCHEMA_VERSION,
      mappingStatus: normalizedCharacterEp.sync?.mappingStatus || 'verified',
      calibrationStatus: 'manual',
      offsetSeconds: manualOffsetSeconds,
      offsetSource: CHARACTER_EP_SYNC_SOURCES.MANUAL,
      confidence: null,
      algorithmVersion: null,
      analyzedAt: normalizedCharacterEp.sync?.analyzedAt || null,
      errorCode: null,
    };
  }

  if (measuredOffsetSeconds !== null) {
    const isReview = normalizedCharacterEp.sync?.calibrationStatus === 'review';
    return {
      schemaVersion: CHARACTER_EP_SYNC_SCHEMA_VERSION,
      mappingStatus: normalizedCharacterEp.sync?.mappingStatus || 'verified',
      calibrationStatus: isReview ? 'review' : 'measured',
      offsetSeconds: measuredOffsetSeconds,
      offsetSource: CHARACTER_EP_SYNC_SOURCES.MEASURED,
      confidence: normalizedCharacterEp.audioSync.confidence,
      algorithmVersion: normalizedCharacterEp.audioSync.algorithmVersion,
      analyzedAt: normalizedCharacterEp.audioSync.analyzedAt || null,
      errorCode: null,
    };
  }

  return {
    schemaVersion: CHARACTER_EP_SYNC_SCHEMA_VERSION,
    mappingStatus: normalizedCharacterEp.sync?.mappingStatus || (normalizedCharacterEp.songId ? 'verified' : 'unknown'),
    calibrationStatus: normalizedCharacterEp.sync?.calibrationStatus === 'failed' ? 'failed' : 'unavailable',
    offsetSeconds: null,
    offsetSource: CHARACTER_EP_SYNC_SOURCES.NONE,
    confidence: null,
    algorithmVersion: null,
    analyzedAt: normalizedCharacterEp.sync?.analyzedAt || null,
    errorCode: normalizedCharacterEp.sync?.errorCode || null,
  };
}

export function buildCharacterEpSync(raw = {}, { songId, videoId, mappingStatus = 'verified' } = {}) {
  const normalizedRaw = raw && typeof raw === 'object' ? raw : {};
  const measuredOffsetSeconds = getVerifiedAudioSyncOffset(normalizedRaw.audioSync, { songId, videoId });
  const manualOffsetSeconds = finiteNumber(normalizedRaw.sync?.manualOffsetSeconds);
  const hasManualOffset = manualOffsetSeconds !== null && Math.abs(manualOffsetSeconds) <= 60;
  const measuredNeedsReview = measuredOffsetSeconds !== null
    && Number(normalizedRaw.audioSync?.confidence) < 0.8;
  const calibrationStatus = hasManualOffset
    ? 'manual'
    : measuredOffsetSeconds !== null
      ? measuredNeedsReview ? 'review' : 'measured'
      : normalizedRaw.audioSyncAttempt?.status === 'failed' ? 'failed' : 'unavailable';

  return {
    schemaVersion: CHARACTER_EP_SYNC_SCHEMA_VERSION,
    mappingStatus,
    calibrationStatus,
    offsetSeconds: hasManualOffset ? manualOffsetSeconds : measuredOffsetSeconds,
    offsetSource: hasManualOffset
      ? CHARACTER_EP_SYNC_SOURCES.MANUAL
      : measuredOffsetSeconds !== null ? CHARACTER_EP_SYNC_SOURCES.MEASURED : CHARACTER_EP_SYNC_SOURCES.NONE,
    confidence: hasManualOffset ? null : normalizedRaw.audioSync?.confidence || null,
    algorithmVersion: hasManualOffset ? null : normalizedRaw.audioSync?.algorithmVersion || null,
    analyzedAt: normalizedRaw.audioSync?.analyzedAt || normalizedRaw.audioSyncAttempt?.at || null,
    errorCode: calibrationStatus === 'failed' ? normalizedRaw.audioSyncAttempt?.reason || 'calibration_failed' : null,
    manualOffsetSeconds: hasManualOffset ? manualOffsetSeconds : null,
  };
}

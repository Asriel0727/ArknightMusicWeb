import { getVerifiedAudioSyncOffset } from '../../shared/character-ep-audio-sync.mjs';

const BILIBILI_SOURCE_PATTERN = /(?:bilibili\.com|player\.bilibili\.com)/i;

export const DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS = 5;

export function getCharacterEpVideoOffsetSeconds(characterEp) {
  const verifiedOffset = getVerifiedAudioSyncOffset(characterEp?.audioSync, {
    songId: characterEp?.songId, videoId: characterEp?.bvid,
  });
  if (verifiedOffset !== null) return verifiedOffset;

  const configuredOffset = characterEp?.videoOffsetSeconds;
  const hasConfiguredOffset = configuredOffset !== null
    && configuredOffset !== undefined
    && configuredOffset !== '';
  const numericOffset = Number(configuredOffset);

  if (hasConfiguredOffset && Number.isFinite(numericOffset)) {
    return numericOffset;
  }

  return BILIBILI_SOURCE_PATTERN.test(characterEp?.sourceUrl || '')
    ? DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS
    : 0;
}

export function getCharacterEpVideoTime(audioTime, videoOffsetSeconds = 0) {
  const numericAudioTime = Number(audioTime);
  const numericOffset = Number(videoOffsetSeconds);
  const safeAudioTime = Number.isFinite(numericAudioTime) ? Math.max(0, numericAudioTime) : 0;
  const safeOffset = Number.isFinite(numericOffset) ? numericOffset : 0;

  return Math.max(0, safeAudioTime + safeOffset);
}

/** Remaining audio seconds before the MV may start, not a wall-clock timer. */
export function getCharacterEpVideoDelaySeconds(audioTime, videoOffsetSeconds = 0) {
  const numericAudioTime = Number(audioTime);
  const numericOffset = Number(videoOffsetSeconds);
  const safeAudioTime = Number.isFinite(numericAudioTime) ? Math.max(0, numericAudioTime) : 0;
  const safeOffset = Number.isFinite(numericOffset) ? numericOffset : 0;
  return Math.max(0, -(safeAudioTime + safeOffset));
}

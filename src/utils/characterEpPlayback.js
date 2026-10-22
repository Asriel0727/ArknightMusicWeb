import { getVerifiedAudioSyncOffset } from '../../shared/character-ep-audio-sync.mjs';

const BILIBILI_SOURCE_PATTERN = /(?:bilibili\.com|player\.bilibili\.com)/i;

export const DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS = 5;

export function getCharacterEpVideoOffsetSeconds(characterEp, audioDurationSeconds = 0) {
  const verifiedOffset = getVerifiedAudioSyncOffset(characterEp?.audioSync, {
    songId: characterEp?.songId, videoId: characterEp?.bvid,
  });
  if (verifiedOffset !== null) return verifiedOffset;
  const videoDuration = Number(characterEp?.durationSeconds);
  const audioDuration = Number(audioDurationSeconds);
  // Estimate a signed shift from the durations. Negative shifts require the
  // player to wait until the audio reaches -offset before starting the MV.
  if (Number.isFinite(videoDuration) && videoDuration > 0
    && Number.isFinite(audioDuration) && audioDuration > 0) {
    return Math.round((videoDuration - audioDuration) * 1000) / 1000;
  }

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

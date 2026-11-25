import { resolveCharacterEpSync } from '../../shared/character-ep-sync.mjs';

// An uncalibrated MV must not silently use a guessed five-second offset. The
// caller can inspect syncStatus and decide whether to show a warning or use a
// manual correction instead.
export const DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS = 0;

export function getCharacterEpSyncState(characterEp) {
  return resolveCharacterEpSync(characterEp);
}

export function getCharacterEpVideoOffsetSeconds(characterEp) {
  const sync = getCharacterEpSyncState(characterEp);
  return sync.offsetSeconds ?? DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS;
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

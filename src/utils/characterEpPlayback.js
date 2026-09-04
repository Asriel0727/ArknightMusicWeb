const BILIBILI_SOURCE_PATTERN = /(?:bilibili\.com|player\.bilibili\.com)/i;

export const DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS = 5;

export function getCharacterEpVideoOffsetSeconds(characterEp) {
  const configuredOffset = characterEp?.videoOffsetSeconds;
  const hasConfiguredOffset = configuredOffset !== null
    && configuredOffset !== undefined
    && configuredOffset !== '';
  const numericOffset = Number(configuredOffset);

  if (hasConfiguredOffset && Number.isFinite(numericOffset) && numericOffset >= 0) {
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
  const safeOffset = Number.isFinite(numericOffset) ? Math.max(0, numericOffset) : 0;

  return safeAudioTime + safeOffset;
}

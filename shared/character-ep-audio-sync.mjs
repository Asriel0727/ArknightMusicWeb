export const AUDIO_SYNC_VERSION = 1;

// This is a measured similarity score, not a calibrated probability.
export function getVerifiedAudioSyncOffset(sync, { songId, videoId } = {}) {
  if (sync?.status !== 'accepted' || sync.algorithmVersion !== AUDIO_SYNC_VERSION
    || String(sync.songId) !== String(songId) || String(sync.videoId) !== String(videoId)
    || !songId || !videoId || typeof sync.offsetSeconds !== 'number'
    || !Number.isFinite(sync.offsetSeconds) || Math.abs(sync.offsetSeconds) > 60
    || typeof sync.confidence !== 'number' || !Number.isFinite(sync.confidence)
    || sync.confidence < 0.65 || sync.confidence > 1) return null;
  return sync.offsetSeconds;
}

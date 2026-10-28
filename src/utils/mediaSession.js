import { watch } from 'vue';

// The native audio element owns playback; system controls operate that same element.
export function attachMediaSession(audio, { getMetadata, previous, next, onSeek }) {
  const session = globalThis.navigator?.mediaSession;
  if (!audio || !session) return () => {};

  function updatePosition() {
    if (!session.setPositionState) return;
    const duration = audio.duration;
    try {
      if (!Number.isFinite(duration) || duration <= 0) {
        session.setPositionState();
        return;
      }
      session.setPositionState({
        duration,
        playbackRate: audio.playbackRate > 0 ? audio.playbackRate : 1,
        position: Math.min(duration, Math.max(0, audio.currentTime || 0)),
      });
    } catch {
      // Some browsers expose the API without supporting position updates.
    }
  }

  function updatePlayback() {
    session.playbackState = audio.ended || audio.error ? 'none' : audio.paused ? 'paused' : 'playing';
    updatePosition();
  }

  function seekTo(time) {
    if (!Number.isFinite(time) || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = Math.min(audio.duration, Math.max(0, time));
    onSeek(audio.currentTime);
    updatePosition();
  }

  const handlers = {
    play: () => audio.play(),
    pause: () => audio.pause(),
    previoustrack: previous,
    nexttrack: next,
    seekto: ({ seekTime }) => seekTo(seekTime),
    seekbackward: ({ seekOffset = 10 }) => seekTo(audio.currentTime - seekOffset),
    seekforward: ({ seekOffset = 10 }) => seekTo(audio.currentTime + seekOffset),
  };
  const registered = [];
  for (const [action, handler] of Object.entries(handlers)) {
    try {
      session.setActionHandler(action, async (details) => {
        try {
          await handler(details);
        } catch (error) {
          console.warn(`Media Session ${action} failed:`, error);
        }
      });
      registered.push(action);
    } catch {
      // Unsupported actions must not prevent the remaining controls from working.
    }
  }

  const stopMetadata = watch(getMetadata, (metadata) => {
    if (typeof globalThis.MediaMetadata !== 'function') return;
    try {
      session.metadata = metadata ? new MediaMetadata(metadata) : null;
    } catch (error) {
      console.warn('Media Session metadata update failed:', error);
    }
  }, { immediate: true, flush: 'sync' });

  const events = ['play', 'pause', 'ended', 'loadedmetadata', 'durationchange', 'emptied', 'timeupdate', 'seeked', 'ratechange', 'error'];
  for (const event of events) audio.addEventListener(event, updatePlayback);
  updatePlayback();

  return () => {
    stopMetadata();
    for (const event of events) audio.removeEventListener(event, updatePlayback);
    for (const action of registered) session.setActionHandler(action, null);
    session.metadata = null;
    session.playbackState = 'none';
    try { session.setPositionState?.(); } catch { /* Optional API. */ }
  };
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { reactive } from 'vue';
import { attachMediaSession } from '../src/utils/mediaSession.js';

function fixture(t, { unsupported = [], positionSupported = true } = {}) {
  const originals = ['navigator', 'MediaMetadata'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const actions = new Map();
  const positions = [];
  const session = {
    setActionHandler(action, handler) {
      if (unsupported.includes(action)) throw new Error('Unsupported action');
      actions.set(action, handler);
    },
  };
  if (positionSupported) session.setPositionState = (value) => positions.push(value);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaSession: session } });
  Object.defineProperty(globalThis, 'MediaMetadata', { configurable: true, value: class {
    constructor(metadata) { Object.assign(this, metadata); }
  } });
  const audio = Object.assign(new EventTarget(), {
    currentTime: 20, duration: 120, playbackRate: 1, paused: true, ended: false,
    async play() { this.paused = false; this.dispatchEvent(new Event('play')); },
    pause() { this.paused = true; this.dispatchEvent(new Event('pause')); },
  });
  const state = reactive({ metadata: null });
  const calls = { previous: 0, next: 0, seek: [] };
  const detach = attachMediaSession(audio, {
    getMetadata: () => state.metadata && { ...state.metadata },
    previous: () => { calls.previous++; },
    next: () => { calls.next++; },
    onSeek: (time) => calls.seek.push(time),
  });
  t.after(() => {
    detach();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { session, actions, positions, audio, state, calls, detach };
}

test('metadata follows song changes, delayed album hydration and clearing', (t) => {
  const { state, session } = fixture(t);
  assert.equal(session.metadata, null);
  state.metadata = { title: '大地之鹽', artist: '塞壬唱片-MSR', album: '', artwork: [] };
  assert.equal(session.metadata.title, '大地之鹽');
  state.metadata.album = 'EP';
  assert.equal(session.metadata.album, 'EP');
  state.metadata = { title: 'Next song', artist: 'Artist', album: 'Album', artwork: [{ src: 'https://example.com/cover.jpg' }] };
  assert.equal(session.metadata.title, 'Next song');
  assert.equal(session.metadata.artwork[0].src, 'https://example.com/cover.jpg');
  state.metadata = null;
  assert.equal(session.metadata, null);
});

test('system controls operate the same audio and queue, with idempotent play/pause', async (t) => {
  const { actions, audio, session, calls } = fixture(t);
  await actions.get('play')({});
  await actions.get('play')({});
  assert.equal(audio.paused, false);
  assert.equal(session.playbackState, 'playing');
  await actions.get('pause')({});
  await actions.get('pause')({});
  assert.equal(session.playbackState, 'paused');
  await actions.get('previoustrack')({});
  await actions.get('nexttrack')({});
  assert.equal(calls.previous, 1);
  assert.equal(calls.next, 1);
});

test('seek actions clamp to duration, update progress, and ignore unknown duration', async (t) => {
  const { actions, audio, calls, positions } = fixture(t);
  await actions.get('seekto')({ seekTime: 500 });
  assert.equal(audio.currentTime, 120);
  await actions.get('seekbackward')({ seekOffset: 200 });
  assert.equal(audio.currentTime, 0);
  await actions.get('seekforward')({});
  assert.equal(audio.currentTime, 10);
  assert.deepEqual(calls.seek, [120, 0, 10]);
  assert.equal(positions.at(-1).position, 10);
  audio.duration = NaN;
  await actions.get('seekto')({ seekTime: 50 });
  assert.equal(audio.currentTime, 10);
  audio.dispatchEvent(new Event('emptied'));
  assert.equal(positions.at(-1), undefined);
});

test('position updates handle rates, native seeking, ended and invalid duration', (t) => {
  const { audio, positions, session } = fixture(t);
  audio.playbackRate = 1.5;
  audio.currentTime = 50;
  audio.dispatchEvent(new Event('seeked'));
  assert.deepEqual(positions.at(-1), { duration: 120, playbackRate: 1.5, position: 50 });
  audio.ended = true;
  audio.dispatchEvent(new Event('ended'));
  assert.equal(session.playbackState, 'none');
  audio.duration = Infinity;
  audio.dispatchEvent(new Event('durationchange'));
  assert.equal(positions.at(-1), undefined);
  audio.ended = false;
  audio.error = { code: 2 };
  audio.dispatchEvent(new Event('error'));
  assert.equal(session.playbackState, 'none');
});

test('unsupported actions and missing optional position API keep remaining controls usable', async (t) => {
  const { actions, session } = fixture(t, { unsupported: ['seekto', 'seekbackward'], positionSupported: false });
  await actions.get('play')({});
  assert.equal(session.playbackState, 'playing');
  assert.equal(actions.has('seekto'), false);
});

test('detaching removes handlers, event listeners and metadata watch', (t) => {
  const { detach, state, session, actions, audio, positions } = fixture(t);
  detach();
  const count = positions.length;
  state.metadata = { title: 'Stale song' };
  audio.dispatchEvent(new Event('play'));
  assert.equal(session.metadata, null);
  assert.equal(session.playbackState, 'none');
  assert.equal(positions.length, count);
  assert.ok([...actions.values()].every((handler) => handler === null));
});

test('browsers without Media Session retain native playback', (t) => {
  const { audio } = fixture(t);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  assert.doesNotThrow(() => attachMediaSession(audio, {} )());
});

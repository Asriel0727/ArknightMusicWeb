import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCharacterEpSync,
  resolveCharacterEpSync,
} from '../shared/character-ep-sync.mjs';

test('manual correction has priority over measured audio alignment', () => {
  const state = resolveCharacterEpSync({
    songId: 'song1',
    bvid: 'video1',
    sync: { manualOffsetSeconds: -1.25 },
    audioSync: {
      status: 'accepted', algorithmVersion: 1,
      songId: 'song1', videoId: 'video1', offsetSeconds: 3, confidence: 0.95,
    },
  });

  assert.equal(state.calibrationStatus, 'manual');
  assert.equal(state.offsetSeconds, -1.25);
  assert.equal(state.offsetSource, 'manual');
});

test('verified audio alignment is exposed as the canonical measured result', () => {
  const raw = {
    audioSync: {
      status: 'accepted', algorithmVersion: 1,
      songId: 'song1', videoId: 'video1', offsetSeconds: 4.44, confidence: 0.92,
      analyzedAt: '2026-11-25T00:00:00Z',
    },
  };
  const sync = buildCharacterEpSync(raw, { songId: 'song1', videoId: 'video1' });

  assert.equal(sync.calibrationStatus, 'measured');
  assert.equal(sync.offsetSeconds, 4.44);
  assert.equal(sync.offsetSource, 'audio-correlation');
  assert.equal(sync.confidence, 0.92);
});

test('low-confidence measured alignment remains usable but is marked for review', () => {
  const sync = buildCharacterEpSync({
    audioSync: {
      status: 'accepted', algorithmVersion: 1,
      songId: 'song1', videoId: 'video1', offsetSeconds: 4.44, confidence: 0.72,
    },
  }, { songId: 'song1', videoId: 'video1' });

  assert.equal(sync.calibrationStatus, 'review');
  assert.equal(sync.offsetSeconds, 4.44);
});

test('failed calibration does not turn the legacy numeric fallback into a valid offset', () => {
  const state = resolveCharacterEpSync({
    songId: 'song1',
    bvid: 'video1',
    videoOffsetSeconds: 5,
    sync: { calibrationStatus: 'failed', errorCode: 'download_failed' },
  });

  assert.equal(state.calibrationStatus, 'failed');
  assert.equal(state.offsetSeconds, null);
  assert.equal(state.offsetSource, null);
});

test('missing character EP data is safe before the API response arrives', () => {
  const state = resolveCharacterEpSync(null);

  assert.equal(state.calibrationStatus, 'unavailable');
  assert.equal(state.mappingStatus, 'unknown');
  assert.equal(state.offsetSeconds, null);
});

test('null raw sync payloads are safe for worker normalization', () => {
  const state = buildCharacterEpSync(null, { songId: 'song1', videoId: 'video1' });

  assert.equal(state.calibrationStatus, 'unavailable');
  assert.equal(state.mappingStatus, 'verified');
  assert.equal(state.offsetSeconds, null);
});

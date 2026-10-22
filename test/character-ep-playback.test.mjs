import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS,
  getCharacterEpVideoOffsetSeconds,
  getCharacterEpVideoTime,
} from '../src/utils/characterEpPlayback.js';

test('uses the configured Bilibili intro offset', () => {
  const characterEp = {
    sourceUrl: 'https://www.bilibili.com/video/BV1example/',
    videoOffsetSeconds: 5.25,
  };

  assert.equal(getCharacterEpVideoOffsetSeconds(characterEp), 5.25);
  assert.equal(getCharacterEpVideoTime(20, 5.25), 25.25);
});

test('falls back to the five-second Bilibili estimate when the API field is absent', () => {
  assert.equal(
    getCharacterEpVideoOffsetSeconds({ sourceUrl: 'https://www.bilibili.com/video/BV1example/' }),
    DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS,
  );
});

test('does not add a Bilibili offset to YouTube videos by default', () => {
  assert.equal(
    getCharacterEpVideoOffsetSeconds({ sourceUrl: 'https://www.youtube.com/watch?v=example' }),
    0,
  );
  assert.equal(getCharacterEpVideoTime(20, 0), 20);
});

test('estimates the intro from actual durations instead of the legacy five seconds', () => {
  const ep = { durationSeconds: 201.5, videoOffsetSeconds: 5 };
  assert.equal(getCharacterEpVideoOffsetSeconds(ep, 200), 1.5);
  assert.equal(getCharacterEpVideoTime(20, getCharacterEpVideoOffsetSeconds(ep, 200)), 21.5);
  assert.equal(getCharacterEpVideoOffsetSeconds(ep, 201.5), 0);
  assert.equal(getCharacterEpVideoOffsetSeconds(ep, 205), 0);
});

test('keeps the fallback until both finite positive durations are available', () => {
  const ep = { durationSeconds: 201, videoOffsetSeconds: 2 };
  for (const audioDuration of [0, null, undefined, NaN, Infinity, -1]) {
    assert.equal(getCharacterEpVideoOffsetSeconds(ep, audioDuration), 2);
  }
  for (const durationSeconds of [0, null, undefined, NaN, Infinity, -1]) {
    assert.equal(getCharacterEpVideoOffsetSeconds({ ...ep, durationSeconds }, 200), 2);
  }
  assert.equal(getCharacterEpVideoOffsetSeconds({ durationSeconds: 200.1 }, 200), 0.1);
});

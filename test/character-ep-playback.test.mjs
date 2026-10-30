import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_BILIBILI_VIDEO_OFFSET_SECONDS,
  getCharacterEpVideoOffsetSeconds,
  getCharacterEpVideoTime,
  getCharacterEpVideoDelaySeconds,
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

test('prefers the explicit offset instead of inferring a start delay from durations', () => {
  const ep = { durationSeconds: 197, videoOffsetSeconds: 5 };
  assert.equal(getCharacterEpVideoOffsetSeconds(ep), 5);
  assert.equal(getCharacterEpVideoTime(20, getCharacterEpVideoOffsetSeconds(ep)), 25);
  assert.equal(getCharacterEpVideoOffsetSeconds(ep), 5);
});

test('uses the configured offset or platform fallback without requiring durations', () => {
  const ep = { durationSeconds: 201, videoOffsetSeconds: 2 };
  assert.equal(getCharacterEpVideoOffsetSeconds(ep), 2);
  assert.equal(getCharacterEpVideoOffsetSeconds({ ...ep, durationSeconds: 0 }), 2);
  assert.equal(getCharacterEpVideoOffsetSeconds({ ...ep, durationSeconds: Infinity }), 2);
  assert.equal(getCharacterEpVideoOffsetSeconds({ sourceUrl: 'https://www.bilibili.com/video/BV1example/' }), 5);
  assert.equal(getCharacterEpVideoOffsetSeconds({ sourceUrl: 'https://www.youtube.com/watch?v=example' }), 0);
});

test('only a verified negative sync offset creates an initial wait', () => {
  const offset = getCharacterEpVideoOffsetSeconds({
    songId: 'song1',
    bvid: 'video1',
    durationSeconds: 197,
    audioSync: {
      status: 'accepted', algorithmVersion: 1,
      songId: 'song1', videoId: 'video1', offsetSeconds: -3, confidence: 0.9,
    },
  });
  assert.equal(offset, -3);
  for (const [audioTime, delay, videoTime] of [
    [0, 3, 0], [1.5, 1.5, 0], [2.999, 0.001, 0], [3, 0, 0], [20, 0, 17],
  ]) {
    assert.ok(Math.abs(getCharacterEpVideoDelaySeconds(audioTime, offset) - delay) < 0.000001);
    assert.equal(getCharacterEpVideoTime(audioTime, offset), videoTime);
  }
  assert.equal(getCharacterEpVideoOffsetSeconds({ durationSeconds: 197 }), 0);
});

test('supports signed fallback values and never seeks to negative or nonfinite video time', () => {
  assert.equal(getCharacterEpVideoOffsetSeconds({ videoOffsetSeconds: -2 }), -2);
  assert.equal(getCharacterEpVideoTime(0, -2), 0);
  assert.equal(getCharacterEpVideoTime(20, -2), 18);
  assert.equal(getCharacterEpVideoDelaySeconds(0, 5), 0);
  for (const invalid of [NaN, Infinity, -Infinity, 'invalid']) {
    assert.equal(getCharacterEpVideoTime(invalid, invalid), 0);
    assert.equal(getCharacterEpVideoDelaySeconds(invalid, invalid), 0);
  }
});

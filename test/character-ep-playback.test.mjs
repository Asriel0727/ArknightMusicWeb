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

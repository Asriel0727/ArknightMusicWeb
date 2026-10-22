import assert from 'node:assert/strict';
import test from 'node:test';
import { getBilibiliDurationSeconds, fetchBilibiliDurationSeconds } from '../scripts/bilibili-video-duration.mjs';

test('uses the embedded first part instead of multipart total duration', () => {
  assert.equal(getBilibiliDurationSeconds({ code: 0, data: {
    duration: 900, pages: [{ duration: 201 }, { duration: 699 }],
  } }), 201);
  assert.equal(getBilibiliDurationSeconds({ code: 0, data: { duration: 201 } }), 201);
});

test('rejects failed metadata and invalid durations', () => {
  assert.equal(getBilibiliDurationSeconds({ code: -403, data: { duration: 201 } }), null);
  for (const duration of [null, undefined, 0, -1, Infinity, 'invalid']) {
    assert.equal(getBilibiliDurationSeconds({ code: 0, data: { duration } }), null);
  }
});

test('requests the correct video ID and reports metadata failures', async () => {
  const request = { get: async (url, options) => {
    assert.equal(new URL(url).searchParams.get('aid'), '123');
    assert.equal(options.timeout, 15000);
    return { ok: () => true, json: async () => ({ code: 0, data: { duration: 200 } }) };
  } };
  assert.equal(await fetchBilibiliDurationSeconds(request, { videoIdType: 'aid', videoId: '123' }), 200);
  await assert.rejects(fetchBilibiliDurationSeconds({ get: async () => ({
    ok: () => true, json: async () => ({ code: -403 }),
  }) }, { videoIdType: 'bvid', videoId: 'BVtest' }), /duration unavailable/);
});

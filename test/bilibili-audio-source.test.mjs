import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchBilibiliAudioSource, getBilibiliAudioUrls } from '../scripts/bilibili-audio-source.mjs';

test('gets CID from pagelist then resolves AAC audio without reading the video webpage', async () => {
  const paths = [];
  const request = { get: async (url, options) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    assert.equal(options.headers.referer, 'https://www.bilibili.com/');
    const data = parsed.pathname.endsWith('/pagelist')
      ? { code: 0, data: [{ cid: 42569895192, duration: 203 }] }
      : { code: 0, data: { dash: { audio: [{ codecs: 'mp4a.40.2',
        baseUrl: 'https://cdn.bilivideo.com/mv.m4s', backupUrl: ['https://cdn.akamaized.net/mv.m4s'] }] } } };
    if (parsed.pathname.endsWith('/playurl')) {
      assert.equal(parsed.searchParams.get('avid'), '117405330244790');
      assert.equal(parsed.searchParams.get('cid'), '42569895192');
      assert.equal(parsed.searchParams.get('fnval'), '16');
    }
    return { ok: () => true, json: async () => data };
  } };
  const source = await fetchBilibiliAudioSource(request, { videoId: '117405330244790', videoIdType: 'aid' });
  assert.deepEqual(paths, ['/x/player/pagelist', '/x/player/playurl']);
  assert.equal(source.cid, '42569895192');
  assert.equal(source.durationSeconds, 203);
  assert.equal(source.audioUrls.length, 2);
});

test('selects AAC by bandwidth and rejects unsafe or unrelated URLs', () => {
  const urls = getBilibiliAudioUrls({ code: 0, data: { dash: { audio: [
    { codecs: 'mp4a.40.2', bandwidth: 64000, base_url: 'https://cdn.bilivideo.cn/low.m4s' },
    { codecs: 'mp4a.40.2', bandwidth: 128000, baseUrl: 'https://cdn.bilivideo.com/high.m4s',
      backupUrl: ['https://cdn.bilivideo.com/high.m4s', 'https://evil.test/audio', 'file:///audio'] },
    { codecs: 'other', bandwidth: 999999, baseUrl: 'https://cdn.bilivideo.com/unsupported.m4s' },
  ] } } });
  assert.deepEqual(urls, ['https://cdn.bilivideo.com/high.m4s', 'https://cdn.bilivideo.cn/low.m4s']);
  assert.deepEqual(getBilibiliAudioUrls({ code: -403 }), []);
});

test('cached CID skips metadata lookup and platform rejection remains an explicit failure', async () => {
  await assert.rejects(fetchBilibiliAudioSource({ get: async (url) => {
    assert.equal(new URL(url).pathname, '/x/player/playurl');
    assert.equal(new URL(url).searchParams.get('bvid'), 'BVtest');
    return { ok: () => false, status: () => 412 };
  } }, { videoId: 'BVtest', videoIdType: 'bvid', cid: '123' }), /HTTP 412/);
});

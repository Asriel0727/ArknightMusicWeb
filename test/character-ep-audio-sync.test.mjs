import assert from 'node:assert/strict';
import test from 'node:test';
import { audioSyncSourceKey, updateAudioSync } from '../scripts/character-ep-audio-sync.mjs';
import { getCharacterEpVideoOffsetSeconds } from '../src/utils/characterEpPlayback.js';
import { getVerifiedAudioSyncOffset } from '../shared/character-ep-audio-sync.mjs';
import worker from '../worker/index.js';

const now = Date.parse('2026-10-22T12:00:00Z');
const detail = { data: { cid: 'song1', sourceUrl: 'https://cdn.test/sign1/siren/audio/song.wav?token=1' } };
const makeRow = () => ({ song_id: 'song1', bvid: 'video1', duration_seconds: 200,
  source_url: 'https://www.bilibili.com/video/video1/', raw: {} });
const measured = { status: 'accepted', algorithmVersion: 1, offsetSeconds: -2.34, confidence: 0.92 };
const options = { musicApiOrigin: 'https://official.test', fetchJson: async () => detail, now,
  resolveAudio: async () => ({ cid: '123', audioUrls: ['https://cdn.bilivideo.com/audio.m4s'] }),
};

test('accepted audio alignment takes priority over duration estimates, including zero and negative', async () => {
  const row = makeRow();
  assert.equal(await updateAudioSync(row, { ...options, analyze: async (_audioUrl, _videoUrl, source) => {
    assert.deepEqual(source.audioUrls, ['https://cdn.bilivideo.com/audio.m4s']);
    return measured;
  } }), 'accepted');
  const ep = { songId: 'song1', bvid: 'video1', durationSeconds: 200, audioSync: row.raw.audioSync };
  assert.equal(getCharacterEpVideoOffsetSeconds(ep), -2.34);
  assert.equal(getCharacterEpVideoOffsetSeconds({ ...ep, audioSync: { ...ep.audioSync, offsetSeconds: 0 } }), 0);
  assert.equal(await updateAudioSync(row, { ...options, analyze: () => assert.fail('must reuse cached result') }), 'cached');
});

test('low confidence or an unrelated mapping falls back to the configured offset', () => {
  for (const invalid of [{ confidence: 0.2 }, { videoId: 'other' }, { songId: 'other' },
    { offsetSeconds: null }, { offsetSeconds: Infinity }, { offsetSeconds: 80 }, { algorithmVersion: 99 }]) {
    const audioSync = { ...measured, songId: 'song1', videoId: 'video1', ...invalid };
    assert.equal(getCharacterEpVideoOffsetSeconds({
      songId: 'song1', bvid: 'video1', durationSeconds: 200, videoOffsetSeconds: 10, audioSync,
    }), 10);
  }
});

test('rotating signed URLs retain cache identity but a different source invalidates it', async () => {
  const row = makeRow();
  assert.equal(audioSyncSourceKey(row, detail.data.sourceUrl),
    audioSyncSourceKey(row, 'https://othercdn.test/sign2/siren/audio/song.wav?token=2'));
  await updateAudioSync(row, { ...options, analyze: async () => measured });
  assert.equal(await updateAudioSync(row, { ...options,
    fetchJson: async () => ({ data: { ...detail.data, sourceUrl: 'https://cdn.test/siren/audio/changed.wav' } }),
    analyze: async () => ({ status: 'rejected', reason: 'low_similarity' }),
  }), 'failed');
  assert.equal(row.raw.audioSync, null);
});

test('a failed refresh preserves the last successful result and backs off repeated attempts', async () => {
  const row = makeRow();
  await updateAudioSync(row, { ...options, analyze: async () => measured });
  const later = now + 31 * 86400000;
  assert.equal(await updateAudioSync(row, { ...options, now: later,
    analyze: async () => ({ status: 'failed', reason: 'download_failed' }),
  }), 'failed');
  assert.equal(row.raw.audioSync.offsetSeconds, -2.34);
  assert.equal(await updateAudioSync(row, { ...options, now: later + 1000,
    analyze: () => assert.fail('cooldown should prevent another download'),
  }), 'cooldown');
});

test('song lookup failure falls back without destroying a valid cached alignment', async () => {
  const row = makeRow();
  await updateAudioSync(row, { ...options, analyze: async () => measured });
  assert.equal(await updateAudioSync(row, { ...options, fetchJson: async () => { throw new Error('offline'); } }), 'failed');
  assert.equal(getVerifiedAudioSyncOffset(row.raw.audioSync, { songId: 'song1', videoId: 'video1' }), -2.34);
});

test('the Worker exposes only verified public alignment fields from raw', async (t) => {
  let mismatched = false;
  t.mock.method(globalThis, 'fetch', async (input) => {
    const url = new URL(input);
    assert.equal(url.pathname, '/rest/v1/music_character_ep_videos');
    assert.ok(url.searchParams.get('select').split(',').includes('raw'));
    return Response.json([{ bvid: 'video1', song_id: 'song1', video_offset_seconds: 5,
      raw: { privateField: 'not-public', audioSync: { ...measured,
        songId: 'song1', videoId: mismatched ? 'old-video' : 'video1', sourceKey: 'private-source-key' } },
    }]);
  });
  const call = () => worker.fetch(new Request('https://worker.test/api/song/song1/character-ep'), {
    SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  }, { waitUntil() {} });
  const response = await call();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.audioSync.offsetSeconds, -2.34);
  assert.equal(body.data.audioSync.sourceKey, undefined);
  assert.equal(body.data.raw, undefined);
  mismatched = true;
  assert.equal((await (await call()).json()).data.audioSync, null);
});

test('API acquisition failure still permits extractor fallback', async () => {
  const row = makeRow();
  assert.equal(await updateAudioSync(row, { ...options,
    resolveAudio: async () => { throw new Error('HTTP 412'); },
    analyze: async (_audioUrl, _videoUrl, source) => {
      assert.deepEqual(source.audioUrls, []);
      return { ...measured, acquisition: 'yt-dlp' };
    },
  }), 'accepted');
  assert.equal(row.raw.audioSyncAttempt.acquisition, 'yt-dlp');
});

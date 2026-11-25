import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

function createFixture(t) {
  const kv = new Map();
  const songs = Array.from({ length: 5 }, (_, index) => ({
    cid: `song-${index + 1}`,
    name: `Song ${index + 1}`,
    lyricUrl: `https://web.hycdn.cn/siren/lyrics/song-${index + 1}.lrc`,
  }));
  const state = { failSongId: 'song-1' };
  const calls = { translationWrites: 0 };
  const env = {
    ARKNIGHTS_DATA: {
      async get(key, type) {
        if (!kv.has(key)) return null;
        const value = kv.get(key);
        return type === 'json' ? JSON.parse(value) : value;
      },
      async put(key, value) {
        kv.set(key, value);
      },
    },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    LYRICS_PREWARM_LOCALES: 'zh-TW',
    AUTH_STATE: {
      getByName() {
        return { async consumeRateLimit() { return { blocked: false }; } };
      },
    },
  };

  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.hostname === 'monster-siren.hypergryph.com') {
      if (url.pathname === '/api/albums') return Response.json({ data: [] });
      if (url.pathname === '/api/songs') return Response.json({ data: { list: songs } });
      const songId = decodeURIComponent(url.pathname.split('/').pop());
      const song = songs.find((item) => item.cid === songId);
      return Response.json({ data: song });
    }

    if (url.pathname.endsWith('.lrc')) {
      return new Response('[00:01.00]Keep moving');
    }

    if (url.hostname.startsWith('translate.google')) {
      return Response.json([[[url.searchParams.get('q').replace('Keep moving', '繼續前進')]]]);
    }

    if (url.pathname.endsWith('/music_songs')) {
      return Response.json([]);
    }

    if (url.pathname.endsWith('/music_cache')) {
      if (options.method === 'POST') return new Response(null, { status: 201 });
      const key = url.searchParams.get('key')?.replace(/^eq\./, '') || '';
      if (key.endsWith(':songs')) {
        return Response.json([{
          key,
          data: { data: { list: songs } },
          updated_at: new Date().toISOString(),
        }]);
      }
      if (key.includes(':song:')) {
        const songId = key.split(':song:')[1];
        return Response.json([{
          key,
          data: { data: songs.find((item) => item.cid === songId) },
          updated_at: new Date().toISOString(),
        }]);
      }
      return Response.json([]);
    }

    if (url.pathname.endsWith('/music_lyric_translations')) {
      if (options.method === 'POST') {
        calls.translationWrites += 1;
        const row = JSON.parse(options.body)[0];
        if (row.song_cid === state.failSongId) return new Response('temporary failure', { status: 503 });
        return new Response(null, { status: 201 });
      }
      return Response.json([]);
    }

    throw new Error(`Unexpected fetch: ${input}`);
  });

  return { env, kv, state, calls };
}

test('scheduled lyric sync reports partial writes and keeps failed songs retryable', async (t) => {
  const fixture = createFixture(t);
  const pending = [];
  await worker.scheduled(
    { cron: '20 */6 * * *' },
    fixture.env,
    { waitUntil(promise) { pending.push(promise); } }
  );
  await Promise.all(pending);

  const status = JSON.parse(fixture.kv.get('sync-status:v1:lyrics-translation'));
  const retryState = JSON.parse(fixture.kv.get('music:api:v2:prewarm:lyrics-retry-state'));
  assert.equal(status.state, 'partial');
  assert.equal(status.lastSuccessAt, null);
  assert.equal(status.summary.failed, 1);
  assert.equal(status.summary.saved > 0, true);
  assert.equal(status.summary.pending, 1);
  assert.equal(retryState['song-1'].attemptCount, 1);
  assert.equal(fixture.calls.translationWrites > 1, true);
});

test('browser fallback translations are persisted instead of being translated again', async (t) => {
  const fixture = createFixture(t);
  fixture.state.failSongId = 'song-that-does-not-exist';
  const response = await worker.fetch(
    new Request('https://worker.example/api/lyrics/translations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        songId: 'song-2',
        locale: 'zh-TW',
        lines: [{ text: 'Keep moving' }],
        translations: ['繼續前進'],
      }),
    }),
    fixture.env,
    { waitUntil() {} },
  );
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.persistence.database, 'saved');
  assert.equal(data.source, 'browser-submitted');
  assert.equal(fixture.calls.translationWrites, 1);
});

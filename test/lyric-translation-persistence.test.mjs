import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

const sourceTexts = ['In the silence', 'We still go on'];
const translations = ['在寂靜之中', '我們依然前行'];
const lyricUrl = 'https://web.hycdn.cn/siren/lyrics/review.lrc';

function fixture(t, { databaseFails = false, kvFails = false } = {}) {
  const kv = new Map();
  const rows = new Map();
  const calls = { provider: 0, writes: 0 };
  const state = { databaseFails };
  const env = {
    ARKNIGHTS_DATA: {
      async get(key) {
        if (kvFails) throw new Error('KV unavailable');
        return kv.has(key) ? JSON.parse(kv.get(key)) : null;
      },
      async put(key, value) {
        if (kvFails) throw new Error('KV unavailable');
        kv.set(key, value);
      },
    },
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
  };
  t.mock.method(globalThis, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/music_cache')) {
      return Response.json([{
        key: 'music:api:v2:song:697672', updated_at: new Date().toISOString(),
        data: { data: { cid: '697672', lyricUrl } },
      }]);
    }
    if (url.pathname.endsWith('/music_lyric_translations')) {
      if (options.method === 'POST') {
        calls.writes += 1;
        if (state.databaseFails) return new Response('Database unavailable', { status: 503 });
        for (const row of JSON.parse(options.body)) rows.set(`${row.song_cid}:${row.lyrics_hash}:${row.target_locale}`, row);
        return new Response(null, { status: 201 });
      }
      const key = ['song_cid', 'lyrics_hash', 'target_locale'].map(name => url.searchParams.get(name)?.slice(3)).join(':');
      return Response.json(rows.has(key) ? [rows.get(key)] : []);
    }
    if (String(input) === lyricUrl) {
      return new Response(sourceTexts.map((text, index) => `[00:0${index}.00]${text}`).join('\n'));
    }
    if (url.hostname.startsWith('translate.google')) {
      calls.provider += 1;
      const texts = url.searchParams.get('q').split('\n');
      return Response.json([[[texts.map(text => translations[sourceTexts.indexOf(text)] || '').join('\n')]]]);
    }
    throw new Error(`Unexpected fetch: ${input}`);
  });
  return { env, kv, rows, calls, state };
}

async function call(env, endpoint, overrides = {}) {
  const payload = { songId: '697672', locale: 'zh-TW', lines: sourceTexts.map(text => ({ text })), ...overrides };
  const response = await worker.fetch(new Request(`https://worker.example/api/lyrics/${endpoint}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }), env, { waitUntil() {} });
  return { status: response.status, data: await response.json() };
}

test('complete server translations are persisted and reused without the provider', async t => {
  const f = fixture(t);
  const first = await call(f.env, 'translate');
  assert.equal(first.status, 200);
  assert.equal(first.data.ok, true);
  assert.equal(first.data.persistence.database, 'saved');
  assert.deepEqual([...f.rows.values()][0].translations, translations);
  const providerCalls = f.calls.provider;
  const second = await call(f.env, 'translate');
  assert.equal(second.data.source, 'kv');
  assert.equal(f.calls.provider, providerCalls);
});

test('database failure is reported and a retry saves cached lyrics without translating again', async t => {
  const f = fixture(t, { databaseFails: true });
  const first = await call(f.env, 'translate');
  assert.equal(first.data.ok, true);
  assert.equal(first.data.persistence.database, 'failed');
  assert.deepEqual(first.data.translations, translations);
  const providerCalls = f.calls.provider;
  f.state.databaseFails = false;
  const retried = await call(f.env, 'translate');
  assert.equal(retried.data.persistence.database, 'saved');
  assert.equal(f.rows.size, 1);
  assert.equal(f.calls.provider, providerCalls);
});

test('Supabase translations remain readable when both KV read and refill fail', async t => {
  const f = fixture(t, { kvFails: true });
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceTexts.join('\n')))).toString('hex');
  f.rows.set(`697672:${hash}:zh-TW`, {
    song_cid: '697672', lyrics_hash: hash, target_locale: 'zh-TW', translations, line_count: 2, provider: 'old-provider',
  });
  const result = await call(f.env, 'translate');
  assert.equal(result.data.source, 'supabase');
  assert.equal(result.data.persistence.database, 'saved');
  assert.deepEqual(result.data.translations, translations);
  assert.equal(f.calls.provider, 0);
});

test('browser translations are saved against authoritative lyrics and preserve an existing complete result', async t => {
  const f = fixture(t);
  const saved = await call(f.env, 'translations', { translations });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.persistence.database, 'saved');
  assert.equal([...f.rows.values()][0].provider, 'google-translate-browser');
  const again = await call(f.env, 'translations', { translations: ['另一個翻譯', '另一種翻譯'] });
  assert.deepEqual(again.data.translations, translations);
  assert.equal(f.calls.writes, 1);
  assert.equal(f.calls.provider, 0);
});

test('incomplete, unchanged and mismatched browser submissions cannot write translations', async t => {
  const f = fixture(t);
  for (const candidate of [[], ['在寂靜之中', ''], sourceTexts]) {
    const result = await call(f.env, 'translations', { translations: candidate });
    assert.equal(result.status, 400);
  }
  const mismatch = await call(f.env, 'translations', { lines: [{ text: 'Wrong song' }], translations: ['不相符'] });
  assert.equal(mismatch.status, 400);
  assert.equal(f.calls.writes, 0);
});

test('a database failure while saving browser translations retains the successful translation for retry', async t => {
  const f = fixture(t, { databaseFails: true });
  const failed = await call(f.env, 'translations', { translations });
  assert.equal(failed.data.ok, true);
  assert.equal(failed.data.persistence.database, 'failed');
  f.state.databaseFails = false;
  const saved = await call(f.env, 'translations', { translations });
  assert.equal(saved.data.persistence.database, 'saved');
  assert.deepEqual([...f.rows.values()][0].translations, translations);
});

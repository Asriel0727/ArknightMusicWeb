import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Replace module dependencies only; exercise the actual plugin implementation.
async function loadPlugin(t, api) {
  const key = `lyricTest_${crypto.randomUUID()}`;
  globalThis[key] = api;
  t.after(() => delete globalThis[key]);
  const source = (await readFile(new URL('../src/services/lyricsTranslationPlugin.js', import.meta.url), 'utf8'))
    .replace(/import \{[\s\S]*?\} from '\.\/api.js';/, `const { translateLyricsOnServer, translateTextOnServer, saveLyricTranslationsOnServer } = globalThis[${JSON.stringify(key)}];`)
    .replace(/import \{ normalizeChineseMusicText \} from '[^']+';/, 'const normalizeChineseMusicText = text => text;');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('browser fallback save retry does not repeat translation', async t => {
  let serverCalls = 0, browserCalls = 0, saveCalls = 0;
  let failSave = true;
  const plugin = await loadPlugin(t, {
    async translateLyricsOnServer() { serverCalls += 1; throw new Error('Provider unavailable'); },
    async saveLyricTranslationsOnServer(lines, translations, locale, songId) {
      saveCalls += 1;
      assert.equal(songId, '697672');
      assert.equal(locale, 'zh-TW');
      assert.deepEqual(translations, ['在寂靜之中']);
      if (failSave) throw new Error('Database unavailable');
      return { ok: true, translations, persistence: { database: 'saved' } };
    },
  });
  t.mock.method(globalThis, 'fetch', async () => {
    browserCalls += 1;
    return Response.json([[['在寂靜之中']]]);
  });
  const lines = [{ time: 0, text: 'In the silence' }];
  const first = await plugin.translateLyricLines(lines, 'zh-TW', '697672');
  assert.equal(first.lyrics[0].translation, '在寂靜之中');
  assert.equal(first.saveStatus, 'failed');
  failSave = false;
  const retried = await plugin.translateLyricLines(lines, 'zh-TW', '697672');
  assert.equal(retried.saveStatus, 'saved');
  assert.equal(serverCalls, 1);
  assert.equal(browserCalls, 1);
  assert.equal(saveCalls, 2);
});

test('saved server translations never call a provider or save endpoint again', async t => {
  const plugin = await loadPlugin(t, {
    async translateLyricsOnServer() {
      return { ok: true, translations: ['我們依然前行'], persistence: { database: 'saved' } };
    },
    async saveLyricTranslationsOnServer() { assert.fail('Already saved'); },
  });
  t.mock.method(globalThis, 'fetch', () => assert.fail('Unexpected provider request'));
  const result = await plugin.translateLyricLines([{ time: 0, text: 'We still go on' }], 'zh-TW', '697672');
  assert.equal(result.saveStatus, 'saved');
  assert.equal(result.lyrics[0].translation, '我們依然前行');
});

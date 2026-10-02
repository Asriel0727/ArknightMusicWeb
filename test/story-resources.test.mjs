import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { audioUrl, collectStoryResources, extractStoryText, imageCandidates } from '../scripts/story/storyResources.mjs';

const source = readFileSync(new URL('../public/story/w2g-beg/script.txt', import.meta.url), 'utf8');
const variables = JSON.parse(readFileSync(new URL('../public/story/story-variables.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/story/w2g-beg/manifest.json', import.meta.url), 'utf8'));

test('story references are discovered without a hard-coded asset list', () => {
  const resources = collectStoryResources(source, variables);
  assert.equal(resources.images.length, 11);
  assert.equal(resources.audio.length, 12);
  assert.equal(resources.videos.length, 0);
  assert.deepEqual(resources.images.sort(), Object.keys(manifest.assets).sort());
  assert.deepEqual(resources.audio.sort(), Object.keys(manifest.audio).sort());
});

test('PRTS image and audio paths resolve safely', () => {
  assert.equal(imageCandidates('bg_indoor_1')[1], 'https://media.prts.wiki/0/0b/Avg_bg_bg_indoor_1.png');
  assert.equal(audioUrl('babel_loop', variables), 'https://torappu.prts.wiki/assets/audio/music/beta1_180603/m_dia_babel_loop.mp3');
  assert.throws(() => imageCandidates('../outside'), /Unsupported image ID/);
  assert.throws(() => audioUrl('unknown', variables), /No PRTS audio mapping/);
});

test('every discovered visual has a local optimized and original file', () => {
  for (const [id, asset] of Object.entries(manifest.assets)) {
    assert.ok(asset.path.endsWith('.webp'), id);
    assert.ok(asset.originalPath.endsWith('.png'), id);
    assert.ok(readFileSync(new URL(`../public/story/w2g-beg/${asset.path}`, import.meta.url)).length > 0, id);
    assert.ok(readFileSync(new URL(`../public/story/w2g-beg/${asset.originalPath}`, import.meta.url)).length > 0, id);
  }
});

test('image tween and video references are discovered for future stories', () => {
  const resources = collectStoryResources('[ImageTween(image="cg_next")]\n[PlayVideo(key="opening_movie")]', variables);
  assert.deepEqual(resources.images, ['cg_next']);
  assert.deepEqual(resources.videos, ['opening_movie']);
});

test('PRTS wiki wrapper is removed before script parsing', () => {
  const wrapped = '{{剧情模拟器|文本数据=\n[HEADER()] 標題\n[name="甲"] 台詞\n}}\n{{剧情导航}}';
  assert.equal(extractStoryText(wrapped), '[HEADER()] 標題\n[name="甲"] 台詞\n');
});

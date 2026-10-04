#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';
import { prtsThumbnailUrl, isEmptyStoryCover, selectStoryCover, fillStoryCoverFallbacks } from '../../src/utils/storyImages.js';
import { syncOperatorCovers } from './operator-covers.mjs';
import { initializeBaseline, loadCustomizations, captureLocalChanges, finishCustomizations } from './story-customizations.mjs';

const root = fileURLToPath(new URL('../../public/story/', import.meta.url));
const directory = path.join(root, 'thumbnails');
const catalogPath = path.join(root, 'catalog.json');
await initializeBaseline();
const customizations = await loadCustomizations();
if (process.env.STORY_SYNC_PIPELINE !== '1') await captureLocalChanges(customizations, JSON.parse(await readFile(catalogPath, 'utf8')));
await finishCustomizations(customizations);
const originalCatalog = JSON.parse(await readFile(catalogPath, 'utf8'));
let repaired = 0;
for (const story of originalCatalog) {
  if (!isEmptyStoryCover(story.cover) && story.coverOrigin !== 'collection') continue;
  const manifest = JSON.parse(await readFile(path.join(root, story.id, 'manifest.json'), 'utf8').catch(() => '{}'));
  const cover = selectStoryCover(manifest.assets, manifest.firstVisual);
  if (cover !== story.cover) repaired++;
  story.cover = cover;
  delete story.coverOrigin;
}
const catalog = fillStoryCoverFallbacks(originalCatalog);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Repaired ${repaired} empty or solid-color story covers`);
const urls = [...new Set(catalog.map(story => story.cover).filter(url => /^https:\/\//.test(url)))];
const indexPath = path.join(root, 'thumbnail-index.json');
const previous = JSON.parse(await readFile(indexPath, 'utf8').catch(() => '{}'));
const index = {};
const failures = [];
const exec = promisify(execFile);
await mkdir(directory, { recursive: true });
let cursor = 0;
let completed = 0;
let totalBytes = 0;

async function download(url) {
  const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl',
    ['--fail', '--location', '--silent', '--show-error', '--max-time', '45', url],
    { encoding: 'buffer', maxBuffer: 12 * 1024 * 1024, timeout: 48000 });
  return stdout;
}

async function sync(url) {
  const name = `${createHash('sha256').update(url).digest('hex').slice(0, 24)}.webp`;
  const relative = `thumbnails/${name}`;
  const file = path.join(root, relative);
  try {
    let bytes = await readFile(file).catch(() => null);
    if (!bytes) {
      let source;
      try { source = await download(prtsThumbnailUrl(url)); }
      catch { source = await download(url); }
      bytes = await sharp(source).resize(480, 270, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 72, effort: 4 }).toBuffer();
      await writeFile(file, bytes);
    }
    index[url] = relative;
    totalBytes += bytes.length;
  } catch (error) {
    if (previous[url] === relative && await readFile(file).catch(() => null)) index[url] = relative;
    failures.push({ url, reason: error.message });
  }
  completed++;
  if (completed % 50 === 0 || completed === urls.length) console.log(`Story thumbnails: ${completed} / ${urls.length}`);
}

// Share one optimized thumbnail between every story referencing the same cover.
await Promise.all(Array.from({ length: 4 }, async () => {
  while (cursor < urls.length) await sync(urls[cursor++]);
}));
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`);
await writeFile(path.join(root, 'thumbnail-report.json'), `${JSON.stringify({ sources: urls.length, cached: Object.keys(index).length, bytes: totalBytes, failures }, null, 2)}\n`);
await syncOperatorCovers(catalog, root);
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
await finishCustomizations(customizations, { checkpoint: process.env.STORY_SYNC_PIPELINE !== '1' });
console.log(`Cached ${Object.keys(index).length} covers in ${(totalBytes / 1024 / 1024).toFixed(2)} MiB; ${failures.length} remote fallbacks`);

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const output = path.join(root, 'public/story/w2g-beg');
const gameDataUrl = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/story/obt/guide/beg/0_welcome_to_guide.txt';
const prtsUrl = 'https://prts.wiki/w/W2G/BEG';
const prtsRawUrl = 'https://prts.wiki/index.php?title=W2G/BEG&action=raw';
const imageIds = [
  'bg_0_babel', 'bg_0_am', 'bg_indoor_1', 'bg_wild_a',
  'avg_0_1', 'avg_0_2', 'avg_0_3',
  'char_002_amiya_1', 'char_013_riop', 'char_016_medic', 'char_1002_nsabr_1',
];
const maxImageBytes = 12 * 1024 * 1024;

function mediaUrl(id) {
  const name = `Avg_${id === 'bg_indoor_1' || id === 'bg_wild_a' ? 'bg_' : ''}${id}.png`;
  const hash = createHash('md5').update(name).digest('hex');
  return `https://media.prts.wiki/${hash[0]}/${hash.slice(0, 2)}/${name}`;
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const overwrite = process.argv.includes('--overwrite');
  const offline = process.argv.includes('--offline');
  const assets = {};
  const downloads = [];
  const scriptPath = path.join(output, 'script.txt');
  let script;
  let scriptSourceUrl = gameDataUrl;
  if (!offline) {
    for (const url of [prtsRawUrl, gameDataUrl]) {
      try {
        const candidate = await fetchBytes(url);
        const text = candidate.toString('utf8');
        if (!text.includes('[HEADER(') || !text.includes('[StartBattle(')) throw new Error('Unexpected script format');
        script = candidate;
        scriptSourceUrl = url;
        break;
      } catch (error) {
        console.warn(`Story source unavailable: ${error.message}`);
      }
    }
  }
  if (!script) script = await readFile(scriptPath).catch(() => null);
  if (!script) throw new Error('No valid upstream or local W2G/BEG script');
  if (!script.toString('utf8').includes('[HEADER(') || !script.toString('utf8').includes('[StartBattle(')) {
    throw new Error('Unexpected or incomplete W2G/BEG script');
  }

  for (const id of imageIds) {
    const file = path.join(output, 'images', `${id}.png`);
    const sourceUrl = mediaUrl(id);
    let bytes = !overwrite ? await readFile(file).catch(() => null) : null;
    if (!bytes) {
      if (offline) throw new Error(`Missing local image: ${id}`);
      bytes = await fetchBytes(sourceUrl);
      downloads.push({ file, bytes });
    }
    if (bytes.length > maxImageBytes || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`Invalid PNG: ${id}`);
    }
    assets[id] = { path: `images/${id}.png`, bytes: bytes.length, sha256: sha256(bytes), sourceUrl };
  }

  const manifest = {
    schemaVersion: 1,
    storyId: 'W2G/BEG',
    sourcePage: prtsUrl,
    script: { path: 'script.txt', bytes: script.length, sha256: sha256(script), sourceUrl: scriptSourceUrl, fallbackSourceUrl: gameDataUrl },
    assets,
  };
  console.log(`W2G/BEG: ${script.length} script bytes, ${imageIds.length} PNGs, ${downloads.length} new downloads`);
  if (dryRun) return;

  await mkdir(path.join(output, 'images'), { recursive: true });
  for (const { file, bytes } of downloads) await writeFile(file, bytes);
  await writeFile(scriptPath, script);
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { audioUrl, collectStoryResources, extractStoryText, imageCandidates } from './storyResources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const publicRoot = path.join(root, 'public/story');
const config = JSON.parse(await readFile(new URL('./stories.json', import.meta.url), 'utf8'));
const variableUrl = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/gamedata/story/story_variables.json';
const variablePath = path.join(publicRoot, 'story-variables.json');
const execFileAsync = promisify(execFile);
const curlPreferredHosts = new Set();
const offline = process.argv.includes('--offline');
const overwrite = process.argv.includes('--overwrite');
const dryRun = process.argv.includes('--dry-run');
const storyFlag = process.argv.indexOf('--story');
const selectedId = storyFlag < 0 ? null : process.argv[storyFlag + 1];
if (storyFlag >= 0 && !selectedId) throw new Error('--story requires an ID');
if (offline && overwrite) throw new Error('--offline and --overwrite cannot be combined');
const stories = selectedId ? config.filter((story) => story.id === selectedId) : config;
if (!stories.length) throw new Error(`Unknown story: ${selectedId}`);

async function fetchBytes(url) {
  if (!url.startsWith('https://')) throw new Error(`Only HTTPS assets are supported: ${url}`);
  const origin = new URL(url).origin;
  let fetchError = null;
  if (!curlPreferredHosts.has(origin)) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        const error = new Error(`${url}: ${response.status}`);
        error.httpStatus = response.status;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (error.httpStatus === 404) throw error;
      fetchError = error;
      if (!error.httpStatus) curlPreferredHosts.add(origin);
    }
  }
  try {
    const executable = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const { stdout } = await execFileAsync(executable, ['--fail', '--location', '--silent', '--show-error', '--max-time', '30', url], {
      encoding: 'buffer', maxBuffer: 100 * 1024 * 1024, timeout: 35000,
    });
    return Buffer.from(stdout);
  } catch (curlError) {
    throw new Error(`${url}: fetch failed (${fetchError?.message || 'host uses curl fallback'}); curl failed (${curlError.message})`);
  }
}

function hash(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function validPng(bytes) { return bytes.length <= 12 * 1024 * 1024 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'; }
function validAudio(bytes) { return bytes.length <= 30 * 1024 * 1024 && (bytes.subarray(0, 3).toString() === 'ID3' || bytes[0] === 0xff); }
function entry(relativePath, bytes, sourceUrl) { return { path: relativePath.replaceAll('\\', '/'), bytes: bytes.length, sha256: hash(bytes), sourceUrl }; }

async function loadVariables() {
  let bytes = null;
  if (!offline) {
    try { bytes = await fetchBytes(variableUrl); }
    catch (error) { console.warn(`Audio mapping source unavailable: ${error.message}`); }
  }
  if (!bytes) bytes = await readFile(variablePath).catch(() => null);
  if (!bytes) throw new Error('No story variables map available');
  const variables = JSON.parse(bytes.toString('utf8'));
  if (!variables || typeof variables !== 'object' || Object.keys(variables).length < 100) {
    throw new Error('Unexpected story variables map');
  }
  return { variables, bytes };
}

async function loadScript(story, previous) {
  const localPath = path.join(publicRoot, story.id, 'script.txt');
  const rawUrl = `https://prts.wiki/index.php?title=${encodeURIComponent(story.page)}&action=raw`;
  if (!offline) {
    for (const url of [rawUrl, story.fallbackScriptUrl].filter(Boolean)) {
      try {
        const bytes = Buffer.from(extractStoryText((await fetchBytes(url)).toString('utf8')));
        return { bytes, sourceUrl: url };
      } catch (error) { console.warn(`Story source unavailable: ${error.message}`); }
    }
  }
  const local = await readFile(localPath).catch(() => null);
  const bytes = local && Buffer.from(extractStoryText(local.toString('utf8')));
  if (!bytes) throw new Error(`No script for ${story.id}; provide a working PRTS source or fallbackScriptUrl`);
  return { bytes, sourceUrl: previous?.script?.sourceUrl || story.fallbackScriptUrl || rawUrl };
}

async function obtainAsset(file, urls, validator, previousUrl) {
  const existing = await readFile(file).catch(() => null);
  if (existing && !validator(existing)) throw new Error(`Invalid local asset: ${file}`);
  if (existing && !overwrite) return { bytes: existing, sourceUrl: previousUrl || urls[0] };
  if (offline) throw new Error(`Missing local asset: ${file}`);
  for (const url of urls) {
    try {
      const bytes = await fetchBytes(url);
      if (!validator(bytes)) throw new Error('Invalid file signature or size');
      return { bytes, sourceUrl: url, download: true };
    } catch (error) { console.warn(`Asset candidate unavailable: ${error.message}`); }
  }
  if (existing) {
    console.warn(`Using committed asset because upstream is unavailable: ${file}`);
    return { bytes: existing, sourceUrl: previousUrl || urls[0] };
  }
  throw new Error(`Cannot resolve asset ${file}; add a source override or restore upstream availability`);
}

async function syncStory(story, variables) {
  if (!/^[a-z0-9-]+$/.test(story.id)) throw new Error(`Unsafe story ID: ${story.id}`);
  const output = path.join(publicRoot, story.id);
  const previous = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8').catch(() => '{}'));
  const script = await loadScript(story, previous);
  const resources = collectStoryResources(script.bytes.toString('utf8'), variables);
  const assets = {};
  const audio = {};
  const videos = {};
  const downloads = [];

  for (const id of resources.images) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Unresolved image variable: ${id}`);
    const relative = `images/${id}.png`;
    const file = path.join(output, relative);
    const urls = story.imageSources?.[id] ? [story.imageSources[id]] : imageCandidates(id);
    const result = await obtainAsset(file, urls, validPng, previous.assets?.[id]?.sourceUrl);
    const webp = await sharp(result.bytes).webp({ quality: 80, effort: 4 }).toBuffer();
    const webpPath = `images/${id}.webp`;
    assets[id] = {
      ...entry(webpPath, webp, result.sourceUrl),
      originalPath: relative,
      originalBytes: result.bytes.length,
      originalSha256: hash(result.bytes),
    };
    downloads.push({ file: path.join(output, webpPath), bytes: webp });
    if (result.download) downloads.push({ file, bytes: result.bytes });
  }
  for (const id of resources.audio) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Unsafe audio ID: ${id}`);
    const relative = `audio/${id}.mp3`;
    const file = path.join(output, relative);
    const url = story.audioSources?.[id] || audioUrl(id, variables);
    const result = await obtainAsset(file, [url], validAudio, previous.audio?.[id]?.sourceUrl);
    audio[id] = entry(relative, result.bytes, result.sourceUrl);
    if (result.download) downloads.push({ file, bytes: result.bytes });
  }
  for (const id of resources.videos) {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`Unsafe video ID: ${id}`);
    const url = story.videoSources?.[id];
    if (!url || !/^https:\/\//.test(url)) throw new Error(`Video ${id} needs an HTTPS videoSources entry`);
    const extension = new URL(url).pathname.match(/\.(mp4|webm)$/i)?.[1]?.toLowerCase();
    if (!extension) throw new Error(`Unsupported video format: ${url}`);
    const relative = `videos/${id}.${extension}`;
    const file = path.join(output, relative);
    const result = await obtainAsset(file, [url], (bytes) => bytes.length > 0 && bytes.length < 95 * 1024 * 1024, previous.videos?.[id]?.sourceUrl);
    videos[id] = entry(relative, result.bytes, result.sourceUrl);
    if (result.download) downloads.push({ file, bytes: result.bytes });
  }

  const firstVisual = resources.images[0] || null;
  const manifest = {
    schemaVersion: 2,
    storyId: story.page,
    title: story.title,
    sourcePage: `https://prts.wiki/w/${story.page}`,
    script: entry('script.txt', script.bytes, script.sourceUrl),
    commandCount: resources.commands.length,
    firstVisual,
    assets, audio, videos,
  };
  console.log(`${story.id}: ${resources.commands.length} commands, ${resources.images.length} images, ${resources.audio.length} audio, ${resources.videos.length} video; ${downloads.length} downloads`);
  if (dryRun) return;
  for (const { file, bytes } of downloads) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  }
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'script.txt'), script.bytes);
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const { variables, bytes } = await loadVariables();
  for (const story of stories) await syncStory(story, variables);
  if (dryRun) return;
  await mkdir(publicRoot, { recursive: true });
  await writeFile(variablePath, bytes);
  await writeFile(path.join(publicRoot, 'catalog.json'), `${JSON.stringify(config.map(({ id, title, page }) => ({ id, title, page })), null, 2)}\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

#!/usr/bin/env node
// Download shared media once, validate the actual bytes, then switch story manifests to local paths.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectStoryResources, audioUrl, videoUrl } from './storyResources.mjs';
import { compressStoryVideo } from './compress-story-video.mjs';

const exec = promisify(execFile);
const root = new URL('../../public/story/', import.meta.url);
const downloads = new URL('../../tmp/story-media-downloads/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const offline = process.argv.includes('--offline');
const communityOnly = process.argv.includes('--community');
const newOnly = process.argv.includes('--new-only');
const retryUnresolved = process.argv.includes('--retry-unresolved');
const maxFileMiB = Number(process.argv.find(arg => arg.startsWith('--max-file-mib='))?.split('=')[1] || 95);
if (!Number.isFinite(maxFileMiB) || maxFileMiB <= 0 || maxFileMiB > 512) throw new Error('--max-file-mib must be between 0 and 512');
const publishLimit = Math.min(maxFileMiB, 95) * 1048576;
const communityPlan = JSON.parse(await readFile(new URL('community-media-sources.json', import.meta.url), 'utf8'));
const communitySources = new Map(communityPlan.entries.map(entry => [`${entry.type}:${entry.key}`, entry]));
const communityUrls = new Map(communityPlan.entries.map(entry => [entry.url, entry]));
const officialVideoPlan = JSON.parse(await readFile(new URL('official-video-sources.json', import.meta.url), 'utf8'));
const officialVideoUrls = new Set(officialVideoPlan.entries.map(entry => entry.url));
const slow = process.argv.includes('--slow');
const concurrency = slow ? 2 : 4;
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const catalog = await read('catalog.json');
const variables = await read('prts-variables.json');
const remoteReport = await read('media-sync-report.json').catch(() => ({ resolved: [], unresolved: [] }));
const index = await read('media/local-index.json').catch(() => ({ schemaVersion: 1, entries: {} }));
const previousDownload = await read('media-download-report.json').catch(() => ({ failures: [] }));
const previousFailures = new Map(previousDownload.failures.map(item => [item.url, item]));
const jobs = new Map();
const manifests = [];
const resolved = new Map(remoteReport.resolved.map(item => [`${item.type}:${item.key}`, item.url]));
const missing = new Map(remoteReport.unresolved.map(item => [`${item.type}:${item.key}`, item.candidates]));
const allowedHosts = new Set(['torappu.prts.wiki', 'static.prts.wiki']);
const urlPath = (url, type) => `media/${type}/${createHash('sha256').update(url).digest('hex')}.${type === 'audio' ? 'mp3' : 'mp4'}`;
function safeUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && (allowedHosts.has(url.hostname) || communityUrls.has(url.href) && url.hostname === 'raw.githubusercontent.com' && url.pathname.startsWith(`/ArknightsAssets/ArknightsAssets2/${communityPlan.commit}/`) || officialVideoUrls.has(url.href) && url.hostname === 'ak.hycdn.cn') && !url.username && !url.password ? url.href : null; } catch { return null; }
}
for (const story of catalog.filter(row => row.available)) {
  const manifest = await read(`${story.id}/manifest.json`);
  const source = await readFile(new URL(`${story.id}/${manifest.script.path}`, root), 'utf8');
  const resources = collectStoryResources(source, variables);
  const references = [];
  for (const type of ['audio', 'videos']) for (const key of new Set([...resources[type], ...Object.keys(manifest[type] || {})])) {
    const entry = manifest[type]?.[key];
    // The original tutorial's downloaded snapshot is already local.
    if (entry?.path && !entry.path.startsWith('../media/')) continue;
    const id = `${type}:${key}`;
    const candidates = [index.references?.[id], communitySources.get(id)?.url, entry?.sourceUrl, entry?.url, resolved.get(id), ...(missing.get(id) || [])].map(safeUrl).filter(Boolean);
    if (!candidates.length) { try { candidates.push(type === 'audio' ? audioUrl(key, variables) : videoUrl(key, variables)); } catch {} }
    const urls = [...new Set(candidates)];
    references.push({ type, key, urls });
    for (const url of urls) if (!jobs.has(url)) jobs.set(url, { url, type, path: urlPath(url, type), result: null });
  }
  manifests.push({ story, manifest, references });
}
await mkdir(new URL('media/audio/', root), { recursive: true });
await mkdir(new URL('media/videos/', root), { recursive: true });
await mkdir(downloads, { recursive: true });
let downloaded = 0, reused = 0, skippedKnownMissing = 0, bytesDownloaded = 0, done = 0;
const compressedSources = [];
const failures = [];
let checkpoint = Promise.resolve();
function saveIndex() {
  // Snapshot before queueing; serialized atomic replacement avoids concurrent checkpoint races.
  const text = `${JSON.stringify(index, null, 2)}\n`;
  checkpoint = checkpoint.then(async () => {
    const temp = new URL('media/local-index.json.part', root);
    await writeFile(temp, text);
    await rename(temp, new URL('media/local-index.json', root));
  });
  return checkpoint;
}
async function inspect(file, type, expected) {
  const info = await stat(file);
  const limit = (type === 'audio' ? 32 : 512) * 1024 * 1024;
  if (info.size < 16 || info.size > limit) throw new Error('invalid-media-size');
  const handle = await open(file, 'r');
  const header = Buffer.alloc(16);
  try { await handle.read(header, 0, 16, 0); } finally { await handle.close(); }
  const valid = type === 'audio' ? header.subarray(0, 3).toString() === 'ID3' || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) : header.subarray(4, 8).toString() === 'ftyp';
  if (!valid) throw new Error('not-a-media-file');
  const hash = createHash('sha256');
  const blobHash = expected && createHash('sha1').update(`blob ${info.size}\0`);
  for await (const chunk of createReadStream(file)) { hash.update(chunk); blobHash?.update(chunk); }
  if (expected && (info.size !== expected.bytes || blobHash.digest('hex') !== expected.gitBlobSha)) throw new Error('source-blob-checksum-mismatch');
  return { bytes: info.size, sha256: hash.digest('hex') };
}
console.log(`Downloading ${jobs.size} unique media URLs for ${manifests.length} stories (${offline ? 'offline recovery' : `${concurrency} concurrent downloads`}).`);
const queue = [...jobs.values()];
async function worker() {
  while (queue.length) {
    const job = queue.shift();
    const file = new URL(job.path, root);
    const part = new URL(`${createHash('sha256').update(job.url).digest('hex')}.part`, downloads);
    const saved = index.entries[job.url];
    let existingMedia, compressed;
    try {
      const expected = communityUrls.get(job.url);
      let media = await inspect(file, job.type, saved?.conversion ? null : expected).catch(() => null);
      const validExisting = media && (!saved || media.sha256 === saved.sha256);
      if (validExisting) existingMedia = media;
      let conversion = validExisting ? saved?.conversion : null;
      let sourceFile;
      if (validExisting) { reused++; sourceFile = file; }
      else {
        if (newOnly && !retryUnresolved && !saved && previousFailures.has(job.url)) {
          skippedKnownMissing++;
          throw new Error('known-missing-source');
        }
        if (officialVideoUrls.has(job.url)) throw new Error('official-usm-needs-conversion');
        if (offline || communityOnly && !expected) throw new Error('not-downloaded');
        if (slow) await new Promise(resolve => setTimeout(resolve, 750));
        const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', [
          '-4', '--fail', '--location', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https',
          '-A', userAgent, '-e', 'https://prts.wiki/', '--retry', '1', '--retry-delay', '2',
          '--connect-timeout', '10', '--max-time', job.type === 'audio' ? '90' : '300',
          // Large videos are allowed only in the ignored temp directory, never directly in public.
          '--max-filesize', String((job.type === 'audio' ? Math.min(32 * 1048576, publishLimit) : 512 * 1048576)),
          '--output', fileURLToPath(part), '--write-out', '%{http_code}|%{content_type}', job.url,
        ], { maxBuffer: 128 * 1024, timeout: job.type === 'audio' ? 200000 : 620000 });
        if (!/^200\|(?:audio\/|video\/|application\/octet-stream)/i.test(stdout.trim())) throw new Error(`non-media-response: ${stdout.trim()}`);
        media = await inspect(part, job.type, expected);
        sourceFile = part;
      }
      if (job.type === 'videos' && media.bytes > publishLimit) {
        console.log(`Compressing ${job.url} (${(media.bytes / 1048576).toFixed(1)} MiB)`);
        compressed = await compressStoryVideo(fileURLToPath(sourceFile), media, publishLimit);
        const before = media;
        media = await inspect(compressed.file, job.type);
        conversion = { ...compressed.conversion, sourceUrl: job.url, ...(conversion ? { previousConversion: conversion } : {}) };
        await rename(compressed.file, file);
        compressedSources.push({ sourceUrl: job.url, bytesBefore: before.bytes, bytesAfter: media.bytes, sha256: media.sha256 });
      } else if (!validExisting) {
        if (media.bytes > publishLimit) throw new Error('media-exceeds-publish-limit');
        await rename(part, file);
      }
      if (!validExisting) { downloaded++; bytesDownloaded += compressed?.conversion.sourceBytes || media.bytes; }
      job.result = { path: job.path, sourceUrl: job.url, ...media, ...(conversion ? { conversion } : {}) };
      index.entries[job.url] = job.result;
    } catch (error) {
      // Never remove a valid existing file or its index on compression/download failure.
      if (existingMedia) {
        if (existingMedia.bytes <= 100 * 1048576) job.result = { path: job.path, sourceUrl: job.url, ...existingMedia, ...(saved?.conversion ? { conversion: saved.conversion } : {}) };
        index.entries[job.url] = saved || { path: job.path, sourceUrl: job.url, ...existingMedia };
      } else delete index.entries[job.url];
      const previousFailure = (offline || communityOnly || error.message === 'known-missing-source') && previousFailures.get(job.url);
      failures.push(previousFailure || { url: job.url, type: job.type, status: Number(String(error.stdout || '').match(/^(\d{3})\|/)?.[1]) || null, reason: error.code === 22 ? 'http-error' : String(error.message).slice(0, 400), retainedExisting: Boolean(existingMedia) });
    } finally {
      await unlink(part).catch(() => {});
      await compressed?.cleanup();
    }
    if (++done % 25 === 0 || done === jobs.size) {
      await saveIndex();
      console.log(`${done}/${jobs.size}: ${downloaded} downloaded, ${reused} reused, ${failures.length} failed, ${(bytesDownloaded / 1048576).toFixed(1)} MiB saved`);
    }
  }
}
await Promise.all(Array.from({ length: offline ? 1 : concurrency }, worker));
await saveIndex();
let localReferences = 0, changedStories = 0;
index.references ||= {};
const unresolved = [];
for (const { story, manifest, references } of manifests) {
  let changed = false;
  for (const { type, key, urls } of references) {
    const downloadedEntry = urls.map(url => jobs.get(url)?.result).find(Boolean);
    if (!downloadedEntry) { unresolved.push({ storyId: story.id, type, key, candidates: urls }); continue; }
    const entry = { ...downloadedEntry, path: `../${downloadedEntry.path}` };
    index.references[`${type}:${key}`] = downloadedEntry.sourceUrl;
    if (JSON.stringify(manifest[type]?.[key]) !== JSON.stringify(entry)) {
      manifest[type] ||= {}; manifest[type][key] = entry; changed = true;
    }
    localReferences++;
  }
  if (changed) { await writeFile(new URL(`${story.id}/manifest.json`, root), `${JSON.stringify(manifest)}\n`); changedStories++; }
}
await saveIndex();
const localFiles = [...jobs.values()].filter(job => job.result);
const totals = { audio: localFiles.filter(job => job.type === 'audio').length, videos: localFiles.filter(job => job.type === 'videos').length, bytes: localFiles.reduce((sum, job) => sum + job.result.bytes, 0) };
const missingKeys = [...new Map(unresolved.map(item => [`${item.type}:${item.key}`, { type: item.type, key: item.key }])).values()];
const missingTotals = { audio: missingKeys.filter(item => item.type === 'audio').length, videos: missingKeys.filter(item => item.type === 'videos').length };
const unsafeLocalFiles = [];
for (const name of await readdir(new URL('media/videos/', root))) {
  if (!name.endsWith('.mp4')) continue;
  const info = await stat(new URL(`media/videos/${name}`, root));
  if (info.size > 100 * 1048576) unsafeLocalFiles.push({ path: `media/videos/${name}`, bytes: info.size });
}
const report = { downloadedAt: new Date().toISOString(), mode: newOnly ? 'incremental-local-files' : 'local-files', stories: manifests.length, uniqueUrls: jobs.size, downloaded, reused, skippedKnownMissing, bytesDownloaded, compressed: compressedSources.length, compressedSources, unsafeLocalFiles, totals, missingTotals, localReferences, changedStories, failures, unresolved };
await writeFile(new URL('media-download-report.json', root), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report, failures: failures.length, unresolved: unresolved.length }));
if (unsafeLocalFiles.length) { console.error('Oversized local videos remain; publishing is blocked. See unsafeLocalFiles in media-download-report.json.'); process.exitCode = 1; }

#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ORIGIN = (process.env.ACTIVITY_API_ORIGIN || 'https://arknights-recruit-api.molly27molly.workers.dev').replace(/\/$/, '');
const SERVERS = ['cn', 'global', 'tw'];
const OUTPUT_DIR = 'public/images/activities';
const MANIFEST_PATH = `${OUTPUT_DIR}/manifest.json`;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const CONTENT_TYPE_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const options = { dryRun: false, limit: 0, overwrite: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') options.dryRun = true;
    else if (argv[index] === '--overwrite') options.overwrite = true;
    else if (argv[index] === '--limit' && argv[index + 1]) options.limit = Number.parseInt(argv[++index], 10) || 0;
  }
  return options;
}

function absolutePath(relativePath) { return path.join(projectRoot, relativePath); }

async function readJson(relativePath, fallback) {
  try { return JSON.parse(await readFile(absolutePath(relativePath), 'utf8')); } catch { return fallback; }
}

async function exists(relativePath) {
  try { await access(absolutePath(relativePath)); return true; } catch { return false; }
}

async function fetchActivities(server) {
  const response = await fetch(`${API_ORIGIN}/api/activities?server=${server}`);
  if (!response.ok) throw new Error(`Activities API (${server}) failed: HTTP ${response.status}`);
  const payload = await response.json();
  return Array.isArray(payload.activities) ? payload.activities : [];
}

function extensionFrom(contentType, sourceUrl) {
  if (CONTENT_TYPE_EXTENSIONS[contentType]) return CONTENT_TYPE_EXTENSIONS[contentType];
  const extension = path.extname(new URL(sourceUrl).pathname).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) ? extension.replace('.jpeg', '.jpg') : '';
}

async function downloadImage(sourceUrl) {
  const response = await fetch(sourceUrl, { headers: { accept: 'image/webp,image/png,image/jpeg,*/*;q=0.8', 'user-agent': 'ArknightMusicWeb activity asset sync' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (!contentType.startsWith('image/') || !extensionFrom(contentType, sourceUrl)) throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} byte limit`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`Image exceeds ${MAX_IMAGE_BYTES} byte limit`);
  return { buffer, contentType, extension: extensionFrom(contentType, sourceUrl) };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const activities = (await Promise.all(SERVERS.map(fetchActivities))).flat();
  const sources = new Map();
  for (const activity of activities) {
    if (activity?.code && /^https:\/\//i.test(activity.image_url || '')) sources.set(activity.code, activity.image_url);
  }

  const manifest = await readJson(MANIFEST_PATH, { schemaVersion: 1, generatedAt: '', assets: {} });
  manifest.assets ||= {};
  const candidates = [];
  for (const [code, sourceUrl] of sources) {
    const entry = manifest.assets[code];
    if (options.overwrite || entry?.sourceUrl !== sourceUrl || !entry?.relativePath || !await exists(entry.relativePath)) candidates.push([code, sourceUrl]);
  }
  const targets = options.limit > 0 ? candidates.slice(0, options.limit) : candidates;
  const result = { downloaded: 0, skipped: sources.size - candidates.length, failed: 0 };
  let manifestChanged = false;
  console.log(`Activities with source images: ${sources.size}`);
  console.log(`Will download: ${targets.length}${options.dryRun ? ' (dry run)' : ''}`);

  for (let index = 0; index < targets.length; index += 1) {
    const [code, sourceUrl] = targets[index];
    process.stdout.write(`\rDownloading ${index + 1}/${targets.length}: ${code}`);
    if (options.dryRun) continue;
    try {
      const image = await downloadImage(sourceUrl);
      const relativePath = `${OUTPUT_DIR}/${code}${image.extension}`;
      await mkdir(path.dirname(absolutePath(relativePath)), { recursive: true });
      await writeFile(absolutePath(relativePath), image.buffer);
      manifest.assets[code] = {
        publicPath: `/${relativePath.replace(/^public\//, '')}`,
        relativePath,
        sourceUrl,
        contentType: image.contentType,
        size: image.buffer.length,
        hash: createHash('sha256').update(image.buffer).digest('hex'),
        syncedAt: new Date().toISOString(),
      };
      result.downloaded += 1;
      manifestChanged = true;
    } catch (error) {
      result.failed += 1;
      console.warn(`\nFailed ${code}: ${error.message}`);
    }
  }
  if (targets.length) process.stdout.write('\n');
  if (!options.dryRun && manifestChanged) {
    manifest.generatedAt = new Date().toISOString();
    await mkdir(absolutePath(OUTPUT_DIR), { recursive: true });
    await writeFile(absolutePath(MANIFEST_PATH), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  console.table(result);
  if (result.failed > 0) {
    console.warn(`${result.failed} images will be retried by the next scheduled sync.`);
  }
}

main().catch((error) => {
  console.error('Activity asset sync failed.', error);
  process.exitCode = 1;
});

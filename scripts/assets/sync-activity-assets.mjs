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
const GENERATED_FALLBACK_SOURCE = 'generated:activity-fallback:v1';
const PRTS_ACTIVITY_LIST_URL = 'https://prts.wiki/w/%E6%B4%BB%E5%8A%A8%E4%B8%80%E8%A7%88';
const PRTS_MATCH_MAX_TIME_DIFFERENCE_MS = 72 * 60 * 60 * 1000;
// Keep critical assets available while the Worker waits for its next scheduled database sync.
const LOCAL_ACTIVITY_IMAGE_OVERRIDES = {
  'wiki-contingency-contract-arclight': 'https://media.prts.wiki/0/0e/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E5%8D%B1%E6%9C%BA%E5%90%88%E7%BA%A6%E6%B6%A4%E5%A2%A8%E4%BD%9C%E6%88%98_01.jpg',
  'wiki-icebreaker-games-1': 'https://media.prts.wiki/5/55/%E6%B4%BB%E5%8A%A8%E9%A2%84%E5%91%8A_%E4%BF%83%E8%9E%8D%E5%85%B1%E7%AB%9E01_01.jpg',
};
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const options = { dryRun: false, limit: 0, overwrite: false, usePrts: true, codes: new Set() };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--dry-run') options.dryRun = true;
    else if (argv[index] === '--overwrite') options.overwrite = true;
    else if (argv[index] === '--limit' && argv[index + 1]) options.limit = Number.parseInt(argv[++index], 10) || 0;
    else if (argv[index] === '--code' && argv[index + 1]) options.codes.add(argv[++index]);
    else if (argv[index] === '--no-prts') options.usePrts = false;
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

function escapeXml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

function getActivityTitle(activity) {
  const names = activity?.name_i18n || {};
  return names['zh-TW'] || names['zh-CN'] || names.en || Object.values(names).find(Boolean) || activity?.code || 'Arknights Activity';
}

function activityImageFamilyKey(activity) {
  const names = activity?.name_i18n || {};
  const name = names['zh-CN'] || names['zh-TW'] || names.en || Object.values(names).find(Boolean) || activity?.code || '';
  return String(name)
    .toLocaleLowerCase()
    .replace(/(?:\u5fa9\u523b|\u590d\u523b|rerun|retrospection|re-run)/gu, '')
    .replace(/20\d{2}/gu, '')
    .replace(/\s*\([^)]*\)\s*$/u, '')
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function getDirectActivityImageSource(activity) {
  return /^https:\/\//i.test(activity?.image_url || '')
    ? activity.image_url
    : (LOCAL_ACTIVITY_IMAGE_OVERRIDES[activity?.code] || '');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>');
}

function stripHtml(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
}

function normalizePrtsTitle(value) {
  return stripHtml(value)
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '')
    .replace(/(?:特别行动|限时任务|复刻|返场)/gu, '');
}

function getCnActivityTitle(activity) {
  const names = activity?.name_i18n || {};
  return names['zh-CN'] || names['zh-TW'] || names.en || Object.values(names).find(Boolean) || '';
}

function parsePrtsActivityList(html) {
  const entries = [];
  for (const row of String(html || '').match(/<tr[\s\S]*?<\/tr>/giu) || []) {
    const cells = row.match(/<td\b[\s\S]*?<\/td>/giu) || [];
    if (cells.length < 2) continue;
    const startMatch = cells[0].match(/(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2})/u);
    const imageMatch = row.match(/<img\b[^>]*\bsrc="([^"]+)"/iu);
    if (!startMatch || !imageMatch) continue;
    const title = stripHtml(cells[1]);
    const normalizedTitle = normalizePrtsTitle(title);
    // PRTS uses China Standard Time in this table. Explicitly supplying +08:00
    // keeps matching deterministic regardless of the machine's local timezone.
    const startAt = Date.parse(`${startMatch[1]}T${startMatch[2]}:00+08:00`);
    if (!title || normalizedTitle.length < 3 || Number.isNaN(startAt)) continue;
    entries.push({ title, normalizedTitle, startAt, imageUrl: decodeHtml(imageMatch[1]) });
  }
  return entries;
}

async function fetchPrtsActivityEntries() {
  const response = await fetch(PRTS_ACTIVITY_LIST_URL, {
    headers: { 'user-agent': 'ArknightMusicWeb activity asset sync' },
  });
  if (!response.ok) throw new Error(`PRTS activity list failed: HTTP ${response.status}`);
  const entries = parsePrtsActivityList(await response.text());
  if (entries.length === 0) throw new Error('PRTS activity list contained no parseable activity images');
  return entries;
}

function findPrtsImageSource(activity, prtsEntries) {
  const normalizedTitle = normalizePrtsTitle(getCnActivityTitle(activity));
  const startAt = Date.parse(activity?.window?.start_at || '');
  if (normalizedTitle.length < 3 || Number.isNaN(startAt)) return '';

  const candidates = prtsEntries
    .map((entry) => {
      const titleMatches = entry.normalizedTitle === normalizedTitle
        || (entry.normalizedTitle.length >= 4 && normalizedTitle.includes(entry.normalizedTitle))
        || (normalizedTitle.length >= 4 && entry.normalizedTitle.includes(normalizedTitle));
      return { entry, titleMatches, timeDifference: Math.abs(entry.startAt - startAt) };
    })
    .filter((candidate) => candidate.titleMatches && candidate.timeDifference <= PRTS_MATCH_MAX_TIME_DIFFERENCE_MS)
    .sort((left, right) => left.timeDifference - right.timeDifference);

  // A title and a nearby start time are both required. Never guess based only on
  // a generic title, because that could silently attach artwork from another run.
  return candidates[0]?.entry?.imageUrl || '';
}

function activitySourcePriority(activity) {
  const code = String(activity?.code || '');
  const names = Object.values(activity?.name_i18n || {}).join(' ');
  const isRerun = /(?:\u5fa9\u523b|\u590d\u523b|rerun|retrospection|re-run)/iu.test(`${code} ${names}`);
  return (code.startsWith('wiki-') ? 20 : 0) + (isRerun ? 0 : 10);
}

function renderFallbackSvg(activity) {
  const title = escapeXml(getActivityTitle(activity));
  const server = escapeXml(String(activity?.window?.server || '').toUpperCase());
  const start = activity?.window?.start_at ? new Date(activity.window.start_at).toISOString().slice(0, 10) : '';
  const label = escapeXml([server, start].filter(Boolean).join(' · '));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="540" viewBox="0 0 1200 540" role="img" aria-label="${title}">
  <defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#162a46"/><stop offset="1" stop-color="#0b111b"/></linearGradient></defs>
  <rect width="1200" height="540" fill="url(#bg)"/><path d="M0 420 380 160 620 540 900 230 1200 430V540H0Z" fill="#2766ad" opacity=".3"/>
  <text x="72" y="88" fill="#69b7ff" font-family="system-ui, sans-serif" font-size="26" font-weight="700">ARKNIGHTS · ACTIVITY</text>
  <text x="72" y="286" fill="#f3f7ff" font-family="system-ui, sans-serif" font-size="54" font-weight="700">${title}</text>
  <text x="72" y="346" fill="#b7c8df" font-family="system-ui, sans-serif" font-size="28">${label || 'Activity artwork is being updated'}</text>
</svg>`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const activities = (await Promise.all(SERVERS.map(fetchActivities))).flat();
  const sources = new Map();
  let prtsEntries = [];
  if (options.usePrts) {
    try {
      prtsEntries = await fetchPrtsActivityEntries();
      console.log(`Loaded ${prtsEntries.length} PRTS activity image entries.`);
    } catch (error) {
      // The existing API/Wiki sources remain usable if PRTS is temporarily down.
      console.warn(`PRTS image import skipped: ${error.message}`);
    }
  }

  // A rerun commonly has its own activity code but reuses the original banner.
  // Index all known official sources first, then let source-less variants borrow
  // a banner only when their normalized localized titles match exactly.
  const sourceByFamily = new Map();
  const resolvedSources = new Map();
  for (const activity of activities) {
    const sourceUrl = getDirectActivityImageSource(activity) || findPrtsImageSource(activity, prtsEntries);
    resolvedSources.set(activity.code, sourceUrl);
    const familyKey = activityImageFamilyKey(activity);
    const current = sourceByFamily.get(familyKey);
    if (sourceUrl && familyKey && (!current || activitySourcePriority(activity) > current.priority)) {
      sourceByFamily.set(familyKey, { code: activity.code, sourceUrl, priority: activitySourcePriority(activity) });
    }
  }
  for (const activity of activities) {
    if (!activity?.code || sources.has(activity.code)) continue;
    const familyKey = activityImageFamilyKey(activity);
    const directSourceUrl = resolvedSources.get(activity.code) || '';
    const familySource = sourceByFamily.get(familyKey);
    sources.set(activity.code, {
      activity,
      sourceUrl: directSourceUrl || familySource?.sourceUrl || '',
      aliasOf: !directSourceUrl && familySource?.code && familySource.code !== activity.code ? familySource.code : '',
    });
  }

  const manifest = await readJson(MANIFEST_PATH, { schemaVersion: 1, generatedAt: '', assets: {} });
  manifest.assets ||= {};
  const candidates = [];
  for (const [code, source] of sources) {
    if (options.codes.size && !options.codes.has(code)) continue;
    const entry = manifest.assets[code];
    const sourceUrl = source.aliasOf ? `alias:${source.aliasOf}` : (source.sourceUrl || GENERATED_FALLBACK_SOURCE);
    if (source.aliasOf) {
      if (options.overwrite || entry?.aliasOf !== source.aliasOf) candidates.push([code, source]);
    } else if (options.overwrite || entry?.sourceUrl !== sourceUrl || !entry?.relativePath || !await exists(entry.relativePath)) candidates.push([code, source]);
  }
  const targets = options.limit > 0 ? candidates.slice(0, options.limit) : candidates;
  const result = { downloaded: 0, aliased: 0, generatedFallbacks: 0, skipped: sources.size - candidates.length, failed: 0 };
  let manifestChanged = false;
  console.log(`Activities requiring local assets: ${sources.size}`);
  console.log(`Will download: ${targets.length}${options.dryRun ? ' (dry run)' : ''}`);

  for (let index = 0; index < targets.length; index += 1) {
    const [code, source] = targets[index];
    const sourceUrl = source.sourceUrl;
    process.stdout.write(`\rDownloading ${index + 1}/${targets.length}: ${code}`);
    if (options.dryRun) continue;
    try {
      if (source.aliasOf) {
        manifest.assets[code] = { aliasOf: source.aliasOf, sourceUrl: `alias:${source.aliasOf}`, syncedAt: new Date().toISOString() };
        result.aliased += 1;
        manifestChanged = true;
        continue;
      }
      const image = sourceUrl
        ? await downloadImage(sourceUrl)
        : { buffer: Buffer.from(renderFallbackSvg(source.activity)), contentType: 'image/svg+xml', extension: '.svg' };
      const relativePath = `${OUTPUT_DIR}/${code}${image.extension}`;
      await mkdir(path.dirname(absolutePath(relativePath)), { recursive: true });
      await writeFile(absolutePath(relativePath), image.buffer);
      manifest.assets[code] = {
        publicPath: `/${relativePath.replace(/^public\//, '')}`,
        relativePath,
        sourceUrl: sourceUrl || GENERATED_FALLBACK_SOURCE,
        contentType: image.contentType,
        size: image.buffer.length,
        hash: createHash('sha256').update(image.buffer).digest('hex'),
        syncedAt: new Date().toISOString(),
      };
      result.downloaded += 1;
      if (!sourceUrl) result.generatedFallbacks += 1;
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
  const fallbackCodes = [...sources.entries()]
    .filter(([code, source]) => !source.sourceUrl && manifest.assets[code]?.sourceUrl === GENERATED_FALLBACK_SOURCE)
    .map(([code]) => code);
  console.log(`Activity asset coverage: ${sources.size - result.failed}/${sources.size} (${fallbackCodes.length} generated fallbacks)`);
  if (fallbackCodes.length) console.log(`Fallback activity codes: ${fallbackCodes.join(', ')}`);
  if (result.failed > 0) {
    console.warn(`${result.failed} images will be retried by the next scheduled sync.`);
  }
}

main().catch((error) => {
  console.error('Activity asset sync failed.', error);
  process.exitCode = 1;
});

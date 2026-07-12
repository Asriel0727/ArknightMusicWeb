#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DEFAULT_AUDIT_PATH = 'public/images/manifest/operator-assets-audit.json';
const DEFAULT_MANIFEST_PATH = 'public/images/manifest/operator-assets.json';
const SUPPORTED_TYPES = new Set(['avatars', 'factions', 'classes', 'portraits', 'items', 'skills', 'modules']);
const IMAGE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const options = {
    audit: DEFAULT_AUDIT_PATH,
    manifest: DEFAULT_MANIFEST_PATH,
    type: 'avatars',
    limit: 0,
    dryRun: false,
    overwrite: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--audit' && next) {
      options.audit = next;
      index += 1;
    } else if (arg === '--manifest' && next) {
      options.manifest = next;
      index += 1;
    } else if (arg === '--type' && next) {
      options.type = next;
      index += 1;
    } else if (arg === '--limit' && next) {
      options.limit = Number.parseInt(next, 10) || 0;
      index += 1;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--overwrite') {
      options.overwrite = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  if (!SUPPORTED_TYPES.has(options.type)) {
    throw new Error(`Unsupported --type "${options.type}". Use one of: ${[...SUPPORTED_TYPES].join(', ')}`);
  }

  return options;
}

function printHelp() {
  console.log(`
Sync audited operator image assets.

Usage:
  npm.cmd run assets:sync -- --type avatars --limit 20
  npm.cmd run assets:sync -- --type factions
  npm.cmd run assets:sync -- --type classes
  npm.cmd run assets:sync -- --type items --limit 50
  npm.cmd run assets:sync -- --type skills --limit 50
  npm.cmd run assets:sync -- --type avatars --dry-run

Options:
  --type <type>          avatars | factions | classes | portraits | items | skills | modules. Default: avatars
  --limit <n>            Sync at most n missing assets. 0 means no limit.
  --audit <path>         Audit report path. Default: ${DEFAULT_AUDIT_PATH}
  --manifest <path>      Output manifest path. Default: ${DEFAULT_MANIFEST_PATH}
  --dry-run              Print what would be downloaded without writing files.
  --overwrite            Re-download even if the local file already exists.
`);
}

function toAbsolutePath(relativePath) {
  return path.join(projectRoot, relativePath);
}

function toPublicPath(relativePath) {
  return `/${relativePath.replaceAll(path.sep, '/').replace(/^public\//, '')}`;
}

async function readJson(relativePath, fallback = null) {
  try {
    const text = await readFile(toAbsolutePath(relativePath), 'utf8');
    return JSON.parse(text);
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function fileExists(relativePath) {
  try {
    await readFile(toAbsolutePath(relativePath));
    return true;
  } catch {
    return false;
  }
}

function normalizeRelativePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
}

function getAssetKey(record) {
  if (record.type === 'avatar') return record.operatorId || record.id;
  if (record.type === 'faction') return record.logoKey || record.id;
  if (record.type === 'class') return record.profession || record.id;
  if (record.type === 'portrait') return `${record.operatorId || 'unknown'}:${record.portraitId || record.id}`;
  if (record.type === 'item') return record.iconId || record.itemId || record.id;
  if (record.type === 'skill') return record.iconId || record.skillId || record.id;
  return record.id;
}

function getManifestBucket(type) {
  if (type === 'avatars') return 'avatars';
  if (type === 'factions') return 'factions';
  if (type === 'classes') return 'classes';
  if (type === 'portraits') return 'portraits';
  if (type === 'items') return 'items';
  if (type === 'skills') return 'skills';
  if (type === 'modules') return 'modules';
  return type;
}

function ensureManifestShape(manifest) {
  return {
    schemaVersion: manifest?.schemaVersion || 1,
    generatedAt: manifest?.generatedAt || '',
    assets: {
      avatars: manifest?.assets?.avatars || {},
      factions: manifest?.assets?.factions || {},
      classes: manifest?.assets?.classes || {},
      portraits: manifest?.assets?.portraits || {},
      items: manifest?.assets?.items || {},
      skills: manifest?.assets?.skills || {},
      modules: manifest?.assets?.modules || {},
    },
    summary: manifest?.summary || {},
  };
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function fetchImage(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'user-agent': 'ArknightMusicWeb asset sync',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || '';
  if (contentType && !IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error(`Unexpected content-type ${contentType}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function tryDownload(record) {
  const errors = [];
  const sourceUrls = Array.isArray(record.sourceUrls) ? record.sourceUrls : [];

  for (const sourceUrl of sourceUrls) {
    try {
      const image = await fetchImage(sourceUrl);
      return {
        ok: true,
        sourceUrl,
        ...image,
      };
    } catch (error) {
      errors.push({
        sourceUrl,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    ok: false,
    errors,
  };
}

async function writeAsset(record, image) {
  const relativePath = normalizeRelativePath(record.relativePath);
  const absolutePath = toAbsolutePath(relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, image.buffer);
}

function buildManifestEntry(record, image) {
  const relativePath = normalizeRelativePath(record.relativePath);
  return {
    id: record.id,
    type: record.type,
    label: record.label || record.id,
    publicPath: toPublicPath(relativePath),
    relativePath,
    hash: image.hash,
    size: image.size,
    contentType: image.contentType || '',
    sourceUrl: image.sourceUrl,
    syncedAt: new Date().toISOString(),
    operatorId: record.operatorId,
    factionId: record.factionId,
    logoKey: record.logoKey,
    profession: record.profession,
    portraitId: record.portraitId,
    skinId: record.skinId,
    category: record.category,
    phase: record.phase,
    itemId: record.itemId,
    iconId: record.iconId,
    skillId: record.skillId,
    rarity: record.rarity,
  };
}

async function buildExistingManifestEntry(record) {
  const relativePath = normalizeRelativePath(record.relativePath);
  const buffer = await readFile(toAbsolutePath(relativePath));
  const extension = path.extname(relativePath).toLowerCase();
  const contentType = extension === '.webp'
    ? 'image/webp'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : 'image/png';

  return buildManifestEntry(record, {
    hash: sha256(buffer),
    size: buffer.length,
    contentType,
    sourceUrl: '',
  });
}

function summarizeBucket(bucket) {
  return Object.keys(bucket || {}).length;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const audit = await readJson(options.audit);
  const manifest = ensureManifestShape(await readJson(options.manifest, {}));
  const bucketName = getManifestBucket(options.type);
  const records = audit?.assets?.[bucketName] || [];
  const candidates = [];

  for (const record of records) {
    const exists = await fileExists(normalizeRelativePath(record.relativePath));
    const assetKey = getAssetKey(record);
    if (!options.overwrite && exists) {
      manifest.assets[bucketName][assetKey] = await buildExistingManifestEntry(record);
      continue;
    }
    delete manifest.assets[bucketName][assetKey];
    candidates.push(record);
  }

  const targets = options.limit > 0 ? candidates.slice(0, options.limit) : candidates;

  console.log(`Audit: ${options.audit}`);
  console.log(`Manifest: ${options.manifest}`);
  console.log(`Type: ${options.type}`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`Will sync: ${targets.length}${options.dryRun ? ' (dry run)' : ''}`);

  const result = {
    synced: 0,
    skipped: records.length - candidates.length,
    failed: 0,
    failures: [],
  };

  for (let index = 0; index < targets.length; index += 1) {
    const record = targets[index];
    const assetKey = getAssetKey(record);
    process.stdout.write(`\rSyncing ${options.type} ${index + 1}/${targets.length}: ${assetKey}`);

    if (!record.sourceUrls || record.sourceUrls.length === 0) {
      result.failed += 1;
      result.failures.push({
        id: record.id,
        relativePath: record.relativePath,
        reason: 'No sourceUrls in audit report. Re-run assets:audit with the latest script.',
      });
      continue;
    }

    if (options.dryRun) {
      result.synced += 1;
      continue;
    }

    const image = await tryDownload(record);
    if (!image.ok) {
      result.failed += 1;
      result.failures.push({
        id: record.id,
        relativePath: record.relativePath,
        errors: image.errors,
      });
      continue;
    }

    image.hash = sha256(image.buffer);
    image.size = image.buffer.length;
    await writeAsset(record, image);
    manifest.assets[bucketName][assetKey] = buildManifestEntry(record, image);
    result.synced += 1;
  }

  if (targets.length > 0) {
    process.stdout.write('\n');
  }

  manifest.generatedAt = new Date().toISOString();
  manifest.summary = {
    avatars: summarizeBucket(manifest.assets.avatars),
    factions: summarizeBucket(manifest.assets.factions),
    classes: summarizeBucket(manifest.assets.classes),
    portraits: summarizeBucket(manifest.assets.portraits),
    items: summarizeBucket(manifest.assets.items),
    skills: summarizeBucket(manifest.assets.skills),
    modules: summarizeBucket(manifest.assets.modules),
  };

  if (!options.dryRun) {
    await mkdir(path.dirname(toAbsolutePath(options.manifest)), { recursive: true });
    await writeFile(toAbsolutePath(options.manifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  console.log('Asset sync complete.');
  console.table({
    synced: result.synced,
    skipped: result.skipped,
    failed: result.failed,
  });

  if (result.failures.length > 0) {
    console.log(`Failures are shown below. Full count: ${result.failures.length}`);
    console.log(JSON.stringify(result.failures.slice(0, 10), null, 2));
  }
}

main().catch((error) => {
  console.error('\nAsset sync failed.');
  console.error(error);
  process.exitCode = 1;
});

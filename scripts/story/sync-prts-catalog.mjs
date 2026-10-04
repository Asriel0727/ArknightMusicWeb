#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { collectStoryResources, extractStoryText, audioUrl } from './storyResources.mjs';
import { classifyStory, storyCategories } from '../../src/utils/storyCatalog.js';
import { selectStoryCover, fillStoryCoverFallbacks } from '../../src/utils/storyImages.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const output = path.join(root, 'public/story');
const cache = path.join(root, 'tmp/prts-stories');
const offline = process.argv.includes('--offline');
const resume = process.argv.includes('--resume');
const incremental = process.argv.includes('--incremental');
if (incremental && (resume || offline)) throw new Error('--incremental requires fresh upstream revision checks; do not combine with --resume or --offline');
const exec = promisify(execFile);
const apiRoot = 'https://prts.wiki/api.php';
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const previousCatalog = JSON.parse(await readFile(path.join(output, 'catalog.json'), 'utf8').catch(() => '[]'));
const previousRows = new Map(previousCatalog.map(row => [row.id, row]));
const syncState = JSON.parse(await readFile(path.join(output, 'sync-state.json'), 'utf8').catch(() => '{"schemaVersion":1,"pages":{}}'));
syncState.pages ||= {};
let fetchedScripts = 0, reusedScripts = 0, changedFiles = 0;
async function saveChanged(file, text) {
  if (await readFile(file, 'utf8').catch(() => null) === text) return;
  await writeFile(file, text);
  changedFiles++;
}

async function request(params) {
  const url = `${apiRoot}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const file = path.join(cache, `${createHash('sha256').update(url).digest('hex')}.json`);
  if (offline) return JSON.parse(await readFile(file, 'utf8'));
  if (resume) {
    const existing = await readFile(file, 'utf8').catch(() => null);
    if (existing) return JSON.parse(existing);
  }
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl',
        ['--fail', '--location', '--silent', '--show-error', '--max-time', '60', url],
        { maxBuffer: 30 * 1024 * 1024, timeout: 65000 });
      const data = JSON.parse(stdout);
      if (data.error) throw new Error(data.error.info);
      await writeFile(file, stdout);
      return data;
    } catch (error) { lastError = error; }
  }
  if (params.pageids?.includes('|')) {
    const ids = params.pageids.split('|');
    const midpoint = Math.ceil(ids.length / 2);
    const first = await request({ ...params, pageids: ids.slice(0, midpoint).join('|') });
    const second = await request({ ...params, pageids: ids.slice(midpoint).join('|') });
    const combined = { query: { pages: [...first.query.pages, ...second.query.pages] } };
    await writeFile(file, JSON.stringify(combined));
    return combined;
  }
  throw lastError;
}

function contents(page) { return page?.revisions?.[0]?.slots?.main?.content || ''; }
function field(text, name) { return text.match(new RegExp(`\\|\\s*${name}\\s*=\\s*([^|\\n}]+)`))?.[1]?.trim() || ''; }
function mediaMap(text) {
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const comma = line.indexOf(',');
    const url = line.slice(comma + 1).trim();
    return comma > 0 && url.startsWith('https://') ? [[line.slice(0, comma).trim().toLowerCase(), url]] : [];
  }));
}
const sourcePage = (page) => `https://prts.wiki/w/${encodeURIComponent(page.replaceAll(' ', '_')).replaceAll('%2F', '/')}`;

// Discover every simulator page, including operator records and special stories.
let continuation = {};
const pages = [];
do {
  const result = await request({ action: 'query', list: 'embeddedin', eititle: 'Template:剧情模拟器', einamespace: '0', eilimit: '500', ...continuation });
  if (!result.query?.embeddedin) throw new Error('PRTS returned no simulator index');
  pages.push(...result.query.embeddedin);
  continuation = result.continue;
} while (continuation);
if (pages.length < 100) throw new Error('PRTS index is unexpectedly incomplete; keeping previous catalog');
console.log(`Discovered ${pages.length} PRTS story pages`);

const media = await request({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: 'Widget:Data_Image|Widget:Data_Char|Widget:Data_Audio' });
const imagePage = media.query.pages.find((page) => /Data[ _]Image/i.test(page.title));
const charPage = media.query.pages.find((page) => /Data[ _]Char/i.test(page.title));
const audioPage = media.query.pages.find((page) => /Data[ _]Audio/i.test(page.title));
const images = { ...mediaMap(contents(imagePage)), ...mediaMap(contents(charPage)) };
// The simulator prefixes background IDs and selects a default expression for portraits.
const portraitDefaults = {};
for (const [key, url] of Object.entries(mediaMap(contents(charPage)))) {
  const base = key.replace(/-\d+\$\d+$/, '');
  if (!portraitDefaults[base] || /-1\$1$/.test(key)) portraitDefaults[base] = url;
}
const variables = JSON.parse(contents(audioPage));
const mediaReport = JSON.parse(await readFile(path.join(output, 'media-sync-report.json'), 'utf8').catch(() => '{"resolved":[],"unresolved":[]}'));
const verifiedMedia = new Map(mediaReport.resolved.map(item => [`${item.type}:${item.key}`, item.url]));
const localMedia = JSON.parse(await readFile(path.join(output, 'media/local-index.json'), 'utf8').catch(() => '{"entries":{},"references":{}}'));
function mediaEntry(type, key, url) {
  const entry = localMedia.entries[localMedia.references?.[`${type}:${key}`] || url];
  if (entry && /^media\/(audio|videos)\/[a-f0-9]{64}\.(mp3|mp4)$/.test(entry.path) && existsSync(path.join(output, entry.path))) return { ...entry, path: `../${entry.path}` };
  return url ? { url } : null;
}
if (Object.keys(images).length < 100 || Object.keys(variables).length < 100) throw new Error('Incomplete PRTS resource maps');

const catalog = [];
const failures = [];
const missingMedia = new Set();
for (let offset = 0; offset < pages.length; offset += 50) {
  const batch = pages.slice(offset, offset + 50);
  const revisions = incremental ? await request({ action: 'query', prop: 'revisions', rvprop: 'ids', pageids: batch.map(page => page.pageid).join('|') }) : null;
  const revisionIds = new Map((revisions?.query?.pages || []).map(page => [page.pageid, page.revisions?.[0]?.revid]));
  const dependencyTitles = batch.map(page => syncState.pages[page.pageid]?.dependencyTitle).filter(Boolean);
  const dependencies = incremental && dependencyTitles.length ? await request({ action: 'query', prop: 'revisions', rvprop: 'ids', titles: dependencyTitles.join('|') }) : null;
  const dependencyIds = new Map((dependencies?.query?.pages || []).map(page => [page.title, page.revisions?.[0]?.revid]));
  const changed = batch.filter(page => {
    const saved = syncState.pages[page.pageid];
    const id = page.title === 'W2G/BEG' ? 'w2g-beg' : `prts-${page.pageid}`;
    if (!incremental || !saved || !revisionIds.get(page.pageid) || saved.revision !== revisionIds.get(page.pageid) || saved.title !== page.title) return true;
    if (saved.dependencyTitle && saved.dependencyRevision !== dependencyIds.get(saved.dependencyTitle)) return true;
    return !previousRows.get(id)?.available || !existsSync(path.join(output, id, 'script.txt')) || !existsSync(path.join(output, id, 'manifest.json'));
  });
  const response = changed.length ? await request({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', pageids: changed.map(page => page.pageid).join('|') }) : { query: { pages: [] } };
  fetchedScripts += changed.length;
  const fetched = new Map(response.query.pages.map((page) => [page.pageid, page]));
  for (const item of batch) {
    const page = fetched.get(item.pageid);
    const id = item.title === 'W2G/BEG' ? 'w2g-beg' : `prts-${item.pageid}`;
    if (!page && !changed.some(candidate => candidate.pageid === item.pageid)) {
      catalog.push(previousRows.get(id)); reusedScripts++;
      continue;
    }
    let raw = contents(page || {});
    const group = field(raw, '剧情分组') || '其他剧情';
    const category = /^(唤醒测试|收束测试)\//.test(item.title) ? '内测剧情' : field(raw, '剧情类型') || '其他';
    const title = item.title === 'W2G/BEG' ? '序章·上 · 初始引导' : item.title === 'G2H/END' ? '序章·下' : item.title.replace(/\/BEG$/, ' 行动前').replace(/\/END$/, ' 行动后').replace(/\/NBT$/, '');
    const row = { id, title, page: item.title, group, category, scriptPath: field(raw, '文本路径'), sourcePage: sourcePage(item.title) };
    try {
      let dependencyTitle, dependencyRevision;
      if (raw.includes('{{:{{PAGENAME}}/data}}')) {
        dependencyTitle = `${item.title}/data`;
        const dataPage = await request({ action: 'query', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: dependencyTitle });
        dependencyRevision = dataPage.query.pages[0]?.revisions?.[0]?.revid;
        raw = raw.replace('{{:{{PAGENAME}}/data}}', contents(dataPage.query.pages[0]));
      }
      const script = extractStoryText(raw);
      const resources = collectStoryResources(script, variables);
      const assets = {};
      const audio = {};
      const videos = {};
      for (const image of resources.images) {
        const key = image.toLowerCase();
        const url = images[key] || images[`bg_${key}`] || portraitDefaults[key] || images[`${key}_1`];
        if (url) assets[image] = { url };
        else missingMedia.add(`image:${image}`);
      }
      for (const key of resources.audio) {
        try {
          const local = mediaEntry('audio', key);
          audio[key] = local || mediaEntry('audio', key, verifiedMedia.get(`audio:${key}`) || audioUrl(key, variables));
        }
        catch { missingMedia.add(`audio:${key}`); }
      }
      for (const video of resources.videos) {
        try {
          const entry = mediaEntry('videos', video, verifiedMedia.get(`videos:${video}`));
          if (!entry) { missingMedia.add(`video:${video}`); continue; }
          videos[video] = entry;
        }
        catch { missingMedia.add(`video:${video}`); }
      }
      const firstVisual = resources.commands.find((command) => ['background', 'image', 'imagetween'].includes(command.kind) && assets[command.attributes.image])?.attributes.image || Object.keys(assets)[0] || null;
      row.cover = selectStoryCover(assets, firstVisual);
      row.available = true;
      const folder = path.join(output, id);
      const existing = JSON.parse(await readFile(path.join(folder, 'manifest.json'), 'utf8').catch(() => '{}'));
      // Preserve locally downloaded images and the registered tutorial's media.
      for (const type of ['assets', 'audio', 'videos']) {
        const entries = { assets, audio, videos }[type];
        const needed = new Set(type === 'assets' ? resources.images : resources[type]);
        for (const [key, entry] of Object.entries(existing[type] || {})) {
          if (needed.has(key) && entry.path && existsSync(path.resolve(folder, entry.path))) entries[key] = entry;
        }
      }
      await mkdir(folder, { recursive: true });
      await saveChanged(path.join(folder, 'script.txt'), script);
      await saveChanged(path.join(folder, 'manifest.json'), `${JSON.stringify({ ...existing, schemaVersion: 3, storyId: item.title, title, sourcePage: row.sourcePage, script: { ...existing.script, path: 'script.txt', sourceUrl: row.sourcePage, bytes: Buffer.byteLength(script), sha256: createHash('sha256').update(script).digest('hex') }, commandCount: resources.commands.length, firstVisual, assets, audio, videos, mediaMode: 'local-preferred' })}\n`);
      syncState.pages[item.pageid] = { title: item.title, revision: page?.revisions?.[0]?.revid, ...(dependencyTitle ? { dependencyTitle, dependencyRevision } : {}) };
    } catch (error) {
      row.available = false;
      failures.push({ page: item.title, reason: error.message });
    }
    catalog.push(!row.available && previousRows.get(id)?.available ? previousRows.get(id) : classifyStory(row));
  }
  console.log(`Synced ${Math.min(offset + 50, pages.length)} / ${pages.length}`);
}

const groupOrder = new Map();
for (const row of catalog) if (!groupOrder.has(row.group)) groupOrder.set(row.group, groupOrder.size);
const categoryOrder = (value) => storyCategories.findIndex(category => category.id === value);
const phaseOrder = (page) => /\/END(?:\/|$)/.test(page) ? 1 : 0;
catalog.sort((a, b) => categoryOrder(a.archiveCategory) - categoryOrder(b.archiveCategory) || (a.archiveCategory === 'main' ? a.chapterNumber - b.chapterNumber : 0) || groupOrder.get(a.group) - groupOrder.get(b.group) || a.page.split('/')[0].localeCompare(b.page.split('/')[0], 'zh-CN', { numeric: true }) || phaseOrder(a.page) - phaseOrder(b.page));
// Start on the familiar tutorial rather than an arbitrary special-story page.
const tutorial = catalog.findIndex((row) => row.id === 'w2g-beg');
if (tutorial > 0) catalog.unshift(...catalog.splice(tutorial, 1));
await saveChanged(path.join(output, 'prts-variables.json'), `${JSON.stringify(variables)}\n`);
await saveChanged(path.join(output, 'catalog.json'), `${JSON.stringify(fillStoryCoverFallbacks(catalog), null, 2)}\n`);
await saveChanged(path.join(output, 'sync-state.json'), `${JSON.stringify(syncState, null, 2)}\n`);
await writeFile(path.join(output, 'sync-report.json'), `${JSON.stringify({ syncedAt: new Date().toISOString(), source: apiRoot, mode: incremental ? 'incremental' : 'full', discovered: pages.length, fetchedScripts, reusedScripts, changedFiles, playable: catalog.filter((row) => row.available).length, failures, missingMedia: [...missingMedia] }, null, 2)}\n`);
console.log(`Finished: ${catalog.length - failures.length} playable stories; ${failures.length} unavailable scripts; ${missingMedia.size} unresolved media IDs (see sync-report.json)`);
if (failures.length) process.exitCode = 1;

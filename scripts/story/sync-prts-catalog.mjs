#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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
const exec = promisify(execFile);
const apiRoot = 'https://prts.wiki/api.php';
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });

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
if (Object.keys(images).length < 100 || Object.keys(variables).length < 100) throw new Error('Incomplete PRTS resource maps');

const catalog = [];
const failures = [];
const missingMedia = new Set();
for (let offset = 0; offset < pages.length; offset += 50) {
  const batch = pages.slice(offset, offset + 50);
  const response = await request({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', pageids: batch.map((page) => page.pageid).join('|') });
  const fetched = new Map(response.query.pages.map((page) => [page.pageid, page]));
  for (const item of batch) {
    const page = fetched.get(item.pageid);
    let raw = contents(page || {});
    const id = item.title === 'W2G/BEG' ? 'w2g-beg' : `prts-${item.pageid}`;
    const group = field(raw, '剧情分组') || '其他剧情';
    const category = /^(唤醒测试|收束测试)\//.test(item.title) ? '内测剧情' : field(raw, '剧情类型') || '其他';
    const title = item.title === 'W2G/BEG' ? '序章·上 · 初始引导' : item.title === 'G2H/END' ? '序章·下' : item.title.replace(/\/BEG$/, ' 行动前').replace(/\/END$/, ' 行动后').replace(/\/NBT$/, '');
    const row = { id, title, page: item.title, group, category, scriptPath: field(raw, '文本路径'), sourcePage: sourcePage(item.title) };
    try {
      if (raw.includes('{{:{{PAGENAME}}/data}}')) {
        const dataPage = await request({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', titles: `${item.title}/data` });
        raw = raw.replace('{{:{{PAGENAME}}/data}}', contents(dataPage.query.pages[0]));
      }
      const script = extractStoryText(raw);
      const resources = collectStoryResources(script, variables);
      const assets = {};
      const audio = {};
      for (const image of resources.images) {
        const key = image.toLowerCase();
        const url = images[key] || images[`bg_${key}`] || portraitDefaults[key] || images[`${key}_1`];
        if (url) assets[image] = { url };
        else missingMedia.add(`image:${image}`);
      }
      for (const key of resources.audio) {
        try { audio[key] = { url: audioUrl(key, variables) }; }
        catch { missingMedia.add(`audio:${key}`); }
      }
      for (const video of resources.videos) missingMedia.add(`video:${video}`);
      const firstVisual = resources.commands.find((command) => ['background', 'image', 'imagetween'].includes(command.kind) && assets[command.attributes.image])?.attributes.image || Object.keys(assets)[0] || null;
      row.cover = selectStoryCover(assets, firstVisual);
      row.available = true;
      const folder = path.join(output, id);
      // Keep the fully downloaded tutorial snapshot and its original source metadata.
      const existing = id === 'w2g-beg' && await readFile(path.join(folder, 'manifest.json'), 'utf8').catch(() => null);
      if (!existing) {
        await mkdir(folder, { recursive: true });
        await writeFile(path.join(folder, 'script.txt'), script);
        await writeFile(path.join(folder, 'manifest.json'), `${JSON.stringify({ schemaVersion: 3, storyId: item.title, title, sourcePage: row.sourcePage, script: { path: 'script.txt', sourceUrl: row.sourcePage }, commandCount: resources.commands.length, firstVisual, assets, audio, videos: {}, mediaMode: 'remote' })}\n`);
      }
    } catch (error) {
      row.available = false;
      failures.push({ page: item.title, reason: error.message });
    }
    catalog.push(classifyStory(row));
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
await writeFile(path.join(output, 'prts-variables.json'), `${JSON.stringify(variables)}\n`);
await writeFile(path.join(output, 'catalog.json'), `${JSON.stringify(fillStoryCoverFallbacks(catalog), null, 2)}\n`);
await writeFile(path.join(output, 'sync-report.json'), `${JSON.stringify({ syncedAt: new Date().toISOString(), source: apiRoot, discovered: pages.length, playable: catalog.filter((row) => row.available).length, failures, missingMedia: [...missingMedia] }, null, 2)}\n`);
console.log(`Finished: ${catalog.length - failures.length} playable stories; ${failures.length} unavailable scripts; ${missingMedia.size} unresolved media IDs (see sync-report.json)`);
if (failures.length) process.exitCode = 1;

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import OpenCC from 'opencc-js';

const root = new URL('../../', import.meta.url);
const exec = promisify(execFile);
const offline = process.argv.includes('--offline');
const refresh = process.argv.includes('--refresh');
if (offline && refresh) throw new Error('--offline and --refresh cannot be combined');
for (const arg of process.argv.slice(2)) if (!['--offline', '--refresh'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
const read = file => readFile(new URL(file, root), 'utf8');
const json = async file => JSON.parse(await read(file));
async function save(file, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  if (await read(file).catch(() => null) !== text) await writeFile(new URL(file, root), text);
}
const hash = text => createHash('sha256').update(text).digest('hex');
const blobHash = text => createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
async function download(url) {
  const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', [
    '--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '45', url,
  ], { maxBuffer: 40 * 1024 * 1024, timeout: 150000, encoding: 'utf8' });
  return stdout;
}
await mkdir(new URL('tmp/story-summaries/blobs/', root), { recursive: true });
await mkdir(new URL('public/story/summaries/', root), { recursive: true });
async function snapshot(repo, branch, name, folders) {
  const file = `tmp/story-summaries/${name}.json`;
  if (!refresh) {
    const cached = await json(file).catch(() => null);
    if (cached) return cached;
  }
  if (offline) throw new Error(`Missing summary source cache: ${file}`);
  const ref = JSON.parse(await download(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`));
  const commit = ref.object.sha;
  const tree = JSON.parse(await download(`https://api.github.com/repos/${repo}/git/trees/${commit}?recursive=1`));
  if (tree.truncated || !Array.isArray(tree.tree)) throw new Error(`Incomplete source tree: ${repo}`);
  const reviews = {};
  for (const folder of folders) reviews[folder] = JSON.parse(await download(`https://raw.githubusercontent.com/${repo}/${commit}/${folder}/gamedata/excel/story_review_table.json`));
  const data = { repo, commit, files: tree.tree.filter(entry => entry.type === 'blob' && entry.path.includes('/gamedata/story/[uc]info/')), reviews };
  if (!data.files.length) throw new Error(`No summary files in ${repo}`);
  await save(file, data);
  return data;
}
const catalog = await json('public/story/catalog.json');
const savedPaths = await json('scripts/story/localization-paths.json').catch(() => ({}));
const cn = await snapshot('Kengxxiao/ArknightsGameData', 'master', 'cn', ['zh_CN']);
const global = await snapshot('Kengxxiao/ArknightsGameData_YoStar', 'main', 'global', ['en_US', 'ja_JP', 'ko_KR']);
const sources = { 'zh-CN': [cn, 'zh_CN'], en: [global, 'en_US'], ja: [global, 'ja_JP'], ko: [global, 'ko_KR'] };
const index = { schemaVersion: 1, provider: 'game-story-info', locales: {} };
const report = { schemaVersion: 1, totalStories: catalog.length, sources: { cn: cn.commit, global: global.commit }, locales: {} };
let completed = 0;
for (const [locale, [source, folder]] of Object.entries(sources)) {
  const files = new Map(source.files.map(entry => [entry.path.toLowerCase(), entry]));
  const segments = new Map(Object.values(source.reviews[folder]).flatMap(group => group.infoUnlockDatas || []).filter(story => story.storyTxt).map(story => [story.storyTxt.toLowerCase().replace(/\.txt$/, ''), story]));
  const previous = await json(`public/story/summaries/${locale}.json`).catch(() => ({ stories: {} }));
  const stories = {};
  const stats = report.locales[locale] = { imported: 0, reused: 0, preserved: 0, missing: [], failed: [], categories: {} };
  const queue = [...catalog];
  await Promise.all(Array.from({ length: 12 }, async () => {
    while (queue.length) {
      const story = queue.shift();
      const scriptPath = (story.scriptPath || savedPaths[story.id] || '').toLowerCase().replace(/\.txt$/, '');
      const segment = segments.get(scriptPath);
      const candidates = [...new Set([segment?.storyInfo?.replace(/^info\//i, '[uc]info/'), scriptPath && `[uc]info/${scriptPath}`].filter(Boolean))];
      const entry = candidates.map(path => files.get(`${folder}/gamedata/story/${path.replace(/\.txt$/, '')}.txt`.toLowerCase())).find(Boolean);
      const category = stats.categories[story.archiveCategory] ||= { total: 0, imported: 0 };
      category.total++;
      if (!entry) {
        stats.missing.push({ id: story.id, title: story.title, category: story.archiveCategory, scriptPath, reason: scriptPath ? 'no-upstream-summary' : 'missing-script-path' });
        continue;
      }
      try {
        const sourceUrl = `https://raw.githubusercontent.com/${source.repo}/${source.commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
        let raw = await read(`tmp/story-summaries/blobs/${entry.sha}.txt`).catch(() => null);
        if (raw !== null && blobHash(raw) !== entry.sha) raw = null;
        if (raw === null && previous.stories[story.id]?.blob === entry.sha) {
          const old = previous.stories[story.id].text;
          if (typeof old === 'string' && blobHash(old) === entry.sha) raw = old;
        }
        const reused = raw !== null;
        if (raw === null) {
          if (offline) throw new Error('Summary not cached');
          raw = await download(sourceUrl);
        }
        if (blobHash(raw) !== entry.sha) throw new Error('Summary Git blob checksum mismatch');
        if (!raw.trim() || /^\s*(?:<!doctype html|<html)/i.test(raw)) throw new Error('Empty or invalid summary');
        await writeFile(new URL(`tmp/story-summaries/blobs/${entry.sha}.txt`, root), raw);
        stories[story.id] = { text: raw, blob: entry.sha, sha256: hash(raw), source: sourceUrl };
        stats.imported++; category.imported++;
        if (reused) stats.reused++;
      } catch (error) {
        const old = previous.stories[story.id];
        if (old && typeof old.text === 'string' && hash(old.text) === old.sha256) {
          stories[story.id] = old;
          stats.imported++; category.imported++; stats.preserved++;
        }
        stats.failed.push({ id: story.id, title: story.title, error: error.message.slice(0, 300) });
      }
      completed++;
      if (completed % 100 === 0) console.log(`Summaries: ${completed} processed (${locale})`);
    }
  }));
  const sorted = Object.fromEntries(Object.entries(stories).sort(([a], [b]) => a.localeCompare(b)));
  await save(`public/story/summaries/${locale}.json`, { schemaVersion: 1, locale, sourceCommit: source.commit, stories: sorted });
  index.locales[locale] = { path: `summaries/${locale}.json`, count: stats.imported, sourceCommit: source.commit };
  for (const key of ['missing', 'failed']) stats[key].sort((a, b) => a.id.localeCompare(b.id));
  await save('public/story/summaries/report.json', report);
  console.log(`${locale}: ${stats.imported} imported; ${stats.missing.length} unavailable; ${stats.failed.length} failed`);
}
// Traditional Chinese is converted from the original CN text, not a Taiwan-server localization.
const toTraditional = OpenCC.Converter({ from: 'cn', to: 'twp' });
const original = await json('public/story/summaries/zh-CN.json');
const traditional = Object.fromEntries(Object.entries(original.stories).map(([id, entry]) => {
  const text = toTraditional(entry.text);
  return [id, { ...entry, text, sha256: hash(text), derivedFrom: 'zh-CN', conversion: 'opencc-cn-twp' }];
}));
await save('public/story/summaries/zh-TW.json', { schemaVersion: 1, locale: 'zh-TW', sourceLocale: 'zh-CN', sourceCommit: cn.commit, stories: traditional });
index.locales['zh-TW'] = { path: 'summaries/zh-TW.json', count: Object.keys(traditional).length, sourceLocale: 'zh-CN', conversion: 'opencc-cn-twp', sourceCommit: cn.commit };
await save('public/story/summaries/index.json', index);
await save('public/story/summaries/report.json', report);
if (Object.values(report.locales).some(stats => stats.failed.length)) process.exitCode = 1;

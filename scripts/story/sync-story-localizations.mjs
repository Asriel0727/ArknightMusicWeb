import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseStoryScript } from '../../src/utils/storyScript.js';

const exec = promisify(execFile);
const root = new URL('../../', import.meta.url);
const read = async file => readFile(new URL(file, root), 'utf8');
const json = async file => JSON.parse(await read(file));
const saveText = async (file, text) => {
  if (await read(file).catch(() => null) !== text) await writeFile(new URL(file, root), text);
};
const save = async (file, data) => saveText(file, JSON.stringify(data, null, 2) + '\n');
const hash = text => createHash('sha256').update(text).digest('hex');
const offline = process.argv.includes('--offline');
const locales = { en: 'en_US', ja: 'ja_JP', ko: 'ko_KR' };
const repo = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/';
await mkdir(new URL('tmp/story-research/', root), { recursive: true });
async function sourceJson(file, url) {
  if (!process.argv.includes('--refresh')) {
    const cached = await json(file).catch(() => null);
    if (cached) return cached;
  }
  if (offline) throw new Error(`Missing cached source: ${file}`);
  const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '60', url], { maxBuffer: 30 * 1024 * 1024 });
  const data = JSON.parse(stdout);
  await save(file, data);
  return data;
}
if (offline && process.argv.includes('--refresh')) throw new Error('--offline and --refresh cannot be combined');
const tree = await sourceJson('tmp/story-research/yostar-tree.json', 'https://api.github.com/repos/Kengxxiao/ArknightsGameData_YoStar/git/trees/main?recursive=1');
if (tree.truncated) throw new Error('Incomplete upstream tree');
const files = new Map(tree.tree.filter(entry => entry.type === 'blob').map(entry => [entry.path, entry]));
const paths = new Map();
const savedPaths = await json('scripts/story/localization-paths.json').catch(() => ({}));
for (const file of await readdir(new URL('tmp/prts-stories/', root)).catch(() => [])) {
  const data = await json(`tmp/prts-stories/${file}`);
  for (const page of data.query?.pages || []) {
    const text = page.revisions?.[0]?.slots?.main?.content || '';
    const match = text.match(/\|\s*文本路径\s*=\s*([^|\n}]+)/);
    if (match) paths.set(page.title, match[1].trim());
  }
}
await mkdir(new URL('tmp/story-localizations/', root), { recursive: true });
await mkdir(new URL('public/story/localizations/', root), { recursive: true });
async function download(entry) {
  const cacheFile = `tmp/story-localizations/${entry.sha}.txt`;
  let text = await read(cacheFile).catch(() => null);
  if (text === null) {
    if (offline) throw new Error('Not cached');
    const url = repo + entry.path.split('/').map(encodeURIComponent).join('/');
    const result = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '40', url], { maxBuffer: 10 * 1024 * 1024 });
    text = result.stdout;
  }
  const blobHash = createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0`).update(text).digest('hex');
  if (blobHash !== entry.sha) throw new Error('Upstream changed; refresh tree before retrying');
  await writeFile(new URL(cacheFile, root), text);
  return text;
}
function assets(commands) {
  const result = new Set();
  for (const { kind, attributes: a } of commands) {
    const keys = kind === 'character' ? ['name', 'name2', 'name3'] : ['background', 'image'].includes(kind) ? ['image'] : ['playmusic', 'playsound'].includes(kind) ? ['key', 'intro'] : [];
    for (const key of keys) if (a[key]) result.add(a[key].split('#')[0]);
  }
  return result;
}
const catalog = await json('public/story/catalog.json');
const previousIndex = await json('public/story/localizations/index.json').catch(() => ({ locales: {} }));
for (const story of catalog) if (!paths.has(story.page) && savedPaths[story.id]) paths.set(story.page, savedPaths[story.id]);
await save('scripts/story/localization-paths.json', Object.fromEntries(catalog.map(story => [story.id, story.scriptPath || paths.get(story.page)]).filter(([, value]) => value)));
const sourceReview = await sourceJson('tmp/story-research/game-story-review.json', 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/story_review_table.json');
const sourceSegments = new Map(Object.values(sourceReview).flatMap(group => group.infoUnlockDatas || []).filter(story => story.storyTxt).map(story => [story.storyTxt.toLowerCase(), story]));
const titles = await json('public/story/localizations/titles.json').catch(() => ({}));
const index = { schemaVersion: 1, provider: 'game-localization', source: 'https://github.com/Kengxxiao/ArknightsGameData_YoStar', tree: tree.sha, locales: { ...previousIndex.locales } };
const previousReport = await json('public/story/localizations/report.json').catch(() => ({ locales: {} }));
const report = { totalStories: catalog.length, locales: { ...previousReport.locales } };
for (const [locale, folder] of Object.entries(locales)) {
  const review = await sourceJson(`tmp/story-research/review-${folder}.json`, `${repo}${folder}/gamedata/excel/story_review_table.json`);
  const segments = new Map(Object.values(review).flatMap(group => group.infoUnlockDatas || []).filter(story => story.storyTxt).map(story => [story.storyTxt.toLowerCase(), story]));
  const titleMap = titles[locale] = {};
  for (const [id, group] of Object.entries(sourceReview)) {
    if (review[id]?.name && group.name) titleMap[group.name] = review[id].name;
  }
  for (const story of catalog) {
    const scriptPath = (story.scriptPath || paths.get(story.page) || '').toLowerCase();
    const segment = segments.get(scriptPath);
    const sourceSegment = sourceSegments.get(scriptPath);
    if (segment?.storyName) {
      titleMap[story.title] = [segment.storyCode, segment.storyName, segment.avgTag].filter(Boolean).join(' · ');
      if (sourceSegment?.storyName) titleMap[sourceSegment.storyName] = segment.storyName;
    }
  }
  await mkdir(new URL(`public/story/localizations/${locale}/`, root), { recursive: true });
  const entries = index.locales[locale] = {};
  const stats = report.locales[locale] = { imported: 0, reused: 0, missing: [], failed: [], incompatibleAssets: [] };
  const queue = [...catalog];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const story = queue.shift();
      const scriptPath = story.scriptPath || paths.get(story.page);
      const entry = scriptPath && files.get(`${folder}/gamedata/story/${scriptPath.replace(/\.txt$/, '')}.txt`);
      if (!entry) { stats.missing.push({ id: story.id, page: story.page, scriptPath }); continue; }
      try {
        const original = await read(`public/story/${story.id}/script.txt`);
        const previous = previousIndex.locales[locale]?.[story.id];
        const localPath = `public/story/localizations/${locale}/${story.id}.txt`;
        const localText = previous && await read(localPath).catch(() => null);
        if (previous?.blob === entry.sha && previous.sourceHash === hash(original) && localText !== null && hash(localText) === previous.translationHash) {
          entries[story.id] = previous;
          stats.imported++; stats.reused++;
          continue;
        }
        const translated = previous?.blob === entry.sha && localText !== null && hash(localText) === previous.translationHash ? localText : await download(entry);
        const parsed = parseStoryScript(translated);
        if (!parsed.some(command => (command.kind === 'dialogue' && command.text) || ['video', 'playvideo'].includes(command.kind))) throw new Error('Empty translated script');
        const originalAssets = assets(parseStoryScript(original));
        const unknown = [...assets(parsed)].filter(asset => !originalAssets.has(asset));
        if (unknown.length) { stats.incompatibleAssets.push({ id: story.id, page: story.page, assets: unknown }); continue; }
        await saveText(localPath, translated);
        entries[story.id] = { sourceHash: hash(original), translationHash: hash(translated), blob: entry.sha, source: repo + entry.path, path: `localizations/${locale}/${story.id}.txt` };
        stats.imported++;
        if (stats.imported % 100 === 0) console.log(`${locale}: ${stats.imported} imported`);
      } catch (error) { stats.failed.push({ id: story.id, error: error.message.slice(0, 200) }); }
    }
  }));
  // Parallel workers may finish in a different order; keep unchanged snapshots stable.
  index.locales[locale] = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  for (const key of ['missing', 'failed', 'incompatibleAssets']) stats[key].sort((a, b) => a.id.localeCompare(b.id));
  console.log(`${locale}: ${stats.imported} imported; ${stats.missing.length} unavailable; ${stats.incompatibleAssets.length} asset mismatches; ${stats.failed.length} failed`);
  await save('public/story/localizations/index.json', index);
  await save('public/story/localizations/report.json', report);
  await save('public/story/localizations/titles.json', titles);
}
if (Object.values(report.locales).some(stats => stats.failed.length)) process.exitCode = 1;

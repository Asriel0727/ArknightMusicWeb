import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = path.join(root, 'tmp/story-research');
const offline = process.argv.includes('--offline');
const exec = promisify(execFile);
await mkdir(cache, { recursive: true });
async function source(file, url) {
  if (!offline) {
    const { stdout } = await exec(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '60', url], { maxBuffer: 30 * 1024 * 1024 });
    JSON.parse(stdout);
    await writeFile(path.join(cache, file), stdout);
  }
  return JSON.parse(await readFile(path.join(cache, file), 'utf8'));
}
const review = await source('game-story-review.json', 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/story_review_table.json');
const score = await source('prts-score.json', `https://prts.wiki/api.php?${new URLSearchParams({ action: 'query', prop: 'revisions', rvprop: 'content', rvslots: 'main', format: 'json', formatversion: '2', titles: '关卡一览/曲谱' })}`);
const raw = score.query.pages[0].revisions[0].slots.main.content;
const lines = [...raw.matchAll(/\{\{\/概览\|([^|]+)\|([^|]+)\|/g)].map(match => ({ id: match[1], name: match[2], groups: [], route: [] }));
if (lines.length < 10 || !lines.some(line => line.id === 'MS')) throw new Error('Incomplete PRTS story line data; preserving existing metadata');
const groupLines = {};
for (const block of raw.split('{{/乐章').slice(1)) {
  const name = block.match(/\|名称=([^\n|]+)/)?.[1]?.trim();
  const lineName = block.match(/\|乐章=([^\n|]+)/)?.[1]?.trim();
  const line = lines.find(line => line.name === lineName);
  if (name && line) { groupLines[name] = { id: line.id, name: line.name, order: line.groups.length }; line.groups.push(name); }
}
// Keep the actual intersections as well as event names: the route gives readers
// context about chapters in other story lines without duplicating their stories.
for (const line of lines) {
  if (line.id === 'MS') continue;
  const section = raw.split(`==${line.name}==`)[1]?.split(/\n==[^=]/)[0] || '';
  line.route = [];
  for (const match of section.matchAll(/\{\{\/(乐章|交点)(?=\s|\|)/g)) {
    // Read the complete template, including nested style templates. The 流入
    // flag distinguishes a prerequisite from a follow-up intersection.
    let depth = 1, end = match.index + 2;
    for (; end < section.length && depth; end++) {
      if (section.slice(end, end + 2) === '{{') { depth++; end++; }
      else if (section.slice(end, end + 2) === '}}') { depth--; end++; }
    }
    const block = section.slice(match.index, end);
    const group = block.match(/\|名称=([^\n|]+)/)?.[1]?.trim();
    if (group) line.route.push({ group, intersection: match[1] === '交点', relation: match[1] === '乐章' ? 'story' : /\|流入=1/.test(block) ? 'prerequisite' : 'followup' });
  }
}
const chapterNames = Object.values(review).filter(group => /^main_\d+$/.test(group.id)).sort((a, b) => Number(a.id.split('_')[1]) - Number(b.id.split('_')[1])).map(group => group.name);
const mainLine = lines.find(line => line.id === 'MS');
mainLine.groups = chapterNames;
mainLine.route = chapterNames.map(group => ({ group, intersection: false }));
const overview = raw.split('==主题曲 为了明日==')[1]?.split('==方舟==')[0] || '';
const mainRoute = [...overview.matchAll(/\[\[关卡一览\/主题曲#EP(\d+)\||\[\[#([^|\]]+)\|/g)].map(match => ({ group: match[1] ? chapterNames[Number(match[1])] : match[2], intersection: !match[1] })).filter(node => node.group);
if (mainRoute.length >= chapterNames.length) mainLine.route = mainRoute.filter((node, index) => mainRoute.findIndex(other => other.group === node.group) === index);
const byPath = new Map();
const groupDates = {};
for (const group of Object.values(review)) {
  if (group.startTime > 0) groupDates[group.name] = group.startTime;
  for (const story of group.infoUnlockDatas || []) {
    if (story.storyTxt) byPath.set(story.storyTxt.toLowerCase(), { order: story.storySort, code: story.storyCode, name: story.storyName });
  }
}
const catalog = JSON.parse(await readFile(path.join(root, 'public/story/catalog.json'), 'utf8'));
const rawPaths = new Map();
// Older snapshots did not persist 文本路径. Read only the cached revision metadata.
for (const file of await readdir(path.join(root, 'tmp/prts-stories')).catch(() => [])) {
  const result = JSON.parse(await readFile(path.join(root, 'tmp/prts-stories', file), 'utf8'));
  for (const page of result.query?.pages || []) {
    const content = page.revisions?.[0]?.slots?.main?.content || '';
    const scriptPath = content.match(/\|\s*文本路径\s*=\s*([^|\n}]+)/)?.[1]?.trim();
    if (scriptPath) rawPaths.set(page.title, scriptPath);
  }
}
const stories = {};
for (const story of catalog) {
  const scriptPath = story.scriptPath || rawPaths.get(story.page);
  const entry = scriptPath && byPath.get(scriptPath.toLowerCase());
  if (entry) stories[story.page] = entry;
}
await writeFile(path.join(root, 'public/story/archive-metadata.json'), `${JSON.stringify({ source: 'https://prts.wiki/w/关卡一览/曲谱', orderSource: 'https://github.com/Kengxxiao/ArknightsGameData', lines, groups: groupLines, dates: groupDates, stories }, null, 2)}\n`);
console.log(`Archive metadata: ${lines.length} story lines; ${Object.keys(groupLines).length} events; ${Object.keys(stories).length} ordered segments`);

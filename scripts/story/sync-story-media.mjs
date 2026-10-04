#!/usr/bin/env node
// Import verified media URLs without rewriting scripts, translations, covers or reading metadata.
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectStoryResources, audioUrl, videoUrl } from './storyResources.mjs';

const exec = promisify(execFile);
const root = new URL('../../public/story/', import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, root), 'utf8'));
const variables = await read('prts-variables.json');
const catalog = await read('catalog.json');
const all = process.argv.includes('--all');
const previous = await read('media-sync-report.json').catch(() => ({ resolved: [], unresolved: [] }));
const retry = process.argv.includes('--retry-unresolved');
const previousResolved = new Map(previous.resolved.map(item => [`${item.type}:${item.key}`, item]));
const jobs = new Map();
const manifests = [];
const unresolved = [];
for (const story of catalog.filter((row) => row.available)) {
  const manifest = await read(`${story.id}/manifest.json`);
  const source = await readFile(new URL(`${story.id}/${manifest.script.path}`, root), 'utf8');
  const resources = collectStoryResources(source, variables);
  manifests.push({ story, manifest, resources });
  for (const type of ['audio', 'videos']) for (const key of resources[type]) {
    const existing = manifest[type]?.[key];
    if (existing && (!all || existing.path)) continue;
    const id = `${type}:${key}`;
    if (jobs.has(id)) continue;
    if (retry && previousResolved.has(id)) continue;
    const candidates = [];
    try { candidates.push(type === 'audio' ? audioUrl(key, variables) : videoUrl(key, variables)); } catch {}
    // Old scripts occasionally use the filename instead of the dictionary alias.
    if (type === 'audio') {
      const basename = key.split('/').at(-1).replace(/\.(ogg|mp3)$/i, '').toLowerCase();
      const basenameAlias = Object.keys(variables).find(name => name.toLowerCase() === basename);
      if (basenameAlias) { try { candidates.push(audioUrl(basenameAlias, variables)); } catch {} }
      const matches = [...new Set(Object.values(variables).filter((value) => typeof value === 'string' && [basename, `m_${basename}`].includes(value.split('/').at(-1).toLowerCase())))];
      if (matches.length === 1) { try { candidates.push(audioUrl(matches[0], variables)); } catch {} }
    }
    jobs.set(id, { type, key, candidates: [...new Set(candidates)], entry: null, attempts: [] });
  }
}
let done = 0;
const queue = [...jobs.values()];
async function worker() {
  while (queue.length) {
    const job = queue.shift();
    for (const url of job.candidates) {
      try {
        const { stdout } = await exec('curl.exe', ['-4', '-sSIL', '-A', 'Mozilla/5.0', '-e', 'https://prts.wiki/', '--retry', '1', '--connect-timeout', '8', '--max-time', '25', url], { maxBuffer: 128 * 1024 });
        const blocks = stdout.trim().split(/\r?\n\r?\n/);
        const header = blocks.at(-1);
        job.attempts.push({ url, status: Number(header.match(/^HTTP\/\S+ (\d+)/m)?.[1]) || 0, contentType: header.match(/content-type:\s*([^\r\n]+)/i)?.[1] || '' });
        if (!/^HTTP\/\S+ 200\b/m.test(header) || !/content-type:\s*(?:audio\/|video\/|application\/octet-stream)/i.test(header)) continue;
        job.entry = { url };
        break;
      } catch { job.attempts.push({ url, status: 0, error: 'network-or-timeout' }); }
    }
    if (!job.entry) unresolved.push({ type: job.type, key: job.key, candidates: job.candidates, attempts: job.attempts });
    if (++done % 50 === 0) console.log(`Resolved media ${done}/${jobs.size}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
let addedAudio = 0, addedVideos = 0, changed = 0;
for (const { story, manifest, resources } of manifests) {
  let dirty = false;
  for (const type of ['audio', 'videos']) for (const key of resources[type]) {
    const entry = jobs.get(`${type}:${key}`)?.entry;
    if (!entry || manifest[type]?.[key]?.path || manifest[type]?.[key]?.url === entry.url) continue;
    manifest[type] ||= {};
    manifest[type][key] = entry;
    if (type === 'audio') addedAudio++; else addedVideos++;
    dirty = true;
  }
  if (dirty) { await writeFile(new URL(`${story.id}/manifest.json`, root), `${JSON.stringify(manifest)}\n`); changed++; }
}
for (const [id, job] of jobs) {
  previousResolved.delete(id);
  if (job.entry) previousResolved.set(id, { type: job.type, key: job.key, ...job.entry });
}
const remaining = [...previous.unresolved.filter(item => !jobs.has(`${item.type}:${item.key}`)), ...unresolved];
const unresolvedByReason = {};
for (const item of remaining) {
  const reason = !item.candidates.length ? 'no-mapping' : item.attempts?.some(attempt => attempt.status === 200) ? 'non-media-response' : item.attempts?.some(attempt => attempt.status === 0) ? 'network-or-timeout' : 'http-error';
  item.reason = reason;
  unresolvedByReason[reason] = (unresolvedByReason[reason] || 0) + 1;
}
const report = { importedAt: new Date().toISOString(), mode: 'verified-remote-streaming', stories: manifests.length, checked: jobs.size, changed, addedAudio, addedVideos, resolved: [...previousResolved.values()], unresolved: remaining, unresolvedByReason };
await writeFile(new URL('media-sync-report.json', root), `${JSON.stringify(report, null, 2)}\n`);
const catalogReport = await read('sync-report.json').catch(() => null);
if (catalogReport) {
  const recovered = new Set(report.resolved.map(item => `${item.type === 'videos' ? 'video' : item.type}:${item.key}`));
  catalogReport.missingMedia = catalogReport.missingMedia.filter(key => !recovered.has(key));
  catalogReport.mediaReport = 'media-sync-report.json';
  await writeFile(new URL('sync-report.json', root), `${JSON.stringify(catalogReport, null, 2)}\n`);
}
console.log(JSON.stringify({ ...report, resolved: report.resolved.length, unresolved: remaining.length }));
console.log(`Report: ${fileURLToPath(new URL('media-sync-report.json', root))}`);

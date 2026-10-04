import { createHash } from 'node:crypto';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { renameWithRetry, writeAtomic } from './atomic-file.mjs';
import { compressStoryVideo } from './compress-story-video.mjs';

const project = fileURLToPath(new URL('../../', import.meta.url));
const root = path.join(project, 'public/story');
const stateFile = path.join(root, 'custom-content-state.json');
const configFile = path.join(project, 'scripts/story/local-overrides.json');
const groups = ['assets', 'audio', 'videos'];
const globalFiles = { characters: 'character-index.json', variables: 'prts-variables.json' };
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  return value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
}
const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(sorted(value)) ?? 'undefined').digest('hex');
async function json(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
async function save(file, value) {
  const text = `${JSON.stringify(sorted(value))}\n`;
  const existing = await json(file, null);
  if (hash(existing) !== hash(value)) await writeAtomic(file, text);
}
function storyFolder(id) {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`Invalid custom story ID: ${id}`);
  return path.join(root, id);
}
async function currentStory(id) {
  const folder = storyFolder(id);
  const manifest = await json(path.join(folder, 'manifest.json'), null);
  if (!manifest) return { manifest: null, script: null };
  const file = path.resolve(folder, manifest.script?.path || 'script.txt');
  if (!file.startsWith(folder + path.sep)) throw new Error(`Script must stay inside its story directory: ${id}`);
  const script = await readFile(file, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  return { manifest, script };
}
function fingerprints(value) { return Object.fromEntries(Object.entries(value || {}).map(([key, entry]) => [key, hash(entry)])); }
function snapshot(row, manifest, script) {
  const fields = Object.fromEntries(Object.entries(manifest || {}).filter(([key]) => !groups.includes(key) && key !== 'script'));
  return { catalog: fingerprints(row), manifest: fingerprints(fields), resources: Object.fromEntries(groups.map(group => [group, fingerprints(manifest?.[group])])), script: fingerprints(Object.fromEntries(Object.entries(manifest?.script || {}).filter(([key]) => !['bytes', 'sha256'].includes(key)))), scriptHash: script === null ? null : hash(script) };
}
function detect(current, baseline, overrides) {
  for (const key of new Set([...Object.keys(current || {}), ...Object.keys(baseline || {})])) {
    if ((own(current || {}, key) ? hash(current[key]) : undefined) !== baseline?.[key]) overrides[key] = own(current || {}, key) ? current[key] : null;
  }
}
function mergeFields(value, patch) {
  const result = { ...value };
  for (const [key, entry] of Object.entries(patch || {})) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error(`Invalid override key: ${key}`);
    if (entry === null) delete result[key]; else result[key] = entry;
  }
  return result;
}
export async function loadCustomizations() {
  const config = await json(configFile, { schemaVersion: 1, stories: {}, allowUpstream: [] });
  const state = await json(stateFile, { schemaVersion: 1, baseline: {}, automatic: {} });
  if (config.schemaVersion !== 1 || state.schemaVersion !== 1) throw new Error('Unsupported story customization schema');
  state.baseline ||= {}; state.automatic ||= {};
  return { config, state, report: [], allowUpstream: new Set(config.allowUpstream || []) };
}
export async function initializeBaseline() {
  const context = await loadCustomizations();
  if (Object.keys(context.state.baseline).length) return;
  for (const row of await json(path.join(root, 'catalog.json'), [])) {
    const { manifest, script } = await currentStory(row.id);
    context.state.baseline[row.id] = snapshot(row, manifest, script);
  }
  context.state.globalBaseline = {};
  for (const [kind, file] of Object.entries(globalFiles)) context.state.globalBaseline[kind] = fingerprints(await json(path.join(root, file), {}));
  await save(stateFile, context.state);
}
export async function captureLocalChanges(context, catalog) {
  context.state.automaticGlobals ||= {};
  for (const [kind, file] of Object.entries(globalFiles)) detect(await json(path.join(root, file), {}), context.state.globalBaseline?.[kind], context.state.automaticGlobals[kind] ||= {});
  for (const row of catalog) {
    if (context.allowUpstream.has(row.id)) { delete context.state.automatic[row.id]; continue; }
    const { manifest, script } = await currentStory(row.id);
    const base = context.state.baseline[row.id];
    const patch = context.state.automatic[row.id] ||= { catalog: {}, manifest: {}, resources: {} };
    detect(row, base?.catalog, patch.catalog);
    if (manifest) {
      detect(Object.fromEntries(Object.entries(manifest).filter(([key]) => !groups.includes(key) && key !== 'script')), base?.manifest, patch.manifest);
      for (const group of groups) detect(manifest[group], base?.resources[group], patch.resources[group] ||= {});
      detect(Object.fromEntries(Object.entries(manifest.script || {}).filter(([key]) => !['bytes', 'sha256'].includes(key))), base?.script, patch.scriptMeta ||= {});
      if (script !== null && (!base || hash(script) !== base.scriptHash || own(patch.scriptMeta, 'path'))) patch.scriptText = script;
    }
    if (!Object.keys(patch.catalog).length && !Object.keys(patch.manifest).length && !Object.keys(patch.scriptMeta || {}).length && !Object.values(patch.resources).some(value => Object.keys(value).length) && !own(patch, 'scriptText')) delete context.state.automatic[row.id];
  }
  // Persist detected edits before any upstream request or generated write takes place.
  await save(stateFile, context.state);
}
export function protectGlobal(context, kind, value) {
  return mergeFields(value, { ...context.state.automaticGlobals?.[kind], ...context.config[kind] });
}
export function isProtectedMedia(context, id, group, key) {
  return own(context.state.automatic[id]?.resources?.[group] || {}, key) || own(context.config.stories?.[id]?.[group] || {}, key);
}
async function patches(context, id) {
  const automatic = context.state.automatic[id] || {};
  const explicit = context.config.stories?.[id] || {};
  let scriptText = automatic.scriptText;
  if (explicit.scriptFile) {
    const file = path.resolve(project, explicit.scriptFile);
    const allowed = path.join(project, 'scripts/story/custom-scripts') + path.sep;
    if (!file.startsWith(allowed)) throw new Error(`Custom scripts must be under scripts/story/custom-scripts/: ${id}`);
    scriptText = await readFile(file, 'utf8');
  }
  return { catalog: { ...automatic.catalog, ...explicit.catalog }, manifest: { ...automatic.manifest, ...explicit.manifest }, scriptMeta: automatic.scriptMeta || {}, resources: Object.fromEntries(groups.map(group => [group, { ...automatic.resources?.[group], ...explicit[group] }])), scriptText };
}
export async function protectScript(context, id, upstream) {
  const patch = await patches(context, id);
  if (patch.scriptText !== undefined && patch.scriptText !== upstream) {
    const directory = path.join(root, 'upstream-changes');
    await mkdir(directory, { recursive: true });
    const candidate = path.join(directory, `${id}.txt`);
    if (await readFile(candidate, 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; }) !== upstream) await writeAtomic(candidate, upstream);
    context.report.push({ id, type: 'script', action: 'kept-custom-script', incomingScript: `upstream-changes/${id}.txt`, upstreamSha256: hash(upstream), localSha256: hash(patch.scriptText) });
    return patch.scriptText;
  }
  return upstream;
}
export async function protectRow(context, row) {
  const result = mergeFields(row, (await patches(context, row.id)).catalog);
  return { ...result, id: row.id, page: result.page || row.id };
}
export async function protectManifest(context, id, manifest) {
  const patch = await patches(context, id);
  const result = mergeFields(manifest, patch.manifest);
  result.script = mergeFields(manifest.script, patch.scriptMeta);
  for (const group of groups) {
    result[group] = mergeFields(manifest[group], patch.resources[group]);
    // Keep checksums correct after the downloader has compressed a protected local file.
    for (const [key, entry] of Object.entries(result[group])) {
      if (!own(patch.resources[group], key) || !entry?.path) continue;
      const file = path.resolve(storyFolder(id), entry.path);
      if (!file.startsWith(root + path.sep)) throw new Error(`Custom media must stay under public/story/: ${id}/${key}`);
      let info = await stat(file);
      let conversion = entry.conversion || (manifest[group]?.[key]?.path === entry.path ? manifest[group][key].conversion : undefined);
      if (group === 'videos' && info.size > 95 * 1048576) {
        const source = { bytes: info.size, sha256: hash(await readFile(file)) };
        const compressed = await compressStoryVideo(file, source, 95 * 1048576);
        try {
          await renameWithRetry(compressed.file, file);
          conversion = compressed.conversion;
          info = await stat(file);
          context.report.push({ id, type: 'video', action: 'compressed-custom-media', key, bytesBefore: source.bytes, bytesAfter: info.size });
        } finally { await compressed.cleanup(); }
      }
      result[group][key] = { ...entry, bytes: info.size, sha256: hash(await readFile(file)), ...(conversion ? { conversion } : {}) };
    }
  }
  return result;
}
export async function finishCustomizations(context, { checkpoint = false } = {}) {
  const catalog = await json(path.join(root, 'catalog.json'), []);
  const ids = new Set(catalog.map(row => row.id));
  for (const [id, patch] of Object.entries(context.config.stories || {})) {
    if (!ids.has(id) && patch.catalog) { catalog.push({ ...patch.catalog, id }); ids.add(id); }
  }
  for (let i = 0; i < catalog.length; i++) {
    const row = catalog[i] = await protectRow(context, catalog[i]);
    const { manifest, script } = await currentStory(row.id);
    if (!manifest) { if (row.available) throw new Error(`Custom story has no manifest: ${row.id}`); continue; }
    const desired = await patches(context, row.id);
    const text = desired.scriptText ?? script;
    const next = await protectManifest(context, row.id, manifest);
    if (text !== null) {
      const file = path.resolve(storyFolder(row.id), next.script?.path || 'script.txt');
      if (!file.startsWith(storyFolder(row.id) + path.sep)) throw new Error(`Custom script must stay inside its story directory: ${row.id}`);
      if (text !== script) await writeAtomic(file, text);
      next.script = { ...next.script, bytes: Buffer.byteLength(text), sha256: hash(text) };
    }
    await save(path.join(storyFolder(row.id), 'manifest.json'), next);
    if (checkpoint) context.state.baseline[row.id] = snapshot(row, next, text);
  }
  await save(path.join(root, 'catalog.json'), catalog);
  context.state.globalBaseline ||= {};
  for (const [kind, file] of Object.entries(globalFiles)) {
    const value = protectGlobal(context, kind, await json(path.join(root, file), {}));
    await save(path.join(root, file), value);
    if (checkpoint) context.state.globalBaseline[kind] = fingerprints(value);
  }
  await save(stateFile, context.state);
  if (context.report.length) await save(path.join(root, 'custom-content-report.json'), { conflicts: context.report });
}

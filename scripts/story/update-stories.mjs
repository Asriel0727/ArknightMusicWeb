#!/usr/bin/env node
// One entry point for both manual updates and the daily GitHub workflow.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadCustomizations, protectGlobal } from './story-customizations.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run story:update [-- --retry-unresolved] [-- --max-file-mib=95]\nChecks fresh PRTS revisions; reuses unchanged scripts, translations and media.');
  process.exit(0);
}
for (const arg of args) {
  if (arg !== '--retry-unresolved' && !/^--max-file-mib=\d+(?:\.\d+)?$/.test(arg)) throw new Error(`Unknown option: ${arg}`);
}
const maxFileMiB = Number(args.find(arg => arg.startsWith('--max-file-mib='))?.split('=')[1] || 95);
if (maxFileMiB <= 0 || maxFileMiB > 512) throw new Error('--max-file-mib must be between 0 and 512');
const root = new URL('../../', import.meta.url);
async function run(file, options = []) {
  console.log(`\n[story:update] ${file} ${options.join(' ')}`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...options], { cwd: fileURLToPath(root), stdio: 'inherit', env: { ...process.env, STORY_SYNC_PIPELINE: '1' } });
    child.on('error', reject);
    child.on('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`${file} stopped (${signal || code}); existing snapshots are retained. Fix the error and rerun story:update.`)));
  });
}

await run('sync-prts-catalog.mjs', ['--incremental']);
// Expressions and portrait composition metadata can change independently of scripts.
console.log('\n[story:update] Refreshing character metadata');
const { stdout } = await promisify(execFile)(process.platform === 'win32' ? 'curl.exe' : 'curl', [
  '--fail', '--location', '--silent', '--show-error', '--retry', '2', '--max-time', '60',
  'https://torappu.prts.wiki/assets/avg/character.json',
], { maxBuffer: 10 * 1024 * 1024, timeout: 200000 });
const characters = JSON.parse(stdout);
if (Object.keys(characters).length < 100) throw new Error('Incomplete character index; keeping the existing file');
const protectedCharacters = `${JSON.stringify(protectGlobal(await loadCustomizations(), 'characters', characters))}\n`;
const characterFile = new URL('public/story/character-index.json', root);
if (await readFile(characterFile, 'utf8').catch(() => null) !== protectedCharacters) await writeFile(characterFile, protectedCharacters);
await run('sync-archive-metadata.mjs');
await run('sync-story-thumbnails.mjs');
await run('download-story-media.mjs', ['--new-only', `--max-file-mib=${maxFileMiB}`, ...args.filter(arg => !arg.startsWith('--max-file-mib='))]);
await run('sync-story-localizations.mjs', ['--refresh']);
await run('apply-customizations.mjs');
console.log('\n[story:update] Complete. See public/story/sync-report.json and media-download-report.json for changes and missing sources.');

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const DEFAULT_API_ORIGIN = 'https://arknights-recruit-api.molly27molly.workers.dev';
const DEFAULT_LIMIT = 25;
const DEFAULT_CONCURRENCY = 4;

function readOption(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readPositiveInteger(name, fallback) {
  const value = Number.parseInt(readOption(name, String(fallback)), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function printUsage() {
  console.log(`
Audit Monster Siren audio availability without downloading whole files.

Usage:
  npm.cmd run music:audit-audio
  npm.cmd run music:audit-audio -- --limit 100
  npm.cmd run music:audit-audio -- --all
  npm.cmd run music:audit-audio -- --cid 232227

Options:
  --api-origin <url>   Worker URL to inspect. Default: ${DEFAULT_API_ORIGIN}
  --limit <number>     Number of songs to check. Default: ${DEFAULT_LIMIT}
  --all                Check every song returned by the Worker.
  --cid <song id>      Check one specific song. Can be supplied more than once.
  --concurrency <n>    Concurrent checks. Default: ${DEFAULT_CONCURRENCY}
  --details             Print every unhealthy song instead of the first 20.
`);
}

if (process.argv.includes('--help')) {
  printUsage();
  process.exit(0);
}

const apiOrigin = readOption('--api-origin', DEFAULT_API_ORIGIN).replace(/\/$/, '');
const concurrency = readPositiveInteger('--concurrency', DEFAULT_CONCURRENCY);
const requestedCids = process.argv.flatMap((value, index) => value === '--cid' ? [process.argv[index + 1]] : [])
  .filter(Boolean);

async function getJson(url) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

async function probeAudio(url) {
  if (!url) return { status: 0, error: 'missing URL' };

  try {
    // hycdn rejects Node's default undici client, while a normal browser-like
    // curl request is accepted. Use curl to avoid reporting that bot policy as
    // a playback failure.
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const nullDevice = process.platform === 'win32' ? 'NUL' : '/dev/null';
    const { stdout } = await execFileAsync(curl, [
      '--silent',
      '--show-error',
      '--location',
      '--connect-timeout', '10',
      '--max-time', '25',
      '--range', '0-1',
      '--output', nullDevice,
      '--write-out', '%{http_code}|%{content_type}|%{content_range}',
      url,
    ], {
      maxBuffer: 1024 * 1024,
    });
    const [statusText, contentType = '', contentRange = ''] = stdout.trim().split('|');
    const status = Number.parseInt(statusText, 10) || 0;
    const result = {
      status,
      contentType,
      contentRange,
      ok: status === 200 || status === 206,
    };
    return result;
  } catch (error) {
    return { status: 0, error: error.message || String(error), ok: false };
  }
}

async function inspectSong(cid) {
  try {
    const payload = await getJson(`${apiOrigin}/api/song/${encodeURIComponent(cid)}/full`);
    const data = payload?.data || {};
    const song = data.song || {};
    const sourceUrl = song.sourceUrl || '';
    const proxyUrl = `${apiOrigin}/proxy-audio?url=${encodeURIComponent(sourceUrl)}`;
    const [direct, proxy] = await Promise.all([probeAudio(sourceUrl), probeAudio(proxyUrl)]);
    return {
      cid: String(cid),
      name: song.name || '',
      direct,
      proxy,
      healthy: direct.ok || proxy.ok,
    };
  } catch (error) {
    return {
      cid: String(cid),
      name: '',
      direct: { status: 0, ok: false, error: error.message || String(error) },
      proxy: { status: 0, ok: false, error: 'song detail unavailable' },
      healthy: false,
    };
  }
}

async function runWithConcurrency(items, worker) {
  const results = [];
  let cursor = 0;
  let completed = 0;
  const startedAt = Date.now();
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push(await worker(item));
      completed += 1;
      if (completed === items.length || completed % 25 === 0) {
        const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
        console.log(`[${completed}/${items.length}] checked (${elapsedSeconds}s elapsed)`);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function resolveCids() {
  if (requestedCids.length > 0) return [...new Set(requestedCids)];

  const payload = await getJson(`${apiOrigin}/api/songs`);
  const songs = payload?.data?.list || payload?.data || [];
  if (!Array.isArray(songs)) throw new Error('Unexpected /api/songs response.');
  if (process.argv.includes('--all')) return songs.map((song) => String(song.cid)).filter(Boolean);

  const limit = readPositiveInteger('--limit', DEFAULT_LIMIT);
  if (limit >= songs.length) return songs.map((song) => String(song.cid)).filter(Boolean);
  if (limit === 1) return songs[0]?.cid ? [String(songs[0].cid)] : [];

  return Array.from({ length: limit }, (_, index) => {
    const songIndex = Math.round((index * (songs.length - 1)) / (limit - 1));
    return String(songs[songIndex]?.cid || '');
  }).filter(Boolean);
}

const cids = await resolveCids();
console.log(`Checking ${cids.length} song(s) against ${apiOrigin}...`);
const results = await runWithConcurrency(cids, inspectSong);
const failures = results.filter((item) => !item.healthy);
const directFailures = results.filter((item) => !item.direct.ok);
const proxyFailures = results.filter((item) => !item.proxy.ok);
const failureDetails = failures.map(({ cid, name, direct, proxy }) => ({ cid, name, direct, proxy }));

console.log(JSON.stringify({
  checked: results.length,
  healthy: results.length - failures.length,
  failed: failures.length,
  directFailures: directFailures.length,
  proxyFailures: proxyFailures.length,
  failures: process.argv.includes('--details') ? failureDetails : failureDetails.slice(0, 20),
  truncatedFailureCount: Math.max(0, failureDetails.length - 20),
}, null, 2));

process.exitCode = failures.length > 0 ? 1 : 0;

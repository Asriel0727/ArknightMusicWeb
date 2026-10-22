import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AUDIO_SYNC_VERSION, getVerifiedAudioSyncOffset } from '../shared/character-ep-audio-sync.mjs';
import { createBilibiliRequest, fetchBilibiliAudioSource } from './bilibili-audio-source.mjs';

const execFileAsync = promisify(execFile);
const DAY_MS = 86400000;

export function audioSyncSourceKey(row, audioUrl) {
  const path = new URL(audioUrl).pathname;
  // Siren rotates the signature prefix and query while keeping /siren/audio/ stable.
  const stablePath = path.includes('/siren/audio/') ? path.slice(path.indexOf('/siren/audio/')) : path;
  return createHash('sha256').update(JSON.stringify([
    AUDIO_SYNC_VERSION, String(row.song_id), String(row.bvid), row.duration_seconds, stablePath,
  ])).digest('hex');
}

export async function analyzeAudioTracks(audioUrl, videoUrl, { audioUrls = [] } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'character-ep-audio-'));
  try {
    const sourceFile = join(directory, 'video-audio-urls.json');
    // Signed CDN URLs are temporary, never persisted in Supabase or CI logs.
    await writeFile(sourceFile, JSON.stringify(audioUrls), { mode: 0o600 });
    const { stdout } = await execFileAsync(process.env.PYTHON_BIN || 'python', [
      fileURLToPath(new URL('./character-ep-audio-sync.py', import.meta.url)),
      '--audio-url', audioUrl, '--video-url', videoUrl, '--work-dir', directory,
      '--video-audio-urls-file', sourceFile,
    ], { timeout: 210000, maxBuffer: 1024 * 1024, windowsHide: true });
    return JSON.parse(stdout);
  } catch (error) {
    // Never log execFile's error message: it contains the signed source URL.
    try { return JSON.parse(error.stdout); } catch { /* no result from timed-out process */ }
    return { status: 'failed', reason: error.killed ? 'analysis_timeout' : 'analysis_process_failed' };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function updateAudioSync(row, {
  musicApiOrigin, analyze = analyzeAudioTracks, fetchJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('song_detail_unavailable');
    return response.json();
  }, now = Date.now(), request = createBilibiliRequest(),
  resolveAudio = (video) => fetchBilibiliAudioSource(request, video),
} = {}) {
  const identity = { songId: row.song_id, videoId: row.bvid };
  let previous = getVerifiedAudioSyncOffset(row.raw?.audioSync, identity) !== null ? row.raw.audioSync : null;
  const previousAttempt = row.raw?.audioSyncAttempt;
  const at = new Date(now).toISOString();
  let sourceKey = null;
  try {
    const detail = await fetchJson(`${musicApiOrigin}/api/song/${encodeURIComponent(row.song_id)}`);
    const audioUrl = detail?.data?.sourceUrl;
    if (!audioUrl || String(detail.data.cid) !== String(row.song_id)) throw new Error('song_audio_unavailable');
    sourceKey = audioSyncSourceKey(row, audioUrl);
    if (previous?.sourceKey !== sourceKey) previous = null;
    row.raw.audioSync = previous;
    if (previous && now - Date.parse(previous.analyzedAt) < 30 * DAY_MS) return 'cached';
    if (previousAttempt?.sourceKey === sourceKey && now - Date.parse(previousAttempt.at) < DAY_MS / 4) return 'cooldown';
    let source = null;
    try {
      source = await resolveAudio({ videoId: String(row.bvid),
        videoIdType: /^\d+$/.test(String(row.bvid)) ? 'aid' : 'bvid',
        cid: row.raw?.bilibili?.cid, durationSeconds: row.duration_seconds,
      });
      row.raw.bilibili = { cid: source.cid };
    } catch { /* yt-dlp remains a fallback when the public interfaces fail. */ }
    const result = await analyze(audioUrl, row.source_url, { audioUrls: source?.audioUrls || [] });
    const candidate = { ...result, ...identity, sourceKey, analyzedAt: at };
    const accepted = getVerifiedAudioSyncOffset(candidate, identity) !== null;
    row.raw.audioSyncAttempt = { sourceKey, at, status: accepted ? 'accepted' : 'failed',
      acquisition: result.acquisition || (source ? 'playurl' : 'yt-dlp'),
      reason: accepted ? null : result.reason || 'invalid_analysis_result' };
    if (accepted) row.raw.audioSync = candidate;
    return accepted ? 'accepted' : 'failed';
  } catch {
    row.raw.audioSync = previous;
    row.raw.audioSyncAttempt = { sourceKey, at, status: 'failed', reason: 'song_audio_or_analysis_unavailable' };
    return 'failed';
  }
}

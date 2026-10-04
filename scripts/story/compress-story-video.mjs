import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const exec = promisify(execFile);
const tempRoot = fileURLToPath(new URL('../../tmp/story-media-compression/', import.meta.url));
let executable;
let pending = Promise.resolve();
async function ffmpeg() {
  if (executable) return executable;
  const candidates = process.env.FFMPEG_PATH ? [process.env.FFMPEG_PATH] : [
    fileURLToPath(new URL('../../tmp/video-compression/ffmpeg.exe', import.meta.url)), 'ffmpeg',
  ];
  for (const candidate of candidates) {
    try { await exec(candidate, ['-version'], { timeout: 10000 }); executable = candidate; return candidate; } catch {}
  }
  throw new Error('ffmpeg-unavailable: install FFmpeg or set FFMPEG_PATH; original media is retained');
}
async function metadata(tool, file) {
  let output;
  try { await exec(tool, ['-hide_banner', '-i', file], { timeout: 30000, maxBuffer: 1024 * 1024 }); }
  catch (error) { if (error.code !== 1) throw error; output = error.stderr; }
  const duration = output?.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const video = output?.split(/\r?\n/).find(line => /Stream .*Video:/.test(line));
  const dimensions = video?.match(/\b(\d{2,5})x(\d{2,5})\b/);
  const audio = (output || '').split(/\r?\n/).filter(line => /Stream .*Audio:/.test(line));
  if (!duration || !dimensions) throw new Error('video-metadata-invalid');
  return {
    duration: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
    width: Number(dimensions[1]), height: Number(dimensions[2]), audioTracks: audio.length,
    audioRate: audio.reduce((sum, line) => sum + Number(line.match(/([\d.]+) kb\/s/)?.[1] || 256) * 1000, 0),
  };
}
async function perform(input, source, limitBytes) {
  const tool = await ffmpeg();
  const before = await metadata(tool, input);
  if (!(before.duration > 0)) throw new Error('video-duration-invalid');
  await mkdir(tempRoot, { recursive: true });
  const folder = await mkdtemp(path.join(tempRoot, 'video-'));
  const output = path.join(folder, 'compressed.mp4');
  const cleanup = async () => {
    // mkdtemp creates this directory only under the ignored project temp directory.
    if (!path.resolve(folder).startsWith(path.resolve(tempRoot) + path.sep)) throw new Error('unsafe-compression-temp-path');
    await rm(folder, { recursive: true, force: true });
  };
  const common = ['-hide_banner', '-loglevel', 'error', '-nostats', '-y', '-i', input];
  const video = ['-map', '0:v:0', '-c:v', 'libx264', '-preset', 'medium', '-threads', '4', '-pix_fmt', 'yuv420p', '-fps_mode', 'passthrough'];
  const audio = ['-map', '0:a?', '-c:a', 'copy'];
  const options = { timeout: 30 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 };
  try {
    // Start with quality-based encoding; use two passes only if it still exceeds the cap.
    await exec(tool, [...common, ...video, '-crf', '20', ...audio, '-movflags', '+faststart', output], options);
    let strategy = 'crf-20';
    if ((await stat(output)).size > limitBytes) {
      const target = Math.min(90 * 1048576, limitBytes * 0.94);
      const bitrate = Math.floor((target * 8 / before.duration - before.audioRate) * 0.95);
      if (bitrate < 64000) throw new Error('video-too-long-for-size-budget-with-original-audio');
      const pass = ['-b:v', String(bitrate), '-passlogfile', path.join(folder, 'pass')];
      await exec(tool, [...common, ...video, ...pass, '-pass', '1', '-an', '-f', 'null', process.platform === 'win32' ? 'NUL' : '/dev/null'], options);
      await exec(tool, [...common, ...video, ...pass, '-pass', '2', ...audio, '-movflags', '+faststart', output], options);
      strategy = `two-pass-${bitrate}`;
    }
    const size = (await stat(output)).size;
    if (size < 16 || size > limitBytes) throw new Error('compressed-video-exceeds-size-limit');
    const after = await metadata(tool, output);
    if (Math.abs(before.duration - after.duration) > 0.1 || before.width !== after.width || before.height !== after.height || before.audioTracks !== after.audioTracks) throw new Error('compressed-video-metadata-mismatch');
    // Decode the complete result and compare original compressed audio packets.
    await exec(tool, ['-v', 'error', '-xerror', '-i', output, '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'], options);
    if (before.audioTracks) {
      const audioHash = async file => {
        const result = await exec(tool, ['-v', 'error', '-i', file, '-map', '0:a', '-c:a', 'copy', '-f', 'streamhash', '-hash', 'sha256', '-'], options);
        return result.stdout.trim();
      };
      if (await audioHash(input) !== await audioHash(output)) throw new Error('compressed-video-audio-changed');
    }
    return { file: output, cleanup, conversion: {
      tool: 'FFmpeg / libx264', sourceFormat: 'MP4', sourceBytes: source.bytes, sourceSha256: source.sha256,
      videoCodec: 'H.264', pixelFormat: 'yuv420p', strategy, audio: 'copy', audioVerified: true,
      durationSeconds: after.duration, width: after.width, height: after.height,
    } };
  } catch (error) { await cleanup(); throw error; }
}
export function compressStoryVideo(input, source, limitBytes) {
  // Serialize expensive encodes while ordinary downloads remain concurrent.
  const result = pending.then(() => perform(input, source, limitBytes));
  pending = result.catch(() => {});
  return result;
}
export async function validateModifiedMedia(file) {
  await exec(await ffmpeg(), ['-v', 'error', '-xerror', '-i', file, '-map', '0:v?', '-map', '0:a?', '-f', 'null', '-'], { timeout: 30 * 60 * 1000, maxBuffer: 2 * 1024 * 1024 });
}

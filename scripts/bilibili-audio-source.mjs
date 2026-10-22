import { fetchBilibiliVideoMetadata } from './bilibili-video-duration.mjs';

export function getBilibiliAudioUrls(payload) {
  if (payload?.code !== 0) return [];
  const formats = [...(payload.data?.dash?.audio || [])]
    .filter((audio) => /^(?:mp4a\.|aac)/i.test(audio.codecs || ''))
    .sort((left, right) => Number(right.bandwidth || 0) - Number(left.bandwidth || 0));
  const urls = formats.flatMap((audio) => [audio.baseUrl || audio.base_url,
    ...(audio.backupUrl || audio.backup_url || [])]);
  return [...new Set(urls.filter((value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password
        && /(?:^|\.)(?:bilivideo\.com|bilivideo\.cn|akamaized\.net)$/.test(url.hostname);
    } catch { return false; }
  }))];
}

export function createBilibiliRequest(fetchImpl = fetch) {
  return { async get(url, options = {}) {
    const response = await fetchImpl(url, {
      headers: { 'user-agent': 'Mozilla/5.0', ...options.headers },
      signal: AbortSignal.timeout(options.timeout || 15000),
    });
    return { ok: () => response.ok, status: () => response.status, json: () => response.json() };
  } };
}

export async function fetchBilibiliAudioSource(request, video) {
  const metadata = video.cid ? { cid: video.cid, durationSeconds: video.durationSeconds }
    : await fetchBilibiliVideoMetadata(request, video);
  if (!/^\d+$/.test(String(metadata.cid))) throw new Error('Bilibili CID unavailable');
  const params = new URLSearchParams({
    [video.videoIdType === 'aid' ? 'avid' : 'bvid']: video.videoId,
    cid: String(metadata.cid), fnval: '16',
  });
  const response = await request.get(`https://api.bilibili.com/x/player/playurl?${params}`, {
    headers: { referer: 'https://www.bilibili.com/' }, timeout: 15000,
  });
  if (!response.ok()) throw new Error(`Bilibili audio HTTP ${response.status()}`);
  const payload = await response.json();
  const audioUrls = getBilibiliAudioUrls(payload);
  if (!audioUrls.length) throw new Error(`Bilibili audio unavailable (code ${payload?.code})`);
  return { ...metadata, audioUrls };
}

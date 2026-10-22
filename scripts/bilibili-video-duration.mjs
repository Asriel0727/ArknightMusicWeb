/** The embedded player uses the first part, not the sum of a multipart video. */
export function getBilibiliDurationSeconds(payload) {
  if (payload?.code !== 0) return null;
  const parts = payload?.data?.pages;
  const value = Array.isArray(parts) && parts.length
    ? parts[0]?.duration
    : payload?.data?.duration;
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export async function fetchBilibiliDurationSeconds(request, video) {
  const metadata = await fetchBilibiliVideoMetadata(request, video);
  return metadata.durationSeconds;
}

export async function fetchBilibiliVideoMetadata(request, video) {
  const params = new URLSearchParams({ [video.videoIdType]: video.videoId });
  // pagelist supplies the first part's CID and duration without depending on
  // the webpage or view endpoint, which can return HTTP 412 independently.
  const response = await request.get(`https://api.bilibili.com/x/player/pagelist?${params}`, {
    headers: { referer: 'https://www.bilibili.com/' },
    timeout: 15_000,
  });
  if (!response.ok()) throw new Error(`Bilibili metadata HTTP ${response.status()}`);
  const payload = await response.json();
  const firstPart = payload?.code === 0 ? payload.data?.[0] : null;
  const duration = Number(firstPart?.duration);
  const cid = String(firstPart?.cid || '');
  if (!Number.isFinite(duration) || duration <= 0 || !/^\d+$/.test(cid)) {
    throw new Error(`Bilibili metadata unavailable (code ${payload?.code})`);
  }
  return { cid, durationSeconds: duration };
}

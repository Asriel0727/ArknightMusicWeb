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
  const params = new URLSearchParams({ [video.videoIdType]: video.videoId });
  const response = await request.get(`https://api.bilibili.com/x/web-interface/view?${params}`, {
    headers: { referer: 'https://www.bilibili.com/' },
    timeout: 15_000,
  });
  if (!response.ok()) throw new Error(`Bilibili metadata HTTP ${response.status()}`);
  const payload = await response.json();
  const duration = getBilibiliDurationSeconds(payload);
  if (duration === null) throw new Error(`Bilibili duration unavailable (code ${payload?.code})`);
  return duration;
}

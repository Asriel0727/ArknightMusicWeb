const DEFAULT_CACHE_TTL_MS = 10 * 60 * 1000;
// 合併同一頁面生命週期內同時發出的相同請求，避免第一個請求尚未寫入
// sessionStorage 時，其他元件又各自看到 Miss 並重複打 API。
const pendingRequests = new Map();

function readCacheEntry(key) {
  try {
    const entry = JSON.parse(sessionStorage.getItem(key) || 'null');
    return Number.isFinite(entry?.savedAt) && Object.hasOwn(entry, 'payload') ? entry : null;
  } catch {
    return null;
  }
}

function writeCacheEntry(key, payload) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), payload }));
  } catch (error) {
    console.warn('[Cache] Write failed:', key, error);
  }
}

/**
 * 取得具有效期的 sessionStorage 快取；舊版未含 savedAt 的資料會自動失效。
 * @param {string} url - 請求的 URL
 * @param {{ maxAgeMs?: number }} options - 快取有效時間
 * @returns {Promise<any>} 解析後的 JSON 資料
 */
export async function fetchWithCache(url, options = {}) {
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_CACHE_TTL_MS;
  const entry = readCacheEntry(url);
  if (entry && Date.now() - entry.savedAt <= maxAgeMs) {
    console.log(`[Cache] Hit for ${url}`);
    return entry.payload;
  }

  const pending = pendingRequests.get(url);
  if (pending) {
    console.debug(`[Cache] Pending for ${url}; reusing in-flight request.`);
    return pending;
  }

  const request = (async () => {
    console.debug(`[Cache] ${entry ? 'Expired' : 'Miss'} for ${url}. Fetching from network...`);
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) throw new Error('Network response was not ok');
      const payload = await response.json();
      writeCacheEntry(url, payload);
      return payload;
    } catch (error) {
      // Keep the UI available during a temporary upstream outage.
      if (entry) {
        console.warn(`[Cache] Refresh failed; serving stale data for ${url}`, error);
        return entry.payload;
      }
      throw error;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, request);
  return request;
}

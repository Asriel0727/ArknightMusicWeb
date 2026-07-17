const DEFAULT_ACTIVITY_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const ACTIVITY_BROWSER_CACHE_PREFIX = 'activities:v1:';
const ACTIVITY_CACHE_TTL_MS = 15 * 60 * 1000;

function getApiBase() {
  return String(import.meta.env.VITE_RECRUIT_API_BASE || DEFAULT_ACTIVITY_API_BASE).replace(/\/$/, '');
}

function readCache(key) {
  try {
    return JSON.parse(sessionStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Browser storage is only a performance optimization.
  }
}

export async function fetchActivities(server) {
  const normalized = ['cn', 'tw', 'global'].includes(server) ? server : 'global';
  const cacheKey = `${ACTIVITY_BROWSER_CACHE_PREFIX}${normalized}`;
  const cached = readCache(cacheKey);
  const cacheAge = cached ? Date.now() - cached.savedAt : Number.POSITIVE_INFINITY;
  if (Array.isArray(cached?.activities) && cacheAge < ACTIVITY_CACHE_TTL_MS) {
    return { activities: cached.activities, source: 'browser-cache', stale: false };
  }

  try {
    const response = await fetch(`${getApiBase()}/api/activities?server=${encodeURIComponent(normalized)}`);
    if (!response.ok) throw new Error(`Activity API failed: ${response.status}`);
    const data = await response.json();
    const activities = Array.isArray(data.activities) ? data.activities : [];
    writeCache(cacheKey, { savedAt: Date.now(), activities });
    return { activities, source: 'network', stale: false };
  } catch (error) {
    console.warn('Activity API unavailable:', error);
    return {
      activities: Array.isArray(cached?.activities) ? cached.activities : [],
      source: cached?.activities ? 'browser-cache' : 'unavailable',
      stale: Boolean(cached?.activities),
    };
  }
}

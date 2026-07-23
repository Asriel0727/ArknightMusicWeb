const DEFAULT_ACTIVITY_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const ACTIVITY_BROWSER_CACHE_PREFIX = 'activities:';

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

  try {
    const response = await fetch(`${getApiBase()}/api/activities?server=${encodeURIComponent(normalized)}`, { cache: 'no-store' });
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

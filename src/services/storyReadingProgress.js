import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { API_ORIGIN } from './api.js';
import { authState } from './auth.js';

const guestKey = 'story-archive-read';
const accountKey = id => `story-archive-read:user:${id}`;
const validId = id => typeof id === 'string' && /^[a-z0-9][a-z0-9_-]{0,99}$/.test(id);
function clean(value) {
  return Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).filter(([id, read]) => validId(id) && read === true));
}
function stored(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch { return {}; }
}
function accountCache(id) {
  const value = stored(accountKey(id));
  const pending = clean(value.pending);
  return { completed: { ...clean(value.completed), ...pending }, pending };
}
async function requestProgress(token, owner, { signal, after, storyIds } = {}) {
  const params = after ? `?after=${encodeURIComponent(after)}` : '';
  const response = await fetch(`${API_ORIGIN}/api/user/story-reads${params}`, {
    method: storyIds ? 'POST' : 'GET', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: storyIds ? JSON.stringify({ storyIds }) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true || data.userId !== owner) {
    const error = new Error('Story progress sync failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

// A completion is monotonic: devices merge completed IDs, never overwrite an
// entire cloud snapshot. Pending writes remain scoped to their original owner.
export function useStoryReadingProgress() {
  const completed = ref({});
  const pending = ref({});
  const guest = ref(clean(stored(guestKey)));
  const owner = ref('');
  const status = ref('guest');
  const storageFailed = ref(false);
  const syncing = ref(false);
  const importCount = computed(() => owner.value ? Object.keys(guest.value).filter(id => !Object.hasOwn(completed.value, id)).length : 0);
  let generation = 0, controller, retryTimer, retries = 0, lastAttempt = 0, disposed = false;

  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); storageFailed.value = false; }
    catch { storageFailed.value = true; }
  }
  function persist(acknowledged = []) {
    if (!owner.value) {
      guest.value = { ...clean(stored(guestKey)), ...completed.value };
      write(guestKey, guest.value);
      return;
    }
    const disk = accountCache(owner.value);
    completed.value = { ...disk.completed, ...completed.value };
    pending.value = { ...disk.pending, ...pending.value };
    for (const id of acknowledged) delete pending.value[id];
    write(accountKey(owner.value), { completed: completed.value, pending: pending.value });
  }
  function schedule(delay = 400) {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { void sync(); }, delay);
  }
  async function sync(resetRetries = false) {
    if (disposed || !owner.value || syncing.value) return;
    clearTimeout(retryTimer);
    if (resetRetries) retries = 0;
    if (navigator.onLine === false) { status.value = 'offline'; return; }
    const version = generation, account = owner.value, token = authState.session?.access_token;
    if (!token || authState.session?.user?.id !== account) return;
    controller = new AbortController();
    const activeController = controller;
    const current = () => !disposed && generation === version;
    const timeout = setTimeout(() => activeController.abort(), 45000);
    syncing.value = true;
    status.value = 'syncing';
    lastAttempt = Date.now();
    try {
      let after;
      const seen = new Set();
      const remote = {};
      do {
        const data = await requestProgress(token, account, { signal: activeController.signal, after });
        if (!current()) return;
        if (!Array.isArray(data.reads) || data.reads.some(row => !validId(row.story_id))) throw new Error('Invalid progress rows');
        for (const row of data.reads) remote[row.story_id] = true;
        after = data.nextCursor;
        if (after && (!validId(after) || seen.has(after) || seen.size >= 100)) throw new Error('Invalid progress pagination');
        if (after) seen.add(after);
      } while (after);
      completed.value = { ...completed.value, ...remote };
      persist(Object.keys(remote));
      while (Object.keys(pending.value).length) {
        const batch = Object.keys(pending.value).slice(0, 200);
        const data = await requestProgress(token, account, { signal: activeController.signal, storyIds: batch });
        if (!current()) return;
        if (!Array.isArray(data.storyIds) || !batch.every(id => data.storyIds.includes(id))) throw new Error('Incomplete progress acknowledgement');
        persist(batch);
      }
      retries = 0;
      status.value = 'synced';
    } catch (error) {
      if (!current()) return;
      status.value = error.status === 401 ? 'expired' : error.status === 404 ? 'unavailable' : navigator.onLine === false ? 'offline' : 'error';
      if (status.value === 'error' && retries < 3) schedule([5000, 15000, 45000][retries++]);
    } finally {
      clearTimeout(timeout);
      if (current()) { syncing.value = false; controller = null; }
    }
  }
  function markCompleted(id) {
    if (!validId(id) || Object.hasOwn(completed.value, id)) return;
    completed.value = { ...completed.value, [id]: true };
    if (owner.value) pending.value = { ...pending.value, [id]: true };
    persist();
    if (owner.value) { status.value = 'pending'; retries = 0; schedule(); }
  }
  function importGuest() {
    if (!owner.value || syncing.value) return;
    guest.value = { ...guest.value, ...clean(stored(guestKey)) };
    const imported = Object.fromEntries(Object.keys(guest.value).filter(id => !Object.hasOwn(completed.value, id)).map(id => [id, true]));
    completed.value = { ...completed.value, ...imported };
    pending.value = { ...pending.value, ...imported };
    persist();
    void sync(true);
  }
  watch(() => [authState.session?.user?.id || '', authState.session?.access_token || ''], ([id]) => {
    const sameOwner = owner.value === id;
    const previousCompleted = sameOwner ? completed.value : {};
    const previousPending = sameOwner ? pending.value : {};
    generation++;
    controller?.abort();
    clearTimeout(retryTimer);
    syncing.value = false;
    retries = 0;
    owner.value = id;
    guest.value = clean(stored(guestKey));
    const cache = id ? accountCache(id) : { completed: guest.value, pending: {} };
    completed.value = { ...cache.completed, ...previousCompleted };
    pending.value = { ...cache.pending, ...previousPending };
    status.value = id ? 'pending' : 'guest';
    if (id) void sync(true);
  }, { immediate: true, flush: 'sync' });

  function refresh() { if (Date.now() - lastAttempt > 15000) void sync(true); }
  function online() { void sync(true); }
  function storage(event) {
    if (event.key === guestKey) {
      guest.value = clean(stored(guestKey));
      if (!owner.value) completed.value = { ...completed.value, ...guest.value };
    }
    if (owner.value && event.key === accountKey(owner.value)) {
      const cache = accountCache(owner.value);
      completed.value = { ...completed.value, ...cache.completed };
      pending.value = { ...pending.value, ...cache.pending };
      if (Object.keys(pending.value).length) schedule();
    }
  }
  onMounted(() => {
    window.addEventListener('online', online);
    window.addEventListener('focus', refresh);
    window.addEventListener('storage', storage);
  });
  onUnmounted(() => {
    disposed = true;
    generation++;
    controller?.abort();
    clearTimeout(retryTimer);
    window.removeEventListener('online', online);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('storage', storage);
  });
  return { completed, owner, status, syncing, storageFailed, importCount, markCompleted, importGuest, sync };
}

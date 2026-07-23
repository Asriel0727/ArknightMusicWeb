<template>
  <main class="activity-page">
    <header class="activity-header">
      <div>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <div class="activity-controls">
        <label class="server-control">
          <span>{{ copy.server }}</span>
          <select v-model="server">
            <option value="tw">{{ copy.tw }}</option>
            <option value="global">{{ copy.global }}</option>
            <option value="cn">{{ copy.cn }}</option>
          </select>
        </label>
        <label class="scope-control">
          <span>{{ copy.scope }}</span>
          <select v-model="activityScope">
            <option value="major">{{ copy.majorOnly }}</option>
            <option value="all">{{ copy.allActivities }}</option>
          </select>
        </label>
        <label v-if="server !== 'cn'" class="future-toggle">
          <input v-model="showFuture" type="checkbox">
          <span>{{ copy.showFuture }}</span>
        </label>
        <label v-if="showFuture && server !== 'cn'" class="scope-control">
          <span>{{ copy.futureCount }}</span>
          <select v-model.number="futureLimit">
            <option v-for="count in 5" :key="count" :value="count">{{ count }}</option>
          </select>
        </label>
      </div>
    </header>
    <label class="search-control">
      <span>{{ copy.search }}</span>
      <input v-model="searchQuery" type="search" :placeholder="copy.searchPlaceholder">
    </label>
    <section v-if="showFuture && server !== 'cn' && !loading && !error" class="future-section">
      <header class="future-header">
        <h2>{{ copy.futureTitle }}</h2>
        <p>{{ copy.futureSubtitle }}</p>
      </header>
      <p v-if="!displayedFutureActivities.length" class="future-empty"><i class="fas fa-calendar-xmark"></i>{{ copy.noFuture }}</p>
      <div v-else class="activity-list">
        <article v-for="activity in displayedFutureActivities" :key="`future-${activity.window.id}`" class="activity-card future-card">
          <div class="activity-visual">
            <img v-if="hasImage(activity)" :src="activityImageUrl(activity)" :alt="localized(activity.name_i18n)" loading="lazy" @error="markImageFailed(activityImageUrl(activity))">
            <div v-else class="image-placeholder"><i class="fas fa-image"></i></div>
          </div>
          <div class="activity-content">
            <h2>{{ localized(activity.name_i18n) }}</h2>
            <p class="future-badge"><i class="fas fa-eye"></i>{{ copy.futureBadge }}</p>
            <p class="date-range"><i class="fas fa-calendar-days"></i>{{ formatRange(activity.window.start_at, activity.window.end_at) }}</p>
            <section v-if="activity.recruitment_pools.length" class="pool-section">
              <h3>{{ copy.recruitmentPools }}</h3>
              <ul>
                <li v-for="pool in activity.recruitment_pools" :key="pool.id">
                  <strong>{{ localized(pool.name_i18n) }}</strong>
                  <span>{{ poolTypeLabel(pool.kind) }}</span>
                </li>
              </ul>
            </section>
          </div>
        </article>
      </div>
    </section>

    <div v-if="loading" class="state"><span class="spinner"></span>{{ copy.loading }}</div>
    <div v-else-if="error" class="state error"><i class="fas fa-triangle-exclamation"></i>{{ error }}</div>
    <div v-else-if="!displayedActivities.length" class="state"><i class="fas fa-calendar-xmark"></i>{{ copy.empty }}</div>
    <section v-else class="activity-list">
      <article v-for="activity in displayedActivities" :key="activity.window.id" class="activity-card">
        <div class="activity-visual">
          <img v-if="hasImage(activity)" :src="activityImageUrl(activity)" :alt="localized(activity.name_i18n)" loading="lazy" @error="markImageFailed(activityImageUrl(activity))">
          <div v-else class="image-placeholder"><i class="fas fa-image"></i></div>
        </div>
        <div class="activity-content">
          <h2>{{ localized(activity.name_i18n) }}</h2>
          <p class="date-range"><i class="fas fa-calendar-days"></i>{{ formatRange(activity.window.start_at, activity.window.end_at) }}</p>
          <section v-if="activity.recruitment_pools.length" class="pool-section">
            <h3>{{ copy.recruitmentPools }}</h3>
            <ul>
              <li v-for="pool in activity.recruitment_pools" :key="pool.id">
                <strong>{{ localized(pool.name_i18n) }}</strong>
                <span>{{ poolTypeLabel(pool.kind) }}</span>
              </li>
            </ul>
          </section>
        </div>
      </article>
    </section>
    <p v-if="isStale" class="stale-note"><i class="fas fa-circle-info"></i>{{ copy.stale }}</p>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchActivities } from '../services/activityApi.js';
import { getLocalActivityImageSource, getLocalActivityImageUrl, loadActivityAssetManifest } from '../services/activityAssetManifest.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';

const { locale } = useI18n();
const server = ref(locale.value === 'zh-TW' ? 'tw' : locale.value === 'zh-CN' ? 'cn' : 'global');
const activityScope = ref('major');
const searchQuery = ref('');
const showFuture = ref(false);
const futureLimit = ref(5);
const activities = ref([]);
const futureActivities = ref([]);
const loading = ref(true);
const error = ref('');
const isStale = ref(false);
const failedImageUrls = ref(new Set());

// Historic PRTS and Wiki records whose titles are translations rather than
// spelling variants. Keep these explicit aliases narrow to avoid hiding
// unrelated activities that merely share a banner or a release window.
const ACTIVITY_DISPLAY_GROUP_OVERRIDES = {
  'prts-h3okge': 'act-or-die-2025',
  'wiki-act-or-die': 'act-or-die-2025',
  'prts-r2bmlv': 'integrated-lookback-back-to-castle-2025',
  'wiki-integrated-lookback-back-to-castle': 'integrated-lookback-back-to-castle-2025',
  'prts-ytniih': 'paddles-up-login-event-2025',
  'wiki-paddles-up-login-event': 'paddles-up-login-event-2025',
  'prts-1fvqqe1': 'contingency-contract-2019',
  'wiki-contingency-contract-event': 'contingency-contract-2019',
};

const TEXT = {
  'zh-TW': { title: '活動', subtitle: '查看各伺服器的活動檔期與對應卡池。', server: '伺服器', scope: '顯示範圍', majorOnly: '大型活動', allActivities: '全部活動', showFuture: '顯示未來視', futureCount: '顯示筆數', futureTitle: '未來視（陸服參考）', futureSubtitle: '以下為陸服已公布、尚未在目前伺服器開始的活動。', futureBadge: '陸服未來活動', noFuture: '目前沒有可參考的未來活動。', search: '搜尋活動', searchPlaceholder: '例如：危機合約', tw: '繁中服', global: '國際服', cn: '陸服', loading: '正在載入活動資料…', empty: '目前沒有符合條件的活動。', error: '無法載入活動資料，請稍後再試。', recruitmentPools: '對應卡池', stale: '目前顯示上次成功取得的快取資料。', pools: { standard: '標準尋訪', kernel: '中堅尋訪', limited: '限定尋訪', event: '活動尋訪' } },
  'zh-CN': { title: '活动', subtitle: '查看各服务器的活动档期与对应卡池。', server: '服务器', scope: '显示范围', majorOnly: '大型活动', allActivities: '全部活动', showFuture: '显示未来视', futureCount: '显示数量', futureTitle: '未来视（国服参考）', futureSubtitle: '以下为国服已公布、尚未在当前服务器开始的活动。', futureBadge: '国服未来活动', noFuture: '目前没有可参考的未来活动。', search: '搜索活动', searchPlaceholder: '例如：危机合约', tw: '繁中服', global: '国际服', cn: '国服', loading: '正在加载活动数据…', empty: '目前没有符合条件的活动。', error: '无法加载活动数据，请稍后再试。', recruitmentPools: '对应卡池', stale: '目前显示上次成功取得的缓存数据。', pools: { standard: '标准寻访', kernel: '中坚寻访', limited: '限定寻访', event: '活动寻访' } },
  en: { title: 'Activities', subtitle: 'Browse event windows and related banners by server.', server: 'Server', scope: 'Display', majorOnly: 'Major activities', allActivities: 'All activities', showFuture: 'Show CN preview', futureCount: 'Items', futureTitle: 'CN server preview', futureSubtitle: 'Activities announced for CN that have not started on the selected server.', futureBadge: 'CN preview', noFuture: 'No future activities are available.', search: 'Search activities', searchPlaceholder: 'For example: Contingency Contract', tw: 'Traditional Chinese', global: 'Global', cn: 'CN', loading: 'Loading activities…', empty: 'No matching activities are available.', error: 'Could not load activities. Please try again later.', recruitmentPools: 'Related banners', stale: 'Showing the last successfully loaded cached data.', pools: { standard: 'Standard', kernel: 'Kernel', limited: 'Limited', event: 'Event banner' } },
};
const copy = computed(() => TEXT[locale.value] || TEXT.en);
const MAJOR_ACTIVITY_TYPES = new Set(['side_story', 'campaign', 'collaboration']);
const MAJOR_OTHER_ACTIVITY_PATTERN = /(?:\u5371\u673a\u5408\u7ea6|\u5f15\u822a\u8005\u8bd5\u70bc|\u77e2\u91cf\u7a81\u7834|\u536b\u620d\u534f\u8bae|\u751f\u606f\u6f14\u7b97|\u4fdd\u5168\u6d3e\u9a7b|\u96c6\u6210\u6218\u7565)/u;
const visibleActivities = computed(() => activities.value
  .filter(hasActivityArtwork)
  .filter(matchesSearch)
  .filter((activity) => activityScope.value === 'all' || isMajorActivity(activity)));
const displayedActivities = computed(() => toDisplayedActivities(visibleActivities.value));
const displayedFutureActivities = computed(() => {
  if (!showFuture.value || server.value === 'cn') return [];
  const cnActivitiesByCode = new Map(futureActivities.value.map((activity) => [activity.code, activity]));
  const currentProgress = [...activities.value]
    .filter(hasActivityArtwork)
    .filter((activity) => activityScope.value === 'all' || isMajorActivity(activity))
    .sort((left, right) => Date.parse(right?.window?.start_at || '') - Date.parse(left?.window?.start_at || ''))
    .map((activity) => cnActivitiesByCode.get(activity.code))
    .find(Boolean);
  const currentServerCodes = new Set(activities.value.map((activity) => activity.code));
  if (!currentProgress) return [];
  const candidates = futureActivities.value
    .filter(hasActivityArtwork)
    .filter(matchesSearch)
    .filter((activity) => activityScope.value === 'all' || isFuturePreviewActivity(activity))
    .filter((activity) => !alreadyAvailableOnCurrentServer(activity, currentServerCodes))
    .filter((activity) => Date.parse(activity?.window?.start_at || '') > Date.parse(currentProgress.window?.start_at || ''))
    .sort((left, right) => Date.parse(left?.window?.start_at || '') - Date.parse(right?.window?.start_at || ''));
  return toDisplayedActivities(candidates)
    .sort((left, right) => Date.parse(left?.window?.start_at || '') - Date.parse(right?.window?.start_at || ''))
    .slice(0, futureLimit.value);
});

function toDisplayedActivities(items) {
  const groupsByFamily = new Map();
  const groups = [];
  for (const activity of items) {
    const familyKeys = activityGroupingKeys(activity);
    const matchingGroups = [...new Set(familyKeys.flatMap((key) => groupsByFamily.get(key) || []))];
    let group = matchingGroups.find((candidate) => relatedActivityWindows(activity, candidate.activity));
    if (!group) {
      group = { activity, activities: [activity] };
      groups.push(group);
    } else {
      group.activities.push(activity);
      if (activityDisplayPriority(activity) > activityDisplayPriority(group.activity)) group.activity = activity;
    }
    for (const key of familyKeys) {
      const familyGroups = groupsByFamily.get(key) || [];
      if (!familyGroups.includes(group)) familyGroups.push(group);
      groupsByFamily.set(key, familyGroups);
    }
  }
  return groups.map(toDisplayActivity);
}

function isMajorActivity(activity) {
  if (MAJOR_ACTIVITY_TYPES.has(activity?.type)) return true;
  const names = Object.values(activity?.name_i18n || {}).join(' ');
  return activity?.type === 'other' && MAJOR_OTHER_ACTIVITY_PATTERN.test(names);
}

function isFuturePreviewActivity(activity) {
  if (activity?.type !== 'campaign') return isMajorActivity(activity);
  const names = Object.values(activity?.name_i18n || {}).join(' ');
  return MAJOR_OTHER_ACTIVITY_PATTERN.test(names) || (activity?.recruitment_pools?.length || 0) > 0;
}

function alreadyAvailableOnCurrentServer(activity, currentServerCodes) {
  if (currentServerCodes.has(activity.code)) return true;
  const activityStart = Date.parse(activity?.window?.start_at || '');
  return futureActivities.value.some((sibling) => currentServerCodes.has(sibling.code)
    && activityFamilyKey(sibling) === activityFamilyKey(activity)
    && Math.abs(Date.parse(sibling?.window?.start_at || '') - activityStart) <= 24 * 60 * 60 * 1000);
}

function hasActivityArtwork(activity) {
  const source = getLocalActivityImageSource(activity?.code);
  return Boolean(source) && !source.startsWith('generated:');
}

function searchKey(value) {
  return normalizeChineseMusicText(String(value || ''), 'zh-CN')
    .toLocaleLowerCase()
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function matchesSearch(activity) {
  const query = searchKey(searchQuery.value);
  if (!query) return true;
  const names = Object.values(activity?.name_i18n || {});
  return names.some((name) => searchKey(name).includes(query));
}

function localized(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '—';
  const keys = locale.value === 'zh-TW' ? ['zh-TW', 'zh_tw', 'tw', 'zh-CN', 'en']
    : locale.value === 'zh-CN' ? ['zh-CN', 'zh_cn', 'cn', 'zh-TW', 'en']
      : [locale.value, 'en', 'zh-TW', 'zh-CN'];
  const text = keys.map((key) => value[key]).find(Boolean) || Object.values(value).find(Boolean) || '—';
  return normalizeChineseMusicText(text, locale.value);
}
function poolTypeLabel(type) { return copy.value.pools[type] || type; }
function activityFamilyKey(activity) {
  const names = activity?.name_i18n || {};
  const name = names['zh-TW'] || names['zh-CN'] || names.en || Object.values(names).find(Boolean) || activity?.code || '';
  return String(name)
    .toLocaleLowerCase()
    .replace(/(?:復刻|复刻|rerun|retrospection|re-run)/gu, '')
    .replace(/20\d{2}/gu, '')
    .replace(/[\s\p{P}\p{S}_]+/gu, '');
}
function activityWindowMinute(timestamp) {
  const time = Date.parse(timestamp || '');
  return Number.isFinite(time) ? Math.floor(time / 60_000) : String(timestamp || '');
}
function sameActivityWindow(left, right) {
  return activityWindowMinute(left?.window?.start_at) === activityWindowMinute(right?.window?.start_at)
    && activityWindowMinute(left?.window?.end_at) === activityWindowMinute(right?.window?.end_at);
}
function relatedActivityWindows(left, right) {
  if (sameActivityWindow(left, right)) return true;
  const leftStart = activityWindowMinute(left?.window?.start_at);
  const leftEnd = activityWindowMinute(left?.window?.end_at);
  const rightStart = activityWindowMinute(right?.window?.start_at);
  const rightEnd = activityWindowMinute(right?.window?.end_at);
  const startDifference = Math.abs(leftStart - rightStart);
  // PRTS can omit the final phase of a rerun while Wiki records its full window.
  // The shared start boundary and overlapping ranges identify the same activity.
  return Number.isFinite(leftStart) && Number.isFinite(leftEnd)
    && Number.isFinite(rightStart) && Number.isFinite(rightEnd)
    && startDifference <= 24 * 60
    && leftStart <= rightEnd && rightStart <= leftEnd;
}
function toDisplayActivity(group) {
  const activitiesInGroup = group.activities;
  const starts = activitiesInGroup.map((activity) => activity?.window?.start_at).filter(Boolean).sort();
  const ends = activitiesInGroup.map((activity) => activity?.window?.end_at).filter(Boolean).sort();
  const pools = new Map();
  for (const activity of activitiesInGroup) {
    for (const pool of activity?.recruitment_pools || []) pools.set(pool.id, pool);
  }
  return {
    ...group.activity,
    window: {
      ...group.activity.window,
      start_at: starts[0] || group.activity.window?.start_at,
      end_at: ends.at(-1) || group.activity.window?.end_at,
    },
    recruitment_pools: [...pools.values()],
  };
}
function normalizedImageSource(sourceUrl) {
  return String(sourceUrl || '')
    .trim()
    .replace(/[?#].*$/u, '')
    .toLocaleLowerCase();
}
function activityImageIdentity(activity) {
  const localSource = getLocalActivityImageSource(activity?.code);
  const sourceUrl = normalizedImageSource(localSource.startsWith('generated:') ? activity?.image_url : (localSource || activity?.image_url));
  return sourceUrl ? `image:${sourceUrl}` : `name:${activityFamilyKey(activity)}`;
}
function isRerunActivity(activity) {
  const names = Object.values(activity?.name_i18n || {}).join(' ');
  const code = String(activity?.code || '');
  return /(?:\u5fa9\u523b|\u590d\u523b|rerun|retrospection|re-run)/iu.test(`${names} ${code}`);
}
function activityDisplayPriority(activity) {
  const localSource = getLocalActivityImageSource(activity?.code);
  const hasSource = Boolean(normalizedImageSource(localSource.startsWith('generated:') ? activity?.image_url : (localSource || activity?.image_url)));
  const isWikiActivity = String(activity?.code || '').startsWith('wiki-');
  return (isRerunActivity(activity) ? 100 : 0) + (isWikiActivity ? 20 : 0) + (hasSource ? 10 : 0);
}
function activityGroupingKeys(activity) {
  const names = activity?.name_i18n || {};
  const nameVariants = [names['zh-CN'], names['zh-TW'], names.en, ...Object.values(names), activity?.code]
    .filter(Boolean);
  const keys = new Set();
  const overrideKey = ACTIVITY_DISPLAY_GROUP_OVERRIDES[activity?.code];
  if (overrideKey) keys.add(`override:${overrideKey}`);
  for (const name of nameVariants) {
    const normalizedName = normalizeChineseMusicText(String(name), 'zh-CN')
      .toLocaleLowerCase()
      .replace(/(?:\u5fa9\u523b|\u590d\u523b|rerun|retrospection|re-run)/gu, '')
      .replace(/20\d{2}/gu, '')
      .replace(/(?:#\s*\d+\s*\u8d5b\u5b63|\u7b2c?\s*\d+\s*\u8d5b\u5b63|season\s*#?\d+)/gu, '')
      .replace(/\s*\([^)]*\)\s*$/u, '')
      .replace(/\u4e0b\u534a\u671f/gu, '\u4e0b\u534a')
      .replace(/\u4e0a\u534a\u671f/gu, '\u4e0a\u534a');
    const fullKey = normalizedName
      .replace(/(?:[#/]\s*0*\d+)/gu, '')
      .replace(/[\s\p{P}\p{S}_]+/gu, '');
    const seriesKey = normalizedName
      .replace(/(?:[#/]\s*0*\d+)(?:\s*[\u300c\u201c"].*?[\u300d\u201d"])?/gu, '')
      .replace(/[\s\p{P}\p{S}_]+/gu, '');
    if (fullKey) keys.add(fullKey);
    if (seriesKey) keys.add(seriesKey);
  }
  return [...keys];
}
function escapeSvgText(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
}
function activityFallbackImageUrl(activity) {
  const title = escapeSvgText(localized(activity?.name_i18n));
  const serverName = escapeSvgText(copy.value[server.value] || server.value.toUpperCase());
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="540" viewBox="0 0 1200 540"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#162a46"/><stop offset="1" stop-color="#0b111b"/></linearGradient></defs><rect width="1200" height="540" fill="url(#bg)"/><path d="M0 420 380 160 620 540 900 230 1200 430V540H0Z" fill="#2766ad" opacity=".3"/><text x="72" y="88" fill="#69b7ff" font-family="system-ui,sans-serif" font-size="26" font-weight="700">ARKNIGHTS · ${serverName}</text><text x="72" y="286" fill="#f3f7ff" font-family="system-ui,sans-serif" font-size="54" font-weight="700">${title}</text><text x="72" y="346" fill="#b7c8df" font-family="system-ui,sans-serif" font-size="28">活動圖片同步中</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function activityImageUrl(activity) {
  const localUrl = getLocalActivityImageUrl(activity?.code);
  return localUrl && !failedImageUrls.value.has(localUrl) ? localUrl : activityFallbackImageUrl(activity);
}
function hasImage() { return true; }
function markImageFailed(url) { failedImageUrls.value = new Set([...failedImageUrls.value, url]); }
function formatRange(start, end) {
  const formatter = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const startLabel = start ? formatter.format(new Date(start)) : '—';
  return end ? `${startLabel} — ${formatter.format(new Date(end))}` : `${startLabel} —`;
}
async function loadActivities() {
  loading.value = true;
  error.value = '';
  const needsFutureData = showFuture.value && server.value !== 'cn';
  const [result, futureResult] = await Promise.all([
    fetchActivities(server.value),
    needsFutureData ? fetchActivities('cn') : Promise.resolve(null),
    loadActivityAssetManifest(),
  ]);
  activities.value = result.activities;
  futureActivities.value = futureResult?.activities || [];
  isStale.value = result.stale;
  if (result.source === 'unavailable') error.value = copy.value.error;
  loading.value = false;
}
watch([server, showFuture], loadActivities);
onMounted(loadActivities);
</script>

<style scoped>
.activity-page{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:30px 0 64px;color:var(--text-color)}
.activity-header{position:static;z-index:auto;box-sizing:border-box;width:auto;padding:0;margin:0 0 28px;text-align:left;background:transparent;backdrop-filter:none;box-shadow:none;display:flex;flex-direction:row;justify-content:space-between;align-items:end;gap:24px}
.activity-header h1{margin:0 0 7px;font-size:2rem}.activity-header p{margin:0;color:var(--text-secondary)}.activity-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.server-control,.scope-control{display:grid;gap:6px;min-width:150px;color:var(--text-secondary);font-size:.78rem}.server-control{min-width:190px}.server-control select,.scope-control select{height:42px;border:1px solid var(--border-color);border-radius:6px;background:#0d1117;color:var(--text-color);padding:0 10px}.future-toggle{display:flex;align-items:center;gap:8px;height:42px;color:var(--text-color);font-size:.86rem;white-space:nowrap}.future-toggle input{accent-color:var(--primary-color)}.search-control{display:grid;gap:6px;max-width:420px;margin:0 0 22px;color:var(--text-secondary);font-size:.78rem}.search-control input{height:42px;border:1px solid var(--border-color);border-radius:6px;background:#0d1117;color:var(--text-color);padding:0 12px;font:inherit}.future-section{margin:0 0 36px;padding:20px 0 0;border-top:1px solid rgba(255,255,255,.12)}.future-header{margin:0 0 16px}.future-header h2{margin:0 0 6px;font-size:1.35rem}.future-header p{margin:0;color:var(--text-secondary);font-size:.9rem}.future-empty{display:flex;align-items:center;gap:9px;min-height:72px;margin:0;border:1px dashed var(--border-color);border-radius:10px;color:var(--text-secondary);padding:0 16px}.future-badge{display:flex;align-items:center;gap:7px;margin:9px 0 0;color:#d4b65c;font-size:.77rem}.activity-card.future-card{border-color:rgba(212,182,92,.3)}.activity-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:16px}.activity-card{overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#161b22;box-shadow:0 8px 22px rgba(0,0,0,.18);transition:transform .2s ease,border-color .2s ease}.activity-card:hover{transform:translateY(-3px);border-color:rgba(88,166,255,.52)}.activity-visual{height:min(32vw,136px);min-height:104px;background:linear-gradient(135deg,#182436,#10151d);overflow:hidden}.activity-visual img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}.image-placeholder{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.2);font-size:2rem}.activity-content{padding:14px 16px 16px}.activity-card h2{margin:0;font-size:1.05rem;line-height:1.35}.date-range{display:flex;align-items:flex-start;gap:8px;margin:9px 0 0;color:#b1bac4;font-size:.82rem;line-height:1.45}.date-range i{margin-top:2px;color:var(--primary-color)}.pool-section{margin-top:15px;padding-top:13px;border-top:1px solid rgba(255,255,255,.08)}.pool-section h3{margin:0 0 8px;color:#8b949e;font-size:.73rem;font-weight:600}.pool-section ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}.pool-section li{display:flex;justify-content:space-between;gap:10px;font-size:.84rem}.pool-section li strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pool-section li span{flex:0 0 auto;color:var(--primary-color);font-size:.74rem}.state{min-height:220px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px dashed var(--border-color);color:var(--text-secondary)}.state.error{color:#ff7b72}.spinner{width:20px;height:20px;border:2px solid var(--border-color);border-top-color:var(--primary-color);border-radius:50%;animation:spin .8s linear infinite}.stale-note{margin:14px 0 0;color:#d4b65c;font-size:.8rem}.stale-note i{margin-right:7px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.activity-page{width:calc(100% - 24px);padding-top:18px}.activity-header{align-items:stretch;flex-direction:column}.activity-controls{width:100%;flex-direction:column;align-items:stretch}.server-control,.scope-control,.search-control{width:100%;max-width:none}.future-toggle{height:auto;min-height:42px}.activity-list{grid-template-columns:1fr}.activity-visual{height:min(32vw,136px)}}
</style>

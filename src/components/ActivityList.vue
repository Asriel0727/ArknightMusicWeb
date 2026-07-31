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
          <button class="activity-open" type="button" @click="openActivity(activity)">
            <span class="activity-visual">
              <img v-if="hasImage(activity)" :src="activityImageUrl(activity)" :alt="localized(activity.name_i18n)" loading="lazy" @error="markImageFailed(activityImageUrl(activity))">
              <span v-else class="image-placeholder"><i class="fas fa-image"></i></span>
            </span>
            <span class="activity-content">
              <strong class="activity-title">{{ localized(activity.name_i18n) }}</strong>
              <span class="future-badge"><i class="fas fa-eye"></i>{{ copy.futureBadge }}</span>
              <span class="date-range"><i class="fas fa-calendar-days"></i>{{ formatRange(activity.window.start_at, activity.window.end_at) }}</span>
              <span class="activity-more">{{ activityDetailCopy.openActivity }} <i class="fas fa-arrow-right"></i></span>
            </span>
          </button>
        </article>
      </div>
    </section>

    <div v-if="loading" class="state"><span class="spinner"></span>{{ copy.loading }}</div>
    <div v-else-if="error" class="state error"><i class="fas fa-triangle-exclamation"></i>{{ error }}</div>
    <div v-else-if="!displayedActivities.length" class="state"><i class="fas fa-calendar-xmark"></i>{{ copy.empty }}</div>
    <section v-else class="activity-list">
      <article v-for="activity in displayedActivities" :key="activity.window.id" class="activity-card">
        <button class="activity-open" type="button" @click="openActivity(activity)">
          <span class="activity-visual">
            <img v-if="hasImage(activity)" :src="activityImageUrl(activity)" :alt="localized(activity.name_i18n)" loading="lazy" @error="markImageFailed(activityImageUrl(activity))">
            <span v-else class="image-placeholder"><i class="fas fa-image"></i></span>
          </span>
          <span class="activity-content">
            <strong class="activity-title">{{ localized(activity.name_i18n) }}</strong>
            <span class="date-range"><i class="fas fa-calendar-days"></i>{{ formatRange(activity.window.start_at, activity.window.end_at) }}</span>
            <span class="activity-more">{{ activityDetailCopy.openActivity }} <i class="fas fa-arrow-right"></i></span>
          </span>
        </button>
      </article>
    </section>
    <p v-if="isStale" class="stale-note"><i class="fas fa-circle-info"></i>{{ copy.stale }}</p>

    <div v-if="selectedActivity" class="pool-dialog-backdrop" @click.self="closeActivity">
      <section class="pool-dialog activity-dialog" role="dialog" aria-modal="true" :aria-label="localized(selectedActivity.name_i18n)">
        <button class="pool-dialog-close" type="button" :aria-label="activityDetailCopy.close" @click="closeActivity">
          <i class="fas fa-xmark"></i>
        </button>
        <img class="activity-dialog-banner" :src="activityImageUrl(selectedActivity)" :alt="localized(selectedActivity.name_i18n)" @error="markImageFailed(activityImageUrl(selectedActivity))">
        <div class="activity-dialog-content">
          <header class="activity-dialog-header">
            <p>{{ activityDetailCopy.activity }}</p>
            <h2>{{ localized(selectedActivity.name_i18n) }}</h2>
            <span class="date-range"><i class="fas fa-calendar-days"></i>{{ formatRange(selectedActivity.window.start_at, selectedActivity.window.end_at) }}</span>
          </header>
          <section class="activity-pools">
            <h3>{{ copy.recruitmentPools }}</h3>
            <div v-if="selectedActivity.recruitment_pools?.length" class="activity-pool-list">
              <article v-for="pool in selectedActivity.recruitment_pools" :key="pool.id" class="activity-pool-detail">
                <img v-if="poolImageUrl(pool)" class="pool-dialog-banner" :src="poolImageUrl(pool)" :alt="localizedPoolName(pool)" @error="markPoolImageFailed(poolImageUrl(pool))">
                <div class="pool-dialog-content">
                  <p class="pool-kind">{{ poolTypeLabel(pool.kind) }}</p>
                  <h2>{{ localizedPoolName(pool) }}</h2>
                  <h3>{{ poolDetailCopy.rateUpOperators }}</h3>
                  <div v-if="pool.operators?.length" class="pool-operators">
                    <button
                      v-for="operator in pool.operators"
                      :key="operator.id"
                      class="pool-operator"
                      type="button"
                      @click="viewOperator(operator)"
                    >
                      <img v-if="operatorAvatarUrl(operator)" :src="operatorAvatarUrl(operator)" :alt="localizedOperatorName(operator)" loading="lazy">
                      <span class="pool-operator-copy">
                        <strong>{{ localizedOperatorName(operator) }}</strong>
                        <small>
                          {{ '★'.repeat(operator.rarity) }}
                          · {{ operator.featured === 'secondary' ? poolDetailCopy.secondaryRateUp : poolDetailCopy.primaryRateUp }}
                          <template v-if="operator.limited"> · {{ poolDetailCopy.limited }}</template>
                        </small>
                      </span>
                      <i class="fas fa-chevron-right"></i>
                    </button>
                  </div>
                  <p v-else class="pool-operator-empty">{{ poolDetailCopy.noOperatorData }}</p>
                </div>
              </article>
            </div>
            <p v-else class="pool-operator-empty">
              {{ selectedActivity.expects_recruitment_pool === false
                ? activityDetailCopy.noPoolForActivity
                : activityDetailCopy.noPoolData }}
            </p>
          </section>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getActivityClassification } from '../data/activityCatalog.js';
import { fetchActivities } from '../services/activityApi.js';
import { getLocalActivityImageSource, getLocalActivityImageUrl, loadActivityAssetManifest } from '../services/activityAssetManifest.js';
import { getLocalOperatorAvatarUrl, loadOperatorAssetManifest } from '../services/operatorAssetManifest.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';

const emit = defineEmits(['view-character']);
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
const failedPoolImageUrls = ref(new Set());
const selectedActivity = ref(null);
const cnOperatorNames = ref(new Map());

// Historic PRTS and Wiki records whose titles are translations rather than
// spelling variants. Keep these explicit aliases narrow to avoid hiding
// unrelated activities that merely share a banner or a release window.
const ACTIVITY_DISPLAY_GROUP_OVERRIDES = {
  'wiki-medjehtiqedti-bound': 'medjehtiqedti-bound-2026',
  'prts-17xyioi': 'medjehtiqedti-bound-2026',
  'wiki-sui-s-garden-of-grotesqueries-mission-event': 'sui-garden-mission-2026',
  'prts-1gtn4va': 'sui-garden-mission-2026',
  'wiki-such-is-the-joy-of-our-reunion-rerun': 'such-is-the-joy-rerun-2026',
  'prts-hj2yk2': 'such-is-the-joy-rerun-2026',
  'prts-h3okge': 'act-or-die-2025',
  'wiki-act-or-die': 'act-or-die-2025',
  'prts-r2bmlv': 'integrated-lookback-back-to-castle-2025',
  'wiki-integrated-lookback-back-to-castle': 'integrated-lookback-back-to-castle-2025',
  'prts-ytniih': 'paddles-up-login-event-2025',
  'wiki-paddles-up-login-event': 'paddles-up-login-event-2025',
  'prts-1fvqqe1': 'contingency-contract-2019',
  'wiki-contingency-contract-event': 'contingency-contract-2019',
};
// Keep the display correct while an already-synced API record waits for the
// Worker to refresh its normalized type.
const ACTIVITY_TYPE_OVERRIDES = {
  'wiki-medjehtiqedti-bound': 'side_story',
  'wiki-sui-s-garden-of-grotesqueries-mission-event': 'campaign',
};
const TEXT = {
  'zh-TW': { title: '活動', subtitle: '查看各伺服器的活動檔期與對應卡池。', server: '伺服器', scope: '顯示範圍', majorOnly: '故事活動', allActivities: '全部活動', showFuture: '顯示未來視', futureCount: '顯示筆數', futureTitle: '未來視（陸服參考）', futureSubtitle: '以下為陸服已公布、尚未在目前伺服器開始的活動。', futureBadge: '陸服未來活動', noFuture: '目前沒有可參考的未來活動。', search: '搜尋活動', searchPlaceholder: '例如：危機合約', tw: '繁中服', global: '國際服', cn: '陸服', loading: '正在載入活動資料…', empty: '目前沒有符合條件的活動。', error: '無法載入活動資料，請稍後再試。', recruitmentPools: '對應卡池', stale: '目前顯示上次成功取得的快取資料。', pools: { standard: '標準尋訪', kernel: '中堅尋訪', limited: '限定尋訪', event: '活動尋訪' } },
  'zh-CN': { title: '活动', subtitle: '查看各服务器的活动档期与对应卡池。', server: '服务器', scope: '显示范围', majorOnly: '故事活动', allActivities: '全部活动', showFuture: '显示未来视', futureCount: '显示数量', futureTitle: '未来视（国服参考）', futureSubtitle: '以下为国服已公布、尚未在当前服务器开始的活动。', futureBadge: '国服未来活动', noFuture: '目前没有可参考的未来活动。', search: '搜索活动', searchPlaceholder: '例如：危机合约', tw: '繁中服', global: '国际服', cn: '国服', loading: '正在加载活动数据…', empty: '目前没有符合条件的活动。', error: '无法加载活动数据，请稍后再试。', recruitmentPools: '对应卡池', stale: '目前显示上次成功取得的缓存数据。', pools: { standard: '标准寻访', kernel: '中坚寻访', limited: '限定寻访', event: '活动寻访' } },
  en: { title: 'Activities', subtitle: 'Browse event windows and related banners by server.', server: 'Server', scope: 'Display', majorOnly: 'Story activities', allActivities: 'All activities', showFuture: 'Show CN preview', futureCount: 'Items', futureTitle: 'CN server preview', futureSubtitle: 'Activities announced for CN that have not started on the selected server.', futureBadge: 'CN preview', noFuture: 'No future activities are available.', search: 'Search activities', searchPlaceholder: 'For example: Contingency Contract', tw: 'Traditional Chinese', global: 'Global', cn: 'CN', loading: 'Loading activities…', empty: 'No matching activities are available.', error: 'Could not load activities. Please try again later.', recruitmentPools: 'Related banners', stale: 'Showing the last successfully loaded cached data.', pools: { standard: 'Standard', kernel: 'Kernel', limited: 'Limited', event: 'Event banner' } },
};
const copy = computed(() => TEXT[locale.value] || TEXT.en);
const POOL_DETAIL_TEXT = {
  'zh-TW': { openPool: '查看卡池', close: '關閉卡池資料', rateUpOperators: 'UP 幹員', primaryRateUp: '主要機率提升', secondaryRateUp: '額外機率提升', limited: '限定', noOperatorData: '目前沒有可顯示的幹員資料。' },
  'zh-CN': { openPool: '查看卡池', close: '关闭卡池资料', rateUpOperators: 'UP 干员', primaryRateUp: '主要概率提升', secondaryRateUp: '额外概率提升', limited: '限定', noOperatorData: '目前没有可显示的干员资料。' },
  en: { openPool: 'View banner', close: 'Close banner details', rateUpOperators: 'Rate-up Operators', primaryRateUp: 'Primary rate-up', secondaryRateUp: 'Secondary rate-up', limited: 'Limited', noOperatorData: 'No Operator data is available for this banner.' },
};
const poolDetailCopy = computed(() => POOL_DETAIL_TEXT[locale.value] || POOL_DETAIL_TEXT.en);
const ACTIVITY_DETAIL_TEXT = {
  'zh-TW': { activity: '活動詳情', openActivity: '查看活動內容', close: '關閉活動詳情', noPoolData: '這個活動目前沒有對應卡池資料。', noPoolForActivity: '本次活動沒有開啟對應卡池。' },
  'zh-CN': { activity: '活动详情', openActivity: '查看活动内容', close: '关闭活动详情', noPoolData: '这个活动目前没有对应卡池资料。', noPoolForActivity: '本次活动没有开启对应卡池。' },
  en: { activity: 'Activity details', openActivity: 'View activity', close: 'Close activity details', noPoolData: 'No related banner data is available for this activity.', noPoolForActivity: 'No event-specific banner ran with this event.' },
};
const activityDetailCopy = computed(() => ACTIVITY_DETAIL_TEXT[locale.value] || ACTIVITY_DETAIL_TEXT.en);
// 預設只顯示具有完整故事活動與對應活動卡池的正式活動。
// 危機合約、登入活動、試煉與其他短期玩法仍可在「全部活動」查看。
const MAJOR_ACTIVITY_TYPES = new Set(['side_story', 'intermezzi']);
const visibleActivities = computed(() => activities.value
  .filter((activity) => !hasYearInActivityName(activity))
  .filter(hasActivityArtwork)
  .filter(matchesSearch)
  .filter((activity) => activityScope.value === 'all' || isMajorActivity(activity)));
const displayedActivities = computed(() => toDisplayedActivities(visibleActivities.value));
const displayedFutureActivities = computed(() => {
  if (!showFuture.value || server.value === 'cn') return [];
  const cnActivitiesByCode = new Map(futureActivities.value.map((activity) => [activity.code, activity]));
  const currentProgress = [...activities.value]
    .filter((activity) => !hasYearInActivityName(activity))
    .filter(hasActivityArtwork)
    .filter((activity) => activityScope.value === 'all' || isMajorActivity(activity))
    .sort((left, right) => Date.parse(right?.window?.start_at || '') - Date.parse(left?.window?.start_at || ''))
    .map((activity) => cnActivitiesByCode.get(activity.code))
    .find(Boolean);
  const currentServerCodes = new Set(activities.value.map((activity) => activity.code));
  if (!currentProgress) return [];
  const candidates = futureActivities.value
    .filter((activity) => !hasYearInActivityName(activity))
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
  const catalogClassification = getActivityClassification(activity);
  if (catalogClassification) return catalogClassification === 'story';
  return MAJOR_ACTIVITY_TYPES.has(activityType(activity));
}

function isFuturePreviewActivity(activity) {
  // Collaboration availability depends on regional licensing, so CN dates are
  // not a reliable preview for TW or Global.
  if (activityType(activity) === 'collaboration') return false;
  return isMajorActivity(activity);
}

function activityType(activity) {
  return ACTIVITY_TYPE_OVERRIDES[activity?.code] || activity?.type || 'other';
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

function hasYearInActivityName(activity) {
  return Object.values(activity?.name_i18n || {}).some((name) => /20\d{2}/u.test(String(name || '')));
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
  const localizedText = normalizeChineseMusicText(text, locale.value);
  return ['zh-TW', 'zh-CN'].includes(locale.value)
    ? localizedText.replace(/\s*\([^()]*[A-Za-z][^()]*\)\s*/gu, ' ').trim()
    : localizedText;
}
function poolTypeLabel(type) { return copy.value.pools[type] || type; }
function localizedPoolName(pool) {
  const names = pool?.name_i18n || {};
  if (locale.value === 'zh-TW' && !names['zh-TW'] && !names['zh-CN']) {
    return `${localized(selectedActivity.value?.name_i18n)}・活動尋訪`;
  }
  if (locale.value === 'zh-CN' && !names['zh-CN'] && !names['zh-TW']) {
    return `${localized(selectedActivity.value?.name_i18n)}・活动寻访`;
  }
  return localized(names);
}
function localizedOperatorName(operator) {
  if (['zh-TW', 'zh-CN'].includes(locale.value)) {
    const chineseName = operator?.name_i18n?.[locale.value]
      || operator?.name_i18n?.['zh-CN']
      || operator?.name_i18n?.['zh-TW']
      || cnOperatorNames.value.get(operator?.id);
    if (chineseName) return normalizeChineseMusicText(chineseName, locale.value);
  }
  return localized(operator?.name_i18n);
}
async function loadChineseOperatorNames() {
  if (!['zh-TW', 'zh-CN'].includes(locale.value) || cnOperatorNames.value.size) return;
  try {
    const response = await fetch('https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/character_table.json');
    if (!response.ok) return;
    const characters = await response.json();
    cnOperatorNames.value = new Map(
      Object.entries(characters).map(([id, character]) => [id, character?.name]).filter(([, name]) => name),
    );
  } catch {
    // The generated catalog still provides English as an offline fallback.
  }
}
watch(locale, loadChineseOperatorNames, { immediate: true });
function poolImageUrl(pool) {
  const localizedUrls = pool?.image_urls || {};
  const defaultUrl = String(localizedUrls.en || pool?.image_url || '');
  const inferredChineseUrl = defaultUrl.replace(
    /\/(?:EN)(?=[ _])/u,
    '/CN',
  );
  const candidates = locale.value === 'zh-TW'
    ? [localizedUrls['zh-TW'], localizedUrls['zh-CN'], inferredChineseUrl, defaultUrl]
    : locale.value === 'zh-CN'
      ? [localizedUrls['zh-CN'], inferredChineseUrl, defaultUrl]
      : [localizedUrls[locale.value], defaultUrl];
  return candidates
    .map((url) => String(url || ''))
    .find((url) => url && !failedPoolImageUrls.value.has(url)) || '';
}
function markPoolImageFailed(url) {
  failedPoolImageUrls.value = new Set([...failedPoolImageUrls.value, String(url || '')]);
}
function operatorAvatarUrl(operator) {
  return getLocalOperatorAvatarUrl(operator?.id);
}
function openActivity(activity) {
  selectedActivity.value = activity;
}
function closeActivity() {
  selectedActivity.value = null;
}
function viewOperator(operator) {
  emit('view-character', {
    ...operator,
    name: localized(operator.name_i18n),
    avatarUrl: operatorAvatarUrl(operator),
  });
}
function activityFamilyKey(activity) {
  const overrideKey = ACTIVITY_DISPLAY_GROUP_OVERRIDES[activity?.code];
  if (overrideKey) return `override:${overrideKey}`;
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
    for (const pool of activity?.recruitment_pools || []) {
      const poolKey = searchKey(pool?.slug
        || pool?.name_i18n?.en
        || pool?.name_i18n?.['zh-CN']
        || pool?.name_i18n?.['zh-TW']
        || pool?.id);
      if (!pools.has(poolKey)) pools.set(poolKey, pool);
    }
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
    loadOperatorAssetManifest(),
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
.activity-header h1{margin:0 0 7px;font-size:2rem}.activity-header p{margin:0;color:var(--text-secondary)}.activity-controls{display:flex;flex-wrap:wrap;gap:12px;align-items:end}.server-control,.scope-control{display:grid;gap:6px;min-width:150px;color:var(--text-secondary);font-size:.78rem}.server-control{min-width:190px}.server-control select,.scope-control select{height:42px;border:1px solid var(--border-color);border-radius:6px;background:#0d1117;color:var(--text-color);padding:0 10px}.future-toggle{display:flex;align-items:center;gap:8px;height:42px;color:var(--text-color);font-size:.86rem;white-space:nowrap}.future-toggle input{accent-color:var(--primary-color)}.search-control{display:grid;gap:6px;max-width:420px;margin:0 0 22px;color:var(--text-secondary);font-size:.78rem}.search-control input{height:42px;border:1px solid var(--border-color);border-radius:6px;background:#0d1117;color:var(--text-color);padding:0 12px;font:inherit}.future-section{margin:0 0 36px;padding:20px 0 0;border-top:1px solid rgba(255,255,255,.12)}.future-header{margin:0 0 16px}.future-header h2{margin:0 0 6px;font-size:1.35rem}.future-header p{margin:0;color:var(--text-secondary);font-size:.9rem}.future-empty{display:flex;align-items:center;gap:9px;min-height:72px;margin:0;border:1px dashed var(--border-color);border-radius:10px;color:var(--text-secondary);padding:0 16px}.future-badge{display:flex;align-items:center;gap:7px;margin:9px 0 0;color:#d4b65c;font-size:.77rem}.activity-card.future-card{border-color:rgba(212,182,92,.3)}.activity-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:16px}.activity-card{overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#161b22;box-shadow:0 8px 22px rgba(0,0,0,.18);transition:transform .2s ease,border-color .2s ease}.activity-card:hover{transform:translateY(-3px);border-color:rgba(88,166,255,.52)}.activity-visual{height:min(32vw,136px);min-height:104px;background:linear-gradient(135deg,#182436,#10151d);overflow:hidden}.activity-visual img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}.image-placeholder{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.2);font-size:2rem}.activity-content{padding:14px 16px 16px}.activity-card h2{margin:0;font-size:1.05rem;line-height:1.35}.date-range{display:flex;align-items:flex-start;gap:8px;margin:9px 0 0;color:#b1bac4;font-size:.82rem;line-height:1.45}.date-range i{margin-top:2px;color:var(--primary-color)}.pool-section{margin-top:15px;padding-top:13px;border-top:1px solid rgba(255,255,255,.08)}.pool-section h3{margin:0 0 8px;color:#8b949e;font-size:.73rem;font-weight:600}.pool-section ul{display:grid;gap:9px;margin:0;padding:0;list-style:none}.pool-trigger{width:100%;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#0d1117;color:var(--text-color);padding:0;text-align:left;cursor:pointer;transition:border-color .2s,transform .2s}.pool-trigger:hover,.pool-trigger:focus-visible{border-color:var(--primary-color);transform:translateY(-1px)}.pool-trigger>img{display:block;width:100%;aspect-ratio:1200/655;object-fit:cover}.pool-trigger-copy{display:grid;gap:3px;padding:8px 10px}.pool-trigger-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.82rem}.pool-trigger-copy small{color:var(--primary-color);font-size:.7rem}.pool-dialog-backdrop{position:fixed;z-index:1000;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.76);backdrop-filter:blur(5px)}.pool-dialog{position:relative;width:min(760px,100%);max-height:min(90vh,820px);overflow:auto;border:1px solid rgba(255,255,255,.16);border-radius:14px;background:#161b22;box-shadow:0 24px 70px rgba(0,0,0,.55)}.pool-dialog-close{position:absolute;z-index:2;top:12px;right:12px;display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(255,255,255,.2);border-radius:50%;background:rgba(13,17,23,.84);color:#fff;cursor:pointer}.pool-dialog-banner{display:block;width:100%;aspect-ratio:1200/655;object-fit:cover;background:#0d1117}.pool-dialog-content{padding:20px}.pool-dialog-content h2{margin:3px 0 22px;font-size:1.5rem}.pool-dialog-content h3{margin:0 0 10px;color:var(--text-secondary);font-size:.8rem}.pool-kind{margin:0;color:var(--primary-color);font-size:.75rem}.pool-operators{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.pool-operator{display:grid;grid-template-columns:52px minmax(0,1fr) auto;align-items:center;gap:11px;min-width:0;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#0d1117;color:var(--text-color);padding:8px;text-align:left;cursor:pointer}.pool-operator:hover,.pool-operator:focus-visible{border-color:var(--primary-color)}.pool-operator>img{width:52px;height:52px;border-radius:7px;object-fit:cover;background:#202938}.pool-operator-copy{display:grid;min-width:0;gap:4px}.pool-operator-copy strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.86rem}.pool-operator-copy small{color:#d4b65c;font-size:.68rem;line-height:1.35}.pool-operator>i{color:var(--text-secondary);font-size:.72rem}.pool-operator-empty{margin:0;color:var(--text-secondary)}.state{min-height:220px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px dashed var(--border-color);color:var(--text-secondary)}.state.error{color:#ff7b72}.spinner{width:20px;height:20px;border:2px solid var(--border-color);border-top-color:var(--primary-color);border-radius:50%;animation:spin .8s linear infinite}.stale-note{margin:14px 0 0;color:#d4b65c;font-size:.8rem}.stale-note i{margin-right:7px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.activity-page{width:calc(100% - 24px);padding-top:18px}.activity-header{align-items:stretch;flex-direction:column}.activity-controls{width:100%;flex-direction:column;align-items:stretch}.server-control,.scope-control,.search-control{width:100%;max-width:none}.future-toggle{height:auto;min-height:42px}.activity-list{grid-template-columns:1fr}.activity-visual{height:min(32vw,136px)}.pool-dialog-backdrop{padding:10px}.pool-operators{grid-template-columns:1fr}.pool-dialog-content{padding:16px}}
.activity-open{display:block;width:100%;border:0;background:transparent;color:inherit;padding:0;text-align:left;cursor:pointer}.activity-open:focus-visible{outline:2px solid var(--primary-color);outline-offset:-2px}.activity-open .activity-visual,.activity-open .activity-content{display:block}.activity-title{display:block;font-size:1.05rem;line-height:1.35}.activity-more{display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding-top:11px;border-top:1px solid rgba(255,255,255,.08);color:var(--primary-color);font-size:.76rem}.activity-dialog{width:min(920px,100%)}.activity-dialog-banner{display:block;width:100%;height:min(32vw,300px);min-height:190px;object-fit:cover;background:#0d1117}.activity-dialog-content{padding:24px}.activity-dialog-header{padding-bottom:22px;border-bottom:1px solid rgba(255,255,255,.1)}.activity-dialog-header>p{margin:0;color:var(--primary-color);font-size:.76rem}.activity-dialog-header h2{margin:5px 0 0;font-size:1.8rem}.activity-dialog-header .date-range{margin-top:10px}.activity-pools{margin-top:24px}.activity-pools>h3{margin:0 0 12px;color:var(--text-secondary);font-size:.82rem}.activity-pool-list{display:grid;gap:20px}.activity-pool-detail{overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:#10151d}.activity-pool-detail .pool-dialog-banner{max-height:360px}.activity-pool-detail .pool-dialog-content h2{margin-bottom:18px}@media(max-width:700px){.activity-dialog-banner{height:190px}.activity-dialog-content{padding:16px}.activity-dialog-header h2{font-size:1.4rem}}
</style>

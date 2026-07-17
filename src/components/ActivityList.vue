<template>
  <main class="activity-page">
    <header class="activity-header">
      <div>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <label class="server-control">
        <span>{{ copy.server }}</span>
        <select v-model="server">
          <option value="tw">{{ copy.tw }}</option>
          <option value="global">{{ copy.global }}</option>
          <option value="cn">{{ copy.cn }}</option>
        </select>
      </label>
    </header>

    <div v-if="loading" class="state"><span class="spinner"></span>{{ copy.loading }}</div>
    <div v-else-if="error" class="state error"><i class="fas fa-triangle-exclamation"></i>{{ error }}</div>
    <div v-else-if="!activities.length" class="state"><i class="fas fa-calendar-xmark"></i>{{ copy.empty }}</div>
    <section v-else class="activity-list">
      <article v-for="activity in activities" :key="activity.window.id" class="activity-card">
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
import { getLocalActivityImageUrl, loadActivityAssetManifest } from '../services/activityAssetManifest.js';

const { locale } = useI18n();
const server = ref(locale.value === 'zh-TW' ? 'tw' : locale.value === 'zh-CN' ? 'cn' : 'global');
const activities = ref([]);
const loading = ref(true);
const error = ref('');
const isStale = ref(false);
const failedImageUrls = ref(new Set());

const TEXT = {
  'zh-TW': { title: '活動', subtitle: '查看各伺服器的活動檔期與對應卡池。', server: '伺服器', tw: '繁中服', global: '國際服', cn: '陸服', loading: '正在載入活動資料…', empty: '目前沒有活動資料。', error: '無法載入活動資料，請稍後再試。', recruitmentPools: '對應卡池', stale: '目前顯示上次成功取得的快取資料。', pools: { standard: '標準尋訪', kernel: '中堅尋訪', limited: '限定尋訪', event: '活動尋訪' } },
  'zh-CN': { title: '活动', subtitle: '查看各服务器的活动档期与对应卡池。', server: '服务器', tw: '繁中服', global: '国际服', cn: '国服', loading: '正在加载活动数据…', empty: '目前没有活动数据。', error: '无法加载活动数据，请稍后再试。', recruitmentPools: '对应卡池', stale: '目前显示上次成功取得的缓存数据。', pools: { standard: '标准寻访', kernel: '中坚寻访', limited: '限定寻访', event: '活动寻访' } },
  en: { title: 'Activities', subtitle: 'Browse event windows and related banners by server.', server: 'Server', tw: 'Traditional Chinese', global: 'Global', cn: 'CN', loading: 'Loading activities…', empty: 'No activities available.', error: 'Could not load activities. Please try again later.', recruitmentPools: 'Related banners', stale: 'Showing the last successfully loaded cached data.', pools: { standard: 'Standard', kernel: 'Kernel', limited: 'Limited', event: 'Event banner' } },
};
const copy = computed(() => TEXT[locale.value] || TEXT.en);

function localized(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '—';
  const keys = locale.value === 'zh-TW' ? ['zh-TW', 'zh_tw', 'tw', 'zh-CN', 'en']
    : locale.value === 'zh-CN' ? ['zh-CN', 'zh_cn', 'cn', 'zh-TW', 'en']
      : [locale.value, 'en', 'zh-TW', 'zh-CN'];
  return keys.map((key) => value[key]).find(Boolean) || Object.values(value).find(Boolean) || '—';
}
function poolTypeLabel(type) { return copy.value.pools[type] || type; }
function activityImageUrl(activity) { return getLocalActivityImageUrl(activity?.code); }
function hasImage(activity) { const url = activityImageUrl(activity); return Boolean(url) && !failedImageUrls.value.has(url); }
function markImageFailed(url) { failedImageUrls.value = new Set([...failedImageUrls.value, url]); }
function formatRange(start, end) {
  const formatter = new Intl.DateTimeFormat(locale.value, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const startLabel = start ? formatter.format(new Date(start)) : '—';
  return end ? `${startLabel} — ${formatter.format(new Date(end))}` : `${startLabel} —`;
}
async function loadActivities() {
  loading.value = true;
  error.value = '';
  const [result] = await Promise.all([fetchActivities(server.value), loadActivityAssetManifest()]);
  activities.value = result.activities;
  isStale.value = result.stale;
  if (result.source === 'unavailable') error.value = copy.value.error;
  loading.value = false;
}
watch(server, loadActivities);
onMounted(loadActivities);
</script>

<style scoped>
.activity-page{width:min(1180px,calc(100% - 40px));margin:0 auto;padding:30px 0 64px;color:var(--text-color)}.activity-header{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:28px}.activity-header h1{margin:0 0 7px;font-size:2rem}.activity-header p{margin:0;color:var(--text-secondary)}.server-control{display:grid;gap:6px;min-width:190px;color:var(--text-secondary);font-size:.78rem}.server-control select{height:42px;border:1px solid var(--border-color);border-radius:6px;background:#0d1117;color:var(--text-color);padding:0 10px}.activity-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr));gap:16px}.activity-card{overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#161b22;box-shadow:0 8px 22px rgba(0,0,0,.18);transition:transform .2s ease,border-color .2s ease}.activity-card:hover{transform:translateY(-3px);border-color:rgba(88,166,255,.52)}.activity-visual{height:min(32vw,136px);min-height:104px;background:linear-gradient(135deg,#182436,#10151d);overflow:hidden}.activity-visual img{width:100%;height:100%;object-fit:cover;object-position:center;display:block}.image-placeholder{height:100%;display:grid;place-items:center;color:rgba(255,255,255,.2);font-size:2rem}.activity-content{padding:14px 16px 16px}.activity-card h2{margin:0;font-size:1.05rem;line-height:1.35}.date-range{display:flex;align-items:flex-start;gap:8px;margin:9px 0 0;color:#b1bac4;font-size:.82rem;line-height:1.45}.date-range i{margin-top:2px;color:var(--primary-color)}.pool-section{margin-top:15px;padding-top:13px;border-top:1px solid rgba(255,255,255,.08)}.pool-section h3{margin:0 0 8px;color:#8b949e;font-size:.73rem;font-weight:600}.pool-section ul{display:grid;gap:7px;margin:0;padding:0;list-style:none}.pool-section li{display:flex;justify-content:space-between;gap:10px;font-size:.84rem}.pool-section li strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pool-section li span{flex:0 0 auto;color:var(--primary-color);font-size:.74rem}.state{min-height:220px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px dashed var(--border-color);color:var(--text-secondary)}.state.error{color:#ff7b72}.spinner{width:20px;height:20px;border:2px solid var(--border-color);border-top-color:var(--primary-color);border-radius:50%;animation:spin .8s linear infinite}.stale-note{margin:14px 0 0;color:#d4b65c;font-size:.8rem}.stale-note i{margin-right:7px}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.activity-page{width:calc(100% - 24px);padding-top:18px}.activity-header{align-items:stretch;flex-direction:column}.server-control{width:100%}.activity-list{grid-template-columns:1fr}.activity-visual{height:min(32vw,136px)}}
</style>

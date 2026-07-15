<template>
  <main class="recruitment-page">
    <div class="recruitment-header">
      <div>
        <span class="section-code">RECRUIT / TAG ANALYSIS</span>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.subtitle }}</p>
      </div>
      <label class="server-control">
        <span>{{ copy.server }}</span>
        <select v-model="server">
          <option value="tw">{{ copy.tw }}</option>
          <option value="cn">{{ copy.cn }}</option>
          <option value="global">{{ copy.global }}</option>
        </select>
      </label>
    </div>

    <section class="recruit-console">
      <div class="selection-status">
        <div>
          <span>{{ copy.selected }}</span>
          <strong>{{ selectedTags.length }} / 5</strong>
        </div>
        <div class="selected-list">
          <button v-for="tag in selectedTags" :key="tag.key" type="button" @click="toggleTag(tag)">
            {{ tag.label }}<i class="fas fa-xmark"></i>
          </button>
          <span v-if="!selectedTags.length">{{ copy.selectHint }}</span>
        </div>
        <button class="reset-command" type="button" :disabled="!selectedTags.length" @click="selectedTags = []">
          <i class="fas fa-rotate-left"></i><span>{{ copy.reset }}</span>
        </button>
      </div>

      <div v-if="loading" class="loading-state"><span class="spinner"></span>{{ copy.loading }}</div>
      <div v-else-if="error" class="error-state">{{ error }}</div>
      <div v-else class="tag-groups">
        <section v-for="group in tagGroups" :key="group.id" class="tag-group">
          <div class="tag-group-title" :title="group.label"><i :class="group.icon"></i><span>{{ group.label }}</span></div>
          <div class="tag-grid">
            <button v-for="tag in group.tags" :key="tag.key" type="button"
              :class="{ active: isSelected(tag), blocked: selectedTags.length >= 5 && !isSelected(tag) }"
              :disabled="selectedTags.length >= 5 && !isSelected(tag)" @click="toggleTag(tag)">
              {{ tag.label }}
            </button>
          </div>
        </section>
      </div>
      <p v-if="server === 'tw'" class="source-note"><i class="fas fa-circle-info"></i>{{ copy.twNote }}</p>
      <p v-if="releaseWarning" class="source-note fallback-note"><i class="fas fa-triangle-exclamation"></i>{{ releaseWarning }}</p>
    </section>

    <section class="result-section">
      <div class="result-header">
        <div><span class="section-code">MATCH RESULT</span><h2>{{ copy.results }}</h2></div>
        <span>{{ combinations.length }} {{ copy.combinations }}</span>
      </div>
      <div v-if="!selectedTags.length" class="empty-result"><i class="fas fa-tags"></i><p>{{ copy.empty }}</p></div>
      <div v-else-if="!combinations.length" class="empty-result"><i class="fas fa-ban"></i><p>{{ copy.noMatch }}</p></div>
      <div v-else class="combination-list">
        <article v-for="result in combinations" :key="result.key" class="combination-row" :class="`guarantee-${result.minRarity}`">
          <div class="guarantee-mark"><span>{{ copy.guarantee }}</span><strong>{{ result.minRarity }}★</strong></div>
          <div class="combination-body">
            <div class="combination-tags"><span v-for="tag in result.tags" :key="tag.key">{{ tag.label }}</span></div>
            <div class="operator-strip">
              <button v-for="operator in result.operators" :key="operator.id" class="operator-token" type="button"
                :title="operator.name" @click="emit('view-character', operator)">
                <img :src="getAvatar(operator)" :alt="operator.name" loading="lazy">
                <span>{{ operator.name }}</span><b>{{ operator.rarity }}★</b>
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchRecruitmentOperators, fetchRecruitReleaseSnapshot, getProxyImageUrl } from '../services/api.js';
import { getRecruitmentGameDataExcelBase } from '../services/gameDataSource.js';
import { getLocalOperatorAvatarUrl, loadOperatorAssetManifest } from '../services/operatorAssetManifest.js';
import { toTraditionalGameDataText } from '../utils/s2tApiText.js';

const { locale, t } = useI18n();
const emit = defineEmits(['view-character']);
const server = ref(locale.value === 'zh-TW' ? 'tw' : locale.value === 'zh-CN' ? 'cn' : 'global');
const operators = ref([]);
const selectedTags = ref([]);
const loading = ref(true);
const error = ref('');
const manifestReady = ref(false);
const releaseWarning = ref('');
let loadToken = 0;
const fallbackDataCache = new Map();

const TEXT = {
  'zh-TW': { title: '公開招募分析', subtitle: '選擇最多五個標籤，找出保底組合與可能出現的幹員。', server: '伺服器資料', tw: '繁中服', cn: '陸服', global: '國際服', selected: '已選標籤', selectHint: '尚未選擇標籤', reset: '重設', loading: '載入招募資料…', results: '招募組合', combinations: '組合', guarantee: '最低保底', empty: '選擇上方標籤後，這裡會即時計算所有有效組合。', noMatch: '目前選擇沒有可用的公開招募組合。', qualification: '資歷', profession: '職業', position: '位置', ability: '能力', senior: '資深幹員', top: '高級資深幹員', melee: '近戰位', ranged: '遠程位', twNote: '繁中服使用公開招募基礎池，並依台服目前實裝進度排除尚未上線幹員。', loadError: '無法載入公開招募資料。' },
  'zh-CN': { title: '公开招募分析', subtitle: '选择最多五个标签，找出保底组合与可能出现的干员。', server: '服务器数据', tw: '繁中服', cn: '陆服', global: '国际服', selected: '已选标签', selectHint: '尚未选择标签', reset: '重置', loading: '加载招募数据…', results: '招募组合', combinations: '组合', guarantee: '最低保底', empty: '选择上方标签后，这里会即时计算所有有效组合。', noMatch: '当前选择没有可用的公开招募组合。', qualification: '资历', profession: '职业', position: '位置', ability: '能力', senior: '资深干员', top: '高级资深干员', melee: '近战位', ranged: '远程位', twNote: '繁中服使用公开招募基础池，并依台服当前实装进度排除尚未上线干员。', loadError: '无法加载公开招募数据。' },
  en: { title: 'Recruitment Analysis', subtitle: 'Select up to five tags to identify guaranteed combinations and possible operators.', server: 'Server data', tw: 'TW', cn: 'CN', global: 'Global', selected: 'Selected tags', selectHint: 'No tags selected', reset: 'Reset', loading: 'Loading recruitment data…', results: 'Recruitment combinations', combinations: 'combinations', guarantee: 'Minimum', empty: 'Select tags above to calculate every valid combination.', noMatch: 'No recruitment combination matches the selected tags.', qualification: 'Qualification', profession: 'Class', position: 'Position', ability: 'Ability', senior: 'Senior Operator', top: 'Top Operator', melee: 'Melee', ranged: 'Ranged', twNote: 'TW uses the recruitment base pool filtered by the current TW release progress.', loadError: 'Unable to load recruitment data.' },
  ja: { title: '公開求人分析', subtitle: '最大5つのタグを選択し、確定レアリティと候補オペレーターを確認します。', server: 'サーバーデータ', tw: '繁中版', cn: '大陸版', global: 'グローバル版', selected: '選択タグ', selectHint: 'タグ未選択', reset: 'リセット', loading: '求人データを読込中…', results: '求人候補', combinations: '組み合わせ', guarantee: '最低保証', empty: 'タグを選択すると有効な組み合わせを計算します。', noMatch: '一致する公開求人の組み合わせがありません。', qualification: '資格', profession: '職業', position: '配置', ability: '能力', senior: 'エリート', top: '上級エリート', melee: '近距離', ranged: '遠距離', twNote: '繁中版は基本求人プールを台湾版の実装進捗で絞り込みます。', loadError: '公開求人データを読み込めません。' },
  ko: { title: '공개모집 분석', subtitle: '최대 5개의 태그를 선택하여 확정 조합과 오퍼레이터를 확인합니다.', server: '서버 데이터', tw: '중문 번체', cn: '중국', global: '글로벌', selected: '선택 태그', selectHint: '선택한 태그 없음', reset: '초기화', loading: '모집 데이터 로딩 중…', results: '모집 조합', combinations: '조합', guarantee: '최저 확정', empty: '태그를 선택하면 유효한 모든 조합을 계산합니다.', noMatch: '선택한 태그와 일치하는 공개모집 조합이 없습니다.', qualification: '자격', profession: '직군', position: '배치', ability: '능력', senior: '고급특별채용', top: '고급특별채용', melee: '근거리', ranged: '원거리', twNote: '중문 번체 서버는 기본 모집 풀을 대만 서버 출시 진행도로 필터링합니다.', loadError: '공개모집 데이터를 불러올 수 없습니다.' },
};
const copy = computed(() => TEXT[locale.value] || TEXT.en);
const RELEASE_WARNING_TEXT = {
  'zh-TW': {
    stale: '台服進度 API 暫時無法使用，目前顯示最後一次成功同步的資料。',
    unavailable: '台服進度資料暫時無法取得，目前以陸服招募池計算，可能包含尚未實裝幹員。',
  },
  'zh-CN': {
    stale: '台服进度 API 暂时无法使用，目前显示最后一次成功同步的数据。',
    unavailable: '台服进度数据暂时无法取得，目前以陆服招募池计算，可能包含尚未实装干员。',
  },
  en: {
    stale: 'TW progress API is unavailable. Showing the last successfully synced data.',
    unavailable: 'TW progress data is unavailable. Results use the CN pool and may include unreleased operators.',
  },
  ja: {
    stale: '繁中版の進捗 API を利用できないため、最後に同期したデータを表示しています。',
    unavailable: '繁中版の進捗を取得できないため、大陸版の求人プールを表示しています。未実装オペレーターを含む可能性があります。',
  },
  ko: {
    stale: '중문 번체 서버 진행 API를 사용할 수 없어 마지막 동기화 데이터를 표시합니다.',
    unavailable: '중문 번체 서버 진행 데이터를 가져올 수 없어 중국 모집 풀을 사용합니다. 미출시 오퍼레이터가 포함될 수 있습니다.',
  },
};
const releaseWarningCopy = computed(() => RELEASE_WARNING_TEXT[locale.value] || RELEASE_WARNING_TEXT.en);

const parseRarity = (value) => typeof value === 'number' ? value + 1 : Number(String(value).match(/(\d+)/)?.[1] || 1);
const normalizeName = (value) => String(value || '').normalize('NFKC').replace(/[\s·・.'’]/g, '').toLowerCase();
const parseRecruitRoster = (detail) => {
  const clean = String(detail || '').replace(/<@[^>]+>/g, '').replace(/<\/>/g, '').replace(/\\n/g, '\n');
  const names = new Set();
  for (const section of clean.split(/-{5,}/)) {
    const lines = section.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const starIndex = lines.findIndex((line) => /^★{1,6}$/.test(line));
    if (starIndex < 0) continue;
    lines.slice(starIndex + 1).join(' ').split('/').map((name) => name.trim()).filter(Boolean).forEach((name) => names.add(normalizeName(name)));
  }
  return names;
};

const fetchFallbackOperators = async (base) => {
  if (!fallbackDataCache.has(base)) {
    const request = Promise.all([
      fetch(`${base}/character_table.json`),
      fetch(`${base}/gacha_table.json`),
    ]).then(async ([characterResponse, gachaResponse]) => {
      if (!characterResponse.ok || !gachaResponse.ok) {
        throw new Error('GameData unavailable');
      }
      const [characters, gacha] = await Promise.all([
        characterResponse.json(),
        gachaResponse.json(),
      ]);
      const roster = parseRecruitRoster(gacha.recruitDetail);
      if (!roster.size) {
        throw new Error('Recruit roster is empty');
      }
      const fallbackOperators = Object.entries(characters).filter(([, char]) => (
        roster.has(normalizeName(char.name))
        && char.profession !== 'TOKEN'
        && char.profession !== 'TRAP'
      )).map(([id, char]) => ({
        id,
        name: char.name,
        rarity: parseRarity(char.rarity),
        profession: char.profession,
        position: char.position,
        abilities: Array.isArray(char.tagList) ? char.tagList : [],
      }));
      if (!fallbackOperators.length) {
        throw new Error('Recruit operators are empty');
      }
      return fallbackOperators;
    }).catch((cause) => {
      fallbackDataCache.delete(base);
      throw cause;
    });
    fallbackDataCache.set(base, request);
  }
  return fallbackDataCache.get(base);
};

const loadData = async () => {
  const currentLoadToken = ++loadToken;
  loading.value = true; error.value = ''; releaseWarning.value = ''; selectedTags.value = [];
  try {
    const base = getRecruitmentGameDataExcelBase(server.value, locale.value);
    const [loadedOperators, releases] = await Promise.all([
      fetchRecruitmentOperators(server.value, locale.value).catch((cause) => {
        console.warn('Recruit calculator API fallback to GameData:', cause);
        return fetchFallbackOperators(base);
      }),
      server.value === 'tw'
        ? fetchRecruitReleaseSnapshot('tw')
        : Promise.resolve({ releases: [], source: 'not-needed', stale: false }),
    ]);
    if (currentLoadToken !== loadToken) return;
    if (releases.source === 'unavailable') {
      releaseWarning.value = releaseWarningCopy.value.unavailable;
    } else if (releases.stale) {
      releaseWarning.value = releaseWarningCopy.value.stale;
    }
    const futureReleaseRows = releases.releases.filter((row) => Date.parse(row.release_at) > Date.now());
    const futureTwIds = new Set(futureReleaseRows.map((row) => row.character_id).filter(Boolean));
    const futureTwNames = new Set(futureReleaseRows.flatMap((row) => [row.operator_name, row.cn_name, row.tw_name].map(normalizeName)));
    operators.value = loadedOperators.filter((operator) => (
      server.value !== 'tw'
      || (!futureTwIds.has(operator.id) && !futureTwNames.has(normalizeName(operator.name)))
    )).map((operator) => locale.value === 'zh-TW' ? {
      ...operator,
      name: toTraditionalGameDataText(operator.name),
      abilities: operator.abilities.map((ability) => toTraditionalGameDataText(ability)),
    } : operator);
  } catch (cause) {
    if (currentLoadToken !== loadToken) return;
    console.error(cause); error.value = copy.value.loadError; operators.value = [];
  } finally {
    if (currentLoadToken === loadToken) loading.value = false;
  }
};

const professionTags = computed(() => [...new Set(operators.value.map((item) => item.profession))].map((value) => ({ key: `profession:${value}`, type: 'profession', value, label: t(`profession.${value}`) })));
const RECRUIT_ABILITY_TAGS_ZH = [
  { traditional: '新手', simplified: '新手', aliases: ['starter'] },
  { traditional: '支援機械', simplified: '支援机械', aliases: ['robot'] },
  { traditional: '控場', simplified: '控场', aliases: ['crowd-control', 'crowd control'] },
  { traditional: '爆發', simplified: '爆发', aliases: ['nuker'] },
  { traditional: '治療', simplified: '治疗', aliases: ['healing'] },
  { traditional: '支援', simplified: '支援', aliases: ['support'] },
  { traditional: '輸出', simplified: '输出', aliases: ['dps'] },
  { traditional: '群攻', simplified: '群攻', aliases: ['aoe'] },
  { traditional: '減速', simplified: '减速', aliases: ['slow'] },
  { traditional: '生存', simplified: '生存', aliases: ['survival'] },
  { traditional: '防護', simplified: '防护', aliases: ['defense'] },
  { traditional: '削弱', simplified: '削弱', aliases: ['debuff'] },
  { traditional: '位移', simplified: '位移', aliases: ['shift'] },
  { traditional: '召喚', simplified: '召唤', aliases: ['summon'] },
  { traditional: '快速復活', simplified: '快速复活', aliases: ['fast-redeploy', 'fast redeploy'] },
  { traditional: '元素', simplified: '元素', aliases: ['elemental'] },
];
const normalizeAbilityTag = (value) => String(value || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
const localizeAbilityTag = (value) => {
  if (locale.value !== 'zh-TW' && locale.value !== 'zh-CN') return value;
  const normalized = normalizeAbilityTag(value);
  const entry = RECRUIT_ABILITY_TAGS_ZH.find((item) => (
    normalizeAbilityTag(item.traditional) === normalized
    || normalizeAbilityTag(item.simplified) === normalized
    || item.aliases.some((alias) => normalizeAbilityTag(alias) === normalized)
  ));
  if (!entry) return locale.value === 'zh-TW' ? toTraditionalGameDataText(value) : value;
  return locale.value === 'zh-TW' ? entry.traditional : entry.simplified;
};
const abilityTags = computed(() => [...new Set(operators.value.flatMap((item) => item.abilities))].sort().map((value) => ({ key: `ability:${value}`, type: 'ability', value, label: localizeAbilityTag(value) })));
const tagGroups = computed(() => [
  { id: 'qualification', label: copy.value.qualification, icon: 'fas fa-certificate', tags: [{ key: 'special:top', type: 'top', label: copy.value.top }, { key: 'special:senior', type: 'senior', label: copy.value.senior }] },
  { id: 'profession', label: copy.value.profession, icon: 'fas fa-shield-halved', tags: professionTags.value },
  { id: 'position', label: copy.value.position, icon: 'fas fa-crosshairs', tags: [{ key: 'position:MELEE', type: 'position', value: 'MELEE', label: copy.value.melee }, { key: 'position:RANGED', type: 'position', value: 'RANGED', label: copy.value.ranged }] },
  { id: 'ability', label: copy.value.ability, icon: 'fas fa-wave-square', tags: abilityTags.value },
]);
const isSelected = (tag) => selectedTags.value.some((item) => item.key === tag.key);
const toggleTag = (tag) => { const index = selectedTags.value.findIndex((item) => item.key === tag.key); if (index >= 0) selectedTags.value.splice(index, 1); else if (selectedTags.value.length < 5) selectedTags.value.push(tag); };
const matchesTag = (operator, tag) => tag.type === 'top' ? operator.rarity === 6 : tag.type === 'senior' ? operator.rarity === 5 : tag.type === 'profession' ? operator.profession === tag.value : tag.type === 'position' ? operator.position === tag.value : operator.abilities.includes(tag.value);
const combinations = computed(() => {
  const tags = selectedTags.value; const results = [];
  for (let mask = 1; mask < (1 << tags.length); mask += 1) {
    const subset = tags.filter((_, index) => mask & (1 << index));
    const hasTop = subset.some((tag) => tag.type === 'top');
    let candidates = operators.value.filter((operator) => subset.every((tag) => matchesTag(operator, tag)) && (hasTop || operator.rarity < 6));
    if (!candidates.length) continue;
    candidates = candidates.sort((a, b) => b.rarity - a.rarity || a.name.localeCompare(b.name));
    results.push({ key: subset.map((tag) => tag.key).sort().join('|'), tags: subset, operators: candidates, minRarity: Math.min(...candidates.map((item) => item.rarity)) });
  }
  return results.sort((a, b) => b.minRarity - a.minRarity || b.tags.length - a.tags.length || a.operators.length - b.operators.length);
});
const getAvatar = (operator) => { void manifestReady.value; const local = getLocalOperatorAvatarUrl(operator.id); return local ? getProxyImageUrl(local) : ''; };

watch([server, locale], loadData);
onMounted(() => { loadOperatorAssetManifest().then(() => { manifestReady.value = true; }).catch(() => {}); loadData(); });
</script>

<style scoped>
.recruitment-page{width:min(1380px,calc(100% - 40px));margin:0 auto;padding:30px 0 60px;color:var(--text-color)}.recruitment-header{display:flex;justify-content:space-between;align-items:end;gap:24px;margin-bottom:18px}.section-code{color:var(--primary-color);font:700 .7rem ui-monospace,Consolas,monospace}.recruitment-header h1{margin:5px 0 6px;font-size:2rem}.recruitment-header p{margin:0;color:var(--text-secondary)}.server-control{display:grid;gap:6px;min-width:190px;color:var(--text-secondary);font-size:.78rem}.server-control select{height:42px;border:1px solid var(--border-color);border-radius:4px;background:#0d1117;color:var(--text-color);padding:0 12px}.recruit-console,.result-section{border:1px solid rgba(255,255,255,.09);background:rgba(22,27,34,.94)}.selection-status{min-height:64px;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:18px;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#0d1117}.selection-status>div:first-child{display:grid}.selection-status span{color:var(--text-secondary);font-size:.75rem}.selection-status strong{font-size:1.1rem}.selected-list{display:flex;gap:6px;overflow-x:auto}.selected-list button{border:1px solid rgba(88,166,255,.4);background:rgba(88,166,255,.1);color:#f0f6fc;padding:7px 9px;white-space:nowrap}.selected-list button i{margin-left:8px}.reset-command{height:38px;border:1px solid var(--border-color);background:transparent;color:var(--text-secondary);padding:0 12px}.reset-command:disabled{opacity:.4}.tag-groups{padding:6px 18px 16px}.tag-group{display:grid;grid-template-columns:130px minmax(0,1fr);gap:14px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.07)}.tag-group:last-child{border-bottom:0}.tag-group header{display:flex;align-items:center;gap:9px;color:var(--text-secondary);font-size:.82rem}.tag-grid{display:flex;flex-wrap:wrap;gap:7px}.tag-grid button{min-height:34px;border:1px solid rgba(255,255,255,.12);border-radius:3px;background:rgba(13,17,23,.72);color:var(--text-secondary);padding:6px 11px}.tag-grid button:hover{color:#fff;border-color:rgba(255,255,255,.3)}.tag-grid button.active{color:#fff;border-color:var(--primary-color);background:rgba(88,166,255,.16);box-shadow:inset 0 -2px var(--primary-color)}.tag-grid button.blocked{opacity:.35}.source-note{margin:0;padding:10px 18px;border-top:1px solid rgba(255,193,7,.16);color:#d4b65c;font-size:.78rem}.source-note i{margin-right:8px}.loading-state,.error-state,.empty-result{min-height:180px;display:flex;align-items:center;justify-content:center;gap:10px;color:var(--text-secondary)}.spinner{width:20px;height:20px;border:2px solid var(--border-color);border-top-color:var(--primary-color);border-radius:50%;animation:spin .8s linear infinite}.result-section{margin-top:18px;padding:18px}.result-header{display:flex;align-items:end;justify-content:space-between;margin-bottom:14px}.result-header h2{margin:4px 0 0}.result-header>span{color:var(--text-secondary);font-size:.8rem}.empty-result{flex-direction:column;border:1px dashed var(--border-color)}.empty-result i{font-size:1.8rem}.combination-list{display:grid;gap:9px}.combination-row{display:grid;grid-template-columns:100px minmax(0,1fr);border:1px solid rgba(255,255,255,.1);background:#0d1117}.guarantee-mark{display:grid;place-content:center;text-align:center;border-right:1px solid rgba(255,255,255,.1)}.guarantee-mark span{font-size:.68rem;color:var(--text-secondary)}.guarantee-mark strong{font-size:1.55rem;color:#f2c14e}.guarantee-5 .guarantee-mark strong,.guarantee-6 .guarantee-mark strong{color:#ff8b55}.combination-body{min-width:0;padding:11px}.combination-tags{display:flex;gap:6px;margin-bottom:9px}.combination-tags span{padding:3px 8px;border:1px solid rgba(88,166,255,.32);color:var(--primary-color);font-size:.75rem}.operator-strip{display:flex;gap:8px;overflow-x:auto;padding-bottom:3px}.operator-token{width:104px;flex:0 0 104px;display:grid;grid-template-columns:34px minmax(0,1fr) auto;align-items:center;gap:5px;padding:5px;border:1px solid rgba(255,255,255,.08);background:rgba(22,27,34,.8)}.operator-token img{width:34px;height:34px;object-fit:cover}.operator-token span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.75rem}.operator-token b{font-size:.68rem;color:#f2c14e}@keyframes spin{to{transform:rotate(360deg)}}@media(max-width:700px){.recruitment-page{width:calc(100% - 24px);padding-top:18px}.recruitment-header{align-items:stretch;flex-direction:column}.server-control{width:100%}.selection-status{grid-template-columns:1fr auto}.selected-list{grid-column:1/-1;grid-row:2}.tag-group{grid-template-columns:1fr}.combination-row{grid-template-columns:72px minmax(0,1fr)}.guarantee-mark strong{font-size:1.2rem}}
.source-note.fallback-note {
  border-top-color: rgba(255, 139, 85, .28);
  color: #ffad7a;
  background: rgba(255, 139, 85, .06);
}

.tag-grid button {
  height: 34px;
  min-height: 0;
  padding: 0 10px;
  font-size: .74rem;
  line-height: 1.15;
}

.tag-grid {
  align-items: center;
  align-content: center;
}

/* 公開招募結果需要較大的可視區，並以換行取代橫向捲動。 */
.recruitment-page {
  width: min(1480px, calc(100% - 40px));
  padding-top: 24px;
}

.recruitment-header {
  margin-bottom: 16px;
}

.recruitment-header h1 {
  margin: 4px 0 5px;
  font-size: 1.65rem;
}

.recruitment-header p {
  font-size: .92rem;
}

.tag-group {
  position: relative;
  z-index: 0;
  grid-template-columns: 82px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  padding: 8px 0;
}

.tag-group-title {
  position: relative;
  z-index: 0;
  box-sizing: border-box;
  width: 82px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0 7px;
  border: 1px solid rgba(255, 255, 255, .07);
  border-radius: 3px;
  background: rgba(13, 17, 23, .72);
  color: var(--text-secondary);
  font-size: .7rem;
}

.tag-group-title i {
  flex: 0 0 auto;
  font-size: .7rem;
}

.tag-group-title span {
  min-width: 0;
  line-height: 1.05;
  text-align: center;
  overflow-wrap: anywhere;
}

.recruit-console {
  position: relative;
  isolation: isolate;
  overflow: hidden;
}

.selection-status {
  position: relative;
  z-index: 2;
}

.tag-groups {
  position: relative;
  z-index: 1;
  overflow: hidden;
  contain: paint;
}

.result-section {
  padding: 22px;
}

.result-header h2 {
  font-size: 1.25rem;
}

.combination-list {
  gap: 14px;
}

.combination-row {
  grid-template-columns: 118px minmax(0, 1fr);
}

.combination-body {
  padding: 15px;
}

.combination-tags {
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.combination-tags span {
  padding: 5px 10px;
  font-size: .82rem;
}

.operator-strip {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 9px;
  overflow: visible;
  padding-bottom: 0;
}

.operator-token {
  width: auto;
  min-width: 0;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  gap: 8px;
  padding: 7px;
  color: var(--text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.operator-token:hover,
.operator-token:focus-visible {
  border-color: rgba(88, 166, 255, .58);
  background: rgba(88, 166, 255, .12);
  outline: none;
}

.operator-token img {
  width: 46px;
  height: 46px;
}

.operator-token span {
  font-size: .82rem;
}

@media (max-width: 700px) {
  .recruitment-page {
    width: calc(100% - 24px);
  }

  .tag-group {
    grid-template-columns: 1fr;
  }

  .tag-group-title {
    width: 82px;
  }

  .combination-row {
    grid-template-columns: 74px minmax(0, 1fr);
  }

  .result-section {
    padding: 12px;
  }

  .combination-body {
    padding: 10px;
  }

  .operator-strip {
    grid-template-columns: repeat(auto-fill, minmax(124px, 1fr));
  }
}
</style>

<template>
  <div class="character-details" v-if="character">
    <nav class="detail-tab-nav" aria-label="Character detail sections">
      <button
        v-for="tab in detailTabs"
        :key="tab.id"
        type="button"
        :class="{ active: activeDetailTab === tab.id }"
        @click="selectDetailTab(tab.id)"
      >
        <i :class="tab.icon"></i>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <section v-show="activeDetailTab === 'overview'" class="character-hero">
      <div class="hero-portrait-panel">
        <div class="portrait-display hero-portrait-display" v-if="currentPortraitUrl">
          <img
            :src="displayPortraitUrl"
            :alt="allPortraits[currentPortraitIndex]?.name || t('character.portraitFallback')"
            crossorigin="anonymous"
            decoding="async"
            fetchpriority="high"
            @error="handlePortraitError"
            class="portrait-image"
            @load="handlePortraitLoad"
          />
        </div>
        <div v-else class="portrait-loading hero-portrait-display">
          <p>{{ t('character.portraitLoading') }}</p>
        </div>

        <div class="portrait-tabs compact-tabs" v-if="allPortraits.length > 1">
          <button
            v-for="(portrait, index) in allPortraits"
            :key="portrait.skinId || `portrait-${index}`"
            :class="{ active: currentPortraitIndex === index }"
            @click="selectPortrait(index)"
          >
            {{ portrait.name }}
          </button>
        </div>
      </div>

      <div class="hero-info-panel">
        <div class="hero-title-row">
          <div>
            <p class="hero-kicker">{{ uiText.overview }}</p>
            <h2 class="character-name-large">{{ character.name }}</h2>
            <p class="character-appellation">{{ character.appellation || character.id }}</p>
          </div>
          <div class="rarity-badge-large">{{ getRarityStars(character.rarity) }}★</div>
        </div>

        <div class="character-tags">
          <span class="tag profession">{{ getProfessionName(character.profession) }}</span>
          <span class="tag position">{{ positionLabel }}</span>
          <span v-if="getFactionLabel(character.factionId)" class="tag nation">{{ getFactionLabel(character.factionId) }}</span>
        </div>

        <div class="hero-stat-grid" v-if="heroStats.length">
          <div v-for="stat in heroStats" :key="stat.label" class="hero-stat">
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}</strong>
          </div>
        </div>

        <div class="hero-summary-grid">
          <div class="summary-panel" v-if="character.traitDescription">
            <span class="summary-label">{{ t('character.sections.trait') }}</span>
            <p class="api-pre-line">{{ character.traitDescription }}</p>
          </div>
          <div class="summary-panel" v-if="primaryTalent">
            <span class="summary-label">{{ t('character.sections.talents') }}</span>
            <strong>{{ primaryTalent.name || t('character.talentFallback', { n: 1 }) }}</strong>
            <p class="api-pre-line">{{ primaryTalent.description }}</p>
          </div>
        </div>

        <div class="hero-skills" v-if="featuredSkills.length">
          <span class="summary-label">{{ t('character.sections.skills') }}</span>
          <div class="hero-skill-list">
            <div v-for="(skill, index) in featuredSkills" :key="skill.id" class="hero-skill">
              <span>{{ t('character.skillIndex', { n: index + 1 }) }}</span>
              <strong>{{ skill.name }}</strong>
            </div>
          </div>
        </div>

        <p class="obtain-line api-pre-line" v-if="character.obtainApproach">
          <i class="fas fa-gift"></i>
          {{ character.obtainApproach }}
        </p>
      </div>
    </section>

    <div class="character-details-content">
      <section v-show="activeDetailTab === 'battle'" class="detail-tier" v-if="hasBattleContent">
        <div class="tier-heading">
          <span>01</span>
          <div>
            <h3>{{ uiText.battle }}</h3>
            <p>{{ uiText.battleHint }}</p>
          </div>
        </div>

        <div class="tier-grid">
          <div class="detail-section wide-section" v-if="character.phases && character.phases.length > 0">
            <h3><i class="fas fa-chart-bar"></i> {{ t('character.sections.stats') }}</h3>
            <div class="attributes-table-wrapper">
              <table class="attributes-table">
                <thead>
                  <tr>
                    <th>{{ t('character.stats.phase') }}</th>
                    <th>{{ t('character.stats.hp') }}</th>
                    <th>{{ t('character.stats.atk') }}</th>
                    <th>{{ t('character.stats.def') }}</th>
                    <th>{{ t('character.stats.res') }}</th>
                    <th>{{ t('character.stats.respawn') }}</th>
                    <th>{{ t('character.stats.cost') }}</th>
                    <th>{{ t('character.stats.block') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(phase, phaseIndex) in character.phases" :key="phaseIndex">
                    <td class="phase-label">{{ t('character.phaseLabel', { phase: phaseIndex }) }}</td>
                    <td>{{ getAttribute(phase, 'maxHp') }}</td>
                    <td>{{ getAttribute(phase, 'atk') }}</td>
                    <td>{{ getAttribute(phase, 'def') }}</td>
                    <td>{{ getAttribute(phase, 'magicResistance') }}%</td>
                    <td>{{ getAttribute(phase, 'respawnTime') }}s</td>
                    <td>{{ getAttribute(phase, 'cost') }}</td>
                    <td>{{ getAttribute(phase, 'blockCnt') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="detail-section" v-if="character.phaseRanges && character.phaseRanges.length > 0">
            <h3><i class="fas fa-crosshairs"></i> {{ t('character.sections.range') }}</h3>
            <div class="range-phases">
              <div v-for="range in character.phaseRanges" :key="range.phase" class="range-phase-item">
                <h4>{{ t('character.eliteRangeTitle', { phase: range.phase }) }}</h4>
                <div class="range-grid" :style="getRangeGridStyle(range.grids)">
                  <div
                    v-for="(grid, idx) in range.grids"
                    :key="idx"
                    class="range-cell"
                    :class="getCellClass(grid)"
                    :style="getCellStyle(grid, range.grids)"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="character.talents && character.talents.length > 0">
            <h3><i class="fas fa-magic"></i> {{ t('character.sections.talents') }}</h3>
            <div class="talents-list">
              <template v-for="(talent, tIndex) in character.talents" :key="tIndex">
                <div
                  v-for="(candidate, cIndex) in talent.candidates"
                  :key="`${tIndex}-${cIndex}`"
                  class="talent-card"
                >
                  <div class="talent-header">
                    <span class="talent-name">{{ candidate.name || t('character.talentFallback', { n: tIndex + 1 }) }}</span>
                    <span class="talent-unlock">
                      {{ t('character.unlockLine', { elite: candidate.unlockCondition?.phase || 0, level: candidate.unlockCondition?.level || 1 }) }}
                      <span v-if="candidate.requiredPotentialRank > 0" class="potential-req">
                        {{ t('character.potentialReq', { rank: candidate.requiredPotentialRank }) }}
                      </span>
                    </span>
                  </div>
                  <p class="talent-desc api-pre-line">{{ candidate.description }}</p>
                </div>
              </template>
            </div>
          </div>

          <div class="detail-section wide-section" v-if="character.skills && character.skills.length > 0">
            <h3><i class="fas fa-bolt"></i> {{ t('character.sections.skills') }}</h3>
            <div class="skills-list">
              <div v-for="(skill, index) in character.skills" :key="skill.id" class="skill-card">
                <div class="skill-header">
                  <span class="skill-index">{{ t('character.skillIndex', { n: index + 1 }) }}</span>
                  <span class="skill-name">{{ skill.name }}</span>
                </div>
                <p class="skill-desc api-pre-line">{{ skill.description }}</p>
                <div class="skill-stats">
                  <span v-if="skill.spData?.spCost"><i class="fas fa-bolt"></i> {{ t('character.spCost') }}: {{ skill.spData.spCost }}</span>
                  <span v-if="skill.spData?.initSp"><i class="fas fa-play"></i> {{ t('character.initSp') }}: {{ skill.spData.initSp }}</span>
                  <span v-if="skill.duration > 0"><i class="fas fa-clock"></i> {{ t('character.duration') }}: {{ skill.duration }}s</span>
                  <span v-if="skill.spData?.spType !== undefined"><i class="fas fa-sync"></i> {{ getSpTypeName(skill.spData.spType) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-show="activeDetailTab === 'development'" class="detail-tier" v-if="hasDevelopmentContent">
        <div class="tier-heading">
          <span>02</span>
          <div>
            <h3>{{ uiText.development }}</h3>
            <p>{{ uiText.developmentHint }}</p>
          </div>
        </div>

        <div class="tier-grid">
          <div class="detail-section" v-if="character.potentialRanks && character.potentialRanks.length > 0">
            <h3><i class="fas fa-arrow-up"></i> {{ t('character.sections.potential') }}</h3>
            <div class="potential-list">
              <div v-for="(rank, index) in character.potentialRanks" :key="index" class="potential-item">
                <span class="potential-level">{{ t('character.potentialLevel', { n: index + 2 }) }}</span>
                <span class="potential-effect api-pre-line">
                  {{ rank.description || rank.buffDescription || t('character.improveDefault') }}
                </span>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="character.evolveCosts && character.evolveCosts.length > 0">
            <h3><i class="fas fa-level-up-alt"></i> {{ t('character.sections.evolve') }}</h3>
            <div class="evolve-costs">
              <div v-for="(cost, index) in character.evolveCosts" :key="index" class="evolve-phase">
                <h4>{{ t('character.evolveTitle', { phase: cost.phase }) }}</h4>
                <div class="materials-grid">
                  <div v-for="(item, itemIndex) in cost.cost" :key="itemIndex" class="material-item">
                    <img
                      :src="item.iconUrl"
                      :alt="item.name"
                      loading="lazy"
                      decoding="async"
                      @error="handleMaterialError"
                      class="material-icon"
                    />
                    <div class="material-info">
                      <span class="material-name">{{ item.name }}</span>
                      <span class="material-count">x{{ item.count }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section wide-section" v-if="character.skillUpgradeCosts && character.skillUpgradeCosts.length > 0">
            <h3><i class="fas fa-cogs"></i> {{ t('character.sections.skillCost') }}</h3>
            <div class="skill-upgrade-costs">
              <div v-for="(upgrade, index) in character.skillUpgradeCosts" :key="index" class="upgrade-level">
                <h4>{{ t('character.skillRankTitle', { from: upgrade.level - 1, to: upgrade.level }) }}</h4>
                <div class="materials-grid" v-if="upgrade.lvlUpCost && upgrade.lvlUpCost.length > 0">
                  <div v-for="(item, itemIndex) in upgrade.lvlUpCost" :key="itemIndex" class="material-item">
                    <img
                      :src="item.iconUrl"
                      :alt="item.name"
                      loading="lazy"
                      decoding="async"
                      @error="handleMaterialError"
                      class="material-icon"
                    />
                    <div class="material-info">
                      <span class="material-name">{{ item.name }}</span>
                      <span class="material-count">x{{ item.count }}</span>
                    </div>
                  </div>
                </div>
                <p v-else class="no-cost">{{ t('character.noMaterials') }}</p>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="character.modules && character.modules.length > 0">
            <h3><i class="fas fa-puzzle-piece"></i> {{ t('character.sections.modules') }}</h3>
            <div class="modules-list">
              <div v-for="module in character.modules" :key="module.id" class="module-card">
                <div class="module-header">
                  <span class="module-name">{{ module.uniEquipName || t('character.moduleDefault') }}</span>
                  <span class="module-type" v-if="module.typeName1 || module.typeName2">
                    {{ module.typeName1 }}{{ module.typeName2 ? ` - ${module.typeName2}` : '' }}
                  </span>
                </div>
                <p class="module-desc api-pre-line" v-if="module.uniEquipDesc">{{ module.uniEquipDesc }}</p>
                <div class="module-unlock">
                  <span>{{ t('character.unlockModule') }}: {{ t('character.phaseLabel', { phase: module.unlockEvolvePhase }) }} Lv{{ module.unlockLevel }}</span>
                  <span v-if="module.unlockFavorPoint"> {{ t('character.trust', { points: module.unlockFavorPoint }) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="character.buildingSkills && character.buildingSkills.length > 0">
            <h3><i class="fas fa-building"></i> {{ t('character.sections.logistics') }}</h3>
            <div class="building-skills-list">
              <div v-for="skill in character.buildingSkills" :key="skill.id" class="building-skill-card">
                <div class="building-skill-header">
                  <span class="building-skill-name">{{ skill.name || t('character.logisticsDefault') }}</span>
                  <span class="building-skill-room" v-if="skill.roomType">{{ getRoomTypeName(skill.roomType) }}</span>
                </div>
                <p class="building-skill-desc api-pre-line">{{ skill.description }}</p>
                <div class="building-skill-unlock" v-if="skill.cond">
                  <span v-if="skill.cond.phase !== undefined">{{ t('character.phaseLabel', { phase: skill.cond.phase }) }}</span>
                  <span v-if="skill.cond.level">Lv{{ skill.cond.level }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-show="activeDetailTab === 'archive'" class="detail-tier" v-if="character.handbook && hasHandbookContent">
        <div class="tier-heading">
          <span>03</span>
          <div>
            <h3>{{ uiText.archive }}</h3>
            <p>{{ uiText.archiveHint }}</p>
          </div>
        </div>

        <div class="detail-section wide-section">
          <h3><i class="fas fa-book"></i> {{ t('character.sections.handbook') }}</h3>
          <div class="handbook-content">
            <div v-if="character.handbook.storyTextAudio && character.handbook.storyTextAudio.length > 0" class="handbook-stories">
              <div v-for="(story, index) in character.handbook.storyTextAudio" :key="index" class="story-card">
                <h4 @click="toggleStory(index)" class="story-title">
                  <i :class="expandedStories.includes(index) ? 'fas fa-chevron-down' : 'fas fa-chevron-right'"></i>
                  {{ story.storyTitle || t('character.storyFallback', { n: index + 1 }) }}
                </h4>
                <p v-if="expandedStories.includes(index)" class="story-content api-pre-line">
                  {{ story.stories?.[0]?.storyText || '' }}
                </p>
              </div>
            </div>
            <p v-else class="no-data">{{ t('character.noHandbook') }}</p>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCharacterAvatarUrls } from '../services/api.js';

const { t, locale } = useI18n();

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
});

const currentPortraitIndex = ref(0);
const currentPortraitUrlIndex = ref(0);
const expandedStories = ref([0]); // 預設展開第一個檔案
const activeDetailTab = ref('overview');
const trimmedPortraitUrl = ref('');
let trimmedPortraitObjectUrl = '';
let portraitTrimToken = 0;

// 詳細資料頭像多來源索引
const avatarIndex = ref(0);

// 取得當前角色可用的所有頭像 URL
const avatarUrls = computed(() => getCharacterAvatarUrls(props.character.id));

// 目前應顯示的頭像 URL（會隨錯誤自動切換來源）
const currentAvatarUrl = computed(() => {
  const urls = avatarUrls.value || [];
  return urls[avatarIndex.value] || urls[0] || '';
});

// 獲取立繪列表
const allPortraits = computed(() => {
  const list = [];

  // 添加立繪
  if (props.character.portraits && props.character.portraits.length > 0) {
    props.character.portraits.forEach(p => {
      list.push({
        name: p.name,
        urls: p.urls,
        skinId: p.skinId ?? null
      });
    });
  }

  // 如果沒有從 API 解析出的立繪，就使用頭像多來源作為備用立繪
  return list.length > 0 ? list : [{ name: t('character.portraitFallback'), urls: avatarUrls.value }];
});

const currentPortraitUrl = computed(() => {
  const portrait = allPortraits.value[currentPortraitIndex.value];
  if (!portrait || !portrait.urls) {
    return '';
  }
  const url = portrait.urls[currentPortraitUrlIndex.value] || portrait.urls[0] || '';
  return url;
});

const displayPortraitUrl = computed(() => trimmedPortraitUrl.value || currentPortraitUrl.value);

const hasHandbookContent = computed(() => {
  return props.character.handbook && 
    props.character.handbook.storyTextAudio && 
    props.character.handbook.storyTextAudio.length > 0;
});

const DETAIL_UI_TEXT = {
  'zh-TW': {
    overview: '幹員總覽',
    battle: '戰鬥資訊',
    battleHint: '素質、攻擊範圍、天賦與技能。',
    development: '養成資訊',
    developmentHint: '潛能、精英化、技能升級、模組與後勤。',
    archive: '檔案資料',
    archiveHint: '幹員故事與背景紀錄。',
  },
  'zh-CN': {
    overview: '干员总览',
    battle: '战斗信息',
    battleHint: '属性、攻击范围、天赋与技能。',
    development: '养成信息',
    developmentHint: '潜能、精英化、技能升级、模组与后勤。',
    archive: '档案资料',
    archiveHint: '干员故事与背景记录。',
  },
  en: {
    overview: 'Operator Overview',
    battle: 'Combat',
    battleHint: 'Stats, range, talents, and skills.',
    development: 'Development',
    developmentHint: 'Potential, promotion, skill costs, modules, and base skills.',
    archive: 'Archive',
    archiveHint: 'Operator stories and background records.',
  },
  ja: {
    overview: 'オペレーター概要',
    battle: '戦闘情報',
    battleHint: 'ステータス、攻撃範囲、素質、スキル。',
    development: '育成情報',
    developmentHint: '潜在能力、昇進、スキル強化、モジュール、基地スキル。',
    archive: '記録',
    archiveHint: 'オペレーターの物語と背景記録。',
  },
  ko: {
    overview: '오퍼레이터 개요',
    battle: '전투 정보',
    battleHint: '능력치, 공격 범위, 재능과 스킬.',
    development: '육성 정보',
    developmentHint: '잠재능력, 정예화, 스킬 강화, 모듈과 기반시설 스킬.',
    archive: '기록',
    archiveHint: '오퍼레이터 스토리와 배경 기록.',
  },
};

const uiText = computed(() => DETAIL_UI_TEXT[locale.value] || DETAIL_UI_TEXT['zh-TW']);

const positionLabel = computed(() =>
  props.character.position === 'MELEE' ? t('character.melee') : t('character.ranged')
);

const finalPhase = computed(() => {
  const phases = props.character.phases || [];
  return phases.length > 0 ? phases[phases.length - 1] : null;
});

const heroStats = computed(() => {
  if (!finalPhase.value) return [];

  return [
    { label: t('character.stats.hp'), value: getAttribute(finalPhase.value, 'maxHp') },
    { label: t('character.stats.atk'), value: getAttribute(finalPhase.value, 'atk') },
    { label: t('character.stats.def'), value: getAttribute(finalPhase.value, 'def') },
    { label: t('character.stats.cost'), value: getAttribute(finalPhase.value, 'cost') },
  ].filter((stat) => stat.value !== '-');
});

const primaryTalent = computed(() => {
  const talent = props.character.talents?.[0];
  const candidates = talent?.candidates || [];
  return candidates.length > 0 ? candidates[candidates.length - 1] : null;
});

const featuredSkills = computed(() => (props.character.skills || []).slice(0, 3));

const hasBattleContent = computed(() =>
  Boolean(
    props.character.phases?.length ||
    props.character.phaseRanges?.length ||
    props.character.talents?.length ||
    props.character.skills?.length
  )
);

const hasDevelopmentContent = computed(() =>
  Boolean(
    props.character.potentialRanks?.length ||
    props.character.evolveCosts?.length ||
    props.character.skillUpgradeCosts?.length ||
    props.character.modules?.length ||
    props.character.buildingSkills?.length
  )
);

const detailTabs = computed(() =>
  [
    { id: 'overview', label: uiText.value.overview, icon: 'fas fa-id-card', available: true },
    { id: 'battle', label: uiText.value.battle, icon: 'fas fa-bolt', available: hasBattleContent.value },
    { id: 'development', label: uiText.value.development, icon: 'fas fa-level-up-alt', available: hasDevelopmentContent.value },
    { id: 'archive', label: uiText.value.archive, icon: 'fas fa-book', available: hasHandbookContent.value },
  ].filter((tab) => tab.available)
);

function selectDetailTab(tabId) {
  activeDetailTab.value = tabId;
}

watch(detailTabs, (tabs) => {
  if (!tabs.some((tab) => tab.id === activeDetailTab.value)) {
    activeDetailTab.value = 'overview';
  }
});

function clearTrimmedPortraitUrl() {
  if (trimmedPortraitObjectUrl) {
    URL.revokeObjectURL(trimmedPortraitObjectUrl);
    trimmedPortraitObjectUrl = '';
  }
  trimmedPortraitUrl.value = '';
}

function loadImageForTrim(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function findOpaqueBounds(imageData, width, height) {
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha <= 8) continue;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

async function trimPortraitWhitespace(url) {
  const trimToken = ++portraitTrimToken;
  clearTrimmedPortraitUrl();
  if (!url || typeof document === 'undefined') return;

  try {
    const image = await loadImageForTrim(url);
    if (trimToken !== portraitTrimToken) return;

    const sourceCanvas = document.createElement('canvas');
    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    sourceCanvas.width = image.naturalWidth || image.width;
    sourceCanvas.height = image.naturalHeight || image.height;
    sourceContext.drawImage(image, 0, 0);

    const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const bounds = findOpaqueBounds(imageData, sourceCanvas.width, sourceCanvas.height);
    if (!bounds) return;

    const padX = Math.round(sourceCanvas.width * 0.035);
    const padTop = Math.round(sourceCanvas.height * 0.025);
    const padBottom = Math.round(sourceCanvas.height * 0.015);
    const sx = Math.max(0, bounds.minX - padX);
    const sy = Math.max(0, bounds.minY - padTop);
    const sw = Math.min(sourceCanvas.width - sx, bounds.maxX - sx + 1 + padX);
    const sh = Math.min(sourceCanvas.height - sy, bounds.maxY - sy + 1 + padBottom);

    if (sw <= 0 || sh <= 0) return;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = sw;
    outputCanvas.height = sh;
    outputCanvas.getContext('2d').drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob = await new Promise((resolve) => outputCanvas.toBlob(resolve, 'image/png'));
    if (!blob || trimToken !== portraitTrimToken) return;

    trimmedPortraitObjectUrl = URL.createObjectURL(blob);
    trimmedPortraitUrl.value = trimmedPortraitObjectUrl;
  } catch (error) {
    if (trimToken === portraitTrimToken) {
      clearTrimmedPortraitUrl();
    }
  }
}

watch(currentPortraitUrl, (url) => {
  trimPortraitWhitespace(url);
}, { immediate: true });

onUnmounted(() => {
  portraitTrimToken++;
  clearTrimmedPortraitUrl();
});

const selectPortrait = (index) => {
  console.log('[組件調試] 選擇立繪索引:', index);
  currentPortraitIndex.value = index;
  currentPortraitUrlIndex.value = 0; // 重置備用 URL 索引
  console.log('[組件調試] 重置URL索引為0');
};

const toggleStory = (index) => {
  const idx = expandedStories.value.indexOf(index);
  if (idx > -1) {
    expandedStories.value.splice(idx, 1);
  } else {
    expandedStories.value.push(index);
  }
};

const getProfessionName = (profession) => {
  const key = `profession.${profession}`;
  const translated = t(key);
  return translated === key ? profession : translated;
};

const getFactionLabel = (factionId) => {
  if (!factionId) return '';
  const key = `nation.${factionId}`;
  const translated = t(key);
  return translated === key ? factionId : translated;
};

const getRoomTypeName = (roomType) => {
  const key = `roomType.${roomType}`;
  const translated = t(key);
  return translated === key ? roomType : translated;
};

const getSpTypeName = (spType) => {
  const key = `spType.${String(spType)}`;
  const translated = t(key);
  return translated === key ? t('spType.default') : translated;
};

const getRarityStars = (rarity) => {
  let numRarity = 0;
  if (typeof rarity === 'number') {
    numRarity = rarity;
  } else if (typeof rarity === 'string') {
    const match = rarity.match(/TIER_(\d+)/);
    if (match) {
      numRarity = parseInt(match[1]) - 1;
    } else {
      numRarity = parseInt(rarity) || 0;
    }
  }
  numRarity = Math.max(0, Math.min(5, numRarity));
  return numRarity + 1;
};

const getAttribute = (phase, attrName) => {
  if (!phase.attributesKeyFrames || phase.attributesKeyFrames.length === 0) {
    return '-';
  }
  const lastFrame = phase.attributesKeyFrames[phase.attributesKeyFrames.length - 1];
  const value = lastFrame.data?.[attrName];
  return value !== undefined ? value : '-';
};

// 攻擊範圍相關
const getRangeGridStyle = (grids) => {
  if (!grids || grids.length === 0) return {};
  
  // 找出範圍邊界
  let minRow = 0, maxRow = 0, minCol = 0, maxCol = 0;
  grids.forEach(g => {
    minRow = Math.min(minRow, g.row);
    maxRow = Math.max(maxRow, g.row);
    minCol = Math.min(minCol, g.col);
    maxCol = Math.max(maxCol, g.col);
  });
  
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 24px)`,
    gridTemplateRows: `repeat(${rows}, 24px)`,
    gap: '2px'
  };
};

const getCellClass = (grid) => {
  if (grid.row === 0 && grid.col === 0) return 'self-cell';
  return 'attack-cell';
};

const getCellStyle = (grid, allGrids) => {
  // 計算偏移
  let minRow = 0, minCol = 0;
  allGrids.forEach(g => {
    minRow = Math.min(minRow, g.row);
    minCol = Math.min(minCol, g.col);
  });
  
  return {
    gridRow: grid.row - minRow + 1,
    gridColumn: grid.col - minCol + 1
  };
};

const handleImageError = (event) => {
  const img = event.target;
  const urls = avatarUrls.value || [];
  const nextIndex = avatarIndex.value + 1;

  // 嘗試下一個頭像來源
  if (nextIndex < urls.length) {
    avatarIndex.value = nextIndex;
    img.src = urls[nextIndex];
    return;
  }

  // 所有來源都失敗才顯示占位圖
  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%2330363d" width="200" height="200"/><text fill="%238b949e" x="100" y="110" text-anchor="middle" font-size="16">No Image</text></svg>';
};

const portraitFailedDataUrl = () => {
  const msg = t('character.portraitLoadFailed');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect fill="#30363d" width="400" height="600"/><text fill="#8b949e" x="200" y="310" text-anchor="middle" font-size="18">${msg}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const handlePortraitLoad = (event) => {
  console.log('[組件調試] 立繪載入成功:', event?.target?.src);
};

const handlePortraitError = (event) => {
  const failedUrl = event.target.src;
  console.log('[組件調試] 立繪載入失敗:', failedUrl);
  
  const portrait = allPortraits.value[currentPortraitIndex.value];
  console.log('[組件調試] 當前立繪索引:', currentPortraitIndex.value);
  console.log('[組件調試] 當前立繪數據:', portrait);
  console.log('[組件調試] 當前URL索引:', currentPortraitUrlIndex.value, '/', portrait?.urls?.length || 0);
  
  if (portrait && portrait.urls) {
    // 檢查是否還有更多 URL 可以嘗試
    if (currentPortraitUrlIndex.value < portrait.urls.length - 1) {
      // 嘗試下一個備用 URL
      currentPortraitUrlIndex.value++;
      const nextUrl = portrait.urls[currentPortraitUrlIndex.value];
      console.log('[組件調試] 嘗試下一個URL:', nextUrl, '索引:', currentPortraitUrlIndex.value, '/', portrait.urls.length);
      
      if (nextUrl && nextUrl !== failedUrl) {
        // 使用 nextTick 確保響應式更新
        setTimeout(() => {
          console.log('[組件調試] 設置新URL:', nextUrl);
          // 先設置一個空白圖片，然後再設置新 URL，確保觸發載入
          event.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          setTimeout(() => {
            event.target.src = nextUrl;
          }, 50);
        }, 100);
        return; // 返回，不顯示佔位符
      }
    }
    
    // 所有 URL 都失敗，顯示佔位符
    console.log('[組件調試] 所有URL都失敗，顯示佔位符。已嘗試:', currentPortraitUrlIndex.value + 1, '個URL');
    event.target.src = portraitFailedDataUrl();
  } else {
    // 沒有立繪數據
    console.log('[組件調試] 沒有立繪數據');
    event.target.src = portraitFailedDataUrl();
  }
};

const handleMaterialError = (event) => {
  event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect fill="%2330363d" width="60" height="60" rx="6"/><text fill="%238b949e" x="30" y="35" text-anchor="middle" font-size="10">?</text></svg>';
};
</script>

<style scoped>
.character-details {
  padding: 20px;
  max-height: 80vh;
  overflow-y: auto;
}

.detail-tab-nav {
  position: sticky;
  top: 0;
  z-index: 5;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
  margin: -20px -20px 18px;
  padding: 12px 20px;
  background: rgba(8, 11, 16, 0.94);
  border-bottom: 1px solid rgba(139, 148, 158, 0.2);
  backdrop-filter: blur(12px);
}

.detail-tab-nav button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  height: 38px;
  padding: 0 12px;
  border: 1px solid rgba(139, 148, 158, 0.18);
  border-radius: 6px;
  background: rgba(13, 17, 23, 0.62);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.88rem;
  font-weight: 700;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}

.detail-tab-nav button:hover,
.detail-tab-nav button.active {
  background: rgba(88, 166, 255, 0.16);
  border-color: rgba(88, 166, 255, 0.5);
  color: var(--text-color);
}

.detail-tab-nav i {
  color: var(--primary-color);
  font-size: 0.9rem;
}

.detail-tab-nav span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-hero {
  display: grid;
  grid-template-columns: minmax(280px, 42%) minmax(0, 1fr);
  gap: 24px;
  min-height: min(720px, calc(80vh - 40px));
  margin-bottom: 28px;
  border-bottom: 1px solid rgba(139, 148, 158, 0.25);
  padding-bottom: 24px;
}

.hero-portrait-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 193, 7, 0.14), transparent 32%),
    linear-gradient(160deg, rgba(16, 22, 29, 0.94), rgba(5, 8, 12, 0.94));
  border: 1px solid rgba(139, 148, 158, 0.2);
  border-radius: 8px;
  overflow: hidden;
}

.hero-portrait-display {
  flex: 1;
  min-height: 420px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 18px 18px 0;
  background: transparent;
  overflow: hidden;
}

.hero-portrait-display .portrait-image {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center bottom;
}

.hero-info-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
}

.hero-title-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}

.hero-title-row .rarity-badge-large {
  position: static;
  flex-shrink: 0;
  margin-top: 2px;
}

.hero-kicker {
  margin: 0 0 6px;
  color: #9adbe8;
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.hero-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.hero-stat {
  min-width: 0;
  padding: 12px;
  border: 1px solid rgba(139, 148, 158, 0.18);
  border-radius: 6px;
  background: rgba(13, 17, 23, 0.62);
}

.hero-stat span,
.summary-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-secondary);
  font-size: 0.78rem;
}

.hero-stat strong {
  color: var(--text-color);
  font-size: 1.2rem;
}

.hero-summary-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.summary-panel,
.hero-skills,
.obtain-line {
  padding: 14px;
  border: 1px solid rgba(139, 148, 158, 0.18);
  border-radius: 6px;
  background: rgba(13, 17, 23, 0.48);
}

.summary-panel strong {
  display: block;
  margin-bottom: 8px;
  color: var(--primary-color);
}

.summary-panel p,
.obtain-line {
  color: var(--text-color);
  line-height: 1.65;
}

.summary-panel p {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
}

.hero-skill-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.hero-skill {
  min-width: 0;
  padding: 10px;
  border-radius: 6px;
  background: rgba(88, 166, 255, 0.09);
}

.hero-skill span {
  display: block;
  margin-bottom: 4px;
  color: var(--primary-color);
  font-size: 0.78rem;
  font-weight: 700;
}

.hero-skill strong {
  display: block;
  color: var(--text-color);
  font-size: 0.92rem;
  line-height: 1.35;
}

.obtain-line {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 0;
  color: var(--text-secondary);
}

.obtain-line i {
  color: #ffc107;
  margin-top: 4px;
}

.compact-tabs {
  max-height: 128px;
  overflow-y: auto;
  margin: 0;
  padding: 12px;
  border-top: 1px solid rgba(139, 148, 158, 0.18);
}

.character-details-content {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.detail-tier {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tier-heading {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.tier-heading > span {
  flex-shrink: 0;
  color: #ffc107;
  font-size: 0.88rem;
  font-weight: 800;
  padding: 5px 8px;
  border: 1px solid rgba(255, 193, 7, 0.34);
  border-radius: 4px;
  background: rgba(255, 193, 7, 0.08);
}

.tier-heading h3 {
  margin: 0 0 4px;
  color: var(--text-color);
  font-size: 1.25rem;
}

.tier-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.tier-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.wide-section {
  grid-column: 1 / -1;
}

.character-details-header {
  display: flex;
  gap: 30px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.character-avatar-large {
  position: relative;
  width: 150px;
  height: 150px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #1a1f26, #2d333b);
}

.character-avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rarity-badge-large {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: #ffc107;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: bold;
}

.character-info-header {
  flex: 1;
}

.character-name-large {
  font-size: 1.8rem;
  color: var(--primary-color);
  margin: 0 0 8px 0;
}

.character-appellation {
  font-size: 1rem;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
  font-style: italic;
}

.character-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
}

.tag.profession { background: var(--primary-color); color: white; }
.tag.position { background: var(--border-color); color: var(--text-color); }
.tag.nation { background: rgba(88, 166, 255, 0.2); color: var(--primary-color); }

.detail-section {
  background: rgba(13, 17, 23, 0.5);
  padding: 20px;
  border: 1px solid rgba(139, 148, 158, 0.16);
  border-radius: 8px;
}

.detail-section h3 {
  font-size: 1.2rem;
  color: var(--primary-color);
  margin: 0 0 15px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-section h3 i {
  font-size: 1rem;
}

.detail-section h4 {
  font-size: 1rem;
  color: var(--primary-color);
  margin: 0 0 10px 0;
}

.detail-section p {
  line-height: 1.7;
  color: var(--text-color);
  margin: 0;
}

/* 立繪 */
.portrait-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.portrait-tabs button {
  padding: 8px 16px;
  background: var(--border-color);
  border: none;
  border-radius: 6px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.portrait-tabs button:hover,
.portrait-tabs button.active {
  background: var(--primary-color);
  color: white;
}

.portrait-display {
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 20px;
}

.portrait-image {
  max-width: 100%;
  max-height: 500px;
  border-radius: 8px;
  object-fit: contain;
}

.portrait-display.hero-portrait-display {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-height: 420px;
  padding: 18px 18px 0;
  background: transparent;
  overflow: hidden;
}

.portrait-display.hero-portrait-display .portrait-image {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  border-radius: 0;
  object-fit: contain;
  object-position: center bottom;
}

/* 特性 */
.trait-text {
  background: rgba(88, 166, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
}

/* 屬性表格 */
.attributes-table-wrapper {
  overflow-x: auto;
}

.attributes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.attributes-table th,
.attributes-table td {
  padding: 12px 8px;
  text-align: center;
  border: 1px solid var(--border-color);
}

.attributes-table th {
  background: var(--border-color);
  color: var(--text-color);
  font-weight: 600;
}

.phase-label {
  font-weight: 600;
  color: var(--primary-color);
}

/* 攻擊範圍 */
.range-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.range-phase-item {
  background: rgba(0, 0, 0, 0.2);
  padding: 15px;
  border-radius: 8px;
}

.range-grid {
  margin-top: 10px;
}

.range-cell {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.attack-cell {
  background: rgba(88, 166, 255, 0.6);
  border: 1px solid var(--primary-color);
}

.self-cell {
  background: rgba(255, 193, 7, 0.8);
  border: 1px solid #ffc107;
}

/* 天賦 */
.talents-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.talent-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid var(--primary-color);
}

.talent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.talent-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--primary-color);
}

.talent-unlock {
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: var(--border-color);
  padding: 4px 10px;
  border-radius: 4px;
}

.potential-req {
  color: #ffc107;
  margin-left: 5px;
}

.talent-desc {
  color: var(--text-color);
  font-size: 0.95rem;
  line-height: 1.6;
}

/* 潛能 */
.potential-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.potential-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 6px;
}

.potential-level {
  font-weight: 600;
  color: var(--primary-color);
  min-width: 70px;
}

.potential-effect {
  color: var(--text-color);
}

/* 技能 */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skill-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid var(--primary-color);
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.skill-index {
  background: var(--primary-color);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}

.skill-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.skill-desc {
  color: var(--text-secondary);
  margin-bottom: 12px;
  line-height: 1.6;
}

.skill-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.skill-stats span {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* 后勤技能 */
.building-skills-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.building-skill-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid #4caf50;
}

.building-skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.building-skill-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #4caf50;
}

.building-skill-room {
  font-size: 0.85rem;
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  padding: 4px 10px;
  border-radius: 4px;
}

.building-skill-desc {
  color: var(--text-secondary);
  line-height: 1.6;
}

.building-skill-unlock {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 材料 */
.evolve-costs,
.skill-upgrade-costs {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.evolve-phase,
.upgrade-level {
  background: rgba(88, 166, 255, 0.05);
  padding: 15px;
  border-radius: 8px;
}

.materials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.material-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.material-icon {
  width: 50px;
  height: 50px;
  object-fit: contain;
  border-radius: 4px;
}

.material-info {
  display: flex;
  flex-direction: column;
}

.material-name {
  font-size: 0.85rem;
  color: var(--text-color);
}

.material-count {
  font-size: 0.95rem;
  color: var(--primary-color);
  font-weight: 600;
}

.no-cost {
  color: var(--text-secondary);
  font-style: italic;
}

/* 模組 */
.modules-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid #ffc107;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.module-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffc107;
}

.module-type {
  font-size: 0.85rem;
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
  padding: 4px 10px;
  border-radius: 4px;
}

.module-desc {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.module-unlock {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 檔案 */
.handbook-stories {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-card {
  background: rgba(88, 166, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
}

.story-title {
  padding: 12px 15px;
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.2);
  transition: background 0.2s;
}

.story-title:hover {
  background: rgba(88, 166, 255, 0.1);
}

.story-title i {
  font-size: 0.8rem;
  color: var(--primary-color);
}

.story-content {
  padding: 15px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  line-height: 1.8;
}

.no-data {
  color: var(--text-secondary);
  text-align: center;
  padding: 20px;
  font-style: italic;
}

@media (max-width: 768px) {
  .character-details {
    padding: 12px;
    max-height: 82vh;
  }

  .detail-tab-nav {
    display: flex;
    grid-template-columns: none;
    gap: 8px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    margin: -12px -12px 14px;
    padding: 10px 12px;
    scrollbar-width: none;
  }

  .detail-tab-nav::-webkit-scrollbar {
    display: none;
  }

  .detail-tab-nav button {
    flex: 0 0 auto;
    height: 36px;
    min-width: 96px;
    padding: 0 11px;
    font-size: 0.82rem;
  }

  .character-hero {
    grid-template-columns: 1fr;
    min-height: auto;
    gap: 12px;
    margin-bottom: 20px;
    padding-bottom: 18px;
  }

  .hero-info-panel {
    order: 1;
    gap: 12px;
  }

  .hero-portrait-panel {
    order: 2;
    border-radius: 6px;
    max-height: clamp(280px, 44vh, 390px);
  }

  .hero-portrait-display,
  .portrait-display.hero-portrait-display {
    height: clamp(240px, 40vh, 340px);
    min-height: 0;
    max-height: none;
    padding: 0 8px;
    align-items: flex-end;
    overflow: hidden;
  }

  .hero-stat-grid,
  .tier-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .hero-summary-grid,
  .hero-skill-list {
    grid-template-columns: 1fr;
  }

  .hero-title-row {
    align-items: flex-start;
    gap: 10px;
  }

  .hero-kicker {
    font-size: 0.72rem;
    margin-bottom: 4px;
  }

  .character-tags {
    justify-content: flex-start;
    gap: 6px;
  }

  .tag {
    padding: 4px 8px;
    font-size: 0.78rem;
  }

  .hero-stat {
    padding: 9px 10px;
  }

  .hero-stat span,
  .summary-label {
    font-size: 0.72rem;
    margin-bottom: 3px;
  }

  .hero-stat strong {
    font-size: 1rem;
  }

  .summary-panel,
  .hero-skills,
  .obtain-line {
    padding: 11px;
  }

  .summary-panel p {
    -webkit-line-clamp: 3;
    line-height: 1.55;
  }

  .hero-skill {
    padding: 9px 10px;
  }

  .hero-skill strong {
    font-size: 0.88rem;
  }

  .compact-tabs {
    display: flex;
    flex-wrap: nowrap;
    overflow-x: auto;
    overflow-y: hidden;
    max-height: none;
    padding: 8px;
  }

  .compact-tabs button {
    flex: 0 0 auto;
    padding: 7px 10px;
    font-size: 0.82rem;
  }

  .character-details-content {
    gap: 22px;
  }

  .tier-heading {
    gap: 10px;
  }

  .tier-heading > span {
    font-size: 0.78rem;
    padding: 4px 7px;
  }

  .tier-heading h3 {
    font-size: 1.05rem;
  }

  .tier-heading p {
    font-size: 0.82rem;
  }

  .detail-section {
    padding: 14px;
  }

  .detail-section h3 {
    font-size: 1rem;
    margin-bottom: 12px;
    padding-bottom: 8px;
  }

  .wide-section {
    grid-column: 1 / -1;
  }

  .character-details-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .character-avatar-large {
    width: 120px;
    height: 120px;
  }

  .character-name-large {
    font-size: 1.35rem;
    line-height: 1.2;
  }

  .materials-grid {
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 10px;
  }

  .portrait-image {
    max-height: 350px;
  }

  .portrait-display.hero-portrait-display .portrait-image {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    object-position: center bottom;
  }

  .talent-header,
  .skill-header,
  .module-header,
  .building-skill-header {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .character-details {
    padding: 10px;
  }

  .detail-tab-nav {
    margin: -10px -10px 12px;
    padding: 9px 10px;
  }

  .detail-tab-nav button {
    min-width: 86px;
    height: 34px;
    font-size: 0.78rem;
  }

  .detail-tab-nav button i {
    display: none;
  }

  .hero-stat-grid,
  .tier-grid {
    grid-template-columns: 1fr;
  }

  .hero-title-row {
    flex-direction: column;
  }

  .hero-title-row .rarity-badge-large {
    align-self: flex-start;
  }

  .hero-portrait-display,
  .portrait-display.hero-portrait-display {
    height: clamp(220px, 38vh, 300px);
    min-height: 0;
    max-height: none;
  }

  .portrait-display.hero-portrait-display .portrait-image {
    max-width: 100%;
    height: 100%;
    max-height: 100%;
  }

  .materials-grid {
    grid-template-columns: 1fr;
  }

  .potential-item {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .attributes-table {
    font-size: 0.78rem;
  }

  .attributes-table th,
  .attributes-table td {
    padding: 8px 6px;
  }
}

@media (max-width: 768px) and (orientation: landscape) {
  .hero-portrait-panel {
    max-height: clamp(220px, 58vh, 300px);
  }

  .hero-portrait-display,
  .portrait-display.hero-portrait-display {
    height: clamp(200px, 52vh, 270px);
  }

  .portrait-display.hero-portrait-display .portrait-image {
    height: 100%;
    max-height: 100%;
  }
}

.api-pre-line {
  white-space: pre-line;
}
</style>

<template>
  <div class="recruit-maker" :key="locale">
    <header class="recruit-header">
      <h1 class="recruit-title">{{ t('recruit.pageTitle') }}</h1>
      <div class="recruit-header-actions">
        <button type="button" class="btn-secondary" :disabled="isLoadingChars" @click="pickRandomOperator">
          {{ t('recruit.random') }}
        </button>
        <button type="button" class="btn-primary" :disabled="isExporting" @click="exportCard">
          {{ isExporting ? t('recruit.exporting') : t('recruit.export') }}
        </button>
      </div>
    </header>

    <div class="recruit-body">
      <aside class="recruit-sidebar">
        <nav class="recruit-tabs" role="tablist">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :class="{ active: activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ t(tab.labelKey) }}
          </button>
        </nav>

        <div class="recruit-panel">
          <!-- 立绘 -->
          <div v-if="activeTab === 'appearance'" class="tab-pane">
            <p class="panel-hint">{{ t('recruit.appearanceHint') }}</p>
            <label class="field">
              <span>{{ t('recruit.uploadPortrait') }}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="onPortraitUpload" />
            </label>
            <label class="field">
              <span>{{ t('recruit.scale') }}</span>
              <input
                v-model.number="portraitScale"
                type="range"
                min="0.5"
                max="3"
                step="0.05"
                :disabled="!portraitSrc"
              />
              <small v-if="!portraitSrc">{{ t('recruit.scaleDisabled') }}</small>
            </label>
            <label class="field">
              <span>{{ t('recruit.uploadBackground') }}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" @change="onBackgroundUpload" />
              <button v-if="customBgUrl" type="button" class="link-btn" @click="clearBackground">
                {{ t('recruit.resetBackground') }}
              </button>
            </label>
          </div>

          <!-- 阵营 -->
          <div v-else-if="activeTab === 'organization'" class="tab-pane">
            <label class="field checkbox-field">
              <input v-model="showNewBadge" type="checkbox" />
              <span>{{ t('recruit.showNewBadge') }}</span>
            </label>
            <label class="field">
              <span>{{ t('recruit.factionLogo') }}</span>
              <select v-model="factionLogoKey">
                <option v-for="key in factionLogoOptions" :key="key" :value="key">
                  {{ factionOptionLabel(key) }}
                </option>
              </select>
            </label>
            <label class="field checkbox-field">
              <input v-model="showVoucherDecor" type="checkbox" />
              <span>{{ t('recruit.showVoucherDecor') }}</span>
            </label>
          </div>

          <!-- 角色 -->
          <div v-else-if="activeTab === 'role'" class="tab-pane">
            <label class="field">
              <span>{{ t('recruit.searchOperator') }}</span>
              <input v-model="charSearch" type="search" :placeholder="t('recruit.searchPlaceholder')" />
            </label>
            <div v-if="isLoadingChars" class="panel-loading">{{ t('common.loading') }}</div>
            <ul v-else class="char-pick-list">
              <li
                v-for="char in filteredCharacters"
                :key="char.id"
                :class="{ active: selectedCharId === char.id }"
              >
                <button type="button" @click="applyCharacter(char)">
                  <img :src="getRecruitCharacterAvatarUrl(char)" :alt="char.name" loading="lazy" decoding="async" @error="onAvatarError($event, char.id)" />
                  <span>{{ char.name }}</span>
                  <small>{{ getRarityStars(char.rarity) }}★</small>
                </button>
              </li>
            </ul>
            <div v-if="selectedCharacterDetails" class="selected-character-tools">
              <div class="selected-character-name">
                {{ selectedCharacterDetails.name }}
              </div>
              <label class="field checkbox-field">
                <input v-model="useSelectedCharacterFaction" type="checkbox" @change="applySelectedCharacterFaction" />
                <span>使用該角色陣營</span>
              </label>
              <label v-if="selectedCharacterPortraits.length" class="field">
                <span>角色皮膚</span>
                <select v-model.number="selectedPortraitIndex" @change="applySelectedPortrait">
                  <option
                    v-for="(portrait, index) in selectedCharacterPortraits"
                    :key="portrait.skinId || portrait.portraitId || index"
                    :value="index"
                  >
                    {{ portrait.name || portrait.portraitId || `Skin ${index + 1}` }}
                  </option>
                </select>
              </label>
            </div>
            <label class="field">
              <span>{{ t('character.rarity') }}</span>
              <div class="star-pick-row">
                <button
                  v-for="n in [3, 4, 5, 6]"
                  :key="n"
                  type="button"
                  :class="{ active: starCount === n }"
                  @click="starCount = n"
                >
                  {{ n }}★
                </button>
              </div>
            </label>
            <label class="field">
              <span>{{ t('character.profession') }}</span>
              <select v-model="profession">
                <option v-for="p in professionOptions" :key="p.value" :value="p.value">
                  {{ p.label }}
                </option>
              </select>
            </label>
          </div>

          <!-- 文本 -->
          <div v-else class="tab-pane">
            <label class="field">
              <span>{{ t('recruit.nameZh') }}</span>
              <input :value="nameZh" type="text" @input="onNameZhInput" />
            </label>
            <label class="field">
              <span>{{ t('recruit.nameEn') }}</span>
              <input :value="nameEn" type="text" @input="onNameEnInput" />
            </label>
            <label class="field">
              <span>{{ t('recruit.tagline') }}</span>
              <textarea :value="tagline" rows="4" @input="onTaglineInput" />
            </label>
          </div>
        </div>
      </aside>

      <section ref="previewAreaRef" class="recruit-preview">
        <div class="preview-scaler" :style="previewScalerStyle">
          <div
            ref="cardRef"
            class="recruit-card"
            :style="cardBackgroundStyle"
          >
            <img
              v-if="portraitSrc"
              class="portrait-layer"
              :src="portraitSrc"
              alt=""
              draggable="false"
              :style="portraitStyle"
              @mousedown.prevent="startPortraitDrag"
              @touchstart.prevent="startPortraitDrag"
              @error="onPortraitError"
            />

            <div class="card-fade" aria-hidden="true" />

            <div class="card-ui">
              <img
                class="faction-logo"
                :src="factionLogoUrl"
                alt=""
                crossorigin="anonymous"
                @error="onFactionLogoError"
              />

              <div class="stars-row">
                <img
                  v-for="i in starCount"
                  :key="i"
                  class="star-img"
                  :src="RECRUIT_STAR_IMAGE_URL"
                  alt=""
                />
              </div>

              <div class="name-block">
                <div class="class-column">
                  <img
                    class="class-icon"
                    :src="professionIconUrl"
                    alt=""
                    crossorigin="anonymous"
                  />
                  <img
                    v-if="showNewBadge"
                    class="new-badge"
                    :src="RECRUIT_NEW_BADGE_URL"
                    alt="NEW"
                    crossorigin="anonymous"
                  />
                </div>
                <div class="names">
                  <div class="name-zh">{{ nameZh || t('recruit.nameZhPlaceholder') }}</div>
                  <div class="name-en">{{ (nameEn || t('recruit.nameEnPlaceholder')).toUpperCase() }}</div>
                </div>
              </div>

              <div v-if="showVoucherDecor" class="voucher-decor" aria-hidden="true">
                <div class="voucher-bar voucher-senior" />
                <div class="voucher-bar voucher-contract" />
              </div>

              <div class="tagline-block">
                <p v-for="(line, idx) in taglineLines" :key="idx">{{ line }}</p>
              </div>
            </div>
          </div>
        </div>

        <p class="preview-tip">{{ t('recruit.dragHint') }}</p>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { i18n as globalI18n } from '../i18n/index.js';
import {
  fetchRecruitCharacters,
  fetchRecruitCharacterDetails,
  getCharacterAvatarFallbackUrl,
  getCharacterAvatarUrls,
  syncFactionI18nMessages,
} from '../services/api.js';
import {
  RECRUIT_STAR_IMAGE_URL,
  RECRUIT_CARD_SIZE,
  DEFAULT_RECRUIT_BACKGROUND,
  RECRUIT_DEFAULT_BACKGROUND_URL,
  RECRUIT_NEW_BADGE_URL,
  RECRUIT_FACTION_LOGO_OPTIONS,
  getRecruitFactionLogoUrl,
  getRecruitProfessionIconUrl,
  rarityToStars,
  factionIdToLogoKey,
} from '../utils/recruitCard.js';
import {
  getLocalOperatorAvatarUrl,
  loadOperatorAssetManifest,
} from '../services/operatorAssetManifest.js';

const { t, locale } = useI18n();

const tabs = [
  { id: 'appearance', labelKey: 'recruit.tabs.appearance' },
  { id: 'organization', labelKey: 'recruit.tabs.organization' },
  { id: 'role', labelKey: 'recruit.tabs.role' },
  { id: 'text', labelKey: 'recruit.tabs.text' },
];

const activeTab = ref('appearance');
const previewAreaRef = ref(null);
const cardRef = ref(null);
const previewScale = ref(0.12);
const DEFAULT_PORTRAIT_WIDTH = 500;
const DEFAULT_PORTRAIT_SCALE = 1.45;

function getDefaultPortraitPosition(scale = DEFAULT_PORTRAIT_SCALE) {
  return {
    x: Math.round((RECRUIT_CARD_SIZE.width - DEFAULT_PORTRAIT_WIDTH * scale) / 2),
    y: 70,
  };
}

const DEFAULT_RECRUIT_TEXT = {
  'zh-TW': {
    nameZh: '中文名稱',
    nameEn: 'ENGLISH NAME',
    tagline: '請在此輸入幹員報到語音或介紹文字。\n選擇角色後會自動套用資料。',
  },
  'zh-CN': {
    nameZh: '中文名称',
    nameEn: 'ENGLISH NAME',
    tagline: '请在此输入干员报到语音或介绍文字。\n选择角色后会自动套用资料。',
  },
  en: {
    nameZh: 'Operator name',
    nameEn: 'ENGLISH NAME',
    tagline: 'Enter the operator onboarding line or profile text here.\nSelecting an operator will fill this automatically.',
  },
  ja: {
    nameZh: 'オペレーター名',
    nameEn: 'ENGLISH NAME',
    tagline: 'オペレーターの着任ボイスや紹介文を入力してください。\nオペレーターを選択すると自動入力されます。',
  },
  ko: {
    nameZh: '오퍼레이터 이름',
    nameEn: 'ENGLISH NAME',
    tagline: '오퍼레이터 합류 대사나 소개 문구를 입력하세요.\n오퍼레이터를 선택하면 자동으로 입력됩니다.',
  },
};

function getDefaultRecruitText(localeCode) {
  return DEFAULT_RECRUIT_TEXT[localeCode] || DEFAULT_RECRUIT_TEXT['zh-TW'];
}

const initialRecruitText = getDefaultRecruitText(locale.value);
const nameZh = ref(initialRecruitText.nameZh);
const nameEn = ref(initialRecruitText.nameEn);
const tagline = ref(initialRecruitText.tagline);
const nameZhEditedByUser = ref(false);
const nameEnEditedByUser = ref(false);
const taglineEditedByUser = ref(false);
const starCount = ref(6);
const profession = ref('PIONEER');
const factionLogoKey = ref('logo_rhodes');
const showVoucherDecor = ref(false);
const showNewBadge = ref(true);

const portraitSrc = ref('');
const portraitScale = ref(DEFAULT_PORTRAIT_SCALE);
const portraitPos = ref(getDefaultPortraitPosition());
const customBgUrl = ref('');
const portraitObjectUrl = ref('');

const characters = ref([]);
const isLoadingChars = ref(true);
const charSearch = ref('');
const debouncedCharSearch = ref('');
const selectedCharId = ref('');
const selectedCharacterDetails = ref(null);
const selectedPortraitIndex = ref(0);
const useSelectedCharacterFaction = ref(true);
const isExporting = ref(false);
const portraitUrlCandidates = ref([]);
const portraitUrlCandidateIndex = ref(0);

let dragState = null;
let charSearchDebounceTimer = null;
let recruitCharactersLoadToken = 0;
let recruitCharacterDetailToken = 0;
let recruitCharactersIdleHandle = null;
const failedImageUrls = new Set();
const assetManifestVersion = ref(0);

const professionOptions = computed(() => [
  { value: 'PIONEER', label: t('profession.PIONEER') },
  { value: 'WARRIOR', label: t('profession.WARRIOR') },
  { value: 'TANK', label: t('profession.TANK') },
  { value: 'SNIPER', label: t('profession.SNIPER') },
  { value: 'CASTER', label: t('profession.CASTER') },
  { value: 'MEDIC', label: t('profession.MEDIC') },
  { value: 'SUPPORT', label: t('profession.SUPPORT') },
  { value: 'SPECIAL', label: t('profession.SPECIAL') },
]);

const factionLogoOptions = RECRUIT_FACTION_LOGO_OPTIONS;

const factionLogoUrl = computed(() => getRecruitFactionLogoUrl(factionLogoKey.value));
const professionIconUrl = computed(() => getRecruitProfessionIconUrl(profession.value));

const taglineLines = computed(() => {
  const text = tagline.value || '';
  return text.split(/\n/).filter((line) => line.length > 0);
});

const cardBackgroundStyle = computed(() => {
  if (customBgUrl.value) {
    return {
      backgroundImage: `url(${customBgUrl.value})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    backgroundImage: `url(${RECRUIT_DEFAULT_BACKGROUND_URL}), ${DEFAULT_RECRUIT_BACKGROUND}`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
});

const portraitStyle = computed(() => ({
  left: `${portraitPos.value.x}px`,
  top: `${portraitPos.value.y}px`,
  width: `${DEFAULT_PORTRAIT_WIDTH * portraitScale.value}px`,
}));

const previewScalerStyle = computed(() => ({
  transform: `scale(${previewScale.value})`,
  transformOrigin: 'center top',
}));

const filteredCharacters = computed(() => {
  const q = debouncedCharSearch.value.trim().toLowerCase();
  let list = characters.value;
  if (q) {
    list = list.filter(
      (c) =>
        c.name?.toLowerCase().includes(q) ||
        c.appellation?.toLowerCase().includes(q) ||
        c.id?.toLowerCase().includes(q)
    );
  }
  return list.slice(0, 80);
});

const selectedCharacterPortraits = computed(() => selectedCharacterDetails.value?.portraits || []);

function getRecruitCharacterAvatarUrl(char) {
  void assetManifestVersion.value;
  return getLocalOperatorAvatarUrl(char?.id) || char?.avatarUrl || getCharacterAvatarFallbackUrl(char?.id);
}

function getRarityStars(rarity) {
  return rarityToStars(rarity);
}

function factionOptionLabel(logoKey) {
  const id = logoKey.replace(/^logo_/, '');
  const key = `recruit.faction.${id}`;
  const label = t(key);
  return label === key ? id : label;
}

function fitPreview() {
  const area = previewAreaRef.value;
  if (!area) return;
  const pad = 48;
  const scale = Math.min(
    (area.clientWidth - pad) / RECRUIT_CARD_SIZE.width,
    (area.clientHeight - pad) / RECRUIT_CARD_SIZE.height,
    1
  );
  previewScale.value = Math.max(0.08, scale);
}

function onNameZhInput(event) {
  nameZhEditedByUser.value = true;
  nameZh.value = event.target.value;
}

function onNameEnInput(event) {
  nameEnEditedByUser.value = true;
  nameEn.value = event.target.value;
}

function onTaglineInput(event) {
  taglineEditedByUser.value = true;
  tagline.value = event.target.value;
}

function applyLocalizedDefaultText() {
  if (selectedCharId.value) return;

  const defaultText = getDefaultRecruitText(locale.value);

  if (!nameZhEditedByUser.value) {
    nameZh.value = defaultText.nameZh;
  }

  if (!nameEnEditedByUser.value) {
    nameEn.value = defaultText.nameEn;
  }

  if (!taglineEditedByUser.value) {
    tagline.value = defaultText.tagline;
  }
}

function onAvatarError(event, charId) {
  const el = event.target;
  if (!el) return;

  if (el.src) {
    failedImageUrls.add(el.src);
  }

  const nextIndex = Number(el.dataset.fallbackIndex || 1);
  const urls = getCharacterAvatarUrls(charId);
  const nextUrl = urls.slice(nextIndex).find((url) => !failedImageUrls.has(url));
  if (!nextUrl) return;

  el.dataset.fallbackIndex = String(urls.indexOf(nextUrl) + 1);
  el.src = nextUrl || getCharacterAvatarFallbackUrl(charId);
}

function onFactionLogoError(event) {
  const el = event.target;
  if (!el || el.dataset.fallback) return;
  el.dataset.fallback = '1';
  el.src = getRecruitFactionLogoUrl('logo_rhodes');
}

function revokePortraitObjectUrl() {
  if (portraitObjectUrl.value) {
    URL.revokeObjectURL(portraitObjectUrl.value);
    portraitObjectUrl.value = '';
  }
}

function setPortraitFromUrl(url, isObjectUrl = false) {
  revokePortraitObjectUrl();
  if (isObjectUrl) portraitObjectUrl.value = url;
  portraitSrc.value = url;
}

function getUsableImageUrls(urls) {
  return (urls || []).filter((url) => url && !failedImageUrls.has(url));
}

function preloadImageUrl(url) {
  if (!url || failedImageUrls.has(url)) return;
  const img = new Image();
  img.onload = () => {};
  img.onerror = () => {
    failedImageUrls.add(url);
  };
  img.src = url;
}

function preloadPortraits(detail, activePortraitIndex) {
  const portraits = detail?.portraits || [];
  portraits.forEach((portrait, index) => {
    if (index === activePortraitIndex) return;
    const url = getUsableImageUrls(portrait?.urls)[0];
    preloadImageUrl(url);
  });
}

function applyPortraitFromDetail(detail, portraitIndex) {
  const portraits = detail?.portraits || [];
  const portrait = portraits[portraitIndex] || portraits[portraits.length - 1] || portraits[0];
  const urls = getUsableImageUrls(portrait?.urls);
  const url = urls[0];
  if (!url) return;

  portraitUrlCandidates.value = urls;
  portraitUrlCandidateIndex.value = 0;
  setPortraitFromUrl(url);
  portraitScale.value = DEFAULT_PORTRAIT_SCALE;
  portraitPos.value = getDefaultPortraitPosition(portraitScale.value);
}

function onPortraitError() {
  if (portraitSrc.value) {
    failedImageUrls.add(portraitSrc.value);
  }

  const nextIndex = portraitUrlCandidateIndex.value + 1;
  const nextUrl = portraitUrlCandidates.value
    .slice(nextIndex)
    .find((url) => !failedImageUrls.has(url));

  if (!nextUrl) return;

  portraitUrlCandidateIndex.value = portraitUrlCandidates.value.indexOf(nextUrl);
  setPortraitFromUrl(nextUrl);
}

function applySelectedPortrait() {
  if (!selectedCharacterDetails.value) return;
  applyPortraitFromDetail(selectedCharacterDetails.value, selectedPortraitIndex.value);
}

function applySelectedCharacterFaction() {
  if (!useSelectedCharacterFaction.value || !selectedCharacterDetails.value?.factionId) return;
  factionLogoKey.value = factionIdToLogoKey(selectedCharacterDetails.value.factionId);
}

function pickEliteOnePortraitIndex(detail) {
  const portraits = detail?.portraits || [];
  const eliteOneIndex = portraits.findIndex((portrait) => portrait?.skinId == null);
  return eliteOneIndex >= 0 ? eliteOneIndex : 0;
}

function onPortraitUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  setPortraitFromUrl(URL.createObjectURL(file), true);
  e.target.value = '';
}

function onBackgroundUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (customBgUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(customBgUrl.value);
  }
  customBgUrl.value = URL.createObjectURL(file);
  e.target.value = '';
}

function clearBackground() {
  if (customBgUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(customBgUrl.value);
  }
  customBgUrl.value = '';
}

function startPortraitDrag(e) {
  if (!portraitSrc.value) return;
  const ev = e.touches ? e.touches[0] : e;
  dragState = {
    startX: ev.clientX,
    startY: ev.clientY,
    originX: portraitPos.value.x,
    originY: portraitPos.value.y,
  };
}

function onPointerMove(e) {
  if (!dragState) return;
  const ev = e.touches ? e.touches[0] : e;
  const dx = (ev.clientX - dragState.startX) / previewScale.value;
  const dy = (ev.clientY - dragState.startY) / previewScale.value;
  portraitPos.value = {
    x: dragState.originX + dx,
    y: dragState.originY + dy,
  };
}

function endPortraitDrag() {
  dragState = null;
}

async function loadCharacterRecruitData(charId, options = {}) {
  const detailToken = ++recruitCharacterDetailToken;
  try {
    const detail = await fetchRecruitCharacterDetails(charId);
    if (detailToken !== recruitCharacterDetailToken) return;

    selectedCharacterDetails.value = detail;
    selectedPortraitIndex.value = pickEliteOnePortraitIndex(detail);
    applyPortraitFromDetail(detail, selectedPortraitIndex.value);
    preloadPortraits(detail, selectedPortraitIndex.value);
    applySelectedCharacterFaction();

    const recruitText = detail.recruitVoiceText || detail.traitDescription || '';
    if (recruitText && (!options.preserveUserText || !taglineEditedByUser.value)) {
      tagline.value = recruitText.replace(/\\n/g, '\n').slice(0, 200);
    }
  } catch (err) {
    console.warn('Failed to load portrait', err);
  }
}

async function applyCharacter(char, options = {}) {
  const preserveUserText = options.preserveUserText === true;

  selectedCharId.value = char.id;

  if (!preserveUserText) {
    nameZhEditedByUser.value = false;
    nameEnEditedByUser.value = false;
    taglineEditedByUser.value = false;
  }

  if (!preserveUserText || !nameZhEditedByUser.value) {
    nameZh.value = char.name || '';
  }

  if (!preserveUserText || !nameEnEditedByUser.value) {
    nameEn.value = (char.appellation || char.id || '').toUpperCase();
  }

  starCount.value = getRarityStars(char.rarity);
  profession.value = char.profession || 'PIONEER';
  if (useSelectedCharacterFaction.value) {
    factionLogoKey.value = factionIdToLogoKey(char.factionId);
  }
  await loadCharacterRecruitData(char.id, { preserveUserText });
}

async function pickRandomOperator() {
  if (!characters.value.length) return;
  const char = characters.value[Math.floor(Math.random() * characters.value.length)];
  await applyCharacter(char);
}

async function loadRecruitCharacters() {
  const loadToken = ++recruitCharactersLoadToken;
  const [, loadedCharacters] = await Promise.all([
    syncFactionI18nMessages(globalI18n),
    fetchRecruitCharacters(),
    loadOperatorAssetManifest().then(() => {
      assetManifestVersion.value += 1;
    }).catch(() => null),
  ]);
  if (loadToken !== recruitCharactersLoadToken) return;

  characters.value = loadedCharacters;

  if (selectedCharId.value) {
    const selectedCharacter = loadedCharacters.find((char) => char.id === selectedCharId.value);
    if (selectedCharacter) {
      await applyCharacter(selectedCharacter, { preserveUserText: true });
    }
  } else {
    applyLocalizedDefaultText();
  }
}

async function handleAppLocaleChanged() {
  try {
    isLoadingChars.value = true;
    await loadRecruitCharacters();
  } catch (err) {
    console.error(err);
  } finally {
    isLoadingChars.value = false;
  }
}

async function exportCard() {
  if (!cardRef.value || isExporting.value) return;
  isExporting.value = true;
  try {
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(cardRef.value, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      width: RECRUIT_CARD_SIZE.width,
      height: RECRUIT_CARD_SIZE.height,
      scale: 1,
    });
    const link = document.createElement('a');
    link.download = `ark-recruit-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Export failed', err);
    alert(t('recruit.exportFailed'));
  } finally {
    isExporting.value = false;
  }
}

onMounted(async () => {
  fitPreview();
  window.addEventListener('resize', fitPreview);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', endPortraitDrag);
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', endPortraitDrag);
  window.addEventListener('app-locale-changed', handleAppLocaleChanged);

  const loadWhenIdle = async () => {
    recruitCharactersIdleHandle = null;
    try {
      await loadRecruitCharacters();
    } catch (err) {
      console.error(err);
    } finally {
      isLoadingChars.value = false;
    }
  };

  if ('requestIdleCallback' in window) {
    recruitCharactersIdleHandle = window.requestIdleCallback(loadWhenIdle, { timeout: 1200 });
  } else {
    recruitCharactersIdleHandle = window.setTimeout(loadWhenIdle, 0);
  }
});

onUnmounted(() => {
  if (recruitCharactersIdleHandle != null) {
    if ('cancelIdleCallback' in window) {
      window.cancelIdleCallback(recruitCharactersIdleHandle);
    } else {
      window.clearTimeout(recruitCharactersIdleHandle);
    }
    recruitCharactersIdleHandle = null;
  }
  if (charSearchDebounceTimer) {
    clearTimeout(charSearchDebounceTimer);
    charSearchDebounceTimer = null;
  }
  window.removeEventListener('resize', fitPreview);
  window.removeEventListener('mousemove', onPointerMove);
  window.removeEventListener('mouseup', endPortraitDrag);
  window.removeEventListener('touchmove', onPointerMove);
  window.removeEventListener('touchend', endPortraitDrag);
  window.removeEventListener('app-locale-changed', handleAppLocaleChanged);
  revokePortraitObjectUrl();
  if (customBgUrl.value?.startsWith('blob:')) {
    URL.revokeObjectURL(customBgUrl.value);
  }
});

watch(charSearch, (value) => {
  if (charSearchDebounceTimer) {
    clearTimeout(charSearchDebounceTimer);
  }
  charSearchDebounceTimer = setTimeout(() => {
    debouncedCharSearch.value = value;
    charSearchDebounceTimer = null;
  }, 120);
});
</script>

<style scoped>
.recruit-maker {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  min-height: 520px;
  margin: 0 12px 12px;
  border-radius: 8px;
  overflow: hidden;
  background:
    linear-gradient(135deg, rgba(23, 28, 32, 0.96), rgba(10, 12, 14, 0.98)),
    var(--card-bg);
  border: 1px solid rgba(221, 226, 229, 0.1);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.32);
}

.recruit-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(221, 226, 229, 0.1);
  background: linear-gradient(90deg, rgba(229, 88, 45, 0.14), rgba(43, 188, 201, 0.08), transparent);
  flex-shrink: 0;
}

.recruit-title {
  font-size: 1.15rem;
  margin: 0;
  color: var(--text-color);
}

.recruit-header-actions {
  display: flex;
  gap: 10px;
}

.btn-primary,
.btn-secondary {
  padding: 9px 14px;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-weight: 600;
}

.btn-primary {
  background: #e5582d;
  color: #fff;
  border-color: rgba(255, 255, 255, 0.16);
}

.btn-primary:disabled,
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-color);
  border-color: rgba(255, 255, 255, 0.14);
}

.recruit-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.recruit-sidebar {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(221, 226, 229, 0.1);
  background: rgba(10, 12, 14, 0.86);
}

.recruit-tabs {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 4px;
  padding: 12px;
  border-bottom: 1px solid rgba(221, 226, 229, 0.1);
}

.recruit-tabs button {
  text-align: center;
  padding: 9px 10px;
  border: none;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
}

.recruit-tabs button.active {
  background: rgba(43, 188, 201, 0.18);
  color: #8ee8f0;
  font-weight: 600;
}

.recruit-panel {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
}

.panel-hint,
.preview-tip {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0 0 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
  font-size: 0.85rem;
  color: var(--text-color);
}

.field input[type='text'],
.field input[type='search'],
.field select,
.field textarea {
  padding: 8px 10px;
  border-radius: 4px;
  border: 1px solid rgba(221, 226, 229, 0.14);
  background: #111820;
  color: #f3f7fb;
  font-size: 0.9rem;
  color-scheme: dark;
}

.field select {
  cursor: pointer;
}

.field select:focus {
  outline: 2px solid #2bbcc9;
  outline-offset: 2px;
  border-color: #2bbcc9;
}

.field select option {
  background: #0b1016;
  color: #f3f7fb;
}

.field select option:checked,
.field select option:hover {
  background: #1f6570;
  color: #ffffff;
}

.field input[type='range'] {
  width: 100%;
  accent-color: var(--primary-color);
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
}

.link-btn {
  background: none;
  border: none;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0;
  text-align: left;
}

.star-pick-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.star-pick-row button {
  padding: 6px 10px;
  border-radius: 3px;
  border: 1px solid rgba(221, 226, 229, 0.14);
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-secondary);
  cursor: pointer;
}

.star-pick-row button.active {
  background: #e5582d;
  border-color: #e5582d;
  color: #fff;
}

.char-pick-list {
  list-style: none;
  margin: 0 0 14px;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
}

.char-pick-list li button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  text-align: left;
}

.char-pick-list li.active button,
.char-pick-list li button:hover {
  background: rgba(43, 188, 201, 0.14);
}

.char-pick-list img {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  object-fit: cover;
}

.char-pick-list small {
  margin-left: auto;
  color: var(--text-secondary);
}

.selected-character-tools {
  margin: 0 0 16px;
  padding: 12px;
  border: 1px solid rgba(221, 226, 229, 0.12);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.035);
}

.selected-character-tools .field:last-child {
  margin-bottom: 0;
}

.selected-character-name {
  margin-bottom: 10px;
  font-size: 0.9rem;
  font-weight: 700;
  color: #8ee8f0;
}

.panel-loading {
  padding: 12px;
  color: var(--text-secondary);
}

.recruit-preview {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  overflow: hidden;
  background:
    radial-gradient(circle at 20% 20%, rgba(43, 188, 201, 0.12), transparent 28%),
    linear-gradient(135deg, #101315, #050607);
  padding: 16px;
  position: relative;
}

.preview-scaler {
  flex-shrink: 0;
}

.recruit-card {
  position: relative;
  width: 1920px;
  height: 1080px;
  overflow: hidden;
  box-shadow: 0 30px 60px rgba(0, 0, 0, 0.45);
}

.recruit-card::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background:
    linear-gradient(90deg, rgba(0, 0, 0, 0.62) 0%, rgba(0, 0, 0, 0.18) 34%, rgba(0, 0, 0, 0.5) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 38%, rgba(0, 0, 0, 0.5));
}

.portrait-layer {
  position: absolute;
  z-index: 2;
  height: auto;
  cursor: move;
  user-select: none;
  pointer-events: auto;
}

.card-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 42%;
  z-index: 3;
  pointer-events: none;
  background: linear-gradient(
    to top,
    rgba(0, 0, 0, 0.92) 0%,
    rgba(0, 0, 0, 0.92) 19%,
    rgba(0, 0, 0, 0) 85%
  );
}

.card-ui {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
}

.faction-logo {
  position: absolute;
  left: 342px;
  top: 160px;
  width: 500px;
  filter: brightness(0) invert(1);
  opacity: 0.85;
}

.stars-row {
  position: absolute;
  left: 565px;
  top: 560px;
  display: flex;
  align-items: center;
  padding-left: 52px;
}

.star-img {
  width: 152px;
  height: 152px;
  margin-left: -35px;
}

.star-img:first-child {
  margin-left: 0;
}

.name-block {
  position: absolute;
  left: 560px;
  top: 700px;
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.class-column {
  width: 180px;
  min-height: 186px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.class-icon {
  width: 180px;
  max-height: 132px;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.new-badge {
  width: 132px;
  height: auto;
  margin-top: -10px;
  filter: drop-shadow(0 0 22px rgba(255, 47, 47, 0.72));
}

.names {
  display: flex;
  flex-direction: column;
}

.name-zh {
  font-size: 120px;
  font-weight: 900;
  line-height: 1;
  color: #fff;
  -webkit-text-stroke: 3px rgba(0, 0, 0, 0.9);
  paint-order: stroke fill;
  font-family: 'Source Han Serif TC', 'Noto Serif TC', serif;
}

.name-en {
  font-size: 48px;
  line-height: 1;
  color: #fff;
  white-space: nowrap;
  -webkit-text-stroke: 3px rgba(0, 0, 0, 0.9);
  paint-order: stroke fill;
  font-family: 'Arial Narrow', 'Helvetica Neue', sans-serif;
  letter-spacing: 0.08em;
}

.voucher-decor {
  position: absolute;
  top: 470px;
  right: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.voucher-bar {
  width: 338px;
  height: 80px;
  border-radius: 4px;
  opacity: 0.35;
}

.voucher-senior {
  background: linear-gradient(90deg, rgba(255, 200, 80, 0.5), rgba(255, 140, 40, 0.2));
}

.voucher-contract {
  background: linear-gradient(90deg, rgba(120, 180, 255, 0.5), rgba(60, 100, 200, 0.2));
}

.tagline-block {
  position: absolute;
  left: 320px;
  top: 900px;
  width: 1280px;
  color: #fff;
  font-size: 36px;
  line-height: 48px;
  font-family: 'Microsoft JhengHei', 'PingFang TC', sans-serif;
}

.tagline-block p {
  margin: 0;
}

.preview-tip {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
}

@media (max-width: 960px) {
  .recruit-body {
    flex-direction: column;
  }

  .recruit-sidebar {
    width: 100%;
    max-height: 42vh;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }

  .recruit-tabs {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .recruit-maker {
    height: auto;
    min-height: calc(100vh - 100px);
  }
}
</style>

<template>
  <article class="shared-operator" v-if="character">
    <section class="shared-art-panel">
      <div class="shared-art" v-if="currentPortraitUrl">
        <img :src="currentPortraitUrl" :alt="character.name" decoding="async" fetchpriority="high">
      </div>
      <div class="shared-identity">
        <span class="shared-rarity">{{ rarityStars }}★</span>
        <h1>{{ character.name }}</h1>
        <p>{{ character.appellation || character.id }}</p>
        <div class="shared-tags">
          <span>{{ professionName }}</span>
          <span>{{ character.position === 'MELEE' ? t('character.melee') : t('character.ranged') }}</span>
          <span v-if="factionName">{{ factionName }}</span>
        </div>
      </div>
      <div class="portrait-controls" v-if="portraits.length > 1">
        <button v-for="(portrait, index) in portraits" :key="portrait.skinId || portrait.portraitId || index"
          type="button" :class="{ active: portraitIndex === index }" :title="portrait.name"
          @click="portraitIndex = index">
          <img :src="getPortraitUrl(portrait)" :alt="portrait.name" loading="lazy">
        </button>
      </div>
    </section>

    <section class="shared-data-panel">
      <header class="shared-header">
        <div>
          <span>OPERATOR PROFILE</span>
          <h2>{{ character.name }}</h2>
        </div>
        <div class="shared-stats" v-if="latestPhase">
          <div><span>HP</span><strong>{{ getAttribute('maxHp') }}</strong></div>
          <div><span>ATK</span><strong>{{ getAttribute('atk') }}</strong></div>
          <div><span>DEF</span><strong>{{ getAttribute('def') }}</strong></div>
          <div><span>RES</span><strong>{{ getAttribute('magicResistance') }}</strong></div>
        </div>
      </header>

      <div class="skill-heading">
        <span>{{ t('character.sections.skills').replace(/^\d+\.\s*/, '') }}</span>
        <strong>{{ selectedSkill?.name || '-' }}</strong>
      </div>
      <div class="skill-switcher" v-if="skills.length">
        <button v-for="(skill, index) in skills" :key="skill.id || index" type="button"
          :class="{ active: skillIndex === index }" :title="skill.name" @click="skillIndex = index">
          <img v-if="getSkillIcon(skill)" :src="getSkillIcon(skill)" :alt="skill.name">
          <span>{{ skill.name }}</span>
        </button>
      </div>
      <div class="skill-detail" v-if="selectedSkill">
        <div class="skill-title">
          <img v-if="getSkillIcon(selectedSkill)" :src="getSkillIcon(selectedSkill)" :alt="selectedSkill.name">
          <div><span>SKILL {{ skillIndex + 1 }}</span><h3>{{ selectedSkill.name }}</h3></div>
        </div>
        <p>{{ selectedSkill.description }}</p>
        <div class="skill-metrics">
          <span v-if="selectedSkill.spData?.spCost">SP {{ selectedSkill.spData.spCost }}</span>
          <span v-if="selectedSkill.spData?.initSp">INIT {{ selectedSkill.spData.initSp }}</span>
          <span v-if="selectedSkill.duration > 0">{{ selectedSkill.duration }}s</span>
        </div>
      </div>
      <p class="shared-trait" v-if="character.traitDescription">{{ character.traitDescription }}</p>
    </section>
  </article>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';
import { getLocalSkillIconUrl, loadOperatorAssetManifest } from '../services/operatorAssetManifest.js';

const props = defineProps({
  character: { type: Object, required: true },
  initialPortraitId: { type: String, default: '' },
});
const emit = defineEmits(['portrait-change']);
const { t, te } = useI18n();
const portraitIndex = ref(0);
const skillIndex = ref(0);
const manifestReady = ref(false);

const rarityStars = computed(() => Math.max(1, Math.min(6, Number(props.character?.rarity || 0) + 1)));
const professionName = computed(() => te(`profession.${props.character?.profession}`)
  ? t(`profession.${props.character.profession}`) : props.character?.profession || '');
const factionName = computed(() => te(`nation.${props.character?.factionId}`)
  ? t(`nation.${props.character.factionId}`) : props.character?.factionId || '');
const portraits = computed(() => props.character?.portraits || []);
const skills = computed(() => props.character?.skills || []);
const selectedSkill = computed(() => skills.value[skillIndex.value] || null);
const latestPhase = computed(() => props.character?.phases?.at(-1) || null);

const getPortraitUrl = (portrait) => {
  const url = portrait?.urls?.[0] || '';
  return url ? getProxyImageUrl(url) : '';
};
const getPortraitId = (portrait, index) => String(portrait?.portraitId || portrait?.skinId || index);
const currentPortraitUrl = computed(() => getPortraitUrl(portraits.value[portraitIndex.value]));
const getSkillIcon = (skill) => {
  void manifestReady.value;
  const url = getLocalSkillIconUrl(skill?.iconId || skill?.id) || skill?.iconUrls?.[0] || skill?.iconUrl || '';
  return url ? getProxyImageUrl(url) : '';
};
const getAttribute = (key) => latestPhase.value?.attributesKeyFrames?.at(-1)?.data?.[key] ?? '-';

watch(
  [portraits, () => props.initialPortraitId],
  ([items, requestedId]) => {
    const requestedIndex = requestedId
      ? items.findIndex((portrait, index) => getPortraitId(portrait, index) === requestedId)
      : -1;
    portraitIndex.value = requestedIndex >= 0 ? requestedIndex : 0;
  },
  { immediate: true }
);

watch(portraitIndex, (index) => {
  emit('portrait-change', getPortraitId(portraits.value[index], index));
}, { immediate: true });

onMounted(() => {
  loadOperatorAssetManifest().then(() => { manifestReady.value = true; }).catch(() => {});
});
</script>

<style scoped>
.shared-operator { height: min(760px, calc(92vh - 112px)); min-height: 580px; display: grid; grid-template-columns: minmax(0, 62%) minmax(340px, 38%); overflow: hidden; background: #0d1117; border: 1px solid rgba(255,255,255,.1); }
.shared-art-panel { position: relative; min-width: 0; overflow: hidden; background: radial-gradient(circle at 45% 42%, rgba(88,166,255,.12), transparent 38%), #090d12; }
.shared-art { position: absolute; inset: 0; display: grid; place-items: end center; }
.shared-art::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 58%, rgba(13,17,23,.86)), linear-gradient(0deg, rgba(5,8,11,.72), transparent 38%); pointer-events: none; }
.shared-art img { width: 112%; height: 112%; max-width: none; object-fit: contain; object-position: center bottom; filter: drop-shadow(0 24px 30px rgba(0,0,0,.55)); }
.shared-identity { position: absolute; z-index: 2; left: 28px; bottom: 30px; max-width: 72%; text-shadow: 0 3px 14px #000; }
.shared-rarity { color: #ffc107; font-weight: 800; }
.shared-identity h1 { margin: 2px 0; color: #fff; font-size: clamp(2.8rem, 6vw, 5.6rem); line-height: .95; overflow-wrap: anywhere; }
.shared-identity p { margin: 10px 0; color: #b8c1cc; font-family: ui-monospace, Consolas, monospace; }
.shared-tags, .skill-metrics { display: flex; flex-wrap: wrap; gap: 7px; }
.shared-tags span, .skill-metrics span { padding: 5px 9px; border: 1px solid rgba(255,255,255,.2); background: rgba(13,17,23,.78); font-size: .78rem; }
.portrait-controls { position: absolute; z-index: 3; top: 20px; left: 20px; display: flex; gap: 6px; max-width: calc(100% - 40px); overflow-x: auto; }
.portrait-controls button { width: 58px; height: 58px; flex: 0 0 58px; padding: 2px; border: 1px solid rgba(255,255,255,.16); background: rgba(13,17,23,.84); cursor: pointer; }
.portrait-controls button.active { border-color: var(--primary-color); box-shadow: inset 0 -3px var(--primary-color); }
.portrait-controls img { width: 100%; height: 100%; object-fit: contain; }
.shared-data-panel { min-width: 0; padding: 24px; display: grid; grid-template-rows: auto auto auto minmax(0,1fr) auto; gap: 14px; overflow: hidden; background: rgba(22,27,34,.96); }
.shared-header { display: grid; gap: 14px; border-bottom: 1px solid rgba(255,255,255,.1); padding-bottom: 14px; }
.shared-header span, .skill-heading span, .skill-title span { color: #8b949e; font: .7rem ui-monospace, Consolas, monospace; }
.shared-header h2, .skill-detail h3 { margin: 3px 0 0; color: #fff; }
.shared-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
.shared-stats div { padding: 8px; border-top: 2px solid rgba(88,166,255,.6); background: rgba(13,17,23,.72); }
.shared-stats span, .shared-stats strong { display: block; }
.skill-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.skill-heading strong { color: var(--primary-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill-switcher { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 7px; }
.skill-switcher button { min-width: 0; padding: 7px; display: grid; grid-template-columns: 38px minmax(0,1fr); align-items: center; gap: 7px; border: 1px solid rgba(255,255,255,.12); background: #0d1117; color: #b8c1cc; cursor: pointer; }
.skill-switcher button.active { color: #fff; border-color: var(--primary-color); background: rgba(88,166,255,.12); }
.skill-switcher img { width: 38px; height: 38px; object-fit: contain; }
.skill-switcher span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.skill-detail { min-height: 0; padding: 16px; overflow-y: auto; border: 1px solid rgba(255,255,255,.1); background: rgba(13,17,23,.76); }
.skill-title { display: flex; align-items: center; gap: 12px; }
.skill-title img { width: 54px; height: 54px; object-fit: contain; }
.skill-detail p, .shared-trait { white-space: pre-line; line-height: 1.65; overflow-wrap: anywhere; }
.shared-trait { margin: 0; padding-top: 12px; border-top: 1px solid rgba(255,255,255,.1); color: #b8c1cc; max-height: 100px; overflow-y: auto; }
@media (max-width: 760px) { .shared-operator { height: auto; min-height: 0; grid-template-columns: 1fr; overflow-y: auto; } .shared-art-panel { min-height: 52vh; } .shared-data-panel { overflow: visible; } .shared-art img { width: 106%; height: 106%; } .shared-identity h1 { font-size: 2.8rem; } }
</style>

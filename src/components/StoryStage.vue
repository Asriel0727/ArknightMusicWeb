<template>
  <main class="story-page">
    <header class="story-heading">
      <div>
        <p class="eyebrow">STORY / W2G / BEG</p>
        <h1>{{ labels.title }}</h1>
        <p>{{ labels.subtitle }}</p>
      </div>
      <a href="https://prts.wiki/w/W2G/BEG" target="_blank" rel="noopener noreferrer">PRTS ↗</a>
    </header>

    <div v-if="error" class="story-message" role="alert">{{ error }}</div>
    <div v-else-if="!frame" class="story-message" role="status">{{ labels.loading }}</div>
    <section v-else class="story-shell" aria-label="Story stage">
      <div class="story-stage" :class="{ grayscale: frame.state.grayscale }" @click="advance">
        <div class="scene-backdrop" :style="backgroundStyle"></div>
        <img v-if="frame.state.image && assetPath(frame.state.image)" class="scene-image"
          :src="assetPath(frame.state.image)" alt="" aria-hidden="true">
        <div class="scene-vignette"></div>
        <div class="portrait-row" aria-hidden="true">
          <img v-for="(portrait, index) in frame.state.portraits" :key="`${portrait}-${index}`"
            class="portrait" :class="{ subdued: frame.state.focus > 0 && frame.state.focus !== index + 1 }"
            :src="assetPath(portrait)" alt="">
        </div>
        <div v-if="frame.state.shade" class="scene-shade" :style="shadeStyle"></div>

        <div v-if="frame.type === 'dialogue'" class="dialogue-box">
          <span class="speaker">{{ localize(frame.speaker) || labels.narrator }}</span>
          <p>{{ visibleText }}<span v-if="isTyping" class="cursor" aria-hidden="true">▍</span></p>
          <span class="continue-hint">{{ labels.continue }} ›</span>
        </div>
        <div v-else-if="frame.type === 'decision'" class="decision-box" @click.stop>
          <p>{{ labels.choose }}</p>
          <button v-for="option in frame.options" :key="option.value" type="button"
            @click="choose(option.value)">{{ localize(option.label) }}</button>
        </div>
        <div v-else class="end-box" @click.stop>
          <h2>{{ labels.finished }}</h2>
          <p>{{ labels.battle }}</p>
          <button type="button" @click="restart">{{ labels.restart }}</button>
        </div>
      </div>

      <footer class="story-controls">
        <button type="button" :disabled="!canGoBack" @click="goBack">← {{ labels.previous }}</button>
        <span>{{ frame.command?.line || 333 }} / 333</span>
        <button type="button" :disabled="frame.type !== 'dialogue'" @click="advance">{{ labels.next }} →</button>
      </footer>
      <p class="story-note">{{ labels.note }}</p>
    </section>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';
import { createStoryRunner, parseStoryScript } from '../utils/storyScript.js';

const { locale } = useI18n();
const copies = {
  'zh-TW': { title: '初始引導', subtitle: '明日方舟 · 開場劇情演出原型', loading: '正在載入本地劇情…', narrator: '旁白', continue: '點擊或按空白鍵繼續', choose: '選擇回應', finished: '劇情結束', battle: '原劇情接續至教學戰鬥。', restart: '重新播放', previous: '上一句', next: '下一句', note: '劇情及素材出處：明日方舟／PRTS。此原型保留原文、選項及主要畫面指令；配樂、音效與表情差分尚未接入。' },
  'zh-CN': { title: '初始引导', subtitle: '明日方舟 · 开场剧情演出原型', loading: '正在载入本地剧情…', narrator: '旁白', continue: '点击或按空格键继续', choose: '选择回应', finished: '剧情结束', battle: '原剧情接续至教学战斗。', restart: '重新播放', previous: '上一句', next: '下一句', note: '剧情及素材出处：明日方舟／PRTS。本原型保留原文、选项及主要画面指令；配乐、音效与表情差分尚未接入。' },
  en: { title: 'Opening Tutorial', subtitle: 'Arknights · story stage prototype', loading: 'Loading local story…', narrator: 'Narration', continue: 'Click or press Space to continue', choose: 'Choose a response', finished: 'Story complete', battle: 'The original story continues into the tutorial battle.', restart: 'Restart', previous: 'Previous', next: 'Next', note: 'Story and art: Arknights / PRTS. The prototype includes original text, choices, and major visual commands. Audio and expression layers are pending.' },
};
const labels = computed(() => copies[locale.value] || copies.en);
const base = `${import.meta.env.BASE_URL}story/w2g-beg/`;
const frame = ref(null);
const manifest = ref(null);
const error = ref('');
const visibleText = ref('');
const isTyping = ref(false);
const canGoBack = ref(false);
let runner = null;
let timer = null;

function localize(text) {
  return normalizeChineseMusicText(String(text || '').replaceAll('{@nickname}', '博士'), locale.value);
}

function assetPath(id) {
  const entry = manifest.value?.assets?.[id];
  return entry ? `${base}${entry.path}` : '';
}

const backgroundStyle = computed(() => {
  const id = frame.value?.state?.background;
  const path = assetPath(id);
  return path ? { backgroundImage: `url("${path}")` } : {};
});
const shadeStyle = computed(() => {
  const shade = frame.value?.state?.shade;
  return shade ? { backgroundColor: `rgba(${shade.red}, ${shade.green}, ${shade.blue}, ${shade.alpha})` } : {};
});

function clearTyping() {
  if (timer) window.clearInterval(timer);
  timer = null;
}

watch([frame, locale], () => {
  clearTyping();
  if (frame.value?.type !== 'dialogue') {
    visibleText.value = '';
    isTyping.value = false;
    return;
  }
  const chars = Array.from(localize(frame.value.text));
  let count = 0;
  visibleText.value = '';
  isTyping.value = true;
  timer = window.setInterval(() => {
    count = Math.min(chars.length, count + 2);
    visibleText.value = chars.slice(0, count).join('');
    if (count === chars.length) {
      isTyping.value = false;
      clearTyping();
    }
  }, 25);
});

function advance() {
  if (!runner || frame.value?.type !== 'dialogue') return;
  if (isTyping.value) {
    clearTyping();
    visibleText.value = localize(frame.value.text);
    isTyping.value = false;
    return;
  }
  frame.value = runner.next();
  canGoBack.value = true;
}

function choose(value) {
  if (!runner) return;
  frame.value = runner.choose(value);
  canGoBack.value = true;
}

function goBack() {
  if (!runner) return;
  frame.value = runner.previous();
}

function restart() {
  if (!manifest.value || !sourceText) return;
  runner = createStoryRunner(parseStoryScript(sourceText));
  frame.value = runner.next();
  canGoBack.value = false;
}

function handleKeydown(event) {
  if (event.target instanceof HTMLElement && ['BUTTON', 'INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); advance(); }
  if (event.code === 'ArrowLeft') goBack();
}

let sourceText = '';
onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    const [manifestResponse, scriptResponse] = await Promise.all([
      fetch(`${base}manifest.json`), fetch(`${base}script.txt`),
    ]);
    if (!manifestResponse.ok || !scriptResponse.ok) throw new Error('Story assets unavailable');
    manifest.value = await manifestResponse.json();
    sourceText = await scriptResponse.text();
    restart();
  } catch (cause) {
    error.value = cause.message || String(cause);
  }
});
onUnmounted(() => { clearTyping(); window.removeEventListener('keydown', handleKeydown); });
</script>

<style scoped>
.story-page{width:min(1180px,calc(100% - 32px));margin:18px auto 60px;color:#f4f7fa}
.story-heading{position:relative;top:auto;z-index:auto;box-sizing:border-box;width:auto;padding:0;margin-bottom:16px;text-align:left;background:transparent;backdrop-filter:none;box-shadow:none;display:flex;flex-direction:row;justify-content:space-between;align-items:end;gap:16px}
.story-heading h1{font-size:clamp(1.6rem,4vw,2.5rem);margin:2px 0 4px}
.story-heading p{margin:0;color:#abb8c6}.story-heading .eyebrow{color:#62b9d3;letter-spacing:.25em;font-size:.72rem}
.story-heading a{color:#9bd9ee;text-decoration:none;white-space:nowrap}
.story-message{padding:40px;background:#101922;border:1px solid #344753;border-radius:8px}
.story-shell{background:#0a1017;border:1px solid #45606b;box-shadow:0 24px 60px #0008;border-radius:10px;overflow:hidden}
.story-stage{position:relative;min-height:min(66vw,680px);aspect-ratio:16/9;overflow:hidden;cursor:pointer;background:#06090e}
.story-stage.grayscale>.scene-backdrop,.story-stage.grayscale>.scene-image,.story-stage.grayscale>.portrait-row{filter:grayscale(1)}
.scene-backdrop,.scene-image,.scene-vignette,.scene-shade{position:absolute;inset:0;width:100%;height:100%}
.scene-backdrop{background-position:center;background-size:cover;transition:background-image .35s ease}
.scene-image{object-fit:cover}.scene-vignette{background:linear-gradient(180deg,#02070b88 0%,transparent 28%,transparent 52%,#010407bb 100%)}
.portrait-row{position:absolute;inset:4% 2% 12%;display:flex;align-items:end;justify-content:center;pointer-events:none}
.portrait{width:min(40%,440px);height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 14px 18px #0008);transition:filter .25s,opacity .25s}
.portrait:not(:first-child){margin-left:-6%}.portrait.subdued{filter:brightness(.38) saturate(.45);opacity:.78}
.scene-shade{pointer-events:none;transition:background-color .25s}
.dialogue-box,.decision-box,.end-box{position:absolute;z-index:2;left:5%;right:5%;bottom:4%;background:#08121bdc;border-top:2px solid #7ccde5;box-shadow:0 10px 30px #000a;backdrop-filter:blur(7px)}
.dialogue-box{min-height:132px;padding:22px 30px 24px}.speaker{display:inline-block;color:#9eddf0;font-weight:700;letter-spacing:.08em}
.dialogue-box p{font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.55;margin:12px 0 0;white-space:pre-wrap}.cursor{color:#69d4f3}
.continue-hint{position:absolute;right:22px;bottom:10px;color:#91b9c5;font-size:.74rem}
.decision-box,.end-box{padding:18px 22px;display:grid;gap:9px;cursor:default}.decision-box p,.end-box p{margin:0;color:#bcd0d9}
.decision-box button,.end-box button{border:1px solid #6ea5b6;background:#173746aa;color:#fff;text-align:left;padding:11px 14px;cursor:pointer}
.decision-box button:hover,.decision-box button:focus-visible,.end-box button:hover{background:#2c6071}
.end-box h2{margin:0}.story-controls{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#101d27;color:#adc7d2;font:13px monospace}
.story-controls button{border:1px solid #537784;background:#152b37;color:#e2f5fa;padding:8px 14px;cursor:pointer}.story-controls button:disabled{opacity:.4;cursor:default}
.story-note{margin:12px 16px 16px;color:#829ca8;font-size:.78rem}
@media(max-width:700px){.story-stage{aspect-ratio:9/14;min-height:620px}.portrait-row{inset:12% -25% 24%}.portrait{width:60%}.dialogue-box,.decision-box,.end-box{left:3%;right:3%;bottom:3%}.dialogue-box{padding:17px 18px 28px;min-height:160px}.continue-hint{right:12px}}
@media(prefers-reduced-motion:reduce){.portrait,.scene-shade,.scene-backdrop{transition:none}}
</style>

<template>
  <main class="story-page">
    <header class="story-heading">
      <div>
        <p class="eyebrow">STORY / {{ manifest?.storyId || 'PRTS' }}</p>
        <h1>{{ manifest?.title || labels.title }}</h1>
        <p>{{ labels.subtitle }}</p>
      </div>
      <a :href="manifest?.sourcePage || 'https://prts.wiki/'" target="_blank" rel="noopener noreferrer">PRTS ↗</a>
    </header>

    <select v-if="catalog.length > 1" class="story-picker" :value="selectedStoryId" :aria-label="labels.selectStory" @change="selectStory">
      <option v-for="story in catalog" :key="story.id" :value="story.id">{{ story.title }}</option>
    </select>

    <div v-if="error" class="story-message" role="alert">{{ error }}</div>
    <div v-else-if="!frame" class="story-message" role="status">{{ labels.loading }}</div>
    <section v-else class="story-shell" aria-label="Story stage">
      <div class="stage-wrap">
      <div class="story-stage" :class="{ grayscale: frame.state.grayscale }" @click="advance">
        <img v-if="frame.state.background && assetPath(frame.state.background)" class="scene-backdrop"
          :src="assetPath(frame.state.background)" alt="" aria-hidden="true" fetchpriority="high">
        <img v-if="frame.state.image && assetPath(frame.state.image)" class="scene-image"
          :src="assetPath(frame.state.image)" alt="" aria-hidden="true">
        <div class="scene-vignette"></div>
        <div class="portrait-row" aria-hidden="true">
          <img v-for="(portrait, index) in frame.state.portraits" :key="`${portrait}-${index}`"
            class="portrait" :class="{ subdued: frame.state.focus > 0 && frame.state.focus !== index + 1 }"
            :src="assetPath(portrait)" alt="">
        </div>
        <div v-if="frame.state.shade" class="scene-shade" :style="shadeStyle"></div>
        <video v-if="frame.type === 'video' && videoPath(frame.videoId)" class="scene-video"
          :src="videoPath(frame.videoId)" controls autoplay playsinline @ended="advanceVideo"></video>
      </div>

      <div class="story-dialogue-panel">
        <div v-if="frame.type === 'dialogue'" class="dialogue-box" @click="advance">
          <span class="speaker">{{ localize(frame.speaker) || labels.narrator }}</span>
          <p>{{ visibleText }}<span v-if="isTyping" class="cursor" aria-hidden="true">▍</span></p>
          <span class="continue-hint">{{ labels.continue }} ›</span>
        </div>
        <div v-else-if="frame.type === 'decision'" class="decision-box">
          <p>{{ labels.choose }}</p>
          <button v-for="option in frame.options" :key="option.value" type="button"
            @click="choose(option.value)">{{ localize(option.label) }}</button>
        </div>
        <div v-else-if="frame.type === 'video'" class="end-box">
          <p>{{ labels.videoHint }}</p>
          <button type="button" @click="advanceVideo">{{ labels.next }} →</button>
        </div>
        <div v-else class="end-box">
          <h2>{{ labels.finished }}</h2>
          <p>{{ labels.battle }}</p>
          <button type="button" @click="restart">{{ labels.restart }}</button>
        </div>
      </div>
      </div>

      <footer class="story-controls">
        <button type="button" :disabled="!canGoBack" @click="goBack">← {{ labels.previous }}</button>
        <span>{{ frame.command?.line || commandCount }} / {{ commandCount }}</span>
        <button type="button" :aria-pressed="audioEnabled" @click="toggleAudio">{{ audioEnabled ? labels.audioOn : labels.audioOff }}</button>
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
  'zh-TW': { title: '劇情', subtitle: '明日方舟 · 劇情演出', loading: '正在載入本地劇情…', narrator: '旁白', continue: '點擊或按空白鍵繼續', choose: '選擇回應', finished: '劇情結束', battle: '可以重新播放或選擇其他劇情。', restart: '重新播放', previous: '上一句', next: '下一句', audioOn: '🔊 音效開啟', audioOff: '🔇 開啟音效', videoHint: '影片播放完畢後繼續。', selectStory: '選擇劇情', note: '劇情及素材出處：明日方舟／PRTS。素材由本地快照載入；部分表情與鏡頭指令仍未完整重現。' },
  'zh-CN': { title: '剧情', subtitle: '明日方舟 · 剧情演出', loading: '正在载入本地剧情…', narrator: '旁白', continue: '点击或按空格键继续', choose: '选择回应', finished: '剧情结束', battle: '可以重新播放或选择其他剧情。', restart: '重新播放', previous: '上一句', next: '下一句', audioOn: '🔊 音效开启', audioOff: '🔇 开启音效', videoHint: '视频播放完毕后继续。', selectStory: '选择剧情', note: '剧情及素材出处：明日方舟／PRTS。素材由本地快照加载；部分表情与镜头指令仍未完整重现。' },
  en: { title: 'Story', subtitle: 'Arknights · story stage', loading: 'Loading local story…', narrator: 'Narration', continue: 'Click or press Space to continue', choose: 'Choose a response', finished: 'Story complete', battle: 'Restart or choose another story.', restart: 'Restart', previous: 'Previous', next: 'Next', audioOn: '🔊 Audio on', audioOff: '🔇 Enable audio', videoHint: 'Continue after the video.', selectStory: 'Select story', note: 'Story and art: Arknights / PRTS. Media is loaded from a local snapshot; some expression and camera commands are not yet reproduced.' },
};
const labels = computed(() => copies[locale.value] || copies.en);
const root = `${import.meta.env.BASE_URL}story/`;
const selectedStoryId = ref('');
const catalog = ref([]);
const base = computed(() => `${root}${selectedStoryId.value}/`);
const frame = ref(null);
const manifest = ref(null);
const error = ref('');
const visibleText = ref('');
const isTyping = ref(false);
const canGoBack = ref(false);
const audioEnabled = ref(false);
const commandCount = ref(0);
let runner = null;
let timer = null;
let sourceText = '';
let commands = [];
let loadingToken = 0;
let disposed = false;
let musicAudio = null;
let introAudio = null;
let currentMusicKey = '';
const soundEffects = new Set();
const preloaded = new Set();
const preloadingImages = new Map();

function localize(text) {
  return normalizeChineseMusicText(String(text || '').replaceAll('{@nickname}', '博士'), locale.value);
}

function assetPath(id) {
  const entry = manifest.value?.assets?.[id];
  return entry ? `${base.value}${entry.path}` : '';
}

function videoPath(id) {
  const entry = manifest.value?.videos?.[String(id || '').replace(/^\$/, '')];
  return entry ? `${base.value}${entry.path}` : '';
}
const shadeStyle = computed(() => {
  const shade = frame.value?.state?.shade;
  return shade ? { backgroundColor: `rgba(${shade.red}, ${shade.green}, ${shade.blue}, ${shade.alpha})` } : {};
});

function clearTyping() {
  if (timer) window.clearInterval(timer);
  timer = null;
}

function preloadVisual(id) {
  const url = assetPath(String(id || '').split('#')[0]);
  if (!url || preloaded.has(url)) return;
  preloaded.add(url);
  const image = new window.Image();
  preloadingImages.set(url, image);
  image.onload = () => preloadingImages.delete(url);
  image.onerror = () => { preloadingImages.delete(url); preloaded.delete(url); };
  image.src = url;
}

function preloadUpcoming() {
  const line = frame.value?.command?.line || 0;
  let count = 0;
  for (const command of commands) {
    if (command.line <= line) continue;
    const a = command.attributes;
    const ids = command.kind === 'background' || command.kind === 'image'
      ? [a.image] : command.kind === 'character' ? [a.name, a.name2, a.name3] : [];
    for (const id of ids.filter(Boolean)) {
      preloadVisual(id);
      count += 1;
      if (count >= 2) return;
    }
  }
}

function stopMusic() {
  if (introAudio) { introAudio.pause(); introAudio.onended = null; introAudio = null; }
  if (musicAudio) { musicAudio.pause(); musicAudio = null; }
  currentMusicKey = '';
}

function syncMusic() {
  const music = frame.value?.state?.music;
  const key = audioEnabled.value ? music?.key || '' : '';
  if (key === currentMusicKey) return;
  stopMusic();
  const loopEntry = manifest.value?.audio?.[key];
  if (!loopEntry) return;
  currentMusicKey = key;
  const volume = Math.min(1, Math.max(0, music.volume));
  const playLoop = () => {
    if (currentMusicKey !== key) return;
    musicAudio = new Audio(`${base.value}${loopEntry.path}`);
    musicAudio.loop = true;
    musicAudio.volume = volume;
    musicAudio.play().catch(() => {});
  };
  const introEntry = manifest.value?.audio?.[music.intro];
  if (introEntry && music.intro !== key) {
    introAudio = new Audio(`${base.value}${introEntry.path}`);
    introAudio.volume = volume;
    introAudio.onended = playLoop;
    introAudio.play().catch(() => playLoop());
  } else playLoop();
}

function playFrameSounds() {
  if (!audioEnabled.value) return;
  for (const event of frame.value?.events || []) {
    const entry = manifest.value?.audio?.[event.key];
    if (event.type !== 'sound' || !entry) continue;
    const effect = new Audio(`${base.value}${entry.path}`);
    effect.volume = Math.min(1, Math.max(0, event.volume));
    soundEffects.add(effect);
    effect.onended = () => soundEffects.delete(effect);
    effect.play().catch(() => soundEffects.delete(effect));
  }
}

function toggleAudio() {
  audioEnabled.value = !audioEnabled.value;
  if (audioEnabled.value) syncMusic();
  else {
    stopMusic();
    for (const effect of soundEffects) effect.pause();
    soundEffects.clear();
  }
}

let suppressSound = false;
watch([frame, locale], ([nextFrame], [previousFrame]) => {
  clearTyping();
  preloadUpcoming();
  syncMusic();
  if (nextFrame !== previousFrame && !suppressSound) playFrameSounds();
  suppressSound = false;
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
}, { flush: 'sync' });

function advance() {
  if (!runner || frame.value?.type !== 'dialogue') return;
  if (isTyping.value) {
    clearTyping();
    visibleText.value = localize(frame.value.text);
    isTyping.value = false;
    return;
  }
  frame.value = runner.next();
  canGoBack.value = runner.canPrevious();
}

function choose(value) {
  if (!runner) return;
  frame.value = runner.choose(value);
  canGoBack.value = runner.canPrevious();
}

function goBack() {
  if (!runner) return;
  suppressSound = true;
  frame.value = runner.previous();
  canGoBack.value = runner.canPrevious();
}

function advanceVideo() {
  if (!runner || frame.value?.type !== 'video') return;
  frame.value = runner.next();
  canGoBack.value = runner.canPrevious();
}

function restart() {
  if (!manifest.value || !sourceText) return;
  runner = createStoryRunner(commands);
  frame.value = runner.next();
  canGoBack.value = false;
}

function handleKeydown(event) {
  if (event.target instanceof HTMLElement && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); advance(); }
  if (event.code === 'ArrowLeft') goBack();
}

async function loadStory() {
  const token = ++loadingToken;
  stopMusic();
  manifest.value = null;
  frame.value = null;
  error.value = '';
  sourceText = '';
  commands = [];
  runner = null;
  try {
    const manifestPromise = fetch(`${base.value}manifest.json`);
    const scriptPromise = fetch(`${base.value}script.txt`);
    const manifestResponse = await manifestPromise;
    if (!manifestResponse.ok) throw new Error('Story manifest unavailable');
    const nextManifest = await manifestResponse.json();
    if (token !== loadingToken) return;
    manifest.value = nextManifest;
    preloadVisual(nextManifest.firstVisual);
    const scriptResponse = await scriptPromise;
    if (!manifestResponse.ok || !scriptResponse.ok) throw new Error('Story assets unavailable');
    sourceText = await scriptResponse.text();
    if (token !== loadingToken) return;
    commands = parseStoryScript(sourceText);
    commandCount.value = commands.length;
    restart();
  } catch (cause) {
    if (token === loadingToken) error.value = cause.message || String(cause);
  }
}

function selectStory(event) {
  selectedStoryId.value = event.target.value;
  loadStory();
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  try {
    const response = await fetch(`${root}catalog.json`);
    if (!response.ok) throw new Error('Story catalog unavailable');
    const nextCatalog = await response.json();
    if (disposed) return;
    catalog.value = nextCatalog;
    selectedStoryId.value = catalog.value[0]?.id || '';
    if (!selectedStoryId.value) throw new Error('Story catalog is empty');
    await loadStory();
  } catch (cause) { error.value = cause.message || String(cause); }
});
onUnmounted(() => {
  disposed = true;
  loadingToken += 1;
  clearTyping();
  stopMusic();
  for (const effect of soundEffects) effect.pause();
  soundEffects.clear();
  preloadingImages.clear();
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<style scoped>
.story-page{width:min(1180px,calc(100% - 32px));margin:18px auto 60px;color:#f4f7fa}
.story-heading{position:relative;top:auto;z-index:auto;box-sizing:border-box;width:auto;padding:0;margin-bottom:16px;text-align:left;background:transparent;backdrop-filter:none;box-shadow:none;display:flex;flex-direction:row;justify-content:space-between;align-items:end;gap:16px}
.story-heading h1{font-size:clamp(1.6rem,4vw,2.5rem);margin:2px 0 4px}
.story-heading p{margin:0;color:#abb8c6}.story-heading .eyebrow{color:#62b9d3;letter-spacing:.25em;font-size:.72rem}
.story-heading a{color:#9bd9ee;text-decoration:none;white-space:nowrap}
.story-picker{margin:0 0 14px;padding:10px 12px;border:1px solid #537784;background:#10232e;color:#f4f7fa}
.story-message{padding:40px;background:#101922;border:1px solid #344753;border-radius:8px}
.story-shell{background:#0a1017;border:1px solid #45606b;box-shadow:0 24px 60px #0008;border-radius:10px;overflow:hidden}
.stage-wrap{position:relative}
.story-stage{position:relative;aspect-ratio:16/9;overflow:hidden;cursor:pointer;background:#06090e}
.story-stage.grayscale>.scene-backdrop,.story-stage.grayscale>.scene-image,.story-stage.grayscale>.portrait-row{filter:grayscale(1)}
.scene-backdrop,.scene-image,.scene-vignette,.scene-shade{position:absolute;inset:0;width:100%;height:100%}
.scene-backdrop,.scene-image{object-fit:contain}
.scene-vignette{background:linear-gradient(180deg,#02070b88 0%,transparent 28%,transparent 52%,#010407bb 100%)}
.scene-video{position:absolute;z-index:3;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
.portrait-row{position:absolute;inset:4% 2% 12%;display:flex;align-items:end;justify-content:center;pointer-events:none}
.portrait{width:min(40%,440px);height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 14px 18px #0008);transition:filter .25s,opacity .25s}
.portrait:not(:first-child){margin-left:-6%}.portrait.subdued{filter:brightness(.38) saturate(.45);opacity:.78}
.scene-shade{pointer-events:none;transition:background-color .25s}
.story-dialogue-panel{position:absolute;inset:0;pointer-events:none}
.dialogue-box,.decision-box,.end-box{position:absolute;z-index:2;left:5%;right:5%;bottom:4%;background:#08121bdc;border-top:2px solid #7ccde5;box-shadow:0 10px 30px #000a;backdrop-filter:blur(7px)}
.dialogue-box,.decision-box,.end-box{pointer-events:auto}
.dialogue-box{min-height:132px;padding:22px 30px 24px;cursor:pointer}.speaker{display:inline-block;color:#9eddf0;font-weight:700;letter-spacing:.08em}
.dialogue-box p{font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.55;margin:12px 0 0;white-space:pre-wrap}.cursor{color:#69d4f3}
.continue-hint{position:absolute;right:22px;bottom:10px;color:#91b9c5;font-size:.74rem}
.decision-box,.end-box{padding:18px 22px;display:grid;gap:9px;cursor:default}.decision-box p,.end-box p{margin:0;color:#bcd0d9}
.decision-box button,.end-box button{border:1px solid #6ea5b6;background:#173746aa;color:#fff;text-align:left;padding:11px 14px;cursor:pointer}
.decision-box button:hover,.decision-box button:focus-visible,.end-box button:hover{background:#2c6071}
.end-box h2{margin:0}.story-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 18px;background:#101d27;color:#adc7d2;font:13px monospace}
.story-controls button{border:1px solid #537784;background:#152b37;color:#e2f5fa;padding:8px 14px;cursor:pointer}.story-controls button:disabled{opacity:.4;cursor:default}
.story-note{margin:12px 16px 16px;color:#829ca8;font-size:.78rem}
@media(max-width:700px){
  .story-page{width:calc(100% - 16px);margin:10px auto 32px}
  .story-heading{align-items:start}.story-heading h1{font-size:1.4rem}
  .story-stage{aspect-ratio:16/9;min-height:0}
  .portrait-row{inset:0 1% 0}.portrait{width:35%}.portrait:not(:first-child){margin-left:-2%}
  .story-dialogue-panel{position:relative;inset:auto;min-height:160px;pointer-events:auto}
  .dialogue-box,.decision-box,.end-box{position:relative;left:auto;right:auto;bottom:auto;min-height:160px;box-shadow:none;backdrop-filter:none;background:#0b1a25}
  .dialogue-box{padding:15px 16px 28px}.dialogue-box p{font-size:1rem;margin-top:8px}.continue-hint{right:12px}
  .story-controls{display:grid;grid-template-columns:1fr 1fr;grid-template-areas:'previous next' 'progress audio';gap:8px;padding:10px}
  .story-controls button{padding:8px}.story-controls button:first-child{grid-area:previous}
  .story-controls span{grid-area:progress;align-self:center}.story-controls button:nth-of-type(2){grid-area:audio}
  .story-controls button:last-child{grid-area:next}
}
@media(prefers-reduced-motion:reduce){.portrait,.scene-shade,.scene-backdrop{transition:none}}
</style>

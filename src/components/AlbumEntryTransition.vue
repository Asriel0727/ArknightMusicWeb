<template>
  <Transition name="album-entry-transition">
    <div v-if="active" ref="dialog" class="album-entry-transition" :class="{ 'is-landed': landed }"
      role="dialog" aria-modal="true" aria-labelledby="projection-title" tabindex="-1" @keydown="handleKeydown">
      <div class="transition-scrim" aria-hidden="true"></div>
      <svg class="projection-effects" aria-hidden="true" focusable="false">
        <filter id="projection-noise">
          <feTurbulence type="fractalNoise" baseFrequency="0.72 0.18" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
          <feComponentTransfer in="mono">
            <feFuncA type="table" tableValues="0 0.42" />
          </feComponentTransfer>
        </filter>
      </svg>
      <button ref="closeButton" class="projection-exit" type="button" @click="emit('close')">
        <span aria-hidden="true">←</span> {{ t('album.back') }}
      </button>

      <div ref="dock" class="record-dock" aria-hidden="true">
        <div class="projection-beam"></div>
        <div class="record-floor"></div>
        <div ref="travel" class="record-travel">
          <div ref="tilt" class="record-tilt"><VinylDisc :cover="coverUrl" /></div>
        </div>
      </div>
      <img v-if="origin?.cover && coverUrl" ref="sleeve" class="source-sleeve"
        :style="sleeveStyle" :src="coverUrl" alt="" aria-hidden="true">

      <section class="song-projection" :inert="!landed" :aria-busy="!ready">
        <header class="song-projection-header">
          <span class="song-projection-kicker">唱片資料庫</span>
          <h1 id="projection-title">{{ album?.name || t('album.trackList') }}</h1>
          <p>{{ album?.artistes?.join(' · ') || album?.belong || '唱片資料' }}</p>
        </header>
        <div class="album-visuals" :class="{ 'without-visual': !album?.coverDeUrl }">
          <figure v-if="coverUrl" class="album-cover-visual">
            <img :src="coverUrl" :alt="album?.name || ''" decoding="async" @error="hideBrokenImage">
          </figure>
          <figure v-if="album?.coverDeUrl" class="album-inner-visual">
            <img :src="proxyImageUrl(album.coverDeUrl)" :alt="album?.name || ''" decoding="async" @error="hideBrokenImage">
          </figure>
        </div>
        <p v-if="album?.intro" class="album-intro">{{ normalizeEscapedNewlines(album.intro) }}</p>
        <div class="track-heading">
          <h2>{{ t('album.trackList') }}</h2>
          <span v-if="ready && !error">{{ t('album.trackCount', { count: songs.length }) }}</span>
        </div>
        <div v-if="error" class="projection-message" role="alert">
          <p>{{ t('album.loadError') }}</p>
          <button type="button" @click="emit('retry')">{{ t('album.retry') }}</button>
        </div>
        <p v-else-if="!ready" class="projection-message" role="status">{{ t('common.loading') }}</p>
        <p v-else-if="!songs.length" class="projection-message">{{ t('album.emptyTracks') }}</p>
        <ol v-else class="song-projection-list">
          <li v-for="(song, index) in songs" :key="song.cid || index" class="song-projection-row">
            <span class="song-projection-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="song-projection-name">{{ song.name }}</span>
            <span class="song-projection-artist">{{ song.artistes?.join(', ') || '—' }}</span>
            <button class="song-projection-play" type="button" :aria-label="t('album.play') + ' ' + song.name"
              @click="emit('play-song', index)"><span aria-hidden="true">▷</span> {{ t('album.play') }}</button>
          </li>
        </ol>
      </section>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import VinylDisc from './VinylDisc.vue';

const props = defineProps({
  active: Boolean, ready: Boolean, settled: Boolean, error: Boolean,
  album: { type: Object, default: null },
  origin: { type: Object, default: null },
  songs: { type: Array, default: () => [] },
});
const emit = defineEmits(['complete', 'close', 'play-song', 'retry']);
const { t } = useI18n();
const dialog = ref(null);
const closeButton = ref(null);
const dock = ref(null);
const travel = ref(null);
const tilt = ref(null);
const sleeve = ref(null);
const landed = ref(false);
const proxyImageUrl = url => url ? getProxyImageUrl(url) : '';
const coverUrl = computed(() => proxyImageUrl(props.album?.coverUrl));
const sleeveStyle = computed(() => {
  const r = props.origin?.cover;
  return r ? { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' } : {};
});
const hideBrokenImage = event => { event.target.style.visibility = 'hidden'; };
let animations = [];
let generation = 0;
let previousFocus = null;
let previousOverflow = '';
let inertSiblings = [];
let locked = false;

function releaseDialog() {
  animations.forEach(animation => animation.cancel());
  animations = [];
  if (!locked) return;
  document.body.style.overflow = previousOverflow;
  inertSiblings.forEach(([element, inert]) => { element.inert = inert; });
  inertSiblings = [];
  locked = false;
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
}

function handleKeydown(event) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close'); return; }
  if (event.key !== 'Tab') return;
  const focusable = [...dialog.value.querySelectorAll('button:not(:disabled), [tabindex="0"]')]
    .filter(element => !element.closest('[inert]'));
  const first = focusable[0], last = focusable.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) {
    event.preventDefault(); last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first?.focus();
  }
}

async function openScene() {
  const token = ++generation;
  landed.value = false;
  previousFocus = document.activeElement;
  await nextTick();
  if (token !== generation || !props.active || !dock.value) return;
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  inertSiblings = [...dialog.value.parentElement.children]
    .filter(element => element !== dialog.value)
    .map(element => [element, element.inert]);
  inertSiblings.forEach(([element]) => { element.inert = true; });
  locked = true;
  closeButton.value?.focus({ preventScroll: true });

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    const target = dock.value.getBoundingClientRect();
    const source = props.origin?.disc;
    const size = target.width;
    const cx = target.x + size / 2, cy = target.y + target.height / 2;
    const sx = source ? source.x + source.width / 2 - cx : size * .5;
    const sy = source ? source.y + source.height / 2 - cy : -window.innerHeight * .45;
    const scale = source ? source.width / size : .66;
    // Keep the extraction inside narrow screens. Translation and flattening are separate layers.
    const ex = Math.min(sx + size * scale * .75, window.innerWidth - cx - size * scale / 2 - 12);
    const position = (x, y, s) => 'translate3d(' + x + 'px,' + y + 'px,0) scale(' + s + ')';
    animations.push(travel.value.animate([
      { transform: position(sx, sy, scale), offset: 0, easing: 'cubic-bezier(.3,0,.25,1)' },
      { transform: position(ex, sy, scale), offset: .34, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: position(0, 0, 1), offset: 1 },
    ], { duration: 1250, fill: 'both' }));
    animations.push(tilt.value.animate([
      { transform: 'scaleY(1)', offset: 0 },
      { transform: 'scaleY(1)', offset: .42, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: 'scaleY(.26)', offset: 1 },
    ], { duration: 1250, fill: 'both' }));
    if (sleeve.value) animations.push(sleeve.value.animate([
      { opacity: 1, offset: 0 }, { opacity: 1, offset: .5 }, { opacity: 0, offset: 1 },
    ], { duration: 600, fill: 'both' }));
    try { await animations[0].finished; } catch { return; }
  }
  if (token !== generation || !props.active) return;
  // CSS owns the responsive final geometry after the animation, including resize/orientation changes.
  animations.forEach(animation => animation.cancel());
  animations = [];
  landed.value = true;
  emit('complete');
}

watch(() => props.active, active => {
  if (active) void openScene();
  else { generation++; releaseDialog(); }
}, { immediate: true });
onUnmounted(() => { generation++; releaseDialog(); });
</script>

<style scoped>
.album-entry-transition {
  --dock-size: clamp(230px, 30vw, 430px);
  --dock-bottom: clamp(78px, 11vh, 112px);
  position: fixed;
  z-index: 1300;
  inset: 0;
  isolation: isolate;
  color: #e7f2f8;
  overflow: hidden;
}
.transition-scrim {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: radial-gradient(ellipse at 50% 85%, #12394b, #06141f 72%);
  animation: scrim-in 600ms ease both;
}
.projection-effects { position: absolute; width: 0; height: 0; pointer-events: none; }
.projection-exit {
  position: absolute;
  z-index: 8;
  top: max(16px, env(safe-area-inset-top));
  left: max(24px, env(safe-area-inset-left));
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 44px;
  padding: 8px 16px;
  border: 1px solid #79b7d04d;
  border-radius: 8px;
  background: #0b2331;
  color: #d9edf7;
  cursor: pointer;
  font: inherit;
}
.song-projection {
  position: absolute;
  z-index: 3;
  top: 78px;
  bottom: calc(var(--dock-bottom) + 76px);
  left: 50%;
  width: min(1160px, calc(100% - 64px));
  padding: clamp(22px, 3vw, 38px);
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #6497aa #0b202d;
  border: 1px solid #73b6d047;
  border-top: 2px solid #8ac8df;
  border-radius: 4px 4px 16px 16px;
  background: linear-gradient(135deg, rgba(20, 65, 84, 0.12), rgba(9, 29, 42, 0.18) 64%, rgba(23, 76, 96, 0.1));
  backdrop-filter: blur(3px) saturate(1.14);
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.22), inset 0 0 42px rgba(117, 211, 255, 0.035);
  opacity: 0;
  transform: translate(-50%, 24px);
  transition: opacity 400ms ease, transform 500ms cubic-bezier(.2, .8, .2, 1);
}
.song-projection::before,
.song-projection::after {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
}
.song-projection::before {
  background: repeating-linear-gradient(180deg, transparent 0 5px, rgba(155, 225, 255, 0.035) 6px, transparent 7px);
  opacity: 0.8;
  mix-blend-mode: screen;
  animation: projection-scan 7s linear infinite;
}
.song-projection::after {
  background: rgba(123, 210, 255, 0.42);
  filter: url(#projection-noise);
  opacity: 0.16;
  mix-blend-mode: screen;
  animation: projection-noise 180ms steps(2, end) infinite;
}
.song-projection > * { position: relative; z-index: 1; }
.song-projection-header,
.track-heading,
.song-projection-list,
.projection-message { position: relative; z-index: 1; }
.is-landed .song-projection { opacity: 1; transform: translate(-50%, 0); }
.song-projection-kicker { color: #8aafc0; font-size: 10px; letter-spacing: .22em; }
.song-projection-header {
  position: static;
  display: block;
  width: auto;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: none;
  box-shadow: none;
  text-align: left;
}
.song-projection-header h1 {
  margin: 12px 0 8px;
  color: #f1f7fb;
  font-size: clamp(22px, 2.5vw, 36px);
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.song-projection-header p { margin: 0; color: #aec5d2; font-size: 14px; }
.album-visuals {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr);
  gap: 20px;
  margin: 26px 0;
}
.album-visuals figure {
  position: relative;
  margin: 0;
  min-width: 0;
  height: clamp(140px, 24vh, 250px);
  overflow: hidden;
  border: 1px solid #a4c6d22b;
  border-radius: 8px;
  background: #06131c;
}
.album-visuals img { display: block; width: 100%; height: 100%; object-fit: contain; }
.album-visuals.without-visual { grid-template-columns: minmax(0, 260px); }
.album-intro {
  margin: 0 0 28px; padding-left: 16px; border-left: 2px solid #82b6c760;
  color: #b8ceda; font-size: 14px; line-height: 1.8; white-space: pre-line;
}
.track-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.track-heading h2 { margin: 0; font-size: 18px; color: #e9f3fa; }
.track-heading > span { color: #9dbccf; font-size: 12px; }
.song-projection-list { margin: 14px 0 0; padding: 0; list-style: none; border-top: 1px solid #7fb5cd40; }
.song-projection-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1.5fr) minmax(0, 1fr) 84px;
  gap: 16px;
  align-items: center;
  min-height: 64px;
  padding: 10px 8px;
  border-bottom: 1px solid #7fb5cd26;
}
.song-projection-row:hover, .song-projection-row:focus-within { background: #85c5e00d; }
.song-projection-number { color: #7ba4b6; font: 12px monospace; }
.song-projection-name { color: #e7f2f8; font-size: 15px; line-height: 1.5; overflow-wrap: anywhere; }
.song-projection-artist { color: #a8c1cf; font-size: 13px; overflow-wrap: anywhere; }
.song-projection-play, .projection-message button {
  min-height: 44px; padding: 8px 14px; border: 1px solid #80b8d066;
  border-radius: 6px; background: #25475b; color: #edf7fc; font: inherit; cursor: pointer;
}
button:hover { background: #356580; }
button:focus-visible { outline: 2px solid #c1efff; outline-offset: 3px; }
.projection-message { padding: 28px 0; color: #b8ceda; }
.record-dock {
  position: absolute; z-index: 2;
  width: var(--dock-size); height: var(--dock-size);
  left: calc(50% - var(--dock-size) / 2);
  top: calc(100% - var(--dock-bottom) - var(--dock-size) / 2);
  pointer-events: none;
}
.record-travel { position: absolute; inset: 0; }
.record-tilt { width: 100%; height: 100%; transform: scaleY(.26); }
.source-sleeve { position: fixed; z-index: 5; object-fit: cover; border-radius: 8px; pointer-events: none; }
.is-landed .source-sleeve { visibility: hidden; }
.record-floor {
  position: absolute; inset: 33% -14%; border: 1px solid #64b5d35c; border-radius: 50%;
  background: radial-gradient(ellipse, #317a9826, #0c263326);
  box-shadow: 0 0 24px #51b6dc24;
  opacity: 0; transition: opacity 500ms;
}
.projection-beam {
  position: absolute; width: min(1000px, 88vw); height: 65vh;
  bottom: 50%; left: 50%; transform: translateX(-50%) scaleY(0);
  transform-origin: bottom center;
  background: linear-gradient(to top, #74c9e638, #74c9e610 50%, transparent);
  clip-path: polygon(0 0, 100% 0, 56% 100%, 44% 100%);
  opacity: 0; transition: transform 600ms ease, opacity 500ms;
}
.is-landed .projection-beam { opacity: 1; transform: translateX(-50%) scaleY(1); }
.is-landed .record-floor { opacity: 1; }
@keyframes scrim-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes projection-scan { from { transform: translateY(-8px); } to { transform: translateY(8px); } }
@keyframes projection-noise { 0% { transform: translate(0, 0); } 50% { transform: translate(1px, -1px); } 100% { transform: translate(-1px, 1px); } }
.album-entry-transition-leave-active { transition: opacity 180ms; }
.album-entry-transition-leave-to { opacity: 0; }
@media (min-width: 1800px) {
  .song-projection { width: min(1440px, calc(100% - 120px)); }
  .song-projection-row { min-height: 72px; }
}
@media (max-width: 600px) {
  .album-entry-transition { --dock-size: min(260px, 66vw); --dock-bottom: 62px; }
  .projection-exit { left: 16px; }
  .song-projection { top: 72px; bottom: 120px; width: calc(100% - 28px); padding: 18px 14px; }
  .song-projection-kicker { font-size: 8px; letter-spacing: .13em; }
  .album-visuals { gap: 10px; margin: 18px 0; grid-template-columns: minmax(0, 1fr) minmax(0, 1.7fr); }
  .album-visuals figure { height: clamp(100px, 28vw, 150px); }
  .album-intro { font-size: 13px; margin-bottom: 22px; }
  .song-projection-row { grid-template-columns: 24px minmax(0, 1fr) 72px; gap: 4px 10px; }
  .song-projection-name { font-size: 14px; }
  .song-projection-artist { grid-column: 2; grid-row: 2; font-size: 12px; }
  .song-projection-number, .song-projection-play { grid-row: 1 / span 2; }
  .song-projection-play { grid-column: 3; padding: 8px; font-size: 12px; }
}
@media (max-height: 520px) {
  .album-entry-transition { --dock-size: 180px; --dock-bottom: 38px; }
  .song-projection { top: 66px; bottom: 78px; }
  .album-visuals figure { height: 120px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .source-sleeve { display: none; }
}
</style>

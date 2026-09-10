<template>
  <Transition name="album-entry-transition">
    <div
      v-if="active"
      class="album-entry-transition"
      role="status"
      :aria-label="t('album.trackList')"
    >
      <div class="transition-scrim" aria-hidden="true"></div>

      <button
        class="projection-exit"
        type="button"
        :aria-label="t('nav.albums')"
        @click="emit('close')"
      >
        <span aria-hidden="true">←</span>
        {{ t('album.back') }}
      </button>

      <div class="record-scene" :class="{ 'is-settled': settled }">
        <div class="projection-beam"></div>

        <div class="album-visuals">
          <div v-if="album?.coverUrl" class="album-visual-card album-cover-visual">
            <span class="album-visual-label">COVER</span>
            <img :src="proxyImageUrl(album.coverUrl)" :alt="album.name || ''" decoding="async">
          </div>
          <div v-if="album?.coverDeUrl" class="album-visual-card album-inner-visual">
            <span class="album-visual-label">VISUAL</span>
            <img :src="proxyImageUrl(album.coverDeUrl)" :alt="album.name || ''" decoding="async">
          </div>
        </div>

        <div class="song-projection" :class="{ 'is-ready': ready, 'is-settled': settled }">
          <div class="song-projection-header">
            <span class="song-projection-kicker">MSR / SIGNAL</span>
            <strong>{{ album?.name || t('album.trackList') }}</strong>
            <span>
              {{ t('album.trackList') }}
              <em v-if="settled"> · {{ t('album.trackCount', { count: songs.length }) }}</em>
            </span>
          </div>
          <div class="song-projection-list">
            <div v-if="visibleSongs.length === 0" class="song-projection-loading">
              {{ t('common.loading') }}
            </div>
            <div
              v-for="(song, index) in visibleSongs"
              :key="song.cid || `${song.name}-${index}`"
              class="song-projection-row is-interactive"
            >
              <span class="song-projection-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="song-projection-name">{{ song.name }}</span>
              <span class="song-projection-artist">{{ song.artistes?.join(', ') || '—' }}</span>
              <button
                class="song-projection-play"
                type="button"
                @click="emit('play-song', index)"
              >
                {{ t('album.play') }}
              </button>
            </div>
          </div>
        </div>

        <div class="turntable-base" aria-hidden="true">
          <div class="turntable-glow"></div>
          <div class="turntable-platform">
            <span class="turntable-ring ring-outer"></span>
            <span class="turntable-ring ring-middle"></span>
            <span class="turntable-ring ring-inner"></span>
            <span class="turntable-spindle"></span>
          </div>
        </div>
        <div class="record-floor" aria-hidden="true"></div>
        <div class="record-shadow"></div>
        <div class="record-disc">
          <div class="record-highlight"></div>
          <div class="record-label">
            <img v-if="album?.coverUrl" :src="proxyImageUrl(album.coverUrl)" alt="" decoding="async">
            <span v-else>MSR</span>
          </div>
          <span class="record-hole"></span>
        </div>
        <div class="record-impact"></div>
      </div>

      <p class="transition-caption">{{ t('album.trackList') }}</p>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';

const TRANSITION_DURATION = 2200;

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
  ready: {
    type: Boolean,
    default: false,
  },
  settled: {
    type: Boolean,
    default: false,
  },
  album: {
    type: Object,
    default: null,
  },
  songs: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['complete', 'close', 'play-song']);
const { t } = useI18n();

let finishTimer = null;
let transitionFinished = false;

const proxyImageUrl = (url) => {
  if (!url) return '';
  return getProxyImageUrl(url);
};

const visibleSongs = computed(() => props.settled ? props.songs : props.songs.slice(0, 6));

const clearFinishTimer = () => {
  if (finishTimer === null) return;
  window.clearTimeout(finishTimer);
  finishTimer = null;
};

const finishTransition = () => {
  if (!props.active) return;
  if (!props.ready) {
    transitionFinished = true;
    return;
  }
  emit('complete');
};

const startTransitionTimer = () => {
  clearFinishTimer();
  transitionFinished = false;
  finishTimer = window.setTimeout(() => {
    finishTimer = null;
    finishTransition();
  }, TRANSITION_DURATION);
};

watch(() => props.active, (active) => {
  if (active) {
    startTransitionTimer();
    return;
  }
  clearFinishTimer();
  transitionFinished = false;
});

watch(() => props.ready, (ready) => {
  if (ready && transitionFinished) {
    transitionFinished = false;
    emit('complete');
  }
});

onMounted(() => {
  if (props.active) startTransitionTimer();
});

onUnmounted(() => {
  clearFinishTimer();
});
</script>

<style scoped>
.album-entry-transition {
  position: fixed;
  z-index: 1300;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  isolation: isolate;
  perspective: 1100px;
  color: #e8f6ff;
  pointer-events: auto;
}

.projection-exit {
  position: absolute;
  z-index: 8;
  top: clamp(18px, 4vh, 42px);
  right: clamp(18px, 5vw, 72px);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 9px 13px;
  border: 1px solid rgba(142, 218, 255, 0.28);
  border-radius: 999px;
  background: rgba(9, 31, 48, 0.5);
  color: rgba(202, 239, 255, 0.78);
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
}

.projection-exit:hover,
.projection-exit:focus-visible {
  border-color: rgba(143, 220, 255, 0.72);
  background: rgba(21, 72, 103, 0.68);
  color: #effaff;
  outline: none;
}

.transition-scrim {
  position: absolute;
  z-index: -2;
  inset: 0;
  background:
    radial-gradient(circle at 50% 48%, rgba(37, 133, 190, 0.26), transparent 35%),
    linear-gradient(135deg, rgba(4, 13, 22, 0.94), rgba(7, 28, 44, 0.9));
  backdrop-filter: blur(8px) saturate(1.2);
  animation: transition-scrim-in 520ms ease both;
}

.record-scene {
  position: relative;
  width: min(1120px, 92vw);
  height: min(760px, 84vh);
  transform-style: preserve-3d;
}

.projection-beam {
  position: absolute;
  z-index: 0;
  top: 4%;
  left: 50%;
  width: min(660px, 76vw);
  height: 78%;
  border: 1px solid rgba(144, 218, 255, 0.16);
  background: linear-gradient(180deg, rgba(104, 198, 255, 0.15), rgba(104, 198, 255, 0.02) 70%, transparent);
  clip-path: polygon(34% 0, 66% 0, 100% 100%, 0 100%);
  filter: blur(1px);
  opacity: 0;
  transform: translateX(-50%) rotateX(16deg);
  transform-origin: top center;
  animation: projection-beam-on 1500ms 760ms ease both;
}

.song-projection {
  position: absolute;
  z-index: 5;
  top: 25%;
  left: 50%;
  width: min(780px, 84vw);
  padding: 28px 30px 26px;
  border: 1px solid rgba(148, 222, 255, 0.5);
  background: linear-gradient(145deg, rgba(93, 183, 230, 0.16), rgba(7, 25, 40, 0.3));
  box-shadow: 0 0 36px rgba(93, 196, 255, 0.16), inset 0 0 30px rgba(129, 215, 255, 0.06);
  color: rgba(204, 239, 255, 0.86);
  opacity: 0;
  filter: blur(4px);
  transform: translate(-50%, 38px) rotateX(58deg) scale(0.76);
  transform-origin: center bottom;
  animation: projection-rise 1200ms 860ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.song-projection.is-settled {
  top: 24%;
  width: min(920px, 88vw);
  max-height: min(72vh, 680px);
  overflow: hidden;
  opacity: 0.94;
  filter: none;
  transform: translate(-50%, 0) rotateX(0) scale(1);
  animation: projection-settle 420ms ease both;
}

.song-projection.is-ready {
  color: rgba(224, 246, 255, 0.98);
}

.song-projection-header {
  display: grid;
  gap: 4px;
  padding-bottom: 14px;
  border-bottom: 1px solid rgba(158, 224, 255, 0.24);
}

.song-projection-header strong {
  overflow: hidden;
  color: #effaff;
  font-size: clamp(1.25rem, 2.4vw, 1.85rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-projection-header > span:last-child {
  color: rgba(151, 217, 247, 0.75);
  font-size: 0.86rem;
}

.song-projection-kicker {
  color: rgba(125, 203, 246, 0.72);
  font-size: 0.65rem;
  letter-spacing: 0.18em;
}

.song-projection-list {
  display: grid;
  gap: 2px;
  padding-top: 12px;
}

.song-projection.is-settled .song-projection-list {
  max-height: min(38vh, 360px);
  overflow: auto;
  padding-right: 6px;
  scrollbar-color: rgba(121, 207, 255, 0.5) transparent;
  scrollbar-width: thin;
}

.song-projection-row {
  display: grid;
  grid-template-columns: 32px minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  min-height: 42px;
  border-bottom: 1px solid rgba(152, 218, 248, 0.12);
  font-size: clamp(0.84rem, 1.35vw, 1.02rem);
}

.song-projection-row.is-interactive {
  grid-template-columns: 40px minmax(0, 1.4fr) minmax(0, 1fr) auto;
}

.song-projection-number {
  color: rgba(120, 203, 255, 0.82);
  font-variant-numeric: tabular-nums;
}

.song-projection-name,
.song-projection-artist {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.song-projection-artist {
  color: rgba(167, 217, 238, 0.64);
  font-size: 0.82em;
}

.song-projection-play {
  min-width: 64px;
  padding: 6px 11px;
  border: 1px solid rgba(123, 210, 255, 0.45);
  border-radius: 999px;
  background: rgba(54, 151, 211, 0.22);
  color: rgba(221, 247, 255, 0.9);
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.song-projection-play:hover,
.song-projection-play:focus-visible {
  border-color: rgba(161, 231, 255, 0.9);
  background: rgba(67, 173, 237, 0.5);
  outline: none;
  transform: translateY(-1px);
}

.album-visuals {
  position: absolute;
  z-index: 3;
  top: 3%;
  left: 50%;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: min(1120px, 94vw);
  pointer-events: none;
  opacity: 0;
  transform: translateX(-50%) translateY(24px);
  animation: album-visuals-in 900ms 420ms ease both;
}

.album-visual-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(157, 225, 255, 0.42);
  background: rgba(6, 18, 29, 0.48);
  box-shadow: 0 16px 28px rgba(0, 0, 0, 0.38), 0 0 24px rgba(83, 193, 255, 0.16);
  filter: saturate(0.9);
}

.album-cover-visual {
  width: min(150px, 15vw);
  aspect-ratio: 1;
  transform: rotate(-8deg) translateY(22px);
}

.album-inner-visual {
  width: min(260px, 26vw);
  aspect-ratio: 16 / 9;
  transform: rotate(7deg) translateY(28px);
}

.album-visual-card img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.82;
}

.album-visual-label {
  position: absolute;
  z-index: 1;
  top: 8px;
  left: 10px;
  color: rgba(205, 242, 255, 0.78);
  font-size: 0.58rem;
  letter-spacing: 0.16em;
  text-shadow: 0 1px 8px rgba(0, 0, 0, 0.8);
}

.song-projection-loading {
  min-height: 170px;
  display: grid;
  place-items: center;
  color: rgba(167, 217, 238, 0.64);
  font-size: 0.88rem;
}

.turntable-base {
  position: absolute;
  z-index: 1;
  top: 90%;
  left: 50%;
  width: min(500px, 78vw);
  height: 120px;
  transform: translateX(-50%) rotateX(66deg);
  transform-origin: center top;
  pointer-events: none;
}

.turntable-glow {
  position: absolute;
  inset: 14% -8% -18%;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(92, 200, 255, 0.3), rgba(22, 96, 133, 0.12) 48%, transparent 74%);
  filter: blur(6px);
}

.turntable-platform {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: 1px solid rgba(137, 220, 255, 0.45);
  border-radius: 50%;
  background:
    radial-gradient(ellipse at center, rgba(99, 193, 237, 0.2), rgba(10, 35, 51, 0.68) 58%, rgba(4, 15, 24, 0.84));
  box-shadow:
    0 0 0 8px rgba(24, 96, 128, 0.12),
    0 0 24px rgba(75, 194, 255, 0.22),
    inset 0 0 28px rgba(123, 219, 255, 0.14);
}

.turntable-platform::before,
.turntable-platform::after {
  content: '';
  position: absolute;
  inset: 10%;
  border: 1px solid rgba(149, 226, 255, 0.2);
  border-radius: 50%;
}

.turntable-platform::after {
  inset: 20%;
  border-color: rgba(149, 226, 255, 0.12);
}

.turntable-ring {
  position: absolute;
  top: 50%;
  left: 50%;
  border: 1px solid rgba(147, 226, 255, 0.3);
  border-radius: 50%;
  transform: translate(-50%, -50%);
}

.ring-outer {
  width: 68%;
  height: 68%;
}

.ring-middle {
  width: 48%;
  height: 48%;
  border-color: rgba(147, 226, 255, 0.22);
}

.ring-inner {
  width: 27%;
  height: 27%;
  border-color: rgba(147, 226, 255, 0.18);
}

.turntable-spindle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(221, 249, 255, 0.82);
  border-radius: 50%;
  background: #0a1822;
  box-shadow: 0 0 12px rgba(129, 220, 255, 0.7);
  transform: translate(-50%, -50%);
}

.record-floor {
  position: absolute;
  z-index: 2;
  top: 90%;
  left: 50%;
  width: min(380px, 60vw);
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(117, 203, 255, 0.24), rgba(22, 78, 108, 0.12) 45%, transparent 72%);
  box-shadow: 0 0 35px rgba(105, 201, 255, 0.2);
  opacity: 0;
  transform: translateX(-50%) rotateX(64deg);
  animation: floor-light-on 950ms 1180ms ease both;
}

.record-shadow {
  position: absolute;
  z-index: 3;
  top: 90%;
  left: 50%;
  width: min(250px, 40vw);
  height: 42px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  filter: blur(15px);
  opacity: 0;
  transform: translate(-50%, 50px) rotateX(64deg) scale(0.55);
  animation: record-shadow-land 2200ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
}

.record-disc {
  position: absolute;
  z-index: 4;
  top: 90%;
  left: 50%;
  width: min(290px, 34vw);
  aspect-ratio: 1;
  border: 2px solid rgba(230, 248, 255, 0.5);
  border-radius: 50%;
  background:
    radial-gradient(circle at 50% 50%, #2b3440 0 4.5%, #080b10 4.8% 8%, transparent 8.3%),
    repeating-radial-gradient(circle at 50% 50%, rgba(255, 255, 255, 0.13) 0 1px, transparent 1px 5px),
    radial-gradient(circle at 32% 25%, #3f4b58, #090c12 57%, #010205 100%);
  box-shadow: 0 0 0 8px rgba(4, 9, 14, 0.22), 0 22px 46px rgba(0, 0, 0, 0.62), 0 0 26px rgba(116, 205, 255, 0.34);
  transform-style: preserve-3d;
  animation: record-extract-spin 2200ms cubic-bezier(0.22, 0.8, 0.3, 1) both;
}

.record-disc::before {
  content: '';
  position: absolute;
  inset: 9%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: inherit;
}

.record-highlight {
  position: absolute;
  inset: 8%;
  border-radius: inherit;
  background: linear-gradient(125deg, transparent 34%, rgba(255, 255, 255, 0.28) 48%, transparent 61%);
  mix-blend-mode: screen;
  opacity: 0.56;
}

.record-label {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 31%;
  aspect-ratio: 1;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  background: radial-gradient(circle, #58a6ff, #214f7b 62%, #111b25);
  box-shadow: 0 0 18px rgba(101, 198, 255, 0.46);
  transform: translate(-50%, -50%);
}

.record-label img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.76;
}

.record-label span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(239, 251, 255, 0.88);
  font-size: 0.62rem;
  letter-spacing: 0.14em;
}

.record-hole {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 4.5%;
  aspect-ratio: 1;
  border: 1px solid rgba(255, 255, 255, 0.48);
  border-radius: 50%;
  background: #05080b;
  transform: translate(-50%, -50%);
}

.record-impact {
  position: absolute;
  z-index: 5;
  top: 90%;
  left: 50%;
  width: min(300px, 48vw);
  aspect-ratio: 1;
  border: 1px solid rgba(157, 225, 255, 0.56);
  border-radius: 50%;
  opacity: 0;
  transform: translate(-50%, -50%) scale(0.24);
  animation: record-impact 620ms 1640ms ease-out both;
}

.transition-caption {
  position: absolute;
  bottom: 8vh;
  left: 50%;
  margin: 0;
  color: rgba(190, 231, 250, 0.68);
  font-size: 0.76rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  transform: translateX(-50%);
  animation: caption-in 600ms 1000ms ease both;
}

.album-entry-transition-enter-active,
.album-entry-transition-leave-active {
  transition: opacity 320ms ease;
}

.album-entry-transition-enter-from,
.album-entry-transition-leave-to {
  opacity: 0;
}

@keyframes transition-scrim-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes projection-beam-on {
  0%, 35% { opacity: 0; }
  55%, 100% { opacity: 1; }
}

@keyframes projection-rise {
  0% { opacity: 0; filter: blur(5px); transform: translate(-50%, 38px) rotateX(58deg) scale(0.76); }
  45% { opacity: 0.64; filter: blur(2px); }
  100% { opacity: 0.9; filter: blur(0); transform: translate(-50%, 0) rotateX(0) scale(1); }
}

@keyframes projection-settle {
  from { opacity: 0.72; transform: translate(-50%, 12px) rotateX(3deg) scale(0.98); }
  to { opacity: 0.94; transform: translate(-50%, 0) rotateX(0) scale(1); }
}

@keyframes album-visuals-in {
  from { opacity: 0; transform: translateX(-50%) translateY(24px) scale(0.96); }
  to { opacity: 0.92; transform: translateX(-50%) translateY(0) scale(1); }
}

@keyframes floor-light-on {
  from { opacity: 0; transform: translateX(-50%) rotateX(64deg) scale(0.7); }
  to { opacity: 1; transform: translateX(-50%) rotateX(64deg) scale(1); }
}

@keyframes record-shadow-land {
  0%, 72% { opacity: 0; transform: translate(-50%, 50px) rotateX(64deg) scale(0.55); }
  86% { opacity: 0.72; transform: translate(-50%, 50px) rotateX(64deg) scale(0.9); }
  100% { opacity: 0.45; transform: translate(-50%, 50px) rotateX(64deg) scale(0.82); }
}

@keyframes record-extract-spin {
  0% { opacity: 0; transform: translate3d(calc(-50% - 120px), -180px, 120px) rotateX(-8deg) rotateY(-35deg) rotateZ(-16deg) scale(0.55); }
  18% { opacity: 1; transform: translate3d(calc(-50% - 80px), -120px, 160px) rotateX(-4deg) rotateY(30deg) rotateZ(-8deg) scale(0.78); }
  48% { transform: translate3d(calc(-50% + 10px), -70px, 180px) rotateX(20deg) rotateY(200deg) rotateZ(175deg) scale(1.06); }
  72% { transform: translate3d(calc(-50% + 20px), -25px, 100px) rotateX(52deg) rotateY(320deg) rotateZ(310deg) scale(1); }
  86% { transform: translate3d(calc(-50% + 12px), -10px, 40px) rotateX(64deg) rotateY(350deg) rotateZ(350deg) scale(0.92); }
  92% { transform: translate3d(-50%, -50%, 44px) rotateX(68deg) rotateY(360deg) rotateZ(360deg) scale(0.96); }
  100% { transform: translate3d(-50%, -50%, 44px) rotateX(68deg) rotateY(360deg) rotateZ(360deg) scale(0.93); }
}

@keyframes record-impact {
  0% { opacity: 0.8; transform: translate(-50%, -50%) scale(0.24); }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(1.2); }
}

@keyframes caption-in {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

@media (max-width: 600px) {
  .record-scene {
    width: 100vw;
    height: 82vh;
  }

  .song-projection {
    top: 30%;
    width: 90vw;
    padding: 16px 14px;
  }

  .song-projection.is-settled {
    top: 29%;
    width: 90vw;
  }

  .song-projection-row {
    grid-template-columns: 24px minmax(0, 1fr) auto;
    gap: 7px;
  }

  .song-projection-row.is-interactive {
    grid-template-columns: 24px minmax(0, 1fr) auto;
  }

  .song-projection-artist {
    display: none;
  }

  .record-disc {
    top: 89%;
    width: min(220px, 52vw);
    animation-name: record-extract-spin-mobile;
  }

  .record-floor {
    width: 70vw;
  }

  .turntable-base {
    top: 89%;
    width: 88vw;
    height: 92px;
  }

  .album-visuals {
    top: 6%;
    width: 92vw;
  }

  .album-cover-visual {
    width: min(104px, 25vw);
  }

  .album-inner-visual {
    width: min(170px, 40vw);
  }

  @keyframes record-extract-spin-mobile {
    0% { opacity: 0; transform: translate3d(calc(-50% - 46px), -180px, 80px) rotateX(-8deg) rotateY(-28deg) rotateZ(-14deg) scale(0.48); }
    18% { opacity: 1; transform: translate3d(calc(-50% - 34px), -120px, 110px) rotateX(-4deg) rotateY(24deg) rotateZ(-7deg) scale(0.7); }
    48% { transform: translate3d(calc(-50% + 8px), -70px, 130px) rotateX(20deg) rotateY(200deg) rotateZ(175deg) scale(0.96); }
    72% { transform: translate3d(calc(-50% + 12px), -20px, 70px) rotateX(52deg) rotateY(320deg) rotateZ(310deg) scale(0.95); }
    86% { transform: translate3d(calc(-50% + 6px), -8px, 34px) rotateX(64deg) rotateY(350deg) rotateZ(350deg) scale(0.9); }
    92% { transform: translate3d(-50%, -50%, 38px) rotateX(68deg) rotateY(360deg) rotateZ(360deg) scale(0.93); }
    100% { transform: translate3d(-50%, -50%, 38px) rotateX(68deg) rotateY(360deg) rotateZ(360deg) scale(0.9); }
  }

  .transition-caption {
    bottom: 6vh;
    font-size: 0.65rem;
  }

  .projection-exit {
    top: 18px;
    right: 16px;
    padding: 8px 10px;
    font-size: 0.7rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .transition-scrim,
  .projection-beam,
  .song-projection,
  .album-visuals,
  .record-floor,
  .record-shadow,
  .record-disc,
  .record-impact,
  .transition-caption {
    animation: none !important;
  }

  .projection-exit {
    transition: none;
  }

  .song-projection {
    opacity: 1;
    filter: none;
    transform: translateX(-50%);
  }

  .song-projection.is-settled {
    animation: none;
  }

  .album-visuals {
    opacity: 0.92;
    transform: translateX(-50%);
  }

  .record-disc {
    opacity: 1;
    transform: translate3d(-50%, -50%, 44px) rotateX(68deg) scale(0.93);
  }
}
</style>

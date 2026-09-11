<template>
  <Transition name="album-entry-transition">
    <div v-if="active" ref="dialog" class="album-entry-transition"
      :class="{ 'is-landed': landed, 'is-player-mode': playerOpen }"
      role="dialog" aria-modal="true" aria-labelledby="projection-title" tabindex="-1" @keydown="handleKeydown">
      <div class="transition-scrim" aria-hidden="true"></div>
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
      <div v-if="origin?.card && album" ref="sourceCard" class="source-card album-slot is-active"
        :style="sourceCardStyle" aria-hidden="true" inert>
        <div class="source-card-record" aria-hidden="true">
          <VinylDisc :cover="coverUrl" />
        </div>
        <AlbumCard :album="album" :active="true" :track-count="sourceTrackCount" />
      </div>
      <img v-if="origin?.cover && coverUrl" ref="sleeve" class="source-sleeve"
        :style="sleeveStyle" :src="coverUrl" alt="" aria-hidden="true">

      <section class="song-projection" :inert="!landed" :aria-busy="!ready">
        <header class="song-projection-header">
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
          <li v-for="(song, index) in songs" :key="song.cid || index" class="song-projection-row"
            :class="{ 'is-launching': selectedTrackIndex === index && isLaunchingPlayer }">
            <span class="song-projection-number">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="song-projection-name">{{ song.name }}</span>
            <span class="song-projection-artist">{{ song.artistes?.join(', ') || '—' }}</span>
            <button class="song-projection-play" type="button" :aria-label="t('album.play') + ' ' + song.name"
              @click="handleProjectionPlaySong(index)"><span aria-hidden="true">▷</span> {{ t('album.play') }}</button>
          </li>
        </ol>
      </section>

      <Transition name="projection-player-stage">
        <section v-if="playerOpen" class="projection-player-stage" :aria-label="t('album.play')">
          <div class="projection-player-toolbar">
            <button class="projection-player-back" type="button" @click="emit('close-player')">
              <span aria-hidden="true">←</span> {{ t('album.back') }} {{ t('album.trackList') }}
            </button>
            <span class="projection-player-status">
              <span class="projection-player-status-dot" aria-hidden="true"></span>
              {{ t('album.play') }}
            </span>
          </div>

          <div class="projection-player-body">
            <PlayerView :embedded="true" />
          </div>

          <section v-if="songs.length" class="projection-player-queue" :aria-label="t('album.trackList')">
            <div class="projection-player-queue-heading">
              <span>{{ t('album.trackList') }}</span>
              <span>{{ t('album.trackCount', { count: songs.length }) }}</span>
            </div>
            <ol class="projection-player-queue-list">
              <li v-for="(song, index) in songs" :key="song.cid || `queue-${index}`"
                class="projection-player-queue-item" :class="{ active: activeQueueIndex === index }">
                <button type="button" @click="emit('play-queue-song', index)">
                  <span class="projection-player-queue-number">{{ String(index + 1).padStart(2, '0') }}</span>
                  <span class="projection-player-queue-name">{{ song.name }}</span>
                  <span class="projection-player-queue-state" aria-hidden="true">
                    {{ activeQueueIndex === index ? '▶' : '＋' }}
                  </span>
                </button>
              </li>
            </ol>
          </section>
        </section>
      </Transition>
    </div>
  </Transition>
</template>

<script setup>
import { computed, defineAsyncComponent, nextTick, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import { playerState } from '../stores/player.js';
import AlbumCard from './AlbumCard.vue';
import VinylDisc from './VinylDisc.vue';

const PlayerView = defineAsyncComponent(() => import('./PlayerView.vue'));

const props = defineProps({
  active: Boolean, ready: Boolean, settled: Boolean, error: Boolean,
  album: { type: Object, default: null },
  origin: { type: Object, default: null },
  songs: { type: Array, default: () => [] },
  playerOpen: { type: Boolean, default: false },
  playerSongIndex: { type: Number, default: null },
});
const emit = defineEmits(['complete', 'close', 'play-song', 'play-queue-song', 'close-player', 'retry']);
const { t } = useI18n();
const dialog = ref(null);
const closeButton = ref(null);
const dock = ref(null);
const travel = ref(null);
const tilt = ref(null);
const sourceCard = ref(null);
const sleeve = ref(null);
const landed = ref(false);
const selectedTrackIndex = ref(null);
let playerLaunchTimer = null;
const proxyImageUrl = url => url ? getProxyImageUrl(url) : '';
const coverUrl = computed(() => proxyImageUrl(props.album?.coverUrl));
const sleeveStyle = computed(() => {
  const r = props.origin?.cover;
  return r ? { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' } : {};
});
const sourceCardStyle = computed(() => {
  const r = props.origin?.card;
  return r ? { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' } : {};
});
const sourceTrackCount = computed(() => {
  const rawCount = props.album?.trackCount ?? props.album?.songCount ?? props.album?.song_count;
  if (rawCount !== undefined && rawCount !== null && rawCount !== '') {
    const count = Number(rawCount);
    return Number.isFinite(count) ? count : null;
  }
  if (Array.isArray(props.album?.songs)) return props.album.songs.length;
  return props.songs.length ? props.songs.length : null;
});
const isLaunchingPlayer = computed(() => selectedTrackIndex.value !== null && !props.playerOpen);
const activeQueueIndex = computed(() => {
  const sameAlbum = playerState.sourceContext?.type === 'album'
    && String(playerState.sourceContext.albumCid) === String(props.album?.cid);
  if (sameAlbum && Number.isInteger(playerState.currentSongIndex)) {
    return playerState.currentSongIndex;
  }
  return Number.isInteger(props.playerSongIndex) ? props.playerSongIndex : -1;
});
const hideBrokenImage = event => { event.target.style.visibility = 'hidden'; };
const CARD_LIFT_DURATION = 220;
const CARD_HIGHLIGHT_DURATION = 520;
const DISC_ANIMATION_DURATION = 1250;
let animations = [];
let generation = 0;
let previousFocus = null;
let previousOverflow = '';
let inertSiblings = [];
let locked = false;

function handleProjectionPlaySong(index) {
  if (props.playerOpen || !Number.isInteger(index)) return;
  selectedTrackIndex.value = index;
  if (playerLaunchTimer) window.clearTimeout(playerLaunchTimer);
  playerLaunchTimer = window.setTimeout(() => {
    playerLaunchTimer = null;
    emit('play-song', index);
  }, 180);
}

function releaseDialog() {
  if (playerLaunchTimer) {
    window.clearTimeout(playerLaunchTimer);
    playerLaunchTimer = null;
  }
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
      // Keep the record behind the lifted sleeve until the cover has cleared its origin.
      { opacity: 0, transform: position(sx, sy, scale), offset: 0, easing: 'cubic-bezier(.3,0,.25,1)' },
      { opacity: 0, transform: position(sx, sy, scale), offset: .2 },
      { opacity: 0.92, transform: position(ex, sy, scale), offset: .34, easing: 'cubic-bezier(.3,0,.2,1)' },
      { opacity: 1, transform: position(0, 0, 1), offset: 1 },
    ], { duration: DISC_ANIMATION_DURATION, delay: CARD_LIFT_DURATION, fill: 'both' }));
    animations.push(tilt.value.animate([
      { transform: 'scaleY(1)', offset: 0 },
      { transform: 'scaleY(1)', offset: .42, easing: 'cubic-bezier(.3,0,.2,1)' },
      { transform: 'scaleY(.26)', offset: 1 },
    ], { duration: DISC_ANIMATION_DURATION, delay: CARD_LIFT_DURATION, fill: 'both' }));
    if (sleeve.value) animations.push(sleeve.value.animate([
      // The sleeve stays above the record while it clears the card, so the extraction reads as one object.
      { opacity: 0.01, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
      { opacity: 1, transform: 'translate3d(0, -5px, 0) scale(1.03)', offset: .18 },
      { opacity: 1, transform: 'translate3d(0, -5px, 0) scale(1.03)', offset: .42 },
      { opacity: 0, transform: 'translate3d(0, -5px, 0) scale(1.03)', offset: .72 },
      { opacity: 0, transform: 'translate3d(0, -5px, 0) scale(1.03)', offset: 1 },
    ], { duration: 900, fill: 'both' }));
    if (sourceCard.value) animations.push(sourceCard.value.animate([
      // Animate the whole card first; the cover clone underneath only takes over as it leaves.
      { opacity: 0.01, transform: 'translate3d(0, 0, 0) scale(1)', offset: 0 },
      { opacity: 1, transform: 'translate3d(0, -12px, 28px) scale(1.045)', offset: 0.2 },
      { opacity: 1, transform: 'translate3d(0, -12px, 28px) scale(1.045)', offset: 0.58 },
      { opacity: 0, transform: 'translate3d(0, -8px, 20px) scale(1.025)', offset: 1 },
    ], { duration: CARD_HIGHLIGHT_DURATION, fill: 'both' }));
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
watch(() => props.playerOpen, isOpen => {
  if (!isOpen) selectedTrackIndex.value = null;
});
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
  background: radial-gradient(
    ellipse at 50% 85%,
    rgba(18, 57, 75, 0.56),
    rgba(6, 20, 31, 0.72) 72%,
    rgba(3, 12, 20, 0.78)
  );
  backdrop-filter: blur(3px) saturate(0.84);
  animation: scrim-in 600ms ease both;
}
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
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;
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
.song-projection::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
.song-projection::before {
  content: '';
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
}
.song-projection::before {
  background:
    radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, 0.16) 100%),
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 18%, transparent 82%, rgba(0, 0, 0, 0.08));
  opacity: 0.85;
}
.song-projection > * { position: relative; z-index: 1; }
.song-projection-header,
.track-heading,
.song-projection-list,
.projection-message { position: relative; z-index: 1; }
.is-landed .song-projection { opacity: 1; transform: translate(-50%, 0); }
.is-player-mode .song-projection {
  opacity: 0.28;
  transform: translate(-50%, -18px) scale(0.94);
  filter: blur(2px) saturate(0.72);
  pointer-events: none;
}
.is-player-mode .album-visuals {
  transform: translateY(-34px) scale(0.74);
  opacity: 0.22;
}
.album-visuals { transition: transform 520ms cubic-bezier(.2, .8, .2, 1), opacity 420ms ease; }
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
  margin: 0 0 8px;
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
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
}
.album-visuals img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 16px 26px rgba(0, 0, 0, 0.28));
}
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
.song-projection-row.is-launching {
  position: relative;
  z-index: 3;
  border-color: rgba(126, 198, 255, 0.76);
  background: linear-gradient(90deg, rgba(88, 166, 255, 0.2), rgba(88, 166, 255, 0.06), rgba(88, 166, 255, 0.2));
  box-shadow: 0 0 26px rgba(88, 166, 255, 0.2), inset 0 0 18px rgba(126, 198, 255, 0.12);
  animation: track-row-lift 180ms cubic-bezier(.2, .9, .25, 1) both;
}
.song-projection-row.is-launching::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 18%, rgba(207, 244, 255, 0.65) 48%, transparent 76%);
  animation: track-row-sweep 180ms ease-out both;
}
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
.projection-player-stage {
  position: absolute;
  z-index: 5;
  inset: clamp(66px, 8vh, 86px) clamp(18px, 4vw, 72px) clamp(42px, 7vh, 86px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  min-height: 0;
  padding: clamp(14px, 2vw, 26px);
  overflow: hidden;
  border: 1px solid rgba(115, 182, 208, 0.28);
  border-top: 2px solid rgba(138, 200, 223, 0.76);
  border-radius: 12px 12px 20px 20px;
  background: linear-gradient(135deg, rgba(9, 35, 49, 0.68), rgba(5, 19, 31, 0.74) 64%, rgba(16, 56, 72, 0.54));
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.34), inset 0 0 42px rgba(117, 211, 255, 0.06);
  backdrop-filter: blur(8px) saturate(1.12);
}
.projection-player-stage-enter-active,
.projection-player-stage-leave-active {
  transition: opacity 420ms ease, transform 520ms cubic-bezier(.2, .8, .2, 1);
}
.projection-player-stage-enter-from,
.projection-player-stage-leave-to {
  opacity: 0;
  transform: translateY(34px) scale(0.94);
}
.projection-player-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 40px;
}
.projection-player-back {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 7px 12px;
  border: 1px solid rgba(121, 183, 208, 0.35);
  border-radius: 999px;
  background: rgba(11, 35, 49, 0.72);
  color: #d9edf7;
  cursor: pointer;
  font: inherit;
}
.projection-player-back:hover { background: rgba(53, 101, 128, 0.78); }
.projection-player-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #a8cbd9;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.projection-player-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #7ec6ff;
  box-shadow: 0 0 12px rgba(126, 198, 255, 0.9);
  animation: player-status-pulse 1.4s ease-in-out infinite;
}
.projection-player-body {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(126, 198, 255, 0.35) transparent;
}
.projection-player-body :deep(.embedded-player-view) {
  width: 100%;
  min-height: 100%;
  grid-template-columns: minmax(210px, 0.78fr) minmax(250px, 1fr) minmax(260px, 1fr);
  gap: clamp(18px, 3vw, 42px);
  align-items: stretch;
}
.projection-player-body :deep(.embedded-player-view .player-view-left) {
  grid-column: 1 / span 2;
  display: grid;
  grid-template-columns: minmax(190px, 0.85fr) minmax(240px, 1fr);
  align-items: center;
  gap: clamp(18px, 3vw, 42px);
  max-width: none;
  min-height: 0;
  position: relative;
}
.projection-player-body :deep(.embedded-player-view .player-container),
.projection-player-body :deep(.embedded-player-view .player-header) {
  display: contents;
}
.projection-player-body :deep(.embedded-player-view .player-cover) {
  grid-column: 1;
  grid-row: 1 / span 2;
  justify-self: center;
  width: clamp(190px, 22vw, 330px);
  height: auto;
  aspect-ratio: 1;
  box-sizing: border-box;
  margin: 0;
  padding: clamp(18px, 2vw, 30px);
}
.projection-player-body :deep(.embedded-player-view .player-info) {
  grid-column: 2;
  grid-row: 1;
  align-self: end;
  min-width: 0;
  text-align: left;
}
.projection-player-body :deep(.embedded-player-view .player-info h4) {
  margin-bottom: 8px;
  color: #f1f7fb;
  font-size: clamp(1.35rem, 2.2vw, 2.1rem);
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.projection-player-body :deep(.embedded-player-view .player-info p) { font-size: 1rem; }
.projection-player-body :deep(.embedded-player-view .player-controls) {
  grid-column: 2;
  grid-row: 2;
  align-self: start;
  margin-top: 16px;
}
.projection-player-body :deep(.embedded-player-view .controls-top) {
  justify-content: flex-start;
  gap: 12px;
}
.projection-player-body :deep(.embedded-player-view .progress-container) { margin: 18px 0 10px; }
.projection-player-body :deep(.embedded-player-view .controls-bottom) { justify-content: flex-start; }
.projection-player-body :deep(.embedded-player-view .player-view-right) {
  grid-column: 3;
  max-width: none;
  min-height: 0;
  overflow: hidden;
  justify-content: center;
}
.projection-player-body :deep(.embedded-player-view .player-visual-panel) {
  width: min(100%, 300px);
  align-self: center;
}
.projection-player-body :deep(.embedded-player-view .lyrics-container) {
  height: min(36vh, 330px);
  max-height: none;
  padding: 14px;
  border: 1px solid rgba(127, 181, 205, 0.16);
  background: rgba(5, 18, 29, 0.42);
}
.projection-player-body :deep(.embedded-player-view .no-lyrics) {
  min-height: 180px;
  padding: 20px;
  border: 1px solid rgba(127, 181, 205, 0.16);
  border-radius: 8px;
  background: rgba(5, 18, 29, 0.42);
  text-align: center;
}
.projection-player-body :deep(.embedded-player-view.single-panel) {
  grid-template-columns: minmax(0, 1fr);
}
.projection-player-body :deep(.embedded-player-view.single-panel .player-view-left) {
  grid-column: 1;
}
.projection-player-body :deep(.embedded-player-view.single-panel .player-view-right) { display: none; }
.projection-player-queue {
  min-height: 0;
  border-top: 1px solid rgba(127, 181, 205, 0.22);
  padding-top: 10px;
}
.projection-player-queue-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  color: #a8cbd9;
  font-size: 12px;
}
.projection-player-queue-heading > span:first-child {
  color: #e9f3fa;
  font-size: 14px;
  font-weight: 700;
}
.projection-player-queue-list {
  display: flex;
  gap: 8px;
  margin: 0;
  padding: 0 2px 4px;
  overflow-x: auto;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(126, 198, 255, 0.35) transparent;
}
.projection-player-queue-item {
  flex: 1 0 min(240px, 30vw);
  min-width: 0;
}
.projection-player-queue-item button {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 7px 10px;
  border: 1px solid rgba(127, 181, 205, 0.18);
  border-radius: 7px;
  background: rgba(19, 49, 64, 0.42);
  color: #dcecf4;
  cursor: pointer;
  text-align: left;
  font: inherit;
}
.projection-player-queue-item button:hover { background: rgba(53, 101, 128, 0.68); }
.projection-player-queue-item.active button {
  border-color: rgba(126, 198, 255, 0.7);
  background: rgba(44, 107, 148, 0.5);
  box-shadow: 0 0 16px rgba(88, 166, 255, 0.16);
}
.projection-player-queue-number { color: #7ba4b6; font: 12px monospace; }
.projection-player-queue-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.projection-player-queue-state { color: #8fd1ff; text-align: center; }
.record-dock {
  position: absolute; z-index: 1;
  width: var(--dock-size); height: var(--dock-size);
  left: calc(50% - var(--dock-size) / 2);
  top: calc(100% - var(--dock-bottom) - var(--dock-size) / 2);
  pointer-events: none;
}
.record-travel { position: absolute; inset: 0; }
.record-tilt { width: 100%; height: 100%; transform: scaleY(.26); }
.source-card {
  position: fixed;
  z-index: 7;
  pointer-events: none;
  transform-origin: center bottom;
  transform-style: preserve-3d;
  will-change: transform, opacity;
}
.source-card::before {
  content: '';
  position: absolute;
  z-index: -1;
  top: 14px;
  right: -12px;
  bottom: 10px;
  width: 18px;
  border-radius: 0 12px 12px 0;
  background: linear-gradient(90deg, rgba(12, 18, 28, 0.82), rgba(88, 166, 255, 0.22));
  box-shadow: 8px 12px 20px rgba(0, 0, 0, 0.24);
  transform: translateZ(-22px);
}
.source-card::after {
  content: '';
  position: absolute;
  z-index: -2;
  right: 8%;
  bottom: -18px;
  left: 8%;
  height: 28px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.34);
  filter: blur(12px);
  transform: translateZ(-40px);
}
.source-card-record {
  position: absolute;
  z-index: 1;
  top: 24px;
  right: -24%;
  width: 88%;
  aspect-ratio: 1;
  pointer-events: none;
  transform: translate3d(0, 0, 0) rotateZ(0deg);
  transform-origin: center;
  transition: transform 420ms cubic-bezier(0.2, 0.85, 0.25, 1), opacity 240ms ease;
}
.source-card.is-active {
  filter: saturate(1.08) brightness(1.04);
}
.source-card :deep(.album) {
  position: relative;
  z-index: 2;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 100%;
  padding: 10px;
  overflow: hidden;
  border: 1px solid rgba(88, 166, 255, 0.5);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(19, 56, 75, 0.78), rgba(7, 21, 33, 0.88));
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.48), 0 0 30px rgba(88, 166, 255, 0.16);
  backdrop-filter: blur(8px) saturate(1.08);
  transition: box-shadow 260ms ease, border-color 260ms ease;
}
.source-card :deep(.album)::before {
  content: '';
  position: absolute;
  z-index: 3;
  inset: 0;
  border: 1px solid rgba(126, 198, 255, 0.76);
  border-radius: inherit;
  box-shadow: inset 0 0 22px rgba(88, 166, 255, 0.18), 0 0 18px rgba(88, 166, 255, 0.28);
  pointer-events: none;
}
.source-card :deep(.album)::after {
  content: '';
  position: absolute;
  z-index: 4;
  top: -20%;
  bottom: -20%;
  left: -72%;
  width: 42%;
  background: linear-gradient(105deg, transparent 12%, rgba(255, 255, 255, 0.38) 48%, transparent 82%);
  opacity: 0;
  pointer-events: none;
  transform: skewX(-16deg);
}
.source-card :deep(.album img) {
  height: auto;
  aspect-ratio: 1;
  object-fit: cover;
  margin-bottom: 10px;
  border-radius: 8px;
  -webkit-user-drag: none;
  user-select: none;
}
.source-card :deep(.album-hover-info) {
  opacity: 1;
  transform: translateY(0);
}
.source-card :deep(.marquee-content) {
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  overflow: hidden;
  line-height: 1.35;
  animation: none !important;
  padding-left: 0 !important;
  color: #e6f2fa;
  font-size: clamp(1.05rem, 1.55vw, 1.32rem);
}
.source-card :deep(.album p) {
  min-height: 2.5em;
  margin-bottom: 10px;
  font-size: clamp(0.9rem, 1.18vw, 1.05rem);
}
.source-card :deep(.album button) {
  min-height: 44px;
  height: 44px;
  max-height: 44px;
  padding: 6px 8px;
  font-size: clamp(0.7rem, 1vw, 0.86rem);
}
.source-sleeve {
  position: fixed;
  z-index: 6;
  object-fit: cover;
  border-radius: 8px;
  opacity: 0.01;
  pointer-events: none;
  filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.42));
}
.is-landed .source-sleeve { visibility: hidden; }
.is-landed .source-card { visibility: hidden; }
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
@keyframes track-row-lift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(0, -4px, 0) scale(1.012); }
}
@keyframes track-row-sweep {
  from { opacity: 0; transform: translateX(-120%); }
  55% { opacity: 1; }
  to { opacity: 0; transform: translateX(120%); }
}
@keyframes player-status-pulse {
  0%, 100% { opacity: 0.45; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1); }
}
.album-entry-transition-leave-active { transition: opacity 180ms; }
.album-entry-transition-leave-to { opacity: 0; }
@media (min-width: 1800px) {
  .song-projection { width: min(1440px, calc(100% - 120px)); }
  .song-projection-row { min-height: 72px; }
}
@media (max-width: 900px) {
  .projection-player-stage {
    inset: 64px 12px 22px;
    gap: 10px;
    padding: 12px;
  }
  .projection-player-body :deep(.embedded-player-view) {
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }
  .projection-player-body :deep(.embedded-player-view .player-view-left) {
    grid-column: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: auto;
  }
  .projection-player-body :deep(.embedded-player-view .player-container) {
    display: block;
    width: 100%;
    padding: 0;
  }
  .projection-player-body :deep(.embedded-player-view .player-header) {
    display: flex;
    align-items: center;
    margin-bottom: 16px;
  }
  .projection-player-body :deep(.embedded-player-view .player-cover) {
    width: min(62vw, 250px);
    height: auto;
    margin: 0 auto 12px;
    padding: 22px;
  }
  .projection-player-body :deep(.embedded-player-view .player-info) {
    width: 100%;
    text-align: center;
  }
  .projection-player-body :deep(.embedded-player-view .player-info h4) { font-size: 1.25rem; }
  .projection-player-body :deep(.embedded-player-view .player-controls) {
    width: 100%;
    margin-top: 0;
  }
  .projection-player-body :deep(.embedded-player-view .controls-top) { justify-content: center; }
  .projection-player-body :deep(.embedded-player-view .controls-bottom) { justify-content: space-between; }
  .projection-player-body :deep(.embedded-player-view .player-view-right) {
    grid-column: 1;
    overflow: visible;
  }
  .projection-player-body :deep(.embedded-player-view .lyrics-container) {
    height: min(28vh, 240px);
  }
  .projection-player-queue {
    max-height: min(28vh, 220px);
    overflow-y: auto;
    padding-right: 3px;
  }
  .projection-player-queue-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }
  .projection-player-queue-item { flex: none; }
}
@media (max-width: 600px) {
  .album-entry-transition { --dock-size: min(260px, 66vw); --dock-bottom: 62px; }
  .projection-exit { left: 16px; }
  .song-projection { top: 72px; bottom: 120px; width: calc(100% - 28px); padding: 18px 14px; }
  .projection-player-stage { inset: 66px 8px 14px; padding: 10px; border-radius: 10px 10px 18px 18px; }
  .projection-player-status { display: none; }
  .projection-player-back { min-height: 36px; padding: 6px 10px; font-size: 12px; }
  .projection-player-body :deep(.embedded-player-view .player-cover) { width: min(58vw, 210px); padding: 18px; }
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

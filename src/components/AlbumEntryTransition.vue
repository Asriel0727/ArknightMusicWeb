<template>
  <Transition name="album-entry-transition">
    <div v-if="active" ref="dialog" class="album-entry-transition"
      :class="{ 'is-landed': landed, 'is-player-mode': playerOpen }"
      role="dialog" aria-modal="true" aria-labelledby="projection-title" tabindex="-1"
      @keydown="handleKeydown" @pointerdown="handleSkipPointerDown">
      <div class="transition-scrim" aria-hidden="true"></div>
      <button ref="closeButton" class="projection-exit" type="button" @click="handleExit">
        <span aria-hidden="true">←</span> {{ t('album.back') }}
      </button>

      <div v-if="origin?.card && album" ref="sourceCard" class="source-card album-slot is-active"
        :style="sourceCardStyle" aria-hidden="true" inert>
        <div class="source-card-record" aria-hidden="true">
          <VinylDisc :cover="coverUrl" />
        </div>
        <AlbumCard :album="album" :active="true" :track-count="sourceTrackCount" />
      </div>
      <img v-if="origin?.cover && coverUrl" ref="sleeve" class="source-sleeve"
        :style="sleeveStyle" :src="coverUrl" alt="" aria-hidden="true">

      <div class="album-display-stage">
        <section class="song-projection" :inert="!landed" :aria-busy="!ready">
          <img v-if="album?.coverDeUrl" :key="album.coverDeUrl" class="projection-artwork" :src="proxyImageUrl(album.coverDeUrl)"
            alt="" aria-hidden="true" decoding="async" @error="hideBrokenImage">
          <div class="projection-player-toolbar">
            <div class="projection-player-toolbar-left">
              <div class="projection-player-context">
                <span id="projection-title" class="projection-player-eyebrow">{{ album?.name || t('album.trackList') }}</span>
                <span v-if="playerOpen" class="projection-player-status">
                  <span class="projection-player-status-dot" aria-hidden="true"></span>
                  {{ t('album.play') }}
                </span>
              </div>
            </div>
            <div class="projection-toolbar-actions">
              <button v-if="!playerOpen && currentAlbumSongIndex >= 0" type="button" class="projection-player-queue-toggle"
                @click="handleProjectionPlaySong(currentAlbumSongIndex)">
                {{ t('album.returnToPlayer') }}
              </button>
              <button v-if="playerOpen" type="button" class="projection-player-queue-toggle" @click="emit('close-player')">
                <span aria-hidden="true">←</span> {{ t('album.trackList') }}
              </button>
              <button v-if="playerOpen && songs.length" class="projection-player-queue-toggle" type="button"
                :aria-expanded="queueOpen" aria-controls="projection-player-queue" @click="queueOpen = !queueOpen">
                <i class="fas fa-list" aria-hidden="true"></i>
                <span>{{ t('album.trackList') }}</span>
                <span class="projection-player-queue-count">{{ songs.length }}</span>
                <i :class="queueOpen ? 'fas fa-chevron-down' : 'fas fa-chevron-up'" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <div v-show="!playerOpen" class="projection-layout" :inert="playerOpen">
            <div class="projection-album-info">
              <figure v-if="coverUrl" class="album-cover-visual">
                <img :src="coverUrl" :alt="album?.name || ''" decoding="async" @error="hideBrokenImage">
              </figure>
              <div class="projection-album-copy">
                <header class="song-projection-header">
                  <h1>{{ album?.name || t('album.trackList') }}</h1>
                  <p>{{ album?.artistes?.join(' · ') || album?.belong || '唱片資料' }}</p>
                </header>
                <blockquote v-if="albumIntroLines.length" class="album-tagline">{{ albumIntroLines[0] }}</blockquote>
                <p v-if="albumIntroLines.length > 1" class="album-intro">{{ albumIntroLines.slice(1).join('\n') }}</p>
              </div>
            </div>
            <div class="projection-album-content">
              <section class="projection-tracks" :class="{ 'compact-tracks': hasManyTracks }" :aria-label="t('album.trackList')">
                <div class="track-heading">
                  <h2>{{ t('album.trackList') }}</h2>
                  <span v-if="ready && !error">{{ t('album.trackCount', { count: visibleProjectionTracks.length }) }}</span>
                </div>
                <input v-if="hasManyTracks && ready && !error" v-model="trackSearchQuery" class="projection-track-search"
                  type="search" :placeholder="t('searchBar.trackPlaceholder')" :aria-label="t('searchBar.trackPlaceholder')">
                <div class="projection-track-area" ref="trackAreaRef" tabindex="0" :aria-label="t('album.trackList')">
                  <div v-if="error" class="projection-message" role="alert">
                    <p>{{ t('album.loadError') }}</p>
                    <button type="button" @click="emit('retry')">{{ t('album.retry') }}</button>
                  </div>
                  <p v-else-if="!ready" class="projection-message" role="status">{{ t('common.loading') }}</p>
                  <p v-else-if="!songs.length" class="projection-message">{{ t('album.emptyTracks') }}</p>
                  <p v-else-if="!visibleProjectionTracks.length" class="projection-message" role="status">{{ t('searchBar.noMatchingTracks') }}</p>
                  <ol v-else class="song-projection-list">
                    <li v-for="{ song, index } in visibleProjectionTracks" :key="song.cid || index" class="song-projection-row"
                      :class="{ 'is-current': index === currentAlbumSongIndex, 'is-launching': selectedTrackIndex === index && isLaunchingPlayer }"
                      :aria-current="index === currentAlbumSongIndex ? 'true' : undefined">
                      <span class="song-projection-number">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span class="song-projection-name" :title="song.name">{{ song.name }}</span>
                      <span class="song-projection-artist">{{ song.artistes?.join(', ') || '—' }}</span>
                      <span class="song-projection-waveform" aria-hidden="true">
                        <i v-for="(height, bar) in waveformHeights" :key="bar"
                          :style="{ '--bar-height': `${index === currentAlbumSongIndex ? spectrumHeights[bar] : height}px` }"></i>
                      </span>
                      <button class="song-projection-play" type="button"
                        :aria-label="t(index === currentAlbumSongIndex ? 'album.returnToPlayer' : 'album.play') + ' ' + song.name"
                        @click="handleProjectionPlaySong(index)"><span v-if="index !== currentAlbumSongIndex" aria-hidden="true">▷</span>
                        {{ t(index === currentAlbumSongIndex ? (playerState.isPlaying ? 'album.nowPlaying' : 'album.returnToPlayer') : 'album.play') }}</button>
                    </li>
                  </ol>
                </div>
              </section>
            </div>
          </div>
          <section v-if="playerOpen" class="projection-player-stage" :aria-label="t('album.play')">
            <div class="projection-player-body">
              <PlayerView ref="playerViewRef" :embedded="true"
                @character-ep-expanded-change="isCharacterEpExpanded = $event" />
            </div>

            <Transition name="projection-queue-drawer">
              <section v-if="songs.length && queueOpen" id="projection-player-queue" class="projection-player-queue"
                :aria-label="t('album.trackList')">
                <div class="projection-player-queue-heading">
                  <span>{{ t('album.trackList') }}</span>
                  <span>{{ t('album.trackCount', { count: songs.length }) }}</span>
                </div>
                <ol class="projection-player-queue-list">
                  <li v-for="(song, index) in songs" :key="song.cid || `queue-${index}`"
                    class="projection-player-queue-item" :class="{ active: activeQueueIndex === index }">
                    <button type="button" @click="handleQueueSong(index)">
                      <span class="projection-player-queue-number">{{ String(index + 1).padStart(2, '0') }}</span>
                      <span class="projection-player-queue-name">{{ song.name }}</span>
                      <span class="projection-player-queue-state" aria-hidden="true">
                        {{ activeQueueIndex === index ? '▶' : '＋' }}
                      </span>
                    </button>
                  </li>
                </ol>
              </section>
            </Transition>
          </section>
        </section>
        <div ref="dock" class="record-dock" aria-hidden="true">
          <div class="projection-beam"></div>
          <div class="record-floor"></div>
          <div ref="travel" class="record-travel">
            <div ref="tilt" class="record-tilt"><VinylDisc :cover="coverUrl" /></div>
          </div>
        </div>
      </div>

    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { readAudioSpectrum } from '../utils/audioSpectrum.js';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import { playerState } from '../stores/player.js';
import AlbumCard from './AlbumCard.vue';
import VinylDisc from './VinylDisc.vue';
// Load the player styles with the page, rather than requesting a stale hashed
// CSS chunk only when a song is opened after a deployment.
import PlayerView from './PlayerView.vue';

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
const playerViewRef = ref(null);
const hasManyTracks = computed(() => props.songs.length > 6);
const currentAlbumSongIndex = computed(() => {
  const cid = playerState.currentSong?.cid;
  return cid == null ? -1 : props.songs.findIndex(song => String(song.cid) === String(cid));
});
const albumIntroLines = computed(() => normalizeEscapedNewlines(props.album?.intro || '')
  .split(/\n+/u).map((line) => line.trim()).filter(Boolean));
const waveformHeights = [4, 7, 12, 17, 20, 15, 11, 8, 13, 9, 6, 10, 5, 7, 3];
const spectrumHeights = ref(waveformHeights);
let spectrumFrame = null;
let lastSpectrumTime = 0;
const reducedSpectrumMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
function stopSpectrum() {
  if (spectrumFrame !== null) cancelAnimationFrame(spectrumFrame);
  spectrumFrame = null;
  spectrumHeights.value = waveformHeights;
}
function updateSpectrumLoop() {
  stopSpectrum();
  if (!props.active || !landed.value || props.playerOpen || !playerState.isPlaying
    || currentAlbumSongIndex.value < 0 || document.hidden || reducedSpectrumMotion.matches) return;
  const tick = time => {
    if (time - lastSpectrumTime >= 33) {
      spectrumHeights.value = readAudioSpectrum(waveformHeights.length) || waveformHeights;
      lastSpectrumTime = time;
    }
    spectrumFrame = requestAnimationFrame(tick);
  };
  spectrumFrame = requestAnimationFrame(tick);
}
const trackAreaRef = ref(null);
const trackSearchQuery = ref('');
const visibleProjectionTracks = computed(() => {
  const query = trackSearchQuery.value.trim().normalize('NFKC').toLocaleLowerCase();
  return props.songs.map((song, index) => ({ song, index })).filter(({ song }) => {
    const text = `${song.name || ''} ${(song.artistes || []).join(' ')}`;
    return !query || text.normalize('NFKC').toLocaleLowerCase().includes(query);
  });
});
watch(() => props.album?.cid, () => { trackSearchQuery.value = ''; });
watch(trackSearchQuery, () => nextTick(() => { if (trackAreaRef.value) trackAreaRef.value.scrollTop = 0; }));
const dock = ref(null);
const travel = ref(null);
const tilt = ref(null);
const sourceCard = ref(null);
const sleeve = ref(null);
const landed = ref(false);
watch(() => [props.active, props.playerOpen, landed.value, playerState.isPlaying, currentAlbumSongIndex.value], updateSpectrumLoop);
onMounted(() => {
  document.addEventListener('visibilitychange', updateSpectrumLoop);
  reducedSpectrumMotion.addEventListener('change', updateSpectrumLoop);
});
const selectedTrackIndex = ref(null);
const queueOpen = ref(false);
const isCharacterEpExpanded = ref(false);
let playerLaunchTimer = null;
let albumScrollTop = 0;
let albumTrackFocus = null;
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
  albumScrollTop = dialog.value?.scrollTop || 0;
  albumTrackFocus = document.activeElement;
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
  if (event.key === 'Escape') {
    event.preventDefault();
    handleExit();
    return;
  }
  if (!landed.value && (event.key === 'Enter' || event.key === ' ')) {
    if (!event.target.closest('.projection-exit')) {
      event.preventDefault();
      skipEntranceAnimation();
    }
    return;
  }
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

function handleExit() {
  if (isCharacterEpExpanded.value) {
    playerViewRef.value?.closeCharacterEpPreview();
    return;
  }
  emit('close');
}

function handleQueueSong(index) {
  queueOpen.value = false;
  emit('play-queue-song', index);
}

function skipEntranceAnimation() {
  if (!props.active || landed.value) return;

  // Invalidate the pending scene and let the responsive CSS take over immediately.
  generation++;
  animations.forEach(animation => animation.cancel());
  animations = [];
  landed.value = true;
  emit('complete');
}

function handleSkipPointerDown(event) {
  if (landed.value || event.target.closest('.projection-exit')) return;
  skipEntranceAnimation();
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
  const mobile = window.matchMedia('(max-width: 900px)').matches;
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
      { transform: mobile ? 'scaleY(1)' : 'scaleY(.26)', offset: 1 },
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
watch(() => props.playerOpen, async isOpen => {
  if (!isOpen) {
    selectedTrackIndex.value = null;
    queueOpen.value = false;
  }
  await nextTick();
  if (!dialog.value) return;
  if (isOpen) {
    const stage = dialog.value.querySelector('.projection-player-stage');
    dialog.value.scrollTop = Math.max(0, (stage?.getBoundingClientRect().top || 0) + dialog.value.scrollTop - 88);
    stage?.querySelector('button')?.focus({ preventScroll: true });
  } else {
    dialog.value.scrollTop = albumScrollTop;
    if (albumTrackFocus?.isConnected) albumTrackFocus.focus({ preventScroll: true });
  }
});
onUnmounted(() => {
  stopSpectrum();
  document.removeEventListener('visibilitychange', updateSpectrumLoop);
  reducedSpectrumMotion.removeEventListener('change', updateSpectrumLoop);
  generation++;
  releaseDialog();
});
</script>

<style scoped>
.album-entry-transition {
  --dock-size: min(210px, 26vw);
  --dock-bottom: 52px;
  position: fixed;
  z-index: 1300;
  inset: 0;
  isolation: isolate;
  color: #e7f2f8;
  display: flex;
  flex-direction: column;
  height: 100dvh;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.transition-scrim {
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse at 50% 88%, rgba(15, 75, 103, 0.24), transparent 48%),
    radial-gradient(ellipse at 50% 45%, rgba(3, 18, 29, 0.93), rgba(1, 9, 16, 0.97) 78%);
  backdrop-filter: blur(10px) saturate(0.65);
  animation: scrim-in 600ms ease both;
}
.projection-exit {
  position: fixed;
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
.album-display-stage {
  position: relative;
  flex: none;
  width: min(1240px, calc(100% - 96px));
  margin: auto;
  padding: 88px 0 150px;
}
.song-projection {
  position: relative;
  z-index: 3;
  width: 100%;
  box-sizing: border-box;
  /* Preserve the short-album proportions as a minimum, never a height cap. */
  min-height: clamp(480px, calc(56.25vw - 54px), 697.5px);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  /* Clip the rounded artwork without creating a nested scroll container.
     A hidden overflow + contained overscroll traps mobile swipes here. */
  overflow: clip;
  border: 1px solid rgba(99, 164, 191, 0.4);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(10, 39, 57, 0.96), rgba(3, 19, 30, 0.97) 58%, rgba(8, 32, 46, 0.96));
  box-shadow: 0 24px 90px #0007, 0 0 42px #157ca018, inset 0 0 40px #5fc8ff0b;
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 400ms ease, transform 500ms cubic-bezier(.2, .8, .2, 1);
}
.projection-layout {
  flex: 1 0 auto;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(220px, 0.85fr) minmax(0, 1.15fr);
  gap: clamp(28px, 4vw, 56px);
  padding: clamp(28px, 3.5vw, 48px);
  align-items: start;
}
.song-projection::before {
  content: '';
  position: absolute;
  z-index: 1;
  inset: 0;
  pointer-events: none;
}
.song-projection::before {
  background:
    radial-gradient(ellipse at 0 0, #3aafea22, transparent 46%),
    linear-gradient(90deg, #04152214, #04152240 42%, #04152280 100%);
}
.song-projection > * { position: relative; z-index: 2; }
.song-projection > .projection-artwork {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
  opacity: 0.4;
  filter: saturate(0.65) brightness(1.1);
  pointer-events: none;
}
.song-projection-header,
.track-heading,
.song-projection-list,
.projection-message { position: relative; z-index: 1; }
.is-landed .song-projection { opacity: 1; transform: none; }
.album-cover-visual,
.album-inner-visual { transition: transform 520ms cubic-bezier(.2, .8, .2, 1), opacity 420ms ease; }
.song-projection-header {
  position: static;
  display: block;
  width: auto;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 0;
  background: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  text-align: left;
}
.song-projection-header h1 {
  margin: 0 0 8px;
  color: #f1f7fb;
  font-size: clamp(22px, 2vw, 30px);
  letter-spacing: 0.045em;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.song-projection-header p { margin: 0; color: #b4cfe0; font-size: 16px; line-height: 1.6; }
.album-cover-visual,
.album-inner-visual {
  position: relative;
  margin: 0;
  min-width: 0;
  min-height: 0;
  flex: none;
  overflow: hidden;
  border: 0;
  border-radius: 10px;
  background: transparent;
}
.album-cover-visual {
  width: min(100%, 240px);
  aspect-ratio: 1;
  border: 1px solid #8bb6c44d;
  border-radius: 14px;
  box-shadow: 0 14px 32px #0006, 0 0 22px #1b9bcd12;
}
.album-inner-visual {
  width: 100%;
  height: min(150px, 17dvh);
}
.album-cover-visual img,
.album-inner-visual img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.album-tagline {
  margin: 0;
  padding: 4px 0 4px 12px;
  border-left: 2px solid #719aae80;
  color: #bed5e3;
  font-size: 14px;
  line-height: 1.8;
  white-space: pre-line;
  overflow-wrap: anywhere;
}
.album-intro {
  margin: 0;
  color: #8eaabf; font-size: 14px; line-height: 1.8; white-space: pre-line;
  overflow-wrap: anywhere;
}
.projection-album-info {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  gap: 22px;
  justify-content: flex-start;
}
.projection-album-copy {
  display: flex;
  flex-direction: column;
  flex: none;
  gap: 16px;
}
.projection-album-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 20px;
  justify-content: flex-start;
}
.projection-tracks {
  flex: none;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  gap: 14px;
}
.projection-track-area {
  flex: none;
  min-height: 0;
  max-height: clamp(240px, calc(100dvh - 380px), 460px);
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #719aae80 transparent;
  scrollbar-gutter: stable;
  padding: 2px 4px 4px 2px;
}
.projection-track-search {
  flex: none;
  width: 100%;
  height: 42px;
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(3, 13, 22, 0.5);
  color: #e7f2f8;
  font: inherit;
}
.projection-track-search:focus-visible { outline: 2px solid #80b8d0; outline-offset: 2px; }
.compact-tracks .song-projection-list { gap: 12px; }
.compact-tracks .song-projection-row { height: 64px; padding: 6px 16px; border-radius: 12px; }
.compact-tracks .song-projection-play { min-height: 36px; }
.compact-tracks .song-projection-artist { font-size: 12px; }
.track-heading { flex: none; display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 0 4px 12px; border-bottom: 1px solid #4c8aa333; }
.track-heading::after { content: ''; position: absolute; bottom: -1px; left: 4px; width: 32px; height: 2px; background: #78a9bf99; }
.track-heading h2 { margin: 0; font-size: 23px; color: #f1f7fc; letter-spacing: 0.06em; }
.track-heading > span { color: #9dbccf; font-size: 13px; letter-spacing: 0.08em; }
.song-projection-list {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.song-projection-row {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) 96px 110px;
  grid-template-rows: auto auto;
  gap: 2px 12px;
  align-items: center;
  height: 84px;
  min-height: 0;
  padding: 12px 16px;
  border: 1px solid rgba(88, 156, 185, 0.36);
  border-radius: 15px;
  background: linear-gradient(110deg, rgba(9, 34, 49, 0.84), rgba(5, 24, 36, 0.64));
  box-shadow: 0 5px 14px rgba(0, 0, 0, 0.12);
  transition: background 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}
.song-projection-row:hover, .song-projection-row:focus-within {
  border-color: rgba(137, 192, 214, 0.48);
  background: rgba(22, 61, 78, 0.78);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
  transform: translateY(-1px);
}
.song-projection-row.is-current {
  border-color: #7dcdebb3;
  background: linear-gradient(110deg, #164b63ed, #0b2b40eb);
  box-shadow: inset 3px 0 0 #83d5ef, 0 4px 18px #05131b40;
}
.song-projection-row.is-current .song-projection-name { color: #effbff; }
.song-projection-row.is-current .song-projection-number { color: #a5e7ff; }
.song-projection-row.is-current .song-projection-waveform { opacity: 0.85; }
.song-projection-row.is-current .song-projection-waveform i { background: #94dcf2; }
.song-projection-row.is-current .song-projection-play {
  border-color: #9cdef2aa;
  background: #24617b;
  color: #f0fbff;
}
.song-projection-row.is-launching {
  position: relative;
  z-index: 3;
  border-color: rgba(126, 198, 255, 0.76);
  background: rgba(36, 91, 114, 0.88);
  box-shadow: 0 8px 22px rgba(34, 114, 150, 0.26);
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
.song-projection-number { color: #8db6cf; font: 14px monospace; }
.song-projection-name { color: #e7f2f8; font-size: 17px; font-weight: 650; line-height: 1.5; overflow-wrap: anywhere; }
.song-projection-artist { color: #a8c1cf; font-size: 13px; overflow-wrap: anywhere; }
.song-projection-name { grid-column: 2; grid-row: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-projection-artist { grid-column: 2; grid-row: 2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.song-projection-number { grid-column: 1; grid-row: 1 / span 2; }
.song-projection-waveform {
  grid-column: 3;
  grid-row: 1 / span 2;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 4px;
  height: 16px;
  opacity: 0.3;
}
.song-projection-waveform i {
  width: 2px;
  height: calc(var(--bar-height) * 0.7);
  background: #6295ab;
  border-radius: 2px;
}
.song-projection-play { grid-column: 4; grid-row: 1 / span 2; }
.song-projection-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 48px;
  border: 1px solid #6fabc580;
  border-radius: 10px;
  background: linear-gradient(135deg, #18425a, #123044);
  box-shadow: inset 0 1px 0 #b5e3f412;
  color: #f0faff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.song-projection-play > span { color: #bcefff; font-size: 25px; line-height: 1; }
.projection-message button {
  min-height: 44px; padding: 8px 14px; border: 1px solid #80b8d066;
  border-radius: 6px; background: #25475b; color: #edf7fc; font: inherit; cursor: pointer;
}
button:hover { background: #356580; }
button:focus-visible { outline: 2px solid #c1efff; outline-offset: 3px; }
.projection-message { padding: 28px 0; color: #b8ceda; }
.projection-player-stage {
  position: relative;
  flex-shrink: 0;
  z-index: 5;
  width: 100%;
  height: clamp(480px, 65dvh, 640px);
  margin: 0;
  box-sizing: border-box;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 24px;
  min-height: 0;
  padding: 28px clamp(28px, 3.5vw, 48px);
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: #04152270;
  /* Unmount immediately on return so the list and player never add heights. */
  animation: player-content-in 180ms ease;
}
@keyframes player-content-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.projection-player-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 46px;
  padding: 18px clamp(28px, 3.5vw, 48px);
  border-bottom: 1px solid rgba(137, 198, 218, 0.14);
  background: #04152299;
}
.projection-toolbar-actions { display: flex; align-items: center; gap: 8px; flex: none; }
.projection-player-toolbar-left {
  display: flex;
  flex: 1;
  align-items: center;
  min-width: 0;
  gap: 18px;
}
.projection-player-context,
.projection-player-status,
.projection-player-queue-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.projection-player-context { min-width: 0; gap: 14px; }
.projection-player-eyebrow {
  min-width: 0;
  overflow: hidden;
  color: #dcecf3;
  font-size: clamp(16px, 1.35vw, 20px);
  font-weight: 650;
  letter-spacing: 0.02em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.projection-player-status {
  color: #a8cbd9;
  font-size: 13px;
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
.projection-player-queue-toggle {
  flex: none;
  min-height: 36px;
  padding: 7px 11px;
  border: 1px solid rgba(125, 193, 216, 0.24);
  border-radius: 999px;
  background: rgba(23, 66, 83, 0.44);
  color: #d9edf7;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.projection-player-queue-toggle:hover { background: rgba(49, 111, 136, 0.62); }
.projection-player-queue-count {
  display: grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  border-radius: 50%;
  background: rgba(102, 186, 222, 0.22);
  color: #aee5fb;
  font-size: 10px;
}
.projection-player-body {
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  container-type: size;
  overflow: hidden;
  scrollbar-width: thin;
  scrollbar-color: rgba(126, 198, 255, 0.35) transparent;
}
.projection-player-body :deep(.embedded-player-view) {
  --record-size: min(280px, 30cqw, 44cqh);
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  grid-template-rows: minmax(0, 1fr);
  gap: clamp(28px, 4vw, 52px);
  align-items: stretch;
}
.projection-player-body :deep(.embedded-player-view .player-view-left) {
  grid-column: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  align-self: stretch;
  max-width: none;
  min-height: 0;
}
.projection-player-body :deep(.embedded-player-view .player-container) {
  display: flex;
  flex: none;
  transform-origin: center;
  flex-direction: column;
  justify-content: center;
  width: min(100%, 410px);
  max-width: 410px;
  margin: 0;
  padding: 0;
  background: transparent;
}
.projection-player-body :deep(.embedded-player-view .player-header) {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 0;
  text-align: center;
}
.projection-player-body :deep(.embedded-player-view .player-cover) {
  width: var(--record-size);
  height: var(--record-size);
  flex: none;
  aspect-ratio: 1;
  box-sizing: border-box;
  margin: 0 0 min(20px, 3cqh);
  padding: min(27px, 3cqw, 5cqh);
}
.projection-player-body :deep(.embedded-player-view .vinyl-tonearm) {
  display: block;
  top: calc(var(--record-size) * 0.08);
  left: calc(50% + var(--record-size) * 0.36);
  z-index: 2;
  height: calc(var(--record-size) * 0.46);
  transform: rotate(22deg);
}
.projection-player-body :deep(.embedded-player-view .vinyl-tonearm.playing) {
  transform: rotate(4deg);
}
.projection-player-body :deep(.embedded-player-view .player-info) {
  min-width: 0;
  text-align: center;
}
.projection-player-body :deep(.embedded-player-view .player-info h4) {
  margin: 0 0 min(8px, 1cqh);
  color: #f1f7fb;
  font-size: clamp(1.2rem, 3.6cqh, 1.8rem);
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.projection-player-body :deep(.embedded-player-view .player-info p) { margin: 0; font-size: 0.96rem; }
.projection-player-body :deep(.embedded-player-view .player-controls) {
  margin-top: min(22px, 3cqh);
  gap: min(15px, 2cqh);
}
.projection-player-body :deep(.embedded-player-view .controls-top) {
  justify-content: center;
  gap: min(12px, 1cqw);
}
.song-projection-play {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  white-space: nowrap;
  padding: 8px;
  font-size: 13px;
}
.projection-player-body :deep(.embedded-player-view .progress-container) { margin: 0; }
.projection-player-body :deep(.embedded-player-view .progress-time) { margin: -6px 0 4px; font-variant-numeric: tabular-nums; }
.projection-player-body :deep(.embedded-player-view .controls-bottom) {
  width: 100%;
  justify-content: flex-start;
}
.projection-player-body :deep(.embedded-player-view .character-ep-visual.expanded) {
  width: min(1180px, calc(100vw - 110px));
  max-width: none;
  height: auto;
  max-height: calc(100vh - 100px);
}
.projection-player-body :deep(.embedded-player-view .player-view-right) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  grid-column: 2;
  height: 100%;
  box-sizing: border-box;
  align-self: stretch;
  max-width: none;
  min-height: 0;
  overflow: hidden;
  justify-content: flex-start;
  gap: 20px;
  padding: 0 0 0 24px;
  border: none;
  border-left: 1px solid #89c6da24;
  border-radius: 0;
  background: transparent;
}
.projection-player-body :deep(.embedded-player-view .player-lyrics-panel) {
  min-height: 0;
  gap: min(12px, 2cqh);
}
.projection-player-body :deep(.embedded-player-view .player-view-right.has-video.has-lyrics) {
  grid-template-rows: auto auto;
  overflow: visible;
}
.projection-player-body :deep(.embedded-player-view .player-view-right:not(.has-lyrics) .player-visual-panel) {
  height: 100%;
  max-height: none;
  justify-content: center;
}
.projection-player-body :deep(.embedded-player-view .player-visual-panel) {
  display: flex;
  height: auto;
  max-height: none;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  margin: 0;
  gap: 8px;
}
.projection-player-body :deep(.embedded-player-view .character-ep-visual:not(.expanded)) {
  width: 100%;
  max-width: none;
  box-sizing: border-box;
  flex: none;
  min-height: 0;
  height: auto;
  aspect-ratio: 16 / 9;
  margin: 0;
}
.projection-player-body :deep(.embedded-player-view .lyrics-container) {
  flex: 1 1 0;
  box-sizing: border-box;
  height: auto;
  min-height: 0;
  max-height: none;
  padding: min(14px, 2cqh);
  border: 1px solid rgba(127, 181, 205, 0.16);
  background: rgba(5, 18, 29, 0.42);
}
.projection-player-body :deep(.embedded-player-view .lyrics-toolbar),
.projection-player-body :deep(.embedded-player-view .lyrics-translation-error) {
  flex: none;
}
.projection-player-body :deep(.embedded-player-view .no-lyrics) {
  min-height: 0;
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
  position: absolute;
  z-index: 2;
  right: clamp(18px, 2.4vw, 34px);
  bottom: clamp(18px, 2.4vw, 34px);
  left: clamp(18px, 2.4vw, 34px);
  max-height: min(260px, 35vh);
  padding: 14px;
  overflow-y: auto;
  border: 1px solid rgba(126, 198, 255, 0.3);
  border-radius: 12px;
  background: rgba(5, 24, 37, 0.96);
  box-shadow: 0 -12px 36px rgba(0, 0, 0, 0.28);
  backdrop-filter: blur(14px);
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
.projection-queue-drawer-enter-active,
.projection-queue-drawer-leave-active { transition: opacity 180ms ease, transform 240ms ease; }
.projection-queue-drawer-enter-from,
.projection-queue-drawer-leave-to { opacity: 0; transform: translateY(14px); }
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
  position: absolute; width: min(760px, 74vw); height: 260px;
  bottom: 50%; left: 50%; transform: translateX(-50%) scaleY(0);
  transform-origin: bottom center;
  background: linear-gradient(to top, #55caf350, #46b9ed1c 40%, #74c9e608 78%, transparent);
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
@media (max-width: 900px) {
  .projection-player-stage {
    width: 100%;
    height: auto;
    flex: none;
    display: flex;
    flex-direction: column;
    max-height: none;
    gap: 24px;
    padding: 20px;
    border-radius: 0;
    overflow: visible;
  }
  .projection-player-toolbar { flex: none; }
  .projection-player-body {
    flex: none;
    display: block;
    container-type: inline-size;
    overflow: visible;
  }
  .projection-player-body :deep(.embedded-player-view) {
    --record-size: clamp(160px, 44vw, 230px);
    display: flex;
    flex-direction: column;
    height: auto;
    min-height: 0;
    gap: 24px;
    align-items: stretch;
  }
  .projection-player-body :deep(.embedded-player-view .player-view-left) {
    flex: none;
    height: auto;
    align-items: stretch;
    justify-content: flex-start;
  }
  .projection-player-body :deep(.embedded-player-view .player-container) {
    width: 100%;
    max-width: 440px;
    margin: 0 auto;
  }
  .projection-player-body :deep(.embedded-player-view .player-header) {
    flex-direction: column;
    justify-content: center;
    gap: 20px;
  }
  .projection-player-body :deep(.embedded-player-view .player-cover) {
    margin: 0;
    padding: 20px;
    border-width: 5px;
  }
  .projection-player-body :deep(.embedded-player-view .player-info) {
    flex: 1;
    text-align: center;
  }
  .projection-player-body :deep(.embedded-player-view .player-info h4) { margin-bottom: 6px; font-size: 1.4rem; }
  .projection-player-body :deep(.embedded-player-view .player-info p) { font-size: 0.875rem; }
  .projection-player-body :deep(.embedded-player-view .player-controls) { margin-top: 20px; gap: 12px; }
  .projection-player-body :deep(.embedded-player-view .controls-top) {
    gap: clamp(0px, calc(20cqw - 55.2px), 8px);
  }
  .projection-player-body :deep(.embedded-player-view .progress-container) { margin: 12px 0 0; }
  .projection-player-body :deep(.embedded-player-view .progress-time) { margin-top: 0; }
  .projection-player-body :deep(.embedded-player-view .controls-bottom:empty) { display: none; }
  .projection-player-body :deep(.embedded-player-view .player-view-right),
  .projection-player-body :deep(.embedded-player-view .player-view-right.has-video.has-lyrics) {
    display: flex;
    flex-direction: column;
    gap: 16px;
    flex: none;
    width: 100%;
    height: auto;
    min-height: max-content;
    align-self: start;
    overflow: visible;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: none;
    box-sizing: border-box;
  }
  .projection-player-body :deep(.embedded-player-view .player-visual-panel),
  .projection-player-body :deep(.embedded-player-view .player-lyrics-panel) {
    display: flex;
    flex: none;
    flex-direction: column;
    height: auto;
    max-height: none;
    gap: 12px;
  }
  .projection-player-body :deep(.embedded-player-view .has-lyrics .character-ep-visual:not(.expanded)),
  .projection-player-body :deep(.embedded-player-view .character-ep-visual:not(.expanded)) {
    flex: none;
    width: 100%;
    height: auto;
    max-height: none;
    aspect-ratio: 16 / 9;
  }
  .projection-player-body :deep(.embedded-player-view .player-view-right:not(.has-lyrics) .player-visual-panel) {
    height: auto;
  }
  .projection-player-body :deep(.embedded-player-view .lyrics-container) {
    flex: none;
    height: clamp(280px, 40dvh, 380px);
    min-height: 280px;
    max-height: none;
    padding: 12px;
  }
  .projection-player-body :deep(.embedded-player-view .vinyl-tonearm) { display: none; }
  .projection-player-body :deep(.embedded-player-view.single-panel) { grid-template-rows: minmax(0, 1fr); }
  .projection-player-queue {
    position: static;
    flex: none;
    max-height: min(36dvh, 260px);
    padding: 10px;
    box-shadow: none;
  }
  .projection-player-queue-list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }
  .projection-player-queue-item { flex: none; }
}
@media (max-width: 900px) {
  .album-entry-transition { --dock-size: min(160px, 40vw); --dock-bottom: 28px; }
  /* The entrance is viewport-based; the album below can be arbitrarily tall. */
  .record-dock {
    position: fixed;
    top: calc(50dvh - var(--dock-size) / 2);
    left: calc(50% - var(--dock-size) / 2);
  }
  .record-tilt { transform: scaleY(1); }
  .album-display-stage {
    width: min(720px, calc(100% - 32px));
    margin: 0 auto;
    padding: max(76px, calc(env(safe-area-inset-top) + 60px)) 0 max(24px, env(safe-area-inset-bottom));
  }
  .projection-exit { left: max(12px, env(safe-area-inset-left)); }
  .is-landed .record-dock, .projection-beam { display: none; }
  .song-projection {
    min-height: 0;
    aspect-ratio: auto;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    transform: translateY(12px);
  }
  .song-projection::before { display: none; }
  .song-projection > .projection-artwork {
    position: relative;
    inset: auto;
    display: block;
    height: auto;
    flex: none;
    opacity: 1;
    filter: none;
    border-bottom: 1px solid #78a9bf26;
  }
  .projection-layout {
    display: flex;
    flex-direction: column;
    padding: 24px;
    gap: 28px;
    align-items: stretch;
  }
  .is-landed .song-projection { transform: none; }
  .projection-album-info { flex: none; }
  .projection-player-status { display: none; }
  .projection-player-toolbar { min-height: 44px; gap: 12px; padding: 16px 20px; flex-wrap: wrap; }
  .projection-player-eyebrow { font-size: 12px; }
  .projection-player-queue-toggle { min-height: 32px; padding: 6px 9px; }
  .projection-player-queue-toggle > span:not(.projection-player-queue-count) { display: none; }
  .projection-album-info { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 20px; align-items: start; }
  .album-cover-visual { width: clamp(80px, 18vw, 128px); border-radius: 10px; }
  .projection-album-copy { gap: 10px; }
  .projection-album-content { gap: 14px; }
  .album-inner-visual { height: min(90px, 12dvh); }
  .album-intro, .album-tagline { font-size: 13px; line-height: 1.8; }
  .song-projection-header p { font-size: 13px; }
  .track-heading h2 { font-size: 19px; }
  .song-projection-row { grid-template-columns: 24px minmax(0, 1fr) 72px; gap: 4px 10px; }
  .song-projection-name { font-size: 14px; }
  .song-projection-artist { grid-column: 2; grid-row: 2; font-size: 12px; }
  .song-projection-number, .song-projection-play { grid-row: 1 / span 2; }
  .song-projection-play { grid-column: 3; padding: 8px; font-size: 12px; }
  .song-projection-waveform { display: none; }
  .song-projection-row, .compact-tracks .song-projection-row { min-height: 76px; height: auto; padding: 10px; }
}
@media (max-width: 480px) {
  .projection-player-stage { padding: 16px; }
  .projection-player-body :deep(.embedded-player-view .control-btn) {
    width: 40px; min-width: 40px; max-width: 40px;
    height: 44px; min-height: 44px; max-height: 44px;
  }
  .projection-player-body :deep(.embedded-player-view .control-btn.play-pause) {
    width: 52px; min-width: 52px; max-width: 52px;
    height: 52px; min-height: 52px; max-height: 52px;
  }
  .album-display-stage { width: calc(100% - 24px); }
  .song-projection { border-radius: 16px; }
  .projection-layout { padding: 20px 16px; gap: 24px; }
  .projection-album-info { gap: 14px; }
  .song-projection-header h1 { font-size: 21px; }
  .song-projection-header p { font-size: 12px; }
  .song-projection-play { gap: 6px; }
}
/* Let the video and readable lyrics determine the panel height together.
   Size containment here would otherwise force them to share a fixed height. */
@media (min-width: 901px) {
  .projection-player-stage:has(.has-video.has-lyrics) {
    height: auto;
  }
  .projection-player-body:has(.has-video.has-lyrics) {
    container-type: inline-size;
    overflow: visible;
  }
  .projection-player-body :deep(.embedded-player-view:has(.has-video.has-lyrics)) {
    --record-size: clamp(220px, 26cqw, 280px);
    height: auto;
  }
  .projection-player-body :deep(.embedded-player-view .player-view-right.has-video.has-lyrics) {
    height: auto;
    gap: 24px;
  }
  .projection-player-body :deep(.embedded-player-view .has-video.has-lyrics .lyrics-container) {
    flex: none;
    height: clamp(300px, 40dvh, 400px);
  }
}
@media (min-width: 901px) and (max-width: 1150px) {
  .song-projection-row { grid-template-columns: 26px minmax(0, 1fr) 92px; gap: 2px 10px; }
  .song-projection-waveform { display: none; }
  .song-projection-play { grid-column: 3; }
  .song-projection-name { font-size: 15px; }
}
@media (min-width: 901px) and (max-height: 600px) {
  .projection-player-toolbar { min-height: 30px; padding-bottom: 6px; }
  .projection-player-body :deep(.embedded-player-view) { gap: 12px; }
  .projection-player-body :deep(.embedded-player-view .player-info p) { font-size: 0.8rem; }
  .projection-player-body :deep(.embedded-player-view .control-btn) {
    width: 32px;
    min-width: 32px;
    max-width: 32px;
    height: 32px;
    min-height: 32px;
    max-height: 32px;
    font-size: 1rem;
  }
  .projection-player-body :deep(.embedded-player-view .control-btn.play-pause) {
    width: 40px;
    min-width: 40px;
    max-width: 40px;
    height: 40px;
    min-height: 40px;
    max-height: 40px;
  }
}
@media (min-width: 901px) and (max-height: 650px) {
  .album-display-stage { padding: 76px 0 28px; }
  .is-landed .record-dock, .projection-beam { display: none; }
}
@media (max-height: 520px) {
  .album-entry-transition { --dock-size: 140px; --dock-bottom: 24px; }
  .song-projection-header h1 { font-size: 20px; margin-bottom: 4px; }
  .album-intro { font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
  .source-sleeve { display: none; }
}
</style>

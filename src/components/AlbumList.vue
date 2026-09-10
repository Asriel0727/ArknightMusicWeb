<template>
  <main class="album-list-main" :key="locale">
    <h1 class="page-title">{{ t('album.pageTitle') }}</h1>
    <div v-if="albumState.isLoading && !albumState.isInitialFetchDone" class="loading-spinner">
      <div class="spinner"></div>
      <p>{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="displayAlbums.length === 0" class="no-results">
      <p>{{ t('album.noResults') }}</p>
    </div>
    <div v-else class="album-list-stage">
      <section
        ref="containerRef"
        class="albums-container"
        :class="{ 'is-dragging': isDragging }"
        :style="parallaxStyle"
        :aria-label="t('album.pageTitle')"
        tabindex="0"
        @keydown.left.prevent="showPreviousAlbum"
        @keydown.right.prevent="showNextAlbum"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @pointerleave="handlePointerLeave"
        @dragstart.prevent
        @wheel="handleRackWheel"
      >
        <Transition name="ambient-fade" mode="out-in">
          <div
            v-if="activeAlbum"
            :key="activeAlbum.cid"
            class="album-ambient"
            :style="getAmbientStyle(activeAlbum)"
            aria-hidden="true"
          ></div>
        </Transition>
        <div class="rack-floor" aria-hidden="true"></div>
        <div v-if="showInteractionHint" class="interaction-hint" role="status">
          <span class="interaction-hint-arrow interaction-hint-arrow-left" aria-hidden="true">←</span>
          <span class="interaction-hint-copy">
            {{ isTouchDevice ? t('album.touchHint') : t('album.dragHint') }}
          </span>
          <span class="interaction-hint-arrow interaction-hint-arrow-right" aria-hidden="true">→</span>
          <button
            type="button"
            class="interaction-hint-dismiss"
            :aria-label="t('album.dismissHint')"
            @pointerdown.stop
            @click="dismissInteractionHint"
          >
            ×
          </button>
        </div>
        <div
          v-for="item in visibleAlbums"
          :key="item.album.cid"
          class="album-slot"
          :data-album-id="item.album.cid"
          :class="{
            'is-active': item.slotOffset === 0,
          }"
          :style="getAlbumStyle(item.slotOffset)"
          @click="handleAlbumClick(item.index, $event)"
          @pointerenter="handlePreloadAlbum(item.album)"
        >
          <div v-if="item.slotOffset === 0" class="vinyl-record" aria-hidden="true">
            <VinylDisc :cover="getProxyImageUrl(item.album.coverUrl)" />
          </div>
          <AlbumCard
            :key="item.album.cid"
            :album="item.album"
            :active="item.slotOffset === 0"
            :track-count="getAlbumTrackCount(item.album)"
            :track-count-loading="isAlbumTrackCountLoading(item.album)"
            @view-album="(id, event) => handleViewAlbum(id, event)"
            @preload-album="handlePreloadAlbum"
          />
        </div>

        <div class="rack-controls" :aria-label="t('album.pageTitle')">
          <button
            type="button"
            class="rack-arrow"
            :disabled="displayAlbums.length <= 1"
            :aria-label="t('album.prevPage')"
            @click="showPreviousAlbum"
          >
            <span aria-hidden="true">←</span>
          </button>
          <div class="rack-position" aria-live="polite">
            <span>{{ activeAlbumIndex + 1 }}</span>
            <span class="rack-position-divider">/</span>
            <span>{{ displayAlbums.length }}</span>
          </div>
          <button
            type="button"
            class="rack-arrow"
            :disabled="displayAlbums.length <= 1"
            :aria-label="t('album.nextPage')"
            @click="showNextAlbum"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import AlbumCard from './AlbumCard.vue';
import VinylDisc from './VinylDisc.vue';
import { albumState, searchState } from '../stores/player.js';
import { fetchAlbumDetails, fetchAlbums, getProxyImageUrl, searchMusic } from '../services/api.js';

const { t, locale } = useI18n();
const containerRef = ref(null);
const windowWidth = ref(window.innerWidth);
const activeAlbumIndex = ref(0);
const isDragging = ref(false);
const dragOffset = ref(0);
const dragVelocity = ref(0);
const dragRotation = ref(0);
const parallaxX = ref(0);
const parallaxY = ref(0);
const suppressAlbumClick = ref(false);
const showInteractionHint = ref(false);
const albumTrackCounts = ref({});
const albumTrackLoading = ref({});
const albumTrackRequests = new Map();
let pointerStartX = 0;
let pointerOriginX = 0;
let lastPointerX = 0;
let lastPointerAt = 0;
let lastRackWheelAt = 0;
let releaseFrame = null;
let interactionHintTimer = null;
let slideAudioContext = null;
let slideAudioGain = null;
let searchRequestToken = 0;
let clickResetTimer = null;

const RACK_WHEEL_COOLDOWN_MS = 280;
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

const playAlbumSlideSound = (direction = 1) => {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    if (!slideAudioContext) {
      slideAudioContext = new AudioContextConstructor();
      slideAudioGain = slideAudioContext.createGain();
      slideAudioGain.gain.value = isTouchDevice ? 0.035 : 0.05;
      slideAudioGain.connect(slideAudioContext.destination);
    }

    if (slideAudioContext.state === 'suspended') {
      void slideAudioContext.resume().catch(() => {});
    }

    const now = slideAudioContext.currentTime;
    const click = slideAudioContext.createOscillator();
    const clickGain = slideAudioContext.createGain();
    const body = slideAudioContext.createOscillator();
    const bodyGain = slideAudioContext.createGain();
    const pitch = direction > 0 ? 1760 : 1580;

    // A short high-frequency square pulse gives the carousel a crisp, mechanical "ka".
    click.type = 'square';
    click.frequency.setValueAtTime(pitch, now);
    click.frequency.exponentialRampToValueAtTime(pitch * 0.58, now + 0.026);
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.42, now + 0.001);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

    // A subtle, equally brief lower transient keeps the click tactile without becoming boomy.
    body.type = 'triangle';
    body.frequency.setValueAtTime(direction > 0 ? 520 : 470, now);
    body.frequency.exponentialRampToValueAtTime(260, now + 0.032);
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.18, now + 0.002);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    click.connect(clickGain);
    clickGain.connect(slideAudioGain);
    body.connect(bodyGain);
    bodyGain.connect(slideAudioGain);
    click.start(now);
    body.start(now);
    click.stop(now + 0.045);
    body.stop(now + 0.05);
    click.onended = () => { click.disconnect(); clickGain.disconnect(); };
    body.onended = () => { body.disconnect(); bodyGain.disconnect(); };
  } catch (error) {
    // Audio feedback is optional and must never interrupt album navigation.
    console.debug('Album slide sound unavailable:', error);
  }
};

// 專輯資料只保留一份完整列表；唱片架只渲染目前位置附近的卡片。
const displayAlbums = computed(() => {
  return searchState.query ? searchState.filteredAlbums : albumState.allAlbums;
});

const visibleAlbumRadius = computed(() => {
  const width = windowWidth.value;
  return Math.max(2, Math.min(4, Math.round(width / 320)));
});

const visibleAlbumCount = computed(() => visibleAlbumRadius.value * 2 + 1);

const activeAlbum = computed(() => {
  return displayAlbums.value[activeAlbumIndex.value] || null;
});

const parallaxStyle = computed(() => ({
  '--ambient-parallax-x': `${parallaxX.value * 0.32}px`,
  '--ambient-parallax-y': `${parallaxY.value * 0.32}px`,
}));

const visibleAlbums = computed(() => {
  const total = displayAlbums.value.length;
  if (total === 0) return [];

  const visibleCount = Math.min(total, visibleAlbumCount.value);
  const offsets = Array.from(
    { length: visibleCount },
    (_, position) => position - Math.floor(visibleCount / 2),
  );

  return offsets.map((slotOffset) => {
    const index = (activeAlbumIndex.value + slotOffset + total) % total;
    return {
      album: displayAlbums.value[index],
      index,
      slotOffset,
    };
  });
});

const getAlbumStep = () => {
  const width = windowWidth.value;
  return width <= 600
    ? 82
    : width <= 900
      ? Math.min(136, Math.max(86, width * 0.15))
      : width >= 1400
        ? Math.min(250, Math.max(132, width * 0.1))
        : Math.min(196, Math.max(108, width * 0.135));
};

const getAlbumStyle = (slotOffset) => {
  const offset = slotOffset;
  const distance = Math.abs(offset);
  const albumStep = getAlbumStep();
  const parallaxStrength = 0.62 + Math.min(distance, 4) * 0.12;

  return {
    '--album-offset': offset,
    '--album-x': `${offset * albumStep + dragOffset.value}px`,
    '--album-depth': `${Math.max(-520, -distance * 68)}px`,
    '--album-scale': Math.max(0.58, 1 - distance * 0.075),
    '--album-rotate': `${Math.sign(offset) * -Math.min(64, distance * 23)}deg`,
    '--album-drag-rotate': `${dragRotation.value}deg`,
    '--album-parallax-x': `${parallaxX.value * parallaxStrength}px`,
    '--album-parallax-y': `${parallaxY.value * (0.5 + Math.min(distance, 4) * 0.08)}px`,
    '--vinyl-parallax-x': `${parallaxX.value * (0.8 + Math.min(distance, 4) * 0.1)}px`,
    '--vinyl-parallax-y': `${parallaxY.value * (0.65 + Math.min(distance, 4) * 0.08)}px`,
    '--album-opacity': 1,
    '--album-brightness': Math.max(0.58, 1 - distance * 0.1),
    zIndex: 100 - Math.round(distance),
    pointerEvents: distance > 5 ? 'none' : 'auto',
  };
};

const moveAlbum = (direction) => {
  const total = displayAlbums.value.length;
  if (total <= 1) return;
  dismissInteractionHint();

  playAlbumSlideSound(direction);
  activeAlbumIndex.value = (activeAlbumIndex.value + direction + total) % total;
  preloadAlbumImages([
    displayAlbums.value[activeAlbumIndex.value],
    displayAlbums.value[(activeAlbumIndex.value + direction + total) % total],
  ].filter(Boolean), true, 'high');
};

const showPreviousAlbum = () => moveAlbum(-1);
const showNextAlbum = () => moveAlbum(1);

const handleAlbumClick = (index, event) => {
  if (suppressAlbumClick.value) {
    suppressAlbumClick.value = false;
    return;
  }
  if (event.target.closest('button')) return;

  if (index !== activeAlbumIndex.value) {
    playAlbumSlideSound(index > activeAlbumIndex.value ? 1 : -1);
    activeAlbumIndex.value = index;
  }
};

const updateParallax = (event) => {
  if (isTouchDevice || !containerRef.value) return;

  const rect = containerRef.value.getBoundingClientRect();
  const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
  const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));

  parallaxX.value = normalizedX * 18;
  parallaxY.value = normalizedY * 12;
};

const handlePointerLeave = () => {
  if (isDragging.value) return;
  parallaxX.value = 0;
  parallaxY.value = 0;
};

const handlePointerDown = (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest('button')) return;

  if (releaseFrame !== null) {
    cancelAnimationFrame(releaseFrame);
    releaseFrame = null;
  }
  pointerOriginX = event.clientX;
  pointerStartX = event.clientX;
  lastPointerX = event.clientX;
  lastPointerAt = performance.now();
  dragOffset.value = 0;
  dragVelocity.value = 0;
  dragRotation.value = 0;
  suppressAlbumClick.value = false;
  isDragging.value = true;
  containerRef.value?.setPointerCapture?.(event.pointerId);
};

const handlePointerMove = (event) => {
  updateParallax(event);
  if (!isDragging.value) return;

  const now = performance.now();
  const elapsed = Math.max(8, now - lastPointerAt);
  const deltaX = event.clientX - lastPointerX;
  const instantVelocity = deltaX / elapsed;
  const albumStep = getAlbumStep();
  const turnThreshold = albumStep * 0.5;

  if (Math.abs(event.clientX - pointerOriginX) >= 8) {
    suppressAlbumClick.value = true;
  }

  let currentOffset = event.clientX - pointerStartX;
  while (currentOffset <= -turnThreshold) {
    moveAlbum(1);
    pointerStartX -= albumStep;
    currentOffset = event.clientX - pointerStartX;
  }
  while (currentOffset >= turnThreshold) {
    moveAlbum(-1);
    pointerStartX += albumStep;
    currentOffset = event.clientX - pointerStartX;
  }

  dragOffset.value = currentOffset;
  dragVelocity.value = dragVelocity.value * 0.65 + instantVelocity * 0.35;
  dragRotation.value = Math.max(-12, Math.min(12, -dragVelocity.value * 3.2));
  lastPointerX = event.clientX;
  lastPointerAt = now;
};

const handlePointerUp = () => {
  if (!isDragging.value) return;

  const albumStep = getAlbumStep();
  const releaseNudge = Math.max(
    -albumStep * 0.12,
    Math.min(albumStep * 0.12, dragVelocity.value * 48),
  );
  const releaseRotation = Math.max(-8, Math.min(8, -dragVelocity.value * 2.4));

  isDragging.value = false;
  suppressAlbumClick.value = suppressAlbumClick.value || Math.abs(dragOffset.value) >= 8;
  dragOffset.value = Math.max(
    -albumStep * 0.5,
    Math.min(albumStep * 0.5, dragOffset.value + releaseNudge),
  );
  dragRotation.value = releaseRotation;
  releaseFrame = requestAnimationFrame(() => {
    dragOffset.value = 0;
    dragRotation.value = 0;
    releaseFrame = null;
  });
  // Suppress only the click generated by this drag, not the next deliberate tap.
  window.clearTimeout(clickResetTimer);
  clickResetTimer = window.setTimeout(() => { suppressAlbumClick.value = false; }, 0);
};

const getAmbientStyle = (album) => {
  if (!album?.coverUrl) return {};
  const imageUrl = getProxyImageUrl(album.coverUrl);
  return {
    backgroundImage: `url(${JSON.stringify(imageUrl)})`,
  };
};

const handleRackWheel = (event) => {
  const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.shiftKey
      ? event.deltaY
      : 0;

  if (Math.abs(horizontalDelta) < 8) return;

  event.preventDefault();
  event.stopPropagation();

  const now = Date.now();
  if (now - lastRackWheelAt < RACK_WHEEL_COOLDOWN_MS) return;
  lastRackWheelAt = now;

  if (horizontalDelta > 0) {
    showNextAlbum();
  } else {
    showPreviousAlbum();
  }
};

const preloadImage = (url, priority = 'low') => {
  if (!url) return;
  const img = new Image();
  img.decoding = 'async';
  img.fetchPriority = priority;
  img.src = getProxyImageUrl(url);
};

const preloadAlbumImages = (albums, includeVisual = true, priority = 'low') => {
  albums.forEach((album) => {
    preloadImage(album.coverUrl);
    if (includeVisual) {
      preloadImage(album.coverDeUrl, priority);
    }
  });
};

const preloadAlbumsAroundActive = (radius = visibleAlbumRadius.value, priority = 'low') => {
  const total = displayAlbums.value.length;
  if (total === 0) return;

  const albums = new Set();
  for (let offset = -radius; offset <= radius; offset += 1) {
    const index = (activeAlbumIndex.value + offset + total) % total;
    albums.add(displayAlbums.value[index]);
  }

  preloadAlbumImages([...albums], !isTouchDevice, priority);
};

// 監聽窗口大小變化
const handleResize = () => {
  windowWidth.value = window.innerWidth;
};

// 初始化專輯列表
const initializeAlbums = async () => {
  if (albumState.isInitialFetchDone) {
    initializeInteractionHint();
    return;
  }
  
  albumState.isLoading = true;
  
  try {
    const albums = await fetchAlbums();
    albumState.allAlbums = albums;
    albumState.isInitialFetchDone = true;
    preloadAlbumsAroundActive();
    initializeInteractionHint();
  } catch (error) {
    console.error('Error initializing albums:', error);
  } finally {
    albumState.isLoading = false;
  }
};

// 處理搜索
const handleSearch = async (query) => {
  const token = ++searchRequestToken;
  if (!query) {
    searchState.query = '';
    searchState.filteredAlbums = [];
    activeAlbumIndex.value = 0;
    return;
  }
  
  searchState.query = query;

  try {
    const result = await searchMusic(query);
    if (token !== searchRequestToken) return;
    searchState.filteredAlbums = result.albums || [];
  } catch (error) {
    if (token !== searchRequestToken) return;
    console.warn('Backend search failed, fallback to local search:', error);
    searchState.filteredAlbums = albumState.allAlbums.filter(album => {
      const nameMatch = album.name.toLowerCase().includes(query.toLowerCase());
      const artistMatch = (album.artistes || []).join(', ').toLowerCase().includes(query.toLowerCase());
      return nameMatch || artistMatch;
    });
  }
  
};

const emit = defineEmits(['view-album']);

// 查看專輯
const handleViewAlbum = async (albumId, event) => {
  if (suppressAlbumClick.value) return;
  const slot = event?.currentTarget?.closest('.album-slot');
  // Measure the actual record and cover, so opening continues from the visible sleeve.
  const rectData = (element) => {
    if (!element) return null;
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  };
  if (slot && !slot.classList.contains('is-active')) {
    activeAlbumIndex.value = displayAlbums.value.findIndex(album => String(album.cid) === String(albumId));
    await nextTick();
    return;
  }
  emit('view-album', albumId, {
    disc: rectData(slot?.querySelector('.vinyl-record')),
    cover: rectData(slot?.querySelector('.album > img')),
  });
};

const getTrackCountFromAlbum = (album) => {
  if (Array.isArray(album?.songs)) return album.songs.length;

  const rawCount = album?.trackCount ?? album?.songCount ?? album?.song_count;
  if (rawCount === null || rawCount === undefined || rawCount === '') return null;

  const count = Number(rawCount);
  return Number.isFinite(count) ? count : null;
};

const getAlbumTrackCount = (album) => {
  const embeddedCount = getTrackCountFromAlbum(album);
  if (embeddedCount !== null) return embeddedCount;

  const cid = String(album?.cid || '');
  return cid && Object.hasOwn(albumTrackCounts.value, cid)
    ? albumTrackCounts.value[cid]
    : null;
};

const isAlbumTrackCountLoading = (album) => {
  const cid = String(album?.cid || '');
  return Boolean(cid && albumTrackLoading.value[cid]);
};

const loadAlbumTrackCount = async (album) => {
  const cid = String(album?.cid || '');
  if (!cid || getAlbumTrackCount(album) !== null) return;

  const pendingRequest = albumTrackRequests.get(cid);
  if (pendingRequest) return pendingRequest;

  albumTrackLoading.value = { ...albumTrackLoading.value, [cid]: true };
  const request = fetchAlbumDetails(cid)
    .then((details) => {
      const detailAlbum = details?.data && !Array.isArray(details.data) ? details.data : details;
      const count = getTrackCountFromAlbum(detailAlbum);
      if (count !== null) {
        albumTrackCounts.value = { ...albumTrackCounts.value, [cid]: count };
      }
    })
    .catch((error) => {
      console.debug('Album track count lookup failed:', cid, error);
    })
    .finally(() => {
      const nextLoading = { ...albumTrackLoading.value };
      delete nextLoading[cid];
      albumTrackLoading.value = nextLoading;
      albumTrackRequests.delete(cid);
    });

  albumTrackRequests.set(cid, request);
  return request;
};

const handlePreloadAlbum = (album) => {
  if (!album) return;
  preloadImage(album.coverDeUrl, 'high');
  loadAlbumTrackCount(album);
};

watch(displayAlbums, () => {
  activeAlbumIndex.value = 0;
  dragOffset.value = 0;
  dragVelocity.value = 0;
  dragRotation.value = 0;
  isDragging.value = false;
  suppressAlbumClick.value = false;
  preloadAlbumsAroundActive();
}, { flush: 'post' });

watch(visibleAlbumRadius, () => {
  dragOffset.value = 0;
  dragRotation.value = 0;
  preloadAlbumsAroundActive();
});

const dismissInteractionHint = () => {
  showInteractionHint.value = false;
  if (interactionHintTimer !== null) {
    window.clearTimeout(interactionHintTimer);
    interactionHintTimer = null;
  }
};

const initializeInteractionHint = () => {
  showInteractionHint.value = true;
  interactionHintTimer = window.setTimeout(dismissInteractionHint, 12000);
};

onMounted(() => {
  initializeAlbums();
  window.addEventListener('resize', handleResize);
  // 初始計算一次
  handleResize();
});

watch(locale, async () => {
  if (!albumState.isInitialFetchDone) return;
  albumState.isLoading = true;
  try {
    albumState.allAlbums = await fetchAlbums();
    searchState.query = '';
    searchState.filteredAlbums = [];
    albumState.currentAlbumDetails = null;
  } catch (e) {
    console.error('Refetch albums after locale change failed:', e);
  } finally {
    albumState.isLoading = false;
  }
});

onUnmounted(() => {
  window.clearTimeout(clickResetTimer);
  if (releaseFrame !== null) {
    cancelAnimationFrame(releaseFrame);
  }
  if (interactionHintTimer !== null) {
    window.clearTimeout(interactionHintTimer);
  }
  window.removeEventListener('resize', handleResize);
  if (slideAudioContext) {
    void slideAudioContext.close();
  }
});

// 暴露搜索處理函數給父組件
defineExpose({
  handleSearch
});
</script>

<style scoped>
main {
  --rack-card-width: clamp(230px, 22vw, 340px);
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 20px;
  width: 100%;
  max-width: 1800px;
  margin: 0 auto;
}

main .page-title {
  margin: 0 0 16px 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-color);
}

.album-list-stage {
  flex: 1;
  display: flex;
  min-height: 0;
}

.albums-container {
  position: relative;
  flex: 1;
  min-height: max(calc(var(--rack-card-width) + 220px), calc(100dvh - 370px));
  margin: 12px -20px 0;
  overflow: hidden;
  isolation: isolate;
  perspective: 1300px;
  perspective-origin: center 42%;
  touch-action: pan-y;
  outline: none;
  cursor: grab;
  user-select: none;
}

.albums-container::before {
  content: '';
  position: absolute;
  z-index: 0;
  top: 5%;
  left: 50%;
  width: min(900px, 88%);
  height: 78%;
  background: linear-gradient(to top, rgba(122, 211, 255, 0.16), rgba(122, 211, 255, 0.045) 54%, transparent 86%);
  clip-path: polygon(40% 100%, 60% 100%, 76% 0, 24% 0);
  filter: blur(3px);
  opacity: 0.8;
  pointer-events: none;
  transform: translateX(-50%);
}

.albums-container:focus-visible {
  box-shadow: 0 0 0 2px var(--primary-color), 0 0 0 6px rgba(88, 166, 255, 0.2);
  border-radius: 16px;
}

.albums-container.is-dragging {
  cursor: grabbing;
}

.album-slot {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--rack-card-width);
  height: calc(var(--rack-card-width) + 160px);
  opacity: var(--album-opacity);
  filter: brightness(var(--album-brightness));
  transform: translate3d(
      calc(-50% + var(--album-x) + var(--album-parallax-x)),
      calc(-50% + var(--album-parallax-y)),
      var(--album-depth)
    )
    rotateY(var(--album-rotate))
    scale(var(--album-scale))
    rotateZ(var(--album-drag-rotate));
  transform-style: preserve-3d;
  transform-origin: center bottom;
  transition: transform 480ms cubic-bezier(0.16, 1.08, 0.3, 1), opacity 320ms ease;
  will-change: transform, opacity;
}

.albums-container.is-dragging .album-slot {
  transition: none;
}

.album-ambient {
  position: absolute;
  z-index: 0;
  inset: 8% 10% 18%;
  border-radius: 50%;
  background-position: center;
  background-size: cover;
  filter: blur(42px) saturate(1.45);
  opacity: 0.13;
  pointer-events: none;
  transform: translate3d(var(--ambient-parallax-x), var(--ambient-parallax-y), 0) scale(1.12);
}

.ambient-fade-enter-active,
.ambient-fade-leave-active {
  transition: opacity 520ms ease;
}

.ambient-fade-enter-from,
.ambient-fade-leave-to {
  opacity: 0;
}

.interaction-hint {
  position: absolute;
  z-index: 220;
  top: 10px;
  left: 50%;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  max-width: calc(100% - 32px);
  padding: 9px 12px;
  border: 1px solid rgba(151, 215, 255, 0.52);
  border-radius: 999px;
  background: rgba(8, 20, 32, 0.78);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28), 0 0 24px rgba(88, 166, 255, 0.18);
  color: rgba(235, 247, 255, 0.98);
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.2;
  pointer-events: none;
  transform: translateX(-50%);
  animation: interaction-hint-in 360ms ease both;
}

.interaction-hint-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 29px;
  height: 29px;
  border: 1px solid rgba(167, 220, 255, 0.6);
  border-radius: 50%;
  background: rgba(110, 190, 255, 0.12);
  color: rgba(213, 241, 255, 0.96);
  font-size: 1.25rem;
  font-weight: 500;
  line-height: 1;
  text-shadow: 0 0 10px rgba(105, 184, 255, 0.7);
}

.interaction-hint-arrow-left {
  animation: interaction-hint-arrow-left 1.8s ease-in-out infinite;
}

.interaction-hint-arrow-right {
  animation: interaction-hint-arrow-right 1.8s ease-in-out infinite;
}

.interaction-hint-copy {
  white-space: nowrap;
}

.interaction-hint-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin: -2px -4px -2px 0;
  border: 0;
  border-radius: 50%;
  background: rgba(126, 198, 255, 0.12);
  color: inherit;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  pointer-events: auto;
}

.interaction-hint-dismiss:hover {
  background: rgba(126, 198, 255, 0.28);
}

@keyframes interaction-hint-in {
  from {
    opacity: 0;
    transform: translate(-50%, 8px);
  }

  to {
    opacity: 1;
    transform: translate(-50%, 0);
  }
}

@keyframes interaction-hint-arrow-left {
  0%,
  100% {
    opacity: 0.3;
    transform: translateX(3px);
  }

  50% {
    opacity: 0.8;
    transform: translateX(-3px);
  }
}

@keyframes interaction-hint-arrow-right {
  0%,
  100% {
    opacity: 0.3;
    transform: translateX(-3px);
  }

  50% {
    opacity: 0.8;
    transform: translateX(3px);
  }
}

.album-slot::before {
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

.album-slot::after {
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

.vinyl-record {
  position: absolute;
  z-index: 1;
  top: 24px;
  right: -24%;
  width: 88%;
  aspect-ratio: 1;
  opacity: 1;
  pointer-events: none;
}

.album-slot.is-active {
  filter: saturate(1.08) brightness(1.04);
}

.album-slot :deep(.album) {
  position: relative;
  z-index: 2;
  width: 100%;
  min-height: 100%;
  padding: 10px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(88, 166, 255, 0.05);
  background: linear-gradient(145deg, rgba(20, 49, 64, 0.72), rgba(7, 18, 28, 0.82));
  backdrop-filter: blur(8px) saturate(1.08);
  transition: box-shadow 260ms ease, border-color 260ms ease;
}

.album-slot :deep(.album)::before {
  content: '';
  position: absolute;
  z-index: 3;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: inherit;
  box-shadow: inset 0 0 18px rgba(88, 166, 255, 0.06);
  pointer-events: none;
}

.album-slot :deep(.album)::after {
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

.album-slot.is-active :deep(.album) {
  border-color: rgba(88, 166, 255, 0.5);
  background: linear-gradient(145deg, rgba(19, 56, 75, 0.78), rgba(7, 21, 33, 0.88));
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.48), 0 0 30px rgba(88, 166, 255, 0.16);
}

.album-slot.is-active :deep(.album)::before {
  border-color: rgba(126, 198, 255, 0.76);
  box-shadow:
    inset 0 0 22px rgba(88, 166, 255, 0.18),
    0 0 18px rgba(88, 166, 255, 0.28);
}

.album-slot:hover :deep(.album)::after {
  opacity: 0.48;
  transform: translateX(285%) skewX(-16deg);
  transition: transform 720ms ease, opacity 180ms ease;
}

.album-slot.is-active :deep(.album)::after {
  animation: none;
}

@keyframes album-sheen {
  0%,
  55% {
    opacity: 0;
    transform: translateX(0) skewX(-16deg);
  }

  65% {
    opacity: 0.42;
  }

  82%,
  100% {
    opacity: 0;
    transform: translateX(285%) skewX(-16deg);
  }
}

.album-slot :deep(.album:hover) {
  transform: none;
}

.album-slot :deep(.album img) {
  height: auto;
  aspect-ratio: 1;
  flex-shrink: 0;
  margin-bottom: 10px;
  border-radius: 8px;
  -webkit-user-drag: none;
  user-select: none;
}

.album-slot :deep(.marquee-content) {
  font-size: clamp(1.05rem, 1.55vw, 1.32rem);
  color: #e6f2fa;
  max-width: 100%;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: normal;
  overflow: hidden;
  line-height: 1.35;
  animation: none !important;
  padding-left: 0 !important;
}

.album-slot :deep(.album p) {
  min-height: 2.5em;
  margin-bottom: 10px;
  font-size: clamp(0.9rem, 1.18vw, 1.05rem);
}

.album-slot :deep(.album button) {
  min-height: 44px;
  height: 44px;
  max-height: 44px;
  padding: 6px 8px;
  font-size: clamp(0.7rem, 1vw, 0.86rem);
}

.album-slot:not(.is-active) :deep(.album button) {
  background: #223641;
  color: #c9dce8;
  border: 1px solid #486580;
}

.rack-floor {
  position: absolute;
  z-index: 1;
  right: 4%;
  bottom: 22px;
  left: 4%;
  height: 22px;
  border-radius: 50%;
  background: linear-gradient(90deg, transparent, rgba(88, 166, 255, 0.24), transparent);
  box-shadow: 0 0 34px rgba(88, 166, 255, 0.2);
  transform: rotateX(65deg) translateZ(-30px);
}

.rack-controls {
  position: absolute;
  z-index: 200;
  right: 0;
  bottom: 2px;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  pointer-events: none;
}

.rack-arrow {
  width: 44px;
  height: 44px;
  border: 1px solid rgba(88, 166, 255, 0.5);
  border-radius: 50%;
  background: rgba(18, 25, 36, 0.76);
  color: var(--text-color);
  cursor: pointer;
  font-size: 1.25rem;
  line-height: 1;
  pointer-events: auto;
  transition: background 180ms ease, transform 180ms ease, border-color 180ms ease;
}

.rack-arrow:hover:not(:disabled) {
  border-color: var(--primary-color);
  background: var(--primary-color);
  transform: scale(1.08);
}

.rack-arrow:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.rack-position {
  min-width: 60px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  text-align: center;
  pointer-events: none;
}

.rack-position-divider {
  padding: 0 4px;
  color: var(--primary-color);
}

.loading-spinner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 20px;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(88, 166, 255, 0.3);
  border-radius: 50%;
  border-top-color: var(--primary-color);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.no-results {
  text-align: center;
  padding: 40px;
  color: var(--text-secondary);
}

@media (min-width: 1400px) {
  main {
    max-width: 1880px;
    padding: 28px 32px;
  }

  main .page-title {
    margin-bottom: 22px;
    font-size: clamp(1.45rem, 1.5vw, 1.9rem);
  }

  .albums-container {
    min-height: max(calc(var(--rack-card-width) + 230px), calc(100dvh - 370px));
    margin: 16px -32px 0;
  }

  .album-slot {
    width: var(--rack-card-width);
    height: calc(var(--rack-card-width) + 160px);
  }

  .album-slot :deep(.album) {
    padding: 14px;
  }

  .album-slot :deep(.album img) {
    height: auto;
  }

  .album-slot :deep(.marquee-content) {
    font-size: clamp(1.15rem, 1.65vw, 1.55rem);
  }

  .album-slot :deep(.album p) {
    font-size: clamp(0.96rem, 1.2vw, 1.12rem);
  }

}

@media (max-width: 900px) {
  main { --rack-card-width: 220px; }
  .albums-container {
    min-height: 390px;
    margin-right: -20px;
    margin-left: -20px;
  }

  .album-slot {
    width: var(--rack-card-width);
    height: 350px;
  }

  .album-slot :deep(.album img) {
    height: auto;
  }
}

@media (max-width: 600px) {
  .albums-container {
    min-height: 370px;
    margin-top: 4px;
  }

  .album-slot {
    top: 50%;
    width: 172px;
    height: 328px;
  }

  .album-slot :deep(.album) {
    padding: 8px;
  }

  .album-slot :deep(.album img) {
    height: auto;
  }

  .rack-controls {
    bottom: 0;
  }

  .interaction-hint {
    top: 8px;
    gap: 5px;
    padding: 7px 8px;
    font-size: 0.72rem;
  }

  .interaction-hint-arrow {
    width: 24px;
    height: 24px;
    font-size: 1rem;
  }

  .album-slot :deep(.marquee-content) {
    font-size: 1.08rem;
  }

  .album-slot :deep(.album p) {
    font-size: 0.84rem;
  }

}

@media (prefers-reduced-motion: reduce) {
  .album-slot,
  .vinyl-record,
  .album-ambient,
  .interaction-hint,
  .interaction-hint-arrow,
  .album-slot :deep(.album)::after {
    animation: none !important;
    transition-duration: 1ms !important;
  }
}

</style>


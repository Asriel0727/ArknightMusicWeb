<template>
  <main class="album-list-main" :key="locale" @wheel="handleWheelPageTurn">
    <h1 class="page-title">{{ t('album.pageTitle') }}</h1>
    <div v-if="albumState.isLoading && !albumState.isInitialFetchDone" class="loading-spinner">
      <div class="spinner"></div>
      <p>{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="displayAlbums.length === 0" class="no-results">
      <p>{{ t('album.noResults') }}</p>
    </div>
    <div v-else>
      <section
        ref="containerRef"
        class="albums-container"
        :class="{ 'is-dragging': isDragging }"
        :aria-label="t('album.pageTitle')"
        tabindex="0"
        @keydown.left.prevent="showPreviousAlbum"
        @keydown.right.prevent="showNextAlbum"
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
        @wheel="handleRackWheel"
      >
        <div class="rack-floor" aria-hidden="true"></div>
        <div
          v-for="(album, index) in displayAlbums"
          :key="album.cid"
          class="album-slot"
          :class="{ 'is-active': index === activeAlbumIndex }"
          :style="getAlbumStyle(index)"
          @click="handleAlbumClick(index, $event)"
          @pointerenter="handlePreloadAlbum(album)"
        >
          <AlbumCard
            :album="album"
            @view-album="handleViewAlbum"
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
      
      <!-- 分頁控件 -->
      <div v-if="totalPages > 1" class="pagination-wrapper">
        <div class="pagination-controls">
          <button 
            class="pagination-btn"
            :disabled="albumState.currentPage === 1"
            @click="goToPage(albumState.currentPage - 1)"
          >
            <i class="fas fa-chevron-left"></i>
            {{ t('album.prevPage') }}
          </button>
          
          <div class="pagination-info">
            <span>{{ t('album.pageOf', { current: albumState.currentPage, total: totalPages }) }}</span>
            <span class="pagination-count">{{ t('album.perPageCount', { n: albumsPerPage }) }}</span>
          </div>
          
          <button 
            class="pagination-btn"
            :disabled="albumState.currentPage === totalPages"
            @click="goToPage(albumState.currentPage + 1)"
          >
            {{ t('album.nextPage') }}
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
        
        <!-- 頁碼快速跳轉 -->
        <div class="pagination-numbers" v-if="totalPages <= 10">
          <button
            v-for="page in totalPages"
            :key="page"
            class="page-number"
            :class="{ active: page === albumState.currentPage }"
            @click="goToPage(page)"
          >
            {{ page }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import AlbumCard from './AlbumCard.vue';
import { albumState, modalState, searchState } from '../stores/player.js';
import { fetchAlbums, getProxyImageUrl, searchMusic } from '../services/api.js';

const { t, locale } = useI18n();
const containerRef = ref(null);
const windowWidth = ref(window.innerWidth);
const activeAlbumIndex = ref(0);
const isDragging = ref(false);
const dragOffset = ref(0);
const suppressAlbumClick = ref(false);
let pointerStartX = 0;
let wheelDeltaAccumulator = 0;
let lastWheelPageAt = 0;
let lastRackWheelAt = 0;

const WHEEL_PAGE_THRESHOLD = 90;
const WHEEL_PAGE_COOLDOWN_MS = 520;
const RACK_WHEEL_COOLDOWN_MS = 280;
const SCROLL_EDGE_THRESHOLD = 24;
const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

// 響應式計算每頁顯示的專輯數量
const albumsPerPage = computed(() => {
  const width = windowWidth.value;

  // 唱片架會以重疊卡片呈現，因此每頁可以承載更多專輯。
  // 螢幕上約顯示 5～11 張，其餘專輯仍可透過左右滑動取用。
  const visibleSlots = width <= 600 ? 5 : width <= 900 ? 7 : Math.max(9, Math.floor(width / 130));
  return Math.max(18, Math.min(visibleSlots * 3, 36));
});

// 計算總頁數
const totalPages = computed(() => {
  const albumsToShow = searchState.query ? searchState.filteredAlbums : albumState.allAlbums;
  return Math.ceil(albumsToShow.length / albumsPerPage.value);
});

// 當前頁顯示的專輯
const displayAlbums = computed(() => {
  const albumsToShow = searchState.query ? searchState.filteredAlbums : albumState.allAlbums;
  const startIndex = (albumState.currentPage - 1) * albumsPerPage.value;
  const endIndex = startIndex + albumsPerPage.value;
  return albumsToShow.slice(startIndex, endIndex);
});

const getCircularOffset = (index) => {
  const total = displayAlbums.value.length;
  if (total <= 1) return 0;

  let offset = index - activeAlbumIndex.value;
  const half = total / 2;

  if (offset > half) offset -= total;
  if (offset < -half) offset += total;
  return offset;
};

const getAlbumStyle = (index) => {
  const offset = getCircularOffset(index);
  const distance = Math.abs(offset);
  const width = windowWidth.value;
  const albumStep = width <= 600
    ? 78
    : width <= 900
      ? Math.min(112, Math.max(78, width * 0.14))
      : Math.min(150, Math.max(86, width * 0.105));

  return {
    '--album-offset': offset,
    '--album-x': `${offset * albumStep + dragOffset.value}px`,
    '--album-depth': `${Math.max(-520, -distance * 68)}px`,
    '--album-scale': Math.max(0.58, 1 - distance * 0.075),
    '--album-rotate': `${offset * -30}deg`,
    '--album-opacity': Math.max(0, 1 - distance * 0.14),
    zIndex: 100 - Math.round(distance),
    pointerEvents: distance > 5 ? 'none' : 'auto',
  };
};

const moveAlbum = (direction) => {
  const total = displayAlbums.value.length;
  if (total <= 1) return;

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
    activeAlbumIndex.value = index;
  }
};

const handlePointerDown = (event) => {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest('button')) return;

  pointerStartX = event.clientX;
  dragOffset.value = 0;
  isDragging.value = true;
  containerRef.value?.setPointerCapture?.(event.pointerId);
};

const handlePointerMove = (event) => {
  if (!isDragging.value) return;
  dragOffset.value = event.clientX - pointerStartX;
};

const handlePointerUp = () => {
  if (!isDragging.value) return;

  const distance = dragOffset.value;
  isDragging.value = false;
  dragOffset.value = 0;
  suppressAlbumClick.value = Math.abs(distance) >= 42;

  if (Math.abs(distance) < 42) return;
  if (distance < 0) {
    showNextAlbum();
  } else {
    showPreviousAlbum();
  }
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

const preloadCurrentAndNextPageImages = () => {
  const albumsToShow = searchState.query ? searchState.filteredAlbums : albumState.allAlbums;
  const startIndex = (albumState.currentPage - 1) * albumsPerPage.value;
  const endIndex = startIndex + albumsPerPage.value;
  const currentPageAlbums = albumsToShow.slice(startIndex, endIndex);
  const nextPageAlbums = albumsToShow.slice(endIndex, endIndex + Math.min(6, albumsPerPage.value));

  preloadAlbumImages(currentPageAlbums, !isTouchDevice);
  preloadAlbumImages(nextPageAlbums, false);
};

// 監聽窗口大小變化
const handleResize = () => {
  windowWidth.value = window.innerWidth;
  // 如果當前頁超出範圍，調整到第一頁
  if (albumState.currentPage > totalPages.value) {
    albumState.currentPage = 1;
  }
};

// 初始化專輯列表
const initializeAlbums = async () => {
  if (albumState.isInitialFetchDone) return;
  
  albumState.isLoading = true;
  
  try {
    const albums = await fetchAlbums();
    albumState.allAlbums = albums;
    albumState.isInitialFetchDone = true;
    albumState.currentPage = 1;
    preloadCurrentAndNextPageImages();
  } catch (error) {
    console.error('Error initializing albums:', error);
  } finally {
    albumState.isLoading = false;
  }
};

// 處理搜索
const handleSearch = async (query) => {
  if (!query) {
    searchState.query = '';
    searchState.filteredAlbums = [];
    albumState.currentPage = 1;
    return;
  }
  
  searchState.query = query;

  try {
    const result = await searchMusic(query);
    searchState.filteredAlbums = result.albums || [];
  } catch (error) {
    console.warn('Backend search failed, fallback to local search:', error);
    searchState.filteredAlbums = albumState.allAlbums.filter(album => {
      const nameMatch = album.name.toLowerCase().includes(query);
      const artistMatch = album.artistes.join(', ').toLowerCase().includes(query);
      return nameMatch || artistMatch;
    });
  }
  
  // 搜索後重置到第一頁
  albumState.currentPage = 1;
};

// 跳轉到指定頁
const goToPage = (page) => {
  if (page < 1 || page > totalPages.value) return;
  albumState.currentPage = page;
  preloadCurrentAndNextPageImages();
  // 滾動到頂部
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const getScrollEdges = () => {
  const root = document.documentElement;
  const scrollTop = window.scrollY || root.scrollTop || 0;
  const viewportHeight = window.innerHeight || root.clientHeight || 0;
  const scrollHeight = root.scrollHeight || 0;

  return {
    isNearTop: scrollTop <= SCROLL_EDGE_THRESHOLD,
    isNearBottom: scrollTop + viewportHeight >= scrollHeight - SCROLL_EDGE_THRESHOLD,
  };
};

const handleWheelPageTurn = (event) => {
  if (modalState.isOpen || totalPages.value <= 1) return;
  if (event.ctrlKey || event.shiftKey || Math.abs(event.deltaY) < 1) return;

  const direction = event.deltaY > 0 ? 1 : -1;
  const { isNearTop, isNearBottom } = getScrollEdges();
  const canTurnPage = direction > 0 ? isNearBottom : isNearTop;

  if (!canTurnPage) {
    wheelDeltaAccumulator = 0;
    return;
  }

  const nextPage = albumState.currentPage + direction;
  if (nextPage < 1 || nextPage > totalPages.value) {
    wheelDeltaAccumulator = 0;
    return;
  }

  const now = Date.now();

  event.preventDefault();

  if (now - lastWheelPageAt < WHEEL_PAGE_COOLDOWN_MS) {
    return;
  }

  wheelDeltaAccumulator += event.deltaY;

  if (Math.abs(wheelDeltaAccumulator) < WHEEL_PAGE_THRESHOLD) {
    return;
  }

  wheelDeltaAccumulator = 0;

  lastWheelPageAt = now;
  goToPage(nextPage);
};

const emit = defineEmits(['view-album']);

// 查看專輯
const handleViewAlbum = (albumId) => {
  emit('view-album', albumId);
};

const handlePreloadAlbum = (album) => {
  if (!album) return;
  preloadImage(album.coverDeUrl, 'high');
};

// 監聽每頁數量變化，調整當前頁
watch(albumsPerPage, (newValue, oldValue) => {
  if (oldValue && albumState.currentPage > 1) {
    // 重新計算當前頁，保持顯示的專輯範圍大致相同
    const currentStartIndex = (albumState.currentPage - 1) * oldValue;
    const newPage = Math.floor(currentStartIndex / newValue) + 1;
    albumState.currentPage = Math.min(newPage, totalPages.value);
  }
});

watch(displayAlbums, () => {
  activeAlbumIndex.value = 0;
  dragOffset.value = 0;
  isDragging.value = false;
  suppressAlbumClick.value = false;
  preloadCurrentAndNextPageImages();
}, { flush: 'post' });

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
    albumState.currentPage = 1;
    albumState.currentAlbumDetails = null;
  } catch (e) {
    console.error('Refetch albums after locale change failed:', e);
  } finally {
    albumState.isLoading = false;
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
});

// 暴露搜索處理函數給父組件
defineExpose({
  handleSearch
});
</script>

<style scoped>
main {
  flex: 1;
  padding: 20px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

main .page-title {
  margin: 0 0 16px 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-color);
}

.albums-container {
  position: relative;
  min-height: clamp(390px, 42vw, 520px);
  margin: 12px -20px 0;
  overflow: hidden;
  perspective: 1300px;
  perspective-origin: center 42%;
  touch-action: pan-y;
  outline: none;
  cursor: grab;
  user-select: none;
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
  top: 20px;
  left: 50%;
  width: clamp(142px, 16vw, 210px);
  height: clamp(300px, 33vw, 410px);
  opacity: var(--album-opacity);
  transform: translate3d(
      calc(-50% + var(--album-x)),
      0,
      var(--album-depth)
    )
    rotateY(var(--album-rotate))
    scale(var(--album-scale));
  transform-style: preserve-3d;
  transform-origin: center bottom;
  transition: transform 360ms cubic-bezier(0.22, 0.8, 0.22, 1), opacity 280ms ease;
  will-change: transform, opacity;
}

.albums-container.is-dragging .album-slot {
  transition: none;
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

.album-slot.is-active {
  filter: saturate(1.08) brightness(1.04);
}

.album-slot :deep(.album) {
  width: 100%;
  min-height: 100%;
  padding: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(88, 166, 255, 0.05);
  transition: box-shadow 260ms ease, border-color 260ms ease;
}

.album-slot.is-active :deep(.album) {
  border-color: rgba(88, 166, 255, 0.5);
  box-shadow: 0 24px 40px rgba(0, 0, 0, 0.48), 0 0 30px rgba(88, 166, 255, 0.16);
}

.album-slot :deep(.album:hover) {
  transform: none;
}

.album-slot :deep(.album img) {
  height: clamp(150px, 21vw, 245px);
  margin-bottom: 10px;
  border-radius: 8px;
}

.album-slot :deep(.marquee-content) {
  font-size: clamp(0.82rem, 1.25vw, 1.05rem);
}

.album-slot :deep(.album p) {
  min-height: 2.5em;
  margin-bottom: 10px;
  font-size: clamp(0.7rem, 1vw, 0.84rem);
}

.album-slot :deep(.album button) {
  min-height: 34px;
  height: 34px;
  padding: 6px 8px;
  font-size: clamp(0.7rem, 1vw, 0.86rem);
}

.rack-floor {
  position: absolute;
  z-index: -3;
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
  width: 38px;
  height: 38px;
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

.pagination-wrapper {
  margin-top: 40px;
  padding: 20px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
}

.pagination-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  flex-wrap: wrap;
}

.pagination-btn {
  background-color: var(--primary-color);
  background-image: none;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.4;
  min-height: 44px;
  max-height: 44px;
  height: 44px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: background-color 0.3s, transform 0.3s, box-shadow 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex-shrink: 0;
  flex-grow: 0;
  background-clip: padding-box;
  background-origin: padding-box;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  background-position: center;
  min-width: fit-content;
}

.pagination-btn:hover:not(:disabled) {
  background-color: #3d8eff;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(88, 166, 255, 0.3);
}

.pagination-btn:disabled {
  background-color: var(--border-color);
  background-image: none;
  color: var(--text-secondary);
  cursor: not-allowed;
  opacity: 0.5;
}

.pagination-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: var(--text-color);
  font-size: 1rem;
  min-width: 150px;
}

.pagination-count {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.pagination-numbers {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}

.page-number {
  background: var(--card-bg);
  color: var(--text-color);
  border: 2px solid var(--border-color);
  min-width: 44px;
  max-width: 44px;
  width: 44px;
  min-height: 44px;
  max-height: 44px;
  height: 44px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1;
  box-sizing: border-box;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  flex-grow: 0;
  padding: 0;
}

.page-number:hover {
  background: rgba(88, 166, 255, 0.1);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.page-number.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

@media (max-width: 900px) {
  .albums-container {
    min-height: 370px;
    margin-right: -20px;
    margin-left: -20px;
  }

  .album-slot {
    width: clamp(130px, 21vw, 172px);
    height: 300px;
  }
  
  .pagination-controls {
    gap: 15px;
  }
  
  .pagination-btn {
    padding: 10px 20px;
    font-size: 0.95rem;
    min-height: 40px;
    max-height: 40px;
    height: 40px;
    gap: 6px;
  }
  
  .pagination-info {
    font-size: 0.9rem;
    min-width: 120px;
  }
  
  .page-number {
    min-width: 40px;
    max-width: 40px;
    width: 40px;
    min-height: 40px;
    max-height: 40px;
    height: 40px;
    font-size: 0.95rem;
  }
}

@media (max-width: 600px) {
  .albums-container {
    min-height: 350px;
    margin-top: 4px;
  }

  .album-slot {
    top: 12px;
    width: 132px;
    height: 290px;
  }

  .album-slot :deep(.album) {
    padding: 8px;
  }

  .album-slot :deep(.album img) {
    height: 146px;
  }

  .rack-controls {
    bottom: 0;
  }

  .pagination-controls {
    flex-direction: column;
    gap: 10px;
  }
  
  .pagination-btn {
    width: 100%;
    max-width: 200px;
    min-width: 140px;
    justify-content: center;
    padding: 10px 16px;
    min-height: 40px;
    max-height: 40px;
    height: 40px;
    font-size: 0.9rem;
    gap: 6px;
  }
  
  .pagination-info {
    width: 100%;
  }
  
  .page-number {
    min-width: 36px;
    max-width: 36px;
    width: 36px;
    min-height: 36px;
    max-height: 36px;
    height: 36px;
    font-size: 0.9rem;
  }
}
</style>


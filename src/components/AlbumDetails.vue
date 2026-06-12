<template>
  <div class="album-details-grid album-dossier">
    <div class="album-details-left">
      <div class="dossier-cover-frame">
        <img
          :key="album.cid + '-cover'"
          :src="proxyImageUrl(album.coverUrl)"
          :alt="album.name"
          class="album-grid-cover"
          decoding="async"
          fetchpriority="high"
          @load="handleImageLoad"
          @error="handleImageError"
        >
      </div>

      <div class="album-identity">
        <span class="dossier-kicker">AUDIO DOSSIER</span>
        <h2>{{ album.name }}</h2>
        <h3>{{ album.belong }}</h3>
      </div>

      <div class="dossier-meta-grid">
        <div class="dossier-meta-cell">
          <span>ARCHIVE ID</span>
          <strong>{{ albumArchiveId }}</strong>
        </div>
        <div class="dossier-meta-cell">
          <span>TRACKS</span>
          <strong>{{ trackCount }}</strong>
        </div>
        <div class="dossier-meta-cell">
          <span>SOURCE</span>
          <strong>{{ album.belong || 'MSR' }}</strong>
        </div>
        <div class="dossier-meta-cell">
          <span>STATUS</span>
          <strong>READY</strong>
        </div>
      </div>

      <div class="album-intro-panel">
        <span class="panel-label">SUMMARY</span>
        <p class="album-intro api-pre-line">{{ introForDisplay }}</p>
      </div>
    </div>
    <div class="album-details-right">
      <div class="album-visual-panel">
        <img
          :key="album.cid + '-visual'"
          :src="proxyImageUrl(album.coverDeUrl)"
          :alt="album.name"
          class="album-grid-visual"
          loading="eager"
          decoding="async"
          fetchpriority="high"
          @load="handleImageLoad"
          @error="handleImageError"
        >
        <div class="visual-scanline"></div>
      </div>
      <div class="song-list">
        <div v-if="totalPages > 1" class="song-list-header">
          <div>
            <span class="panel-label">TRACK INDEX</span>
            <h3>{{ t('album.trackList') }}</h3>
          </div>
          <div class="pagination-controls">
            <button 
              :disabled="currentPage === 1"
              @click="changePage(-1)"
            >&lt;</button>
            <span>{{ t('album.pageIndicator', { current: currentPage, total: totalPages }) }}</span>
            <button 
              :disabled="currentPage === totalPages"
              @click="changePage(1)"
            >&gt;</button>
          </div>
        </div>
        <div v-else class="song-list-header">
          <div>
            <span class="panel-label">TRACK INDEX</span>
            <h3>{{ t('album.trackList') }}</h3>
          </div>
        </div>
        <div id="song-list-content">
          <div 
            v-for="(song, index) in currentPageSongs" 
            :key="`${album.cid}-${song.cid}-${index}`"
            class="song-item"
            :class="{ active: isCurrentSong(song) }"
          >
            <div class="song-number">TRK-{{ String(getSongNumber(index)).padStart(2, '0') }}</div>
            <div class="song-title" :ref="el => setTitleRef(el, index)">
              <span class="marquee-content">{{ song.name }}</span>
            </div>
            <div class="song-artist">{{ song.artistes.join(', ') }}</div>
            <div class="song-status">{{ isCurrentSong(song) ? 'SIGNAL' : 'READY' }}</div>
            <div class="song-action">
              <button
                class="song-play-button"
                :aria-label="t('album.play')"
                :title="t('album.play')"
                @click="handlePlaySong(getSongIndex(index))"
              >
                <i class="fas fa-play" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import { playSongFromAlbum, playerState } from '../stores/player.js';

const { t } = useI18n();

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

const introForDisplay = computed(() => {
  const raw = props.album?.intro;
  if (raw == null || !String(raw).trim()) return t('common.noIntro');
  return normalizeEscapedNewlines(raw);
});

const emit = defineEmits(['play-song']);

const currentPage = ref(1);
const songsPerPage = 8;
const songTitleRefs = ref(new Map());
const imageLoaded = ref(false);

// 確保 Map 始終存在
if (!songTitleRefs.value) {
  songTitleRefs.value = new Map();
}

const totalPages = computed(() => {
  return Math.ceil(props.album.songs.length / songsPerPage);
});

const currentPageSongs = computed(() => {
  const startIndex = (currentPage.value - 1) * songsPerPage;
  return props.album.songs.slice(startIndex, startIndex + songsPerPage);
});

const trackCount = computed(() => {
  return props.album.songs?.length || 0;
});

const albumArchiveId = computed(() => {
  const rawId = String(props.album.cid || '');
  const numericId = rawId.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `ALB-${numericId}`;
});

const getSongNumber = (index) => {
  return (currentPage.value - 1) * songsPerPage + index + 1;
};

const getSongIndex = (index) => {
  return (currentPage.value - 1) * songsPerPage + index;
};

const proxyImageUrl = (url) => {
  if (!url) return '';
  // 使用和原本一樣的方法構建URL
  return `https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(url)}`;
};

// 預加載圖片
const preloadImage = (url) => {
  if (!url) return;
  const img = new Image();
  img.src = proxyImageUrl(url);
};

// 監聽專輯變化時預加載圖片
watch(() => props.album, (newAlbum) => {
  if (!newAlbum) return;
  if (newAlbum.coverUrl) {
    preloadImage(newAlbum.coverUrl);
  }
  if (newAlbum.coverDeUrl) {
    preloadImage(newAlbum.coverDeUrl);
  }
}, { immediate: true });

const handleImageLoad = (event) => {
  imageLoaded.value = true;
  event.target.classList.add('loaded');
};

const handleImageError = (event) => {
  console.error('圖片加載失敗:', event.target.src);
  imageLoaded.value = true;
};

const changePage = (direction) => {
  const newPage = currentPage.value + direction;
  if (newPage >= 1 && newPage <= totalPages.value) {
    currentPage.value = newPage;
  }
};

const handlePlaySong = async (index) => {
  await playSongFromAlbum(index, props.album.cid);
  emit('play-song');
};

const isCurrentSong = (song) => {
  return playerState.currentSong?.cid === song.cid;
};

// 設置標題引用（優化：使用 Map 提高性能）
const setTitleRef = (el, index) => {
  // 確保 Map 已初始化
  if (!songTitleRefs.value) {
    songTitleRefs.value = new Map();
  }
  
  if (el) {
    // 元素存在時設置引用
    songTitleRefs.value.set(index, el);
  } else {
    // 組件卸載時清理
    songTitleRefs.value.delete(index);
  }
};

// 應用跑馬燈效果（優化：延遲執行，先顯示內容）
const applyMarquee = () => {
  // 使用雙重 requestAnimationFrame 確保 DOM 完全渲染
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!songTitleRefs.value || songTitleRefs.value.size === 0) return;
      
      songTitleRefs.value.forEach((titleEl) => {
        if (!titleEl || !titleEl.querySelector) return;
        const content = titleEl.querySelector('.marquee-content');
        if (!content) return;
        
        if (content.scrollWidth > titleEl.clientWidth) {
          const duration = content.scrollWidth / 5;
          content.style.animation = `marquee ${duration < 8 ? 8 : duration}s linear infinite`;
        }
      });
    });
  });
};

// 監聽專輯變化，重置狀態
watch(() => props.album.cid, () => {
  currentPage.value = 1;
  imageLoaded.value = false;
  // 確保 Map 存在後再清理
  if (songTitleRefs.value) {
    songTitleRefs.value.clear();
  } else {
    songTitleRefs.value = new Map();
  }
  // 使用 nextTick 確保 DOM 更新後再應用跑馬燈
  nextTick(() => {
    applyMarquee();
  });
});

watch(currentPage, () => {
  // 換頁時立即應用跑馬燈
  applyMarquee();
});

onMounted(() => {
  // 初始載入時延遲應用跑馬燈，讓內容先顯示
  applyMarquee();
});
</script>

<style scoped>
.album-details-grid {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 18px;
  align-items: stretch;
  height: min(calc(100vh - 150px), 720px);
  min-height: 560px;
  overflow: hidden;
}

.album-details-left,
.album-details-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  min-width: 0;
  min-height: 0;
}

.album-details-left {
  padding: 14px;
  background:
    linear-gradient(135deg, rgba(79, 182, 255, 0.08), transparent 34%),
    rgba(5, 6, 7, 0.58);
  border: 1px solid rgba(111, 122, 132, 0.28);
  border-radius: 2px;
  position: relative;
}

.album-details-left::before,
.album-details-right::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -1px;
  width: 46px;
  height: 2px;
  background: var(--accent-orange);
}

.album-details-right {
  position: relative;
  overflow: hidden;
}

.dossier-cover-frame {
  aspect-ratio: 1 / 1;
  border: 1px solid rgba(111, 122, 132, 0.32);
  background:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.035) 0 1px,
      transparent 1px 12px
    ),
    rgba(13, 16, 19, 0.78);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.album-grid-cover {
  width: 92%;
  height: 92%;
  object-fit: contain;
  border-radius: 0;
  display: block;
  opacity: 0;
  transition: opacity 0.2s;
  background: linear-gradient(45deg, #151a20, #252b32);
}

.album-grid-cover.loaded {
  opacity: 1;
}

.album-identity {
  border-bottom: 1px solid rgba(111, 122, 132, 0.22);
  padding-bottom: 12px;
}

.dossier-kicker,
.panel-label {
  display: inline-block;
  color: var(--accent-orange);
  font-size: 0.68rem;
  font-weight: 900;
  letter-spacing: 0.09em;
}

.album-grid-visual {
  width: 100%;
  height: 220px;
  border-radius: 0;
  display: block;
  opacity: 0;
  transition: opacity 0.2s;
  background: linear-gradient(45deg, #151a20, #252b32);
  object-fit: contain;
}

.album-grid-visual.loaded {
  opacity: 1;
}

.album-details-left h2 {
  font-size: clamp(1.35rem, 2vw, 1.75rem);
  color: var(--primary-color);
  margin: 5px 0 0;
  text-align: left;
  line-height: 1.12;
  font-weight: 900;
}

.album-details-left h3 {
  font-size: 0.95rem;
  color: var(--text-secondary);
  margin: 7px 0 0;
  font-weight: 500;
  text-align: left;
}

.dossier-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dossier-meta-cell {
  padding: 9px 10px;
  background: rgba(13, 16, 19, 0.72);
  border: 1px solid rgba(111, 122, 132, 0.22);
  min-width: 0;
}

.dossier-meta-cell span {
  display: block;
  color: var(--text-dim);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.06em;
}

.dossier-meta-cell strong {
  display: block;
  margin-top: 4px;
  color: var(--text-color);
  font-size: 0.88rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.album-details-left .album-intro {
  line-height: 1.55;
  margin: 0;
  color: var(--text-color);
  width: 100%;
  text-align: left;
  font-size: 0.9rem;
}

.album-intro-panel {
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  background: rgba(13, 16, 19, 0.58);
  border-left: 2px solid rgba(45, 212, 191, 0.7);
}

.album-visual-panel {
  position: relative;
  flex: 0 0 auto;
  border: 1px solid rgba(111, 122, 132, 0.28);
  overflow: hidden;
}

.visual-scanline {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 0,
    rgba(45, 212, 191, 0.16) 46%,
    transparent 52%
  );
  transform: translateY(-100%);
  animation: dossierScan 4.5s ease-in-out infinite;
}

.song-list {
  margin-top: 0;
  width: 100%;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(5, 6, 7, 0.58);
  border: 1px solid rgba(111, 122, 132, 0.28);
}

.song-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0;
  padding: 12px 14px;
  flex-wrap: wrap;
  gap: 10px;
  border-bottom: 1px solid rgba(111, 122, 132, 0.22);
}

.song-list h3 {
  font-size: 1rem;
  margin: 4px 0 0;
  padding-bottom: 0;
  border-bottom: none;
  letter-spacing: 0.04em;
}

.song-list-header h3 {
  margin: 0;
  padding-bottom: 0;
  border-bottom: none;
}

#song-list-content {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.song-item {
  display: grid;
  grid-template-columns: 72px minmax(0, 1.25fr) minmax(0, 1fr) 68px 58px;
  gap: 12px;
  align-items: center;
  padding: 10px 22px 10px 14px;
  border-bottom: 1px solid rgba(111, 122, 132, 0.14);
  border-left: 2px solid transparent;
  border-radius: 0;
  transition: background 0.16s ease, border-color 0.16s ease;
  min-height: 50px;
  position: relative;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
}

.song-item::after {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(79, 182, 255, 0.1), transparent);
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
}

.song-item:hover::after,
.song-item.active::after {
  opacity: 1;
  transform: translateX(100%);
  transition: transform 0.7s ease;
}

.song-item:hover {
  background: rgba(79, 182, 255, 0.08);
  border-left-color: var(--primary-color);
}

.song-item.active {
  background: rgba(45, 212, 191, 0.1);
  border-left-color: var(--accent-cyan);
}

.song-number {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.04em;
  min-width: 0;
}

.song-title {
  font-weight: 800;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: middle;
  min-width: 0;
}

.song-artist {
  color: var(--text-secondary);
  font-size: 0.82rem;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  min-width: 0;
}

.song-status {
  color: var(--accent-yellow);
  font-size: 0.7rem;
  font-weight: 900;
  letter-spacing: 0.05em;
  text-align: right;
}

.song-action {
  text-align: right;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  position: relative;
  z-index: 1;
  padding-right: 4px;
}

.song-action .song-play-button {
  background: rgba(79, 182, 255, 0.12);
  color: var(--primary-color);
  border: 1px solid rgba(79, 182, 255, 0.55);
  padding: 0;
  border-radius: 1px;
  cursor: pointer;
  font-size: 0.78rem;
  font-weight: 900;
  line-height: 1;
  min-width: 34px;
  max-width: 34px;
  width: 34px;
  min-height: 30px;
  max-height: 30px;
  height: 30px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: background 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  flex-grow: 0;
}

.song-action .song-play-button i {
  display: block;
  line-height: 1;
  transform: translateX(1px);
}

.song-action .song-play-button:hover {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
  color: #020405;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pagination-controls button {
  background: rgba(13, 16, 19, 0.86);
  color: var(--text-color);
  border: 1px solid rgba(111, 122, 132, 0.34);
  min-width: 34px;
  max-width: 34px;
  width: 34px;
  min-height: 34px;
  max-height: 34px;
  height: 34px;
  border-radius: 1px;
  cursor: pointer;
  font-size: 1.2rem;
  font-weight: bold;
  line-height: 1;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  flex-shrink: 0;
  flex-grow: 0;
  padding: 0;
}

.pagination-controls button:hover:not(:disabled) {
  background: var(--primary-color);
  color: #020405;
}

.pagination-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-controls span {
  font-size: 0.76rem;
  color: var(--text-secondary);
  min-width: 80px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.marquee-content {
  display: inline-block;
  white-space: nowrap;
  padding-left: 0;
  transition: padding-left 0.3s ease;
}

.marquee-content[style*="animation"] {
  padding-left: 100%;
}

@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}

@keyframes dossierScan {
  0%, 65% {
    transform: translateY(-100%);
  }
  100% {
    transform: translateY(100%);
  }
}

.api-pre-line {
  white-space: pre-line;
}

@media (max-width: 900px) {
  .album-details-grid {
    grid-template-columns: 1fr;
    height: auto;
    max-height: none;
    overflow: visible;
  }

  .album-details-left {
    display: grid;
    grid-template-columns: 128px minmax(0, 1fr);
    align-items: start;
  }

  .dossier-cover-frame {
    grid-row: span 2;
  }

  .album-intro-panel {
    grid-column: 1 / -1;
    max-height: 150px;
  }

  .album-grid-visual {
    height: 110px;
  }

  #song-list-content {
    max-height: 420px;
  }

  .song-item {
    grid-template-columns: 64px minmax(0, 1fr) 50px;
    gap: 8px;
    padding-right: 14px;
  }

  .song-artist {
    grid-column: 2 / 3;
    font-size: 0.78rem;
  }

  .song-status {
    display: none;
  }

  .song-action {
    grid-column: 3 / 4;
    grid-row: 1 / span 2;
  }
}

@media (max-width: 560px) {
  .album-details-left {
    grid-template-columns: 104px minmax(0, 1fr);
    padding: 10px;
  }

  .dossier-meta-grid {
    grid-template-columns: 1fr 1fr;
    grid-column: 1 / -1;
  }

  .song-list-header {
    align-items: flex-start;
  }
}

@media (prefers-reduced-motion: reduce) {
  .visual-scanline,
  .song-item::after {
    animation: none;
    transition: none;
  }
}
</style>

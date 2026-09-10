<template>
  <div class="album-details-grid">
    <header class="album-details-header">
      <div class="album-details-kicker">專輯資料</div>
      <h2>{{ displayAlbumName }}</h2>
      <h3>{{ album.belong }}</h3>
    </header>

    <section class="album-media-layout" :class="{ 'without-visual': !album.coverDeUrl }">
      <div class="album-media-panel album-cover-panel">
        <img
          :key="album.cid + '-cover'"
          :src="proxyImageUrl(album.coverUrl)"
          :alt="album.name"
          class="album-grid-cover"
          decoding="async"
          fetchpriority="high"
          @load="handleCoverImageLoad"
          @error="handleCoverImageError"
        >
      </div>

      <div
        v-if="album.coverDeUrl"
        class="album-media-panel album-visual-panel"
        :class="{ loading: !visualLoaded }"
      >
        <div v-if="!visualLoaded" class="album-visual-placeholder">
          {{ t('common.loading') }}
        </div>
        <img
          :key="album.cid + '-visual'"
          :src="proxyImageUrl(album.coverDeUrl)"
          :alt="album.name"
          class="album-grid-visual"
          loading="eager"
          decoding="async"
          fetchpriority="high"
          @load="handleVisualImageLoad"
          @error="handleVisualImageError"
        >
      </div>
    </section>

    <p class="album-intro api-pre-line">{{ displayIntro }}</p>

    <div class="song-list projected-song-list">
      <div v-if="totalPages > 1" class="song-list-header">
          <h3>{{ t('album.trackList') }}</h3>
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
      <h3 v-else>{{ t('album.trackList') }}</h3>
      <div id="song-list-content">
          <div 
            v-for="(song, index) in currentPageSongs" 
            :key="`${album.cid}-${song.cid}-${index}`"
            class="song-item"
          >
            <div class="song-number">{{ getSongNumber(index) }}</div>
            <div class="song-title" :ref="el => setTitleRef(el, index)">
              <span class="marquee-content">{{ song.name }}</span>
            </div>
            <div class="song-artist">{{ song.artistes.join(', ') }}</div>
            <div class="song-action">
              <button @click="handlePlaySong(getSongIndex(index))">{{ t('album.play') }}</button>
            </div>
          </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import { getProxyImageUrl } from '../services/api.js';
import { playSongFromAlbum } from '../stores/player.js';
import { decodeTextLeftToRight } from '../utils/textGlitch.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';

const { t, locale } = useI18n();

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

const introSourceText = computed(() => {
  const raw = props.album?.intro;
  if (raw == null || !String(raw).trim()) return t('common.noIntro');
  return normalizeEscapedNewlines(raw);
});

const translatedIntro = ref('');
const isIntroTranslating = ref(false);
const displayAlbumName = ref('');
const displayIntro = ref('');
const isAlbumTextGlitching = ref(false);
let introTranslationToken = 0;
let albumTextGlitchFrame = null;

const glitchedAlbumIds = globalThis.__albumDetailsGlitchedIds ?? new Set();
globalThis.__albumDetailsGlitchedIds = glitchedAlbumIds;

const introForDisplay = computed(() => {
  return translatedIntro.value || introSourceText.value;
});

displayAlbumName.value = props.album?.name || '';
displayIntro.value = introForDisplay.value;

const updateDisplayTexts = () => {
  displayAlbumName.value = props.album?.name || '';
  displayIntro.value = introForDisplay.value;
};

const cancelAlbumTextGlitch = () => {
  if (albumTextGlitchFrame) {
    cancelAnimationFrame(albumTextGlitchFrame);
    albumTextGlitchFrame = null;
  }
};

const startAlbumTextGlitch = () => {
  const albumId = props.album?.cid;
  if (!albumId || glitchedAlbumIds.has(albumId)) {
    updateDisplayTexts();
    return;
  }

  glitchedAlbumIds.add(albumId);
  cancelAlbumTextGlitch();

  const albumName = props.album?.name || '';
  const intro = introForDisplay.value;
  const duration = 1600;
  const startTime = performance.now();

  isAlbumTextGlitching.value = true;

  const animate = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);

    displayAlbumName.value = decodeTextLeftToRight(albumName, progress);
    displayIntro.value = decodeTextLeftToRight(intro, progress);

    if (progress < 1) {
      albumTextGlitchFrame = requestAnimationFrame(animate);
      return;
    }

    displayAlbumName.value = props.album?.name || albumName;
    displayIntro.value = introForDisplay.value || intro;
    isAlbumTextGlitching.value = false;
    albumTextGlitchFrame = null;
  };

  albumTextGlitchFrame = requestAnimationFrame(animate);
};

const emit = defineEmits(['play-song']);

const currentPage = ref(1);
const songsPerPage = 4;
const songTitleRefs = ref(new Map());
const coverLoaded = ref(false);
const visualLoaded = ref(false);

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

const getSongNumber = (index) => {
  return (currentPage.value - 1) * songsPerPage + index + 1;
};

const getSongIndex = (index) => {
  return (currentPage.value - 1) * songsPerPage + index;
};

const proxyImageUrl = (url) => {
  if (!url) return '';
  // 使用和原本一樣的方法構建URL
  return getProxyImageUrl(url);
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

const handleCoverImageLoad = (event) => {
  coverLoaded.value = true;
  event.target.classList.add('loaded');
};

const handleVisualImageLoad = (event) => {
  visualLoaded.value = true;
  event.target.classList.add('loaded');
};

const handleCoverImageError = (event) => {
  coverLoaded.value = true;
  event.target.classList.add('loaded');
  console.error('圖片加載失敗:', event.target.src);
};

const handleVisualImageError = (event) => {
  visualLoaded.value = true;
  event.target.classList.add('loaded');
  console.error('圖片加載失敗:', event.target.src);
};

const changePage = (direction) => {
  const newPage = currentPage.value + direction;
  if (newPage >= 1 && newPage <= totalPages.value) {
    currentPage.value = newPage;
  }
};

const handlePlaySong = async (index) => {
  emit('play-song');
  await playSongFromAlbum(index, props.album.cid);
};

const refreshIntroTranslation = async () => {
  const sourceText = introSourceText.value;
  const targetLocale = locale.value;
  const token = ++introTranslationToken;

  translatedIntro.value = '';
  isIntroTranslating.value = false;

  if (!sourceText || sourceText === t('common.noIntro')) {
    return;
  }

  const hasChineseSource = /[\u3400-\u9fff]/u.test(sourceText);
  if ((targetLocale === 'zh-TW' || targetLocale === 'zh-CN') && hasChineseSource) {
    translatedIntro.value = normalizeChineseMusicText(sourceText, targetLocale);
    return;
  }

  isIntroTranslating.value = true;

  try {
    const { translateTextBlock } = await import('../services/lyricsTranslationPlugin.js');
    const result = await translateTextBlock(sourceText, targetLocale);

    if (token !== introTranslationToken) {
      return;
    }

    translatedIntro.value = result || sourceText;
  } catch (error) {
    console.warn('Album intro translation failed:', error.message);
  } finally {
    if (token === introTranslationToken) {
      isIntroTranslating.value = false;
    }
  }
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
  coverLoaded.value = false;
  visualLoaded.value = false;
  // 確保 Map 存在後再清理
  if (songTitleRefs.value) {
    songTitleRefs.value.clear();
  } else {
    songTitleRefs.value = new Map();
  }
  // 使用 nextTick 確保 DOM 更新後再應用跑馬燈
  nextTick(() => {
    applyMarquee();
    startAlbumTextGlitch();
  });
  refreshIntroTranslation();
});

watch(locale, () => {
  refreshIntroTranslation();
});

watch(introSourceText, () => {
  refreshIntroTranslation();
});

watch(introForDisplay, () => {
  if (!isAlbumTextGlitching.value) {
    displayIntro.value = introForDisplay.value;
  }
});

watch(currentPage, () => {
  // 換頁時立即應用跑馬燈
  applyMarquee();
});

onMounted(() => {
  updateDisplayTexts();
  nextTick(() => {
    startAlbumTextGlitch();
  });
  refreshIntroTranslation();
});

onMounted(() => {
  // 初始載入時延遲應用跑馬燈，讓內容先顯示
  applyMarquee();
});
onUnmounted(() => {
  cancelAlbumTextGlitch();
});
</script>

<style scoped>
.album-details-grid {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: min(1120px, 100%);
  gap: 20px;
  margin: 0 auto;
  padding: 8px 0 24px;
  isolation: isolate;
}

.album-details-grid > * {
  position: relative;
  z-index: 1;
}

.album-details-header {
  min-width: 0;
  padding: clamp(18px, 3vw, 30px);
  overflow: hidden;
  border: 1px solid rgba(148, 222, 255, 0.26);
  border-radius: 16px;
  background: linear-gradient(112deg, rgba(21, 71, 99, 0.48), rgba(7, 25, 40, 0.78) 58%, rgba(38, 111, 150, 0.18));
  box-shadow: inset 0 0 28px rgba(129, 215, 255, 0.06);
}

.album-details-header::after {
  content: '';
  position: absolute;
  right: -4%;
  bottom: -90%;
  width: 56%;
  aspect-ratio: 1;
  border: 1px solid rgba(128, 213, 255, 0.16);
  border-radius: 50%;
  box-shadow: 0 0 0 22px rgba(128, 213, 255, 0.035), 0 0 0 48px rgba(128, 213, 255, 0.02);
}

.album-details-kicker {
  margin-bottom: 5px;
  color: rgba(125, 203, 246, 0.78);
  font-size: 0.7rem;
  letter-spacing: 0.2em;
}

.album-details-header h2 {
  margin: 0;
  color: #effaff;
  font-size: clamp(1.55rem, 3.2vw, 2.3rem);
  line-height: 1.15;
  text-align: left;
  text-shadow: 0 0 22px rgba(100, 205, 255, 0.16);
}

.album-details-header h3 {
  margin: 8px 0 0;
  color: rgba(167, 217, 238, 0.76);
  font-size: 0.95rem;
  font-weight: 500;
  text-align: left;
}

.album-media-layout {
  display: grid;
  grid-template-columns: minmax(150px, 0.74fr) minmax(0, 1.7fr);
  gap: 20px;
  align-items: stretch;
  min-width: 0;
}

.album-media-layout.without-visual {
  grid-template-columns: minmax(0, 1fr);
}

.album-media-panel {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(148, 222, 255, 0.28);
  border-radius: 12px;
  background: linear-gradient(145deg, rgba(93, 183, 230, 0.14), rgba(7, 25, 40, 0.38));
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.26), inset 0 0 26px rgba(129, 215, 255, 0.06);
}

.album-media-panel::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: inherit;
  pointer-events: none;
}

.album-cover-panel {
  aspect-ratio: 1;
}

.album-visual-panel {
  display: grid;
  min-height: 180px;
  aspect-ratio: 16 / 7;
  align-items: stretch;
}

.album-visual-panel.loading {
  place-items: center;
}

.album-visual-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: rgba(167, 217, 238, 0.72);
  font-size: 0.9rem;
}

.album-grid-cover {
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  display: block;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.3s;
  background: linear-gradient(45deg, #30363d, #484f58);
}

.album-grid-cover.loaded {
  opacity: 1;
}

.album-grid-visual {
  width: 100%;
  height: 100%;
  min-height: 180px;
  aspect-ratio: 16 / 7;
  border-radius: inherit;
  display: block;
  opacity: 0;
  transition: opacity 0.2s;
  background: linear-gradient(45deg, #30363d, #484f58);
  object-fit: cover;
}

.album-grid-visual.loaded {
  opacity: 1;
}

.album-intro {
  line-height: 1.75;
  margin: 0;
  padding: 18px 20px 18px 24px;
  border-left: 3px solid rgba(102, 203, 255, 0.72);
  border-radius: 0 12px 12px 0;
  background: rgba(9, 35, 52, 0.34);
  color: rgba(220, 242, 252, 0.84);
  width: 100%;
  text-align: left;
}

.song-list {
  margin-top: 0;
  width: 100%;
}

.song-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 10px;
}

.song-list h3 {
  font-size: 1.3rem;
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.song-list-header h3 {
  margin: 0;
  padding-bottom: 0;
  border-bottom: none;
}

#song-list-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.song-item {
  display: flex;
  align-items: center;
  padding: 0 15px;
  border-radius: 5px;
  transition: background 0.3s;
  min-height: 52px;
}

.song-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.song-number {
  width: 30px;
  color: var(--text-secondary);
}

.song-title {
  flex: 1;
  font-weight: 500;
  overflow: hidden;
  white-space: nowrap;
  vertical-align: middle;
}

.song-artist {
  flex: 1;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.song-action {
  width: 100px;
  min-width: 100px;
  max-width: 100px;
  text-align: right;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.song-action button {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.5;
  min-height: 36px;
  max-height: 36px;
  height: 36px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: background 0.3s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  flex-grow: 0;
}

.song-action button:hover {
  background: #3d8eff;
}

.projected-song-list {
  position: relative;
  width: 100%;
  padding: clamp(18px, 3vw, 28px);
  overflow: hidden;
  isolation: isolate;
  border: 1px solid rgba(148, 222, 255, 0.5);
  border-radius: 16px;
  background: linear-gradient(145deg, rgba(48, 126, 166, 0.22), rgba(6, 22, 35, 0.62));
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.22), inset 0 0 30px rgba(129, 215, 255, 0.06);
}

.projected-song-list::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  background: repeating-linear-gradient(
    180deg,
    transparent 0,
    transparent 7px,
    rgba(150, 223, 255, 0.045) 8px,
    transparent 9px
  );
  opacity: 0.74;
  pointer-events: none;
  animation: projected-song-scan 8s linear infinite;
}

.projected-song-list::after {
  content: '';
  position: absolute;
  z-index: -1;
  top: -30%;
  left: 12%;
  width: 76%;
  height: 70%;
  border-radius: 50%;
  background: rgba(83, 192, 255, 0.12);
  filter: blur(28px);
  pointer-events: none;
}

.projected-song-list > * {
  position: relative;
  z-index: 1;
}

.projected-song-list-kicker {
  margin-bottom: 4px;
  color: rgba(125, 203, 246, 0.72);
  font-size: 0.68rem;
  letter-spacing: 0.18em;
}

.projected-song-list .song-list-header,
.projected-song-list > h3 {
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(158, 224, 255, 0.24);
}

.projected-song-list .song-list-header h3,
.projected-song-list > h3 {
  color: #effaff;
  font-size: clamp(1.15rem, 2vw, 1.5rem);
  letter-spacing: 0.04em;
}

.projected-song-list .song-list-header h3 {
  margin: 0;
  padding: 0;
  border-bottom: 0;
}

.projected-song-list #song-list-content {
  gap: 6px;
}

.projected-song-list .song-item {
  display: grid;
  grid-template-columns: 34px minmax(0, 1.4fr) minmax(0, 1fr) 86px;
  gap: 12px;
  align-items: center;
  min-height: 58px;
  padding: 9px 14px;
  border: 1px solid rgba(152, 218, 248, 0.12);
  border-radius: 8px;
  background: rgba(5, 24, 37, 0.42);
  transition: background 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.projected-song-list .song-item:hover {
  border-color: rgba(126, 213, 255, 0.42);
  background: rgba(72, 166, 211, 0.2);
  box-shadow: 0 0 18px rgba(94, 197, 255, 0.1);
  transform: translateX(4px);
}

.projected-song-list .song-number {
  width: auto;
  color: rgba(120, 203, 255, 0.88);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

.projected-song-list .song-title {
  min-width: 0;
  color: rgba(232, 248, 255, 0.98);
  font-size: 0.98rem;
}

.projected-song-list .song-artist {
  min-width: 0;
  color: rgba(167, 217, 238, 0.7);
  font-size: 0.84rem;
}

.projected-song-list .song-action {
  width: 86px;
  min-width: 86px;
  max-width: 86px;
}

.projected-song-list .song-action button {
  width: 100%;
  min-height: 34px;
  height: 34px;
  padding: 6px 8px;
  border: 1px solid rgba(183, 229, 255, 0.45);
  border-radius: 7px;
  background: rgba(69, 163, 224, 0.68);
  box-shadow: 0 0 12px rgba(78, 177, 239, 0.12);
  font-size: 0.82rem;
}

.projected-song-list .song-action button:hover {
  border-color: rgba(207, 241, 255, 0.8);
  background: rgba(73, 171, 235, 0.92);
  box-shadow: 0 0 18px rgba(78, 177, 239, 0.3);
}

.projected-song-list .pagination-controls {
  gap: 9px;
}

.projected-song-list .pagination-controls button {
  width: 32px;
  min-width: 32px;
  max-width: 32px;
  height: 32px;
  min-height: 32px;
  max-height: 32px;
  border: 1px solid rgba(126, 213, 255, 0.42);
  background: rgba(54, 139, 188, 0.24);
  color: rgba(220, 244, 255, 0.92);
  font-size: 1rem;
}

.projected-song-list .pagination-controls span {
  min-width: 70px;
  color: rgba(167, 217, 238, 0.72);
  font-size: 0.8rem;
}

@keyframes projected-song-scan {
  from {
    transform: translateY(-10px);
  }

  to {
    transform: translateY(10px);
  }
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.pagination-controls button {
  background: var(--border-color);
  color: var(--text-color);
  border: none;
  min-width: 40px;
  max-width: 40px;
  width: 40px;
  min-height: 40px;
  max-height: 40px;
  height: 40px;
  border-radius: 50%;
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
  color: white;
}

.pagination-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pagination-controls span {
  font-size: 0.9rem;
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

.api-pre-line {
  white-space: pre-line;
}

@media (max-width: 900px) {
  .album-media-layout {
    grid-template-columns: minmax(140px, 0.7fr) minmax(0, 1.65fr);
  }
}

@media (max-width: 600px) {
  .album-details-grid {
    gap: 18px;
    padding-bottom: 70px;
  }

  .album-media-layout,
  .album-media-layout.without-visual {
    grid-template-columns: 1fr;
  }

  .album-cover-panel {
    width: min(100%, 260px);
    justify-self: center;
  }

  .album-visual-panel {
    min-height: 140px;
  }

  .projected-song-list {
    padding: 15px 12px;
  }

  .projected-song-list .song-item {
    grid-template-columns: 26px minmax(0, 1fr) 72px;
    gap: 7px;
    min-height: 58px;
    padding: 8px;
  }

  .projected-song-list .song-title {
    font-size: 0.92rem;
  }

  .projected-song-list .song-artist {
    grid-column: 2;
    grid-row: 2;
    font-size: 0.76rem;
  }

  .projected-song-list .song-action {
    grid-column: 3;
    grid-row: 1 / span 2;
    width: 72px;
    min-width: 72px;
    max-width: 72px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .projected-song-list::before,
  .projected-song-list .song-item {
    animation: none !important;
    transition: none !important;
  }
}
</style>


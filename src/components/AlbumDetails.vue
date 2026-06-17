<template>
  <div class="album-details-grid" :class="{ 'single-panel': !hasRightPanel }">
    <div class="album-details-left">
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
      <h2>{{ displayAlbumName }}</h2>
      <h3>{{ album.belong }}</h3>
      <p class="album-intro api-pre-line">{{ displayIntro }}</p>
    </div>
    <div v-if="hasRightPanel" class="album-details-right" :class="{ loading: album.coverDeUrl && !imageLoaded }">
      <div v-if="album.coverDeUrl && !imageLoaded" class="album-visual-placeholder">
        {{ t('common.loading') }}
      </div>
      <img 
        v-if="album.coverDeUrl"
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
      <div class="song-list">
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
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import { normalizeEscapedNewlines } from '../utils/formatApiText.js';
import { getProxyImageUrl } from '../services/api.js';
import { playSongFromAlbum } from '../stores/player.js';
import { decodeTextLeftToRight } from '../utils/textGlitch.js';

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
const imageLoaded = ref(false);

const hasRightPanel = computed(() => {
  return Boolean(props.album?.coverDeUrl || props.album?.songs?.length);
});

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

const refreshIntroTranslation = async () => {
  const sourceText = introSourceText.value;
  const targetLocale = locale.value;
  const token = ++introTranslationToken;

  translatedIntro.value = '';
  isIntroTranslating.value = false;

  if (!sourceText || sourceText === t('common.noIntro')) {
    return;
  }

  if (targetLocale === 'zh-TW') {
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
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
  align-items: center;
}

.album-details-grid.single-panel {
  grid-template-columns: minmax(0, 1fr);
}

.album-details-grid.single-panel .album-details-left {
  max-width: 640px;
  width: 100%;
  justify-self: center;
}

.album-details-left {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  min-width: 0;
}

.album-details-right {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  min-height: 360px;
}

.album-visual-placeholder {
  width: 100%;
  min-height: 220px;
  border-radius: 8px;
  background: linear-gradient(45deg, #30363d, #484f58);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
}

.album-grid-cover {
  width: 70%;
  max-width: 350px;
  height: auto;
  border-radius: 8px;
  display: block;
  margin-bottom: 10px;
  opacity: 0;
  transition: opacity 0.3s;
  background: linear-gradient(45deg, #30363d, #484f58);
}

.album-grid-cover.loaded {
  opacity: 1;
}

.album-grid-visual {
  width: 100%;
  height: auto;
  min-height: 200px;
  border-radius: 8px;
  display: block;
  margin-bottom: 10px;
  opacity: 0;
  transition: opacity 0.2s;
  background: linear-gradient(45deg, #30363d, #484f58);
  object-fit: cover;
}

.album-grid-visual.loaded {
  opacity: 1;
}

.album-details-left h2 {
  font-size: 1.8rem;
  color: var(--primary-color);
  margin: 0;
  text-align: center;
}

.album-details-left h3 {
  font-size: 1.2rem;
  color: var(--text-secondary);
  margin: 0;
  font-weight: 500;
  text-align: center;
}

.album-details-left .album-intro {
  line-height: 1.6;
  margin: 0;
  color: var(--text-color);
  width: 100%;
  text-align: center;
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
  .album-details-grid {
    grid-template-columns: 1fr;
  }
}
</style>


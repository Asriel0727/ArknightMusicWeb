<template>
  <div class="album-details-grid">
    <div class="album-details-left">
      <img 
        :key="album.cid + '-cover'"
        :src="proxyImageUrl(album.coverUrl)" 
        :alt="album.name" 
        class="album-grid-cover"
        @load="handleImageLoad"
        @error="handleImageError"
      >
      <h2>{{ album.name }}</h2>
      <h3>{{ album.belong }}</h3>
      <p class="album-intro">{{ album.intro || '暫無介紹' }}</p>
    </div>
    <div class="album-details-right">
      <img 
        :key="album.cid + '-visual'"
        :src="proxyImageUrl(album.coverDeUrl)" 
        :alt="album.name" 
        class="album-grid-visual"
        loading="eager"
        @load="handleImageLoad"
        @error="handleImageError"
      >
      <div class="song-list">
        <div v-if="totalPages > 1" class="song-list-header">
          <h3>曲目列表</h3>
          <div class="pagination-controls">
            <button 
              :disabled="currentPage === 1"
              @click="changePage(-1)"
            >&lt;</button>
            <span>第 {{ currentPage }} / {{ totalPages }} 頁</span>
            <button 
              :disabled="currentPage === totalPages"
              @click="changePage(1)"
            >&gt;</button>
          </div>
        </div>
        <h3 v-else>曲目列表</h3>
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
              <button @click="handlePlaySong(getSongIndex(index))">播放</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { playSongFromAlbum } from '../stores/player.js';

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

const emit = defineEmits(['play-song']);

const currentPage = ref(1);
const songsPerPage = 4;
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
  if (newAlbum && newAlbum.coverDeUrl) {
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
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
  align-items: center;
}

.album-details-left,
.album-details-right {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: center;
  min-width: 0;
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

@media (max-width: 900px) {
  .album-details-grid {
    grid-template-columns: 1fr;
  }
}
</style>


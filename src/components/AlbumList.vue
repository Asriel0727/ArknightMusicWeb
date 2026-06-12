<template>
  <main class="album-list-main" :key="locale">
    <div class="archive-header">
      <div>
        <span class="archive-kicker">RHODES AUDIO ARCHIVE</span>
        <h1 class="page-title">{{ t('album.pageTitle') }}</h1>
      </div>
      <div class="archive-status">
        <span>STATUS</span>
        <strong>ONLINE</strong>
      </div>
    </div>
    <div v-if="albumState.isLoading && !albumState.isInitialFetchDone" class="loading-spinner">
      <div class="spinner"></div>
      <p>{{ t('common.loading') }}</p>
    </div>
    <div v-else-if="displayAlbums.length === 0" class="no-results">
      <p>{{ t('album.noResults') }}</p>
    </div>
    <div v-else>
      <div class="albums-container" ref="containerRef">
        <AlbumCard 
          v-for="album in displayAlbums" 
          :key="album.cid"
          :album="album"
          @view-album="handleViewAlbum"
        />
      </div>
      
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
import { albumState, searchState } from '../stores/player.js';
import { fetchAlbums } from '../services/api.js';

const { t, locale } = useI18n();
const containerRef = ref(null);
const windowWidth = ref(window.innerWidth);

// 響應式計算每頁顯示的專輯數量
const albumsPerPage = computed(() => {
  const width = windowWidth.value;
  
  // 根據屏幕寬度計算每行可以顯示多少個專輯
  // 專輯卡片最小寬度：250px (桌面) 或 200px (移動端)
  // 加上間距：25px (桌面) 或 15px (移動端)
  const cardMinWidth = width <= 900 ? 200 : 250;
  const gap = width <= 900 ? 15 : 25;
  const containerPadding = 40; // 左右padding
  const availableWidth = width - containerPadding;
  
  // 計算每行可以放多少個
  const cardsPerRow = Math.floor((availableWidth + gap) / (cardMinWidth + gap));
  
  // 根據屏幕高度計算可以顯示多少行
  // 專輯卡片高度約：350px (包含圖片、文字、按鈕)
  const cardHeight = 350;
  const viewportHeight = window.innerHeight;
  const headerHeight = 200; // 導航欄和頂部工具欄的高度
  const paginationHeight = 100; // 分頁控件的高度
  const availableHeight = viewportHeight - headerHeight - paginationHeight;
  const rowsPerPage = Math.max(2, Math.floor(availableHeight / (cardHeight + gap))); // 至少顯示2行
  
  // 每頁顯示的數量 = 每行數量 × 每頁行數
  const perPage = cardsPerRow * rowsPerPage;
  
  // 設置最小和最大值
  return Math.max(5, Math.min(perPage, 25)); // 最少4個，最多24個
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
  } catch (error) {
    console.error('Error initializing albums:', error);
  } finally {
    albumState.isLoading = false;
  }
};

// 處理搜索
const handleSearch = (query) => {
  if (!query) {
    searchState.query = '';
    searchState.filteredAlbums = [];
    albumState.currentPage = 1;
    return;
  }
  
  searchState.filteredAlbums = albumState.allAlbums.filter(album => {
    const nameMatch = album.name.toLowerCase().includes(query);
    const artistMatch = album.artistes.join(', ').toLowerCase().includes(query);
    return nameMatch || artistMatch;
  });
  
  // 搜索後重置到第一頁
  albumState.currentPage = 1;
};

// 跳轉到指定頁
const goToPage = (page) => {
  if (page < 1 || page > totalPages.value) return;
  albumState.currentPage = page;
  // 滾動到頂部
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const emit = defineEmits(['view-album']);

// 查看專輯
const handleViewAlbum = (albumId) => {
  emit('view-album', albumId);
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
  padding: 18px 40px 24px;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
}

main .page-title {
  margin: 2px 0 0;
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--text-color);
  letter-spacing: 0;
}

.archive-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding: 14px 0 12px;
  border-bottom: 1px solid rgba(111, 122, 132, 0.35);
}

.archive-kicker {
  color: var(--accent-orange);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.archive-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 800;
  border: 1px solid rgba(45, 212, 191, 0.32);
  padding: 6px 9px;
}

.archive-status strong {
  color: var(--accent-cyan);
}

.archive-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
  padding: 14px 0 12px;
  border-bottom: 1px solid rgba(111, 122, 132, 0.35);
}

.archive-kicker {
  color: var(--accent-orange);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.06em;
}

.archive-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 800;
  border: 1px solid rgba(45, 212, 191, 0.32);
  padding: 6px 9px;
}

.archive-status strong {
  color: var(--accent-cyan);
}

.albums-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0 0;
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
  margin-top: 24px;
  padding: 16px 0;
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
  background-color: rgba(79, 182, 255, 0.12);
  background-image: none;
  color: var(--primary-color);
  border: 1px solid rgba(79, 182, 255, 0.35);
  padding: 12px 24px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  line-height: 1.4;
  min-height: 44px;
  max-height: 44px;
  height: 44px;
  box-sizing: border-box;
  white-space: nowrap;
  transition: background-color 0.16s, border-color 0.16s, color 0.16s;
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
  background-color: rgba(255, 138, 42, 0.14);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
  box-shadow: none;
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
  background: rgba(13, 16, 19, 0.86);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  min-width: 44px;
  max-width: 44px;
  width: 44px;
  min-height: 44px;
  max-height: 44px;
  height: 44px;
  border-radius: 2px;
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
  background: rgba(79, 182, 255, 0.16);
  color: var(--text-color);
  border-color: var(--primary-color);
}

@media (max-width: 900px) {
  .albums-container {
    gap: 8px;
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
  main {
    padding: 12px 10px 20px;
  }

  .archive-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
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

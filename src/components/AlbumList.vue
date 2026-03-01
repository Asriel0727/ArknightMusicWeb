<template>
  <main>
    <div v-if="albumState.isLoading && !albumState.isInitialFetchDone" class="loading-spinner">
      <div class="spinner"></div>
      <p>加載中...</p>
    </div>
    <div v-else-if="displayAlbums.length === 0" class="no-results">
      <p>沒有找到專輯</p>
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
            上一頁
          </button>
          
          <div class="pagination-info">
            <span>第 {{ albumState.currentPage }} / {{ totalPages }} 頁</span>
            <span class="pagination-count">（每頁 {{ albumsPerPage }} 個）</span>
          </div>
          
          <button 
            class="pagination-btn"
            :disabled="albumState.currentPage === totalPages"
            @click="goToPage(albumState.currentPage + 1)"
          >
            下一頁
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
import AlbumCard from './AlbumCard.vue';
import { albumState, searchState } from '../stores/player.js';
import { fetchAlbums } from '../services/api.js';

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

.albums-container {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 25px;
  padding: 20px 0;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
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
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 15px;
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


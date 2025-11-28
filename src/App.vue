<template>
  <div id="app">
    <ParticleBackground />
    <Navbar :currentPage="currentPage" @change-page="handlePageChange" />
    
    <!-- 專輯頁面 -->
    <template v-if="currentPage === 'albums'">
      <TopBar @search="handleSearch" />
      <AlbumList ref="albumListRef" @view-album="handleViewAlbum" />
      <Modal @close="handleModalClose" />
    </template>
    
    <!-- 角色圖鑑頁面 -->
    <template v-else-if="currentPage === 'characters'">
      <CharacterList />
      <Modal @close="handleModalClose" />
    </template>
    
    <audio ref="audioPlayerRef" style="display:none;"></audio>
    <footer>
      <p>明日方舟音樂播放器 &copy;</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick, watch } from 'vue';
import ParticleBackground from './components/ParticleBackground.vue';
import Navbar from './components/Navbar.vue';
import TopBar from './components/TopBar.vue';
import AlbumList from './components/AlbumList.vue';
import Modal from './components/Modal.vue';
import CharacterList from './components/CharacterList.vue';
import { initAudioPlayer, modalState, albumState } from './stores/player.js';
import { fetchAlbumDetails } from './services/api.js';
import { decodeText } from './utils/textGlitch.js';

const audioPlayerRef = ref(null);
const albumListRef = ref(null);
const hasGlitchAnimationRun = ref(false);
const currentPage = ref('albums'); // 'albums' 或 'characters'

const handlePageChange = (page) => {
  currentPage.value = page;
};

const handleSearch = (query) => {
  if (albumListRef.value && albumListRef.value.handleSearch) {
    albumListRef.value.handleSearch(query);
  }
};

const handleViewAlbum = async (albumId) => {
  try {
    albumState.currentAlbumDetails = await fetchAlbumDetails(albumId);
    modalState.currentView = 'album';
    modalState.isOpen = true;
  } catch (error) {
    console.error('Error fetching album details:', error);
  }
};

const handleModalClose = () => {
  modalState.isOpen = false;
};

// 应用文字乱码动画效果
const applyTextGlitch = (force = false) => {
  // 如果已经执行过且不是强制执行，则跳过
  if (hasGlitchAnimationRun.value && !force) {
    return;
  }
  
  hasGlitchAnimationRun.value = true;
  const duration = 3000; // 3秒
  const startTime = performance.now();
  
  // 选择所有包含文本的元素（排除input、button内的文本，因为它们会动态变化）
  const textSelectors = [
    '.page-title',
    'button:not(.control-btn):not(.pagination-btn):not(.page-number):not(.modal-close):not(.nav-tab):not(.filter-buttons button)',
    'p:not(.no-lyrics)',
    'h1, h2, h3, h4, h5, h6',
    '.dropdown-song-item span',
    '.pagination-info span',
    'footer p',
    // 专辑相关
    '.marquee-content',
    '.album p',
    '.album-details-left h2',
    '.album-details-left h3',
    '.album-intro',
    '.song-item .song-title .marquee-content',
    '.song-item .song-artist',
    '.song-list-header h3'
  ];
  
  const elements = document.querySelectorAll(textSelectors.join(', '));
  const textElements = [];
  
  elements.forEach(el => {
    // 跳过模态框关闭按钮及其子元素
    if (el.closest('.modal-close') || el.classList.contains('modal-close')) {
      return;
    }
    
    // 跳过已经在动画中的元素（避免重复应用）
    if (el.dataset.glitchProcessed === 'true') {
      return;
    }
    
    // 跳过已经有子元素或动态内容的元素
    if (el.children.length > 0 && Array.from(el.children).some(child => 
      child.tagName === 'I' || child.tagName === 'IMG' || child.classList.contains('scrolling')
    )) {
      return;
    }
    
    // 跳过包含特殊符号的元素（如 ×）
    const text = el.textContent.trim();
    if (text === '×' || text === '←' || text.length === 0) {
      return;
    }
    
    // 保存原始HTML内容，以便正确恢复
    const originalHTML = el.innerHTML;
    const originalText = text;
    
    // 标记为已处理
    el.dataset.glitchProcessed = 'true';
    el.dataset.glitchOriginal = originalText;
    el.dataset.glitchOriginalHTML = originalHTML;
    
    textElements.push({
      element: el,
      originalText: originalText,
      originalHTML: originalHTML
    });
  });
  
  const animate = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    textElements.forEach(({ element, originalText, originalHTML }) => {
      if (progress < 1) {
        element.textContent = decodeText(originalText, progress);
        element.classList.add('text-glitching');
      } else {
        // 恢复原始内容，使用保存的原始HTML
        const savedHTML = element.dataset.glitchOriginalHTML || originalHTML;
        const savedText = element.dataset.glitchOriginal || originalText;
        
        if (savedHTML && savedHTML !== savedText && savedHTML.includes('<')) {
          element.innerHTML = savedHTML;
        } else {
          element.textContent = savedText;
        }
        element.classList.remove('text-glitching');
        // 清除标记，允许下次重新应用动画
        delete element.dataset.glitchProcessed;
      }
    });
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};

// 移除模态框和专辑列表的监听器，因为动画只执行一次

onMounted(() => {
  if (audioPlayerRef.value) {
    initAudioPlayer(audioPlayerRef.value);
  }
  
  // 等待DOM完全渲染后应用文字动画
  nextTick(() => {
    setTimeout(() => {
      applyTextGlitch();
    }, 100);
  });
});
</script>

<style>
/* 全局樣式將從 styles.css 導入 */
</style>

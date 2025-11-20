<template>
  <div id="app">
    <ParticleBackground />
    <Navbar />
    <TopBar @search="handleSearch" />
    <AlbumList ref="albumListRef" @view-album="handleViewAlbum" />
    <Modal @close="handleModalClose" />
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
import { initAudioPlayer, modalState, albumState } from './stores/player.js';
import { fetchAlbumDetails } from './services/api.js';
import { decodeText } from './utils/textGlitch.js';

const audioPlayerRef = ref(null);
const albumListRef = ref(null);

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
const applyTextGlitch = () => {
  const duration = 3000; // 3秒
  const startTime = performance.now();
  
  // 选择所有包含文本的元素（排除input、button内的文本，因为它们会动态变化）
  const textSelectors = [
    '.page-title',
    'button:not(.control-btn):not(.pagination-btn):not(.page-number)',
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
    // 跳过已经有子元素或动态内容的元素
    if (el.children.length > 0 && Array.from(el.children).some(child => 
      child.tagName === 'I' || child.tagName === 'IMG' || child.classList.contains('scrolling')
    )) {
      return;
    }
    
    const text = el.textContent.trim();
    if (text && text.length > 0) {
      textElements.push({
        element: el,
        originalText: text
      });
    }
  });
  
  const animate = (timestamp) => {
    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    textElements.forEach(({ element, originalText }) => {
      if (progress < 1) {
        element.textContent = decodeText(originalText, progress);
        element.classList.add('text-glitching');
      } else {
        element.textContent = originalText;
        element.classList.remove('text-glitching');
      }
    });
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};

// 监听模态框打开，当专辑详情加载时也应用动画
watch(() => [modalState.isOpen, modalState.currentView, albumState.currentAlbumDetails], 
  ([isOpen, view, albumDetails]) => {
    if (isOpen && view === 'album' && albumDetails) {
      // 等待DOM更新后应用动画
      nextTick(() => {
        setTimeout(() => {
          applyTextGlitch();
        }, 200);
      });
    }
  },
  { deep: true }
);

// 监听专辑列表加载完成，应用动画到新加载的专辑卡片
watch(() => albumState.allAlbums.length, (newLength, oldLength) => {
  if (newLength > oldLength && oldLength === 0) {
    // 首次加载专辑列表时，应用动画
    nextTick(() => {
      setTimeout(() => {
        applyTextGlitch();
      }, 300);
    });
  }
});

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


<template>
  <div class="now-playing-bar" ref="barRef">
    <span class="signal-label">CURRENT SIGNAL</span>
    <div id="audio-visualizer" :class="{ paused: !playerState.isPlaying }">
      <div 
        v-for="(bar, index) in visualizerBars" 
        :key="index"
        class="audio-bar"
        :style="{ height: bar.height + '%' }"
      ></div>
    </div>
    <div 
      class="now-playing-marquee-container"
      @click="handleTitleClick"
      :class="{ clickable: playerState.currentSong }"
    >
      <span 
        id="now-playing-title" 
        ref="titleRef"
        :class="{ scrolling: isScrolling }"
      >
        {{ currentTitle }}
      </span>
    </div>
    <button 
      class="now-playing-dropdown" 
      @click="toggleDropdown"
    >
      <i :class="dropdownState.isOpen ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'"></i>
    </button>
    <div 
      class="now-playing-dropdown-list" 
      :class="{ show: dropdownState.isOpen }"
      ref="dropdownRef"
    >
      <div 
        v-for="(song, idx) in dropdownState.allSongs" 
        :key="song.cid"
        class="dropdown-song-item"
        :class="{ active: idx === playerState.currentSongIndex && isCurrentSong(song) }"
        @click="handleSongClick(song)"
      >
        <span>{{ song.name }}</span>
        <span style="color:#8b949e;font-size:0.9em;">- {{ song.artistes?.join(', ') || t('common.unknownArtist') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { playerState, dropdownState, modalState } from '../stores/player.js';
import { playSongFromMasterList } from '../stores/player.js';

const { t } = useI18n();

const barRef = ref(null);
const titleRef = ref(null);
const dropdownRef = ref(null);
const isScrolling = ref(false);
const visualizerBars = ref([
  { height: 30 },
  { height: 60 },
  { height: 40 },
  { height: 80 },
  { height: 50 }
]);

const currentTitle = computed(() => {
  return playerState.currentSong?.name || t('common.noNowPlaying');
});

const isCurrentSong = (song) => {
  return playerState.currentSong?.cid === song.cid;
};

// 更新跑馬燈效果
const updateMarquee = () => {
  if (!titleRef.value) return;
  
  setTimeout(() => {
    if (!titleRef.value) return;
    const container = titleRef.value.parentElement;
    if (!container) return;
    
    const hasOverflow = titleRef.value.scrollWidth > container.clientWidth + 1;
    isScrolling.value = hasOverflow;
    
    if (hasOverflow && titleRef.value) {
      const duration = titleRef.value.scrollWidth / 40;
      titleRef.value.style.animation = `marquee ${duration < 10 ? 10 : duration}s linear infinite`;
    }
  }, 100);
};

// 音頻可視化動畫
let animationFrame = null;
const animateVisualizer = () => {
  if (playerState.isPlaying) {
    visualizerBars.value.forEach(bar => {
      bar.height = Math.random() * 60 + 20;
    });
  } else {
    visualizerBars.value.forEach(bar => {
      bar.height = Math.max(bar.height * 0.9, 5);
    });
  }
  animationFrame = requestAnimationFrame(animateVisualizer);
};

// 切換下拉列表
const toggleDropdown = async () => {
  if (dropdownState.isOpen) {
    dropdownState.isOpen = false;
  } else {
    if (!dropdownState.isLoaded) {
      await loadAllSongs();
    }
    dropdownState.isOpen = true;
  }
};

// 載入所有歌曲
const loadAllSongs = async () => {
  if (dropdownState.isLoaded) return;
  
  try {
    const { fetchSongs } = await import('../services/api.js');
    const songs = await fetchSongs();
    dropdownState.allSongs = songs.map(song => ({
      cid: song.cid,
      name: song.name,
      artistes: song.artists || [t('common.unknownArtist')]
    }));
    dropdownState.isLoaded = true;
  } catch (error) {
    console.error('載入所有歌曲列表時出錯:', error);
  }
};

// 處理歌曲點擊
const handleSongClick = (song) => {
  playSongFromMasterList(song);
  dropdownState.isOpen = false;
};

// 處理標題點擊，打開播放器視圖
const handleTitleClick = (event) => {
  event.stopPropagation(); // 防止觸發外部點擊事件
  if (playerState.currentSong) {
    modalState.currentView = 'player';
    modalState.isOpen = true;
    dropdownState.isOpen = false; // 關閉下拉菜單（如果打開的話）
  }
};

// 點擊外部關閉下拉列表
const handleClickOutside = (event) => {
  if (barRef.value && !barRef.value.contains(event.target)) {
    dropdownState.isOpen = false;
  }
};

watch(currentTitle, () => {
  updateMarquee();
});

onMounted(() => {
  updateMarquee();
  animateVisualizer();
  document.body.addEventListener('click', handleClickOutside);
});

onUnmounted(() => {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
  }
  document.body.removeEventListener('click', handleClickOutside);
});
</script>

<style scoped>
.now-playing-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(13, 16, 19, 0.9);
  border: 1px solid rgba(111, 122, 132, 0.35);
  border-radius: 2px;
  padding: 7px 10px;
  width: 100%;
  max-width: 720px;
  position: relative;
  min-height: 44px;
}

.signal-label {
  flex-shrink: 0;
  color: var(--accent-orange);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  border-right: 1px solid rgba(111, 122, 132, 0.35);
  padding-right: 10px;
}

.now-playing-marquee-container {
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  color: var(--text-color);
  font-weight: 700;
  font-size: 0.9rem;
}

.now-playing-marquee-container.clickable {
  cursor: pointer;
  transition: opacity 0.2s;
}

.now-playing-marquee-container.clickable:hover {
  opacity: 0.8;
}

#now-playing-title {
  display: inline-block;
}

#now-playing-title.scrolling {
  padding-left: 100%;
  animation: marquee 15s linear infinite;
}

.now-playing-dropdown {
  background: rgba(79, 182, 255, 0.12);
  color: var(--primary-color);
  border: 1px solid rgba(79, 182, 255, 0.4);
  border-radius: 2px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 1.1rem;
  margin-left: 8px;
  transition: background 0.2s;
}

.now-playing-dropdown:hover {
  background: rgba(255, 138, 42, 0.16);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

.now-playing-dropdown-list {
  position: absolute;
  top: 105%;
  left: 0;
  width: 100%;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  max-height: 60vh;
  overflow-y: auto;
  background: #090c10;
  border: 1px solid var(--border-color);
  border-radius: 2px;
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.45);
  z-index: 2000;
  padding: 6px 0;
}

.now-playing-dropdown-list.show {
  visibility: visible;
  opacity: 1;
}

.dropdown-song-item {
  padding: 8px 18px;
  color: var(--text-color);
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
  font-size: 1rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dropdown-song-item:hover,
.dropdown-song-item.active {
  background: rgba(79, 182, 255, 0.14);
  color: var(--text-color);
}

#audio-visualizer {
  display: flex;
  align-items: flex-end;
  height: 32px;
  width: 48px;
  gap: 3px;
  margin-left: 8px;
}

.audio-bar {
  width: 3px;
  height: 100%;
  background: var(--accent-cyan);
  border-radius: 0;
  transition: height 0.15s cubic-bezier(.4,2,.6,1), background 0.2s;
  opacity: 0.85;
}

#audio-visualizer.paused .audio-bar {
  background: var(--text-secondary);
  opacity: 0.5;
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
  .signal-label {
    display: none;
  }
  #now-playing-title {
    max-width: 90px;
    font-size: 0.95rem;
  }
  .now-playing-dropdown-list {
    width: 100%;
    min-width: 200px;
    max-width: 100vw;
    left: 0;
    right: 0;
    font-size: 0.95rem;
  }
  .signal-label {
    display: none;
  }
  #audio-visualizer {
    height: 20px;
    width: 32px;
    gap: 2px;
  }
  .audio-bar {
    width: 3px;
  }
}

@media (max-width: 600px) {
  #now-playing-title {
    max-width: 60px;
    font-size: 0.8rem;
  }
  .now-playing-dropdown-list {
    width: 100%;
    min-width: 180px;
    max-width: 100vw;
    left: 0;
    right: 0;
    font-size: 0.8rem;
  }
  #audio-visualizer {
    height: 14px;
    width: 20px;
    gap: 1px;
  }
  .audio-bar {
    width: 2px;
  }
}
</style>

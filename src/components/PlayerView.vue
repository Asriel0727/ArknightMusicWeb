<template>
  <div class="player-view-grid">
    <div class="player-view-left">
      <div class="player-container">
        <div class="player-header">
          <div class="player-cover" :class="{ playing: playerState.isPlaying }">
            <img 
              v-if="playerState.currentSong && playerState.currentSong.coverUrl"
              :src="proxyImageUrl(playerState.currentSong.coverUrl)" 
              :alt="playerState.currentSong.name"
              @load="handleImageLoad"
              @error="handleImageError"
            >
            <div v-else class="no-cover">無封面</div>
          </div>
          <div class="player-info">
            <h4>{{ playerState.currentSong?.name || '未知歌曲' }}</h4>
            <p>{{ playerState.currentSong?.artistes?.join(', ') || '未知演出者' }}</p>
          </div>
        </div>
        <div class="player-controls">
          <div class="controls-top">
            <button class="control-btn" @click="playPreviousSong">
              <i class="fas fa-step-backward"></i>
            </button>
            <button class="control-btn play-pause" @click="togglePlay">
              <i :class="playerState.isPlaying ? 'fas fa-pause' : 'fas fa-play'"></i>
            </button>
            <button class="control-btn" @click="playNextSong">
              <i class="fas fa-step-forward"></i>
            </button>
          </div>
          <div class="progress-container" @click="handleSeek">
            <div class="progress-bar" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <div class="progress-time">
            <span>{{ formatTime(playerState.currentTime) }}</span>
            <span>{{ formatTime(playerState.duration) }}</span>
          </div>
          <div class="controls-bottom">
            <div class="volume-control">
              <button class="control-btn" @click="toggleMute">
                <i :class="volumeIcon"></i>
              </button>
              <input 
                type="range" 
                :value="playerState.volume" 
                min="0" 
                max="1" 
                step="0.05"
                @input="handleVolumeChange"
              >
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="player-view-right">
      <img 
        v-if="playerState.currentSong && playerState.currentSong.coverDeUrl"
        :src="proxyImageUrl(playerState.currentSong.coverDeUrl)" 
        :alt="playerState.currentSong.name" 
        class="album-grid-visual-small"
        @load="handleImageLoad"
        @error="handleImageError"
      >
      <div 
        v-if="playerState.lyrics && playerState.lyrics.length > 0" 
        class="lyrics-container"
        ref="lyricsContainerRef"
        @scroll="handleLyricsScroll"
      >
        <div 
          v-for="(line, index) in playerState.lyrics" 
          :key="index"
          class="lyrics-line"
          :class="{ active: activeLyricIndex === index }"
          :data-time="line.time"
        >
          {{ line.text }}
        </div>
      </div>
      <p v-else class="no-lyrics">暫無歌詞</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { playerState, togglePlay, playPreviousSong, playNextSong, seek, setVolume, toggleMute } from '../stores/player.js';
import { formatTime } from '../utils/time.js';

const lyricsContainerRef = ref(null);
const activeLyricIndex = ref(-1);
let lyricsAnimationFrame = null;
let isUserScrolling = false;
let userScrollTimeout = null;

// 歌詞時間偏移量（秒），正值表示提前顯示歌詞
const LYRICS_TIME_OFFSET = 0.5;

const progressPercent = computed(() => {
  if (!playerState.duration || playerState.duration === 0) return 0;
  return (playerState.currentTime / playerState.duration) * 100;
});

const volumeIcon = computed(() => {
  if (playerState.isMuted || playerState.volume === 0) {
    return 'fas fa-volume-mute';
  } else if (playerState.volume > 0.5) {
    return 'fas fa-volume-up';
  } else {
    return 'fas fa-volume-down';
  }
});

const proxyImageUrl = (url) => {
  if (!url) {
    return '';
  }
  // 使用和原本一樣的方法構建URL
  return `https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(url)}`;
};

const handleImageLoad = (event) => {
  event.target.classList.add('loaded');
};

const handleImageError = (event) => {
  console.error('圖片加載失敗:', event.target.src);
  // 不隱藏圖片，讓它顯示錯誤狀態
};

const handleSeek = (event) => {
  const progressContainer = event.currentTarget;
  const rect = progressContainer.getBoundingClientRect();
  const seekPosition = (event.clientX - rect.left) / rect.width;
  seek(seekPosition);
};

const handleVolumeChange = (event) => {
  setVolume(event.target.value);
};

// 同步歌詞高亮和滾動
const syncLyricsHighlight = (currentTime) => {
  if (!playerState.lyrics || playerState.lyrics.length === 0) return;
  if (!lyricsContainerRef.value) return;

  // 添加時間偏移量，讓歌詞提前顯示
  const adjustedTime = currentTime + LYRICS_TIME_OFFSET;

  let newActiveIndex = -1;
  for (let i = 0; i < playerState.lyrics.length; i++) {
    if (playerState.lyrics[i].time <= adjustedTime) {
      newActiveIndex = i;
    } else {
      break;
    }
  }

  // 始終更新高亮狀態（不管用戶是否在滾動）
  if (newActiveIndex !== activeLyricIndex.value && newActiveIndex !== -1) {
    activeLyricIndex.value = newActiveIndex;
    
    // 只有在用戶沒有主動滾動時才自動滾動
    if (!isUserScrolling) {
      const activeElement = lyricsContainerRef.value.querySelector(
        `.lyrics-line[data-time="${playerState.lyrics[newActiveIndex].time}"]`
      );
      
      if (activeElement) {
        const containerHeight = lyricsContainerRef.value.clientHeight;
        const lineTop = activeElement.offsetTop;
        const lineHeight = activeElement.clientHeight;
        const targetScroll = lineTop - containerHeight / 2 + lineHeight / 2;

        lyricsContainerRef.value.scrollTo({
          top: targetScroll,
          behavior: 'smooth'
        });
      }
    }
  }
};

// 使用 requestAnimationFrame 實現高頻率歌詞同步
const startLyricsSync = () => {
  const sync = () => {
    if (playerState.audioPlayer && playerState.isPlaying) {
      // 直接從 audio 元素獲取當前時間，更準確
      const currentTime = playerState.audioPlayer.currentTime;
      syncLyricsHighlight(currentTime);
    }
    lyricsAnimationFrame = requestAnimationFrame(sync);
  };
  lyricsAnimationFrame = requestAnimationFrame(sync);
};

const stopLyricsSync = () => {
  if (lyricsAnimationFrame) {
    cancelAnimationFrame(lyricsAnimationFrame);
    lyricsAnimationFrame = null;
  }
};

const handleLyricsScroll = () => {
  // 用戶主動滾動時，暫時停止自動滾動但繼續更新高亮
  isUserScrolling = true;
  
  // 清除之前的超時
  if (userScrollTimeout) {
    clearTimeout(userScrollTimeout);
  }
  
  // 3秒後恢復自動滾動
  userScrollTimeout = setTimeout(() => {
    isUserScrolling = false;
  }, 3000);
};

// 監聽播放狀態，控制歌詞同步循環
watch(() => playerState.isPlaying, (isPlaying) => {
  if (isPlaying) {
    startLyricsSync();
  } else {
    stopLyricsSync();
  }
}, { immediate: true });

watch(() => playerState.currentSong, (newSong) => {
  console.log('當前歌曲更新:', newSong);
  console.log('歌詞數量:', playerState.lyrics?.length || 0);
  activeLyricIndex.value = -1;
  if (lyricsContainerRef.value) {
    lyricsContainerRef.value.scrollTop = 0;
  }
});

watch(() => playerState.lyrics, (newLyrics) => {
  console.log('歌詞更新:', newLyrics?.length || 0, '條');
  // 歌詞更新時重置高亮索引
  activeLyricIndex.value = -1;
}, { deep: true });

// 組件掛載時，如果正在播放則啟動同步
onMounted(() => {
  if (playerState.isPlaying) {
    startLyricsSync();
  }
});

// 組件卸載時清理動畫循環和超時
onUnmounted(() => {
  stopLyricsSync();
  if (userScrollTimeout) {
    clearTimeout(userScrollTimeout);
  }
});
</script>

<style scoped>
.player-view-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 30px;
  align-items: center;
}

.player-view-left,
.player-view-right {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.player-view-left .player-container {
  margin-top: 0;
  padding: 0;
  background: none;
}

.player-container {
  margin-top: 30px;
  background: rgba(13, 17, 23, 0.7);
  padding: 20px;
  border-radius: 10px;
}

.player-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 20px;
  text-align: center;
}

.player-cover {
  width: 250px;
  height: 250px;
  border-radius: 200px;
  overflow: hidden;
  margin-right: 0;
  margin-bottom: 15px;
  animation: spin 20s linear infinite;
  animation-play-state: paused;
}

.player-cover.playing {
  animation-play-state: running;
}

.player-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-cover .no-cover {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--border-color);
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.player-info {
  flex: 1;
}

.player-info h4 {
  font-size: 1.2rem;
  margin-bottom: 5px;
  color: var(--primary-color);
}

.player-info p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.player-controls {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.controls-top {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.control-btn {
  background: none;
  border: none;
  color: var(--text-color);
  font-size: 1.2rem;
  cursor: pointer;
  min-width: 44px;
  max-width: 44px;
  width: 44px;
  min-height: 44px;
  max-height: 44px;
  height: 44px;
  border-radius: 50%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
  flex-shrink: 0;
  flex-grow: 0;
  padding: 0;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: var(--primary-color);
}

.control-btn.play-pause {
  background: var(--primary-color);
  color: white;
  font-size: 1.5rem;
  min-width: 56px;
  max-width: 56px;
  width: 56px;
  min-height: 56px;
  max-height: 56px;
  height: 56px;
}

.control-btn.play-pause:hover {
  background: #3d8eff;
  transform: scale(1.05);
}

.progress-container {
  width: 100%;
  height: 6px;
  background: var(--border-color);
  border-radius: 3px;
  cursor: pointer;
  margin: 10px 0;
}

.progress-bar {
  height: 100%;
  background: var(--primary-color);
  border-radius: 3px;
  width: 0%;
  position: relative;
  transition: width 0.1s linear;
}

.progress-time {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin-top: 5px;
}

.controls-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.volume-control input[type="range"] {
  width: 100px;
}

.album-grid-visual-small {
  width: 80%;
  max-width: 400px;
  height: auto;
  border-radius: 8px;
  display: block;
  margin: 0 auto 15px auto;
}

.lyrics-container {
  margin-top: 0;
  max-height: 250px;
  overflow-y: auto;
  background: rgba(13, 17, 23, 0.5);
  padding: 20px;
  border-radius: 8px;
  scroll-behavior: smooth;
  position: relative;
}

.lyrics-line {
  margin-bottom: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  transition: all 0.3s;
  padding: 5px 10px;
  border-radius: 4px;
  position: relative;
}

.lyrics-line.active {
  color: var(--primary-color);
  font-weight: bold;
  font-size: 1.1rem;
  background: rgba(88, 166, 255, 0.1);
  transform: scale(1.02);
  z-index: 1;
}

.no-lyrics {
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .player-view-grid {
    grid-template-columns: 1fr;
  }
  
  .player-header {
    flex-direction: column;
    text-align: center;
  }
  
  .player-cover {
    margin-right: 0;
    margin-bottom: 15px;
  }
}
</style>


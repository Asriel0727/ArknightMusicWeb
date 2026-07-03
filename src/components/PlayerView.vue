<template>
  <div class="player-view-grid" :class="{ 'single-panel': !hasRightPanel }">
    <div class="player-view-left">
      <div class="player-container">
        <div class="player-header">
          <div class="player-cover" :class="{ playing: playerState.isPlaying }"
          >
            <img 
              v-if="playerState.currentSong && playerState.currentSong.coverUrl"
              :src="proxyImageUrl(playerState.currentSong.coverUrl)" 
              :alt="playerState.currentSong.name"
              decoding="async"
              fetchpriority="high"
              @load="handleImageLoad"
              @error="handleImageError"
            >
            <div v-else class="no-cover">{{ t('common.noCover') }}</div>
          </div>
          <div class="player-info">
            <h4>{{ playerState.currentSong?.name || t('common.unknownSong') }}</h4>
            <p>{{ playerState.currentSong?.artistes?.join(', ') || t('common.unknownArtist') }}</p>
          </div>
        </div>
        <div class="player-controls">
          <div class="controls-top">
            <button class="control-btn" :title="playModeTitle" @click="togglePlayMode">
              <i :class="playModeIcon"></i>
            </button>
            <button class="control-btn" @click="playPreviousSong">
              <i class="fas fa-step-backward"></i>
            </button>
            <button class="control-btn play-pause" @click="togglePlay">
              <i :class="playerState.isPlaying ? 'fas fa-pause' : 'fas fa-play'"></i>
            </button>
            <button class="control-btn" @click="playNextSong">
              <i class="fas fa-step-forward"></i>
            </button>
            <button
              class="control-btn"
              :disabled="!playerState.currentSong"
              :title="shareButtonTitle"
              @click="handleShareSong"
            >
              <i :class="shareIcon"></i>
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
                v-model.number="playerState.volume" 
                min="0" 
                max="1" 
                step="0.05"
                @input="handleVolumeChange"
              >
            </div>
            <label class="lyrics-translation-toggle">
              <input
                v-model="playerState.showLyricTranslation"
                type="checkbox"
                @change="handleLyricTranslationToggle"
              >
              <span class="toggle-track" aria-hidden="true">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-label">ç¿»è­¯</span>
            </label>
            <div v-if="authState.user && playerState.currentSong" class="library-actions">
              <button class="library-btn" type="button" :title="isFavoriteSong ? 'Remove favorite' : 'Add favorite'" @click="toggleFavoriteSong">
                <i :class="isFavoriteSong ? 'fas fa-heart' : 'far fa-heart'"></i>
              </button>
              <select v-model="selectedPlaylistId" class="playlist-select" @focus="loadUserPlaylists">
                <option value="">????</option>
                <option v-for="playlist in userPlaylists" :key="playlist.id" :value="playlist.id">{{ playlist.name }}</option>
              </select>
              <button class="library-btn" type="button" @click="addCurrentSongToPlaylist">??</button>
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
        decoding="async"
        fetchpriority="high"
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
          <div class="lyrics-original">
            {{ line.text }}
          </div>
          <div
            v-if="playerState.showLyricTranslation && line.translation"
            class="lyrics-translation"
          >
            {{ line.translation }}
          </div>
        </div>
      </div>
      <p v-else class="no-lyrics">{{ t('common.noLyrics') }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { playerState, togglePlay, playPreviousSong, playNextSong, seek, setVolume, toggleMute, refreshLyricTranslations, togglePlayMode } from '../stores/player.js';
import { createSongShareUrl as createSongSharePageUrl, getProxyImageUrl } from '../services/api.js';
import { authState } from '../services/auth.js';
import { addFavoriteSong, addSongToPlaylist, createPlaylist, fetchFavoriteSongs, fetchPlaylists, removeFavoriteSong } from '../services/userLibrary.js';
import { formatTime } from '../utils/time.js';

const { t, locale } = useI18n();
const emit = defineEmits(['view-album']);

const lyricsContainerRef = ref(null);
const activeLyricIndex = ref(-1);
const hasCopiedShareLink = ref(false);
const isFavoriteSong = ref(false);
const userPlaylists = ref([]);
const selectedPlaylistId = ref('');
let lyricsAnimationFrame = null;
let isUserScrolling = false;
let userScrollTimeout = null;
let shareStatusTimeout = null;

const LYRICS_TIME_OFFSET = 0.5;

const loadUserPlaylists = async () => {
  if (!authState.user) return;
  userPlaylists.value = await fetchPlaylists();
};

const refreshFavoriteState = async () => {
  if (!authState.user || !playerState.currentSong?.cid) {
    isFavoriteSong.value = false;
    return;
  }

  const favorites = await fetchFavoriteSongs();
  isFavoriteSong.value = favorites.some((favorite) => favorite.song_cid === playerState.currentSong.cid);
};

const toggleFavoriteSong = async () => {
  const songId = playerState.currentSong?.cid;
  if (!authState.user || !songId) return;

  if (isFavoriteSong.value) {
    await removeFavoriteSong(songId);
    isFavoriteSong.value = false;
    return;
  }

  await addFavoriteSong(songId);
  isFavoriteSong.value = true;
};

const addCurrentSongToPlaylist = async () => {
  const songId = playerState.currentSong?.cid;
  if (!authState.user || !songId) return;

  if (!selectedPlaylistId.value) {
    const name = window.prompt('????????');
    if (!name) return;
    const playlist = await createPlaylist(name);
    await loadUserPlaylists();
    selectedPlaylistId.value = playlist?.id || '';
  }

  if (selectedPlaylistId.value) {
    await addSongToPlaylist(selectedPlaylistId.value, songId);
  }
};

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

const hasRightPanel = computed(() => {
  return Boolean(playerState.currentSong?.coverDeUrl || playerState.lyrics?.length);
});

const shareIcon = computed(() => {
  return hasCopiedShareLink.value ? 'fas fa-check' : 'fas fa-share-alt';
});

const shareButtonTitle = computed(() => {
  return hasCopiedShareLink.value ? 'å·²è?è£½æ??²é€??' : '?†äº«æ­Œæ›²???';
});

const playModeIcon = computed(() => {
  if (playerState.playMode === 'repeat-one') {
    return 'fas fa-redo-alt';
  }

  if (playerState.playMode === 'shuffle') {
    return 'fas fa-random';
  }

  return 'fas fa-sync-alt';
});

const playModeTitle = computed(() => {
  if (playerState.playMode === 'repeat-one') {
    return '?®é?å¾ªç’°';
  }

  if (playerState.playMode === 'shuffle') {
    return '?¨æ??­æ”¾';
  }

  return '?—è¡¨å¾ªç’°';
});

const proxyImageUrl = (url) => {
  if (!url) {
    return '';
  }
  return getProxyImageUrl(url);
};

const handleImageLoad = (event) => {
  event.target.classList.add('loaded');
};

const handleImageError = (event) => {
  console.error('?–ç?? è?å¤±æ?:', event.target.src);
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

const handleLyricTranslationToggle = () => {
  if (playerState.showLyricTranslation) {
    refreshLyricTranslations();
  }
};

const handleViewAlbum = () => {
  if (!playerState.currentSong?.albumCid) {
    return;
  }

  emit('view-album');
};

const createSongShareUrl = () => {
  const songId = playerState.currentSong?.cid;
  if (!songId) {
    return '';
  }

  const appUrl = new URL(window.location.href);
  appUrl.searchParams.set('song', songId);
  return createSongSharePageUrl(songId, appUrl.toString());
};

const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const handleShareSong = async () => {
  const shareUrl = createSongShareUrl();
  if (!shareUrl) {
    return;
  }

  await copyText(shareUrl);
  hasCopiedShareLink.value = true;

  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
  }

  shareStatusTimeout = setTimeout(() => {
    hasCopiedShareLink.value = false;
  }, 1600);
};

// ?Œæ­¥æ­Œè?é«˜äº®?Œæ»¾??
const syncLyricsHighlight = (currentTime) => {
  if (!playerState.lyrics || playerState.lyrics.length === 0) return;
  if (!lyricsContainerRef.value) return;

  const adjustedTime = currentTime + LYRICS_TIME_OFFSET;

  let newActiveIndex = -1;
  for (let i = 0; i < playerState.lyrics.length; i++) {
    if (playerState.lyrics[i].time <= adjustedTime) {
      newActiveIndex = i;
    } else {
      break;
    }
  }

  if (newActiveIndex !== activeLyricIndex.value && newActiveIndex !== -1) {
    activeLyricIndex.value = newActiveIndex;
    
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

// ä½¿ç”¨ requestAnimationFrame å¯¦ç¾é«˜é »?‡æ?è©žå?æ­?
const startLyricsSync = () => {
  const sync = () => {
    if (playerState.audioPlayer && playerState.isPlaying) {
      // ?´æŽ¥å¾?audio ?ƒç??²å??¶å??‚é?ï¼Œæ›´æº–ç¢º
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
  // ?¨æˆ¶ä¸»å?æ»¾å??‚ï??«æ??œæ­¢?ªå?æ»¾å?ä½†ç¹¼çºŒæ›´?°é?äº?
  isUserScrolling = true;
  
  // æ¸…é™¤ä¹‹å??„è???
  if (userScrollTimeout) {
    clearTimeout(userScrollTimeout);
  }
  
  // 3ç§’å??¢å¾©?ªå?æ»¾å?
  userScrollTimeout = setTimeout(() => {
    isUserScrolling = false;
  }, 3000);
};

// ??½?­æ”¾?€?‹ï??§åˆ¶æ­Œè??Œæ­¥å¾ªç’°
watch(() => playerState.isPlaying, (isPlaying) => {
  if (isPlaying) {
    startLyricsSync();
  } else {
    stopLyricsSync();
  }
}, { immediate: true });

watch(() => playerState.currentSong, (newSong) => {
  activeLyricIndex.value = -1;
  if (lyricsContainerRef.value) {
    lyricsContainerRef.value.scrollTop = 0;
  }
});

watch(() => playerState.lyrics, (newLyrics) => {
  // æ­Œè??´æ–°?‚é?ç½®é?äº®ç´¢å¼?
  activeLyricIndex.value = -1;
}, { deep: true });

watch(locale, () => {
  if (playerState.showLyricTranslation && playerState.lyrics.length > 0) {
    refreshLyricTranslations();
  }
});

// çµ„ä»¶?›è??‚ï?å¦‚æ?æ­?œ¨?­æ”¾?‡å??•å?æ­?
onMounted(() => {
  refreshFavoriteState().catch(() => {});
  loadUserPlaylists().catch(() => {});
  if (playerState.isPlaying) {
    startLyricsSync();
  }
});

// çµ„ä»¶?¸è??‚æ??†å??«å¾ª?°å?è¶…æ?
onUnmounted(() => {
  stopLyricsSync();
  if (userScrollTimeout) {
    clearTimeout(userScrollTimeout);
  }
  if (shareStatusTimeout) {
    clearTimeout(shareStatusTimeout);
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
  border: none;
  padding: 0;
  background: transparent;
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

.control-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.control-btn:disabled:hover {
  background: none;
  color: var(--text-color);
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
  gap: 16px;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
}

.volume-control input[type="range"] {
  width: 100px;
}

.lyrics-translation-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}

.lyrics-translation-toggle input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.toggle-track {
  position: relative;
  width: 42px;
  height: 22px;
  border-radius: 999px;
  background: var(--border-color);
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-secondary);
  transition: transform 0.2s ease, background 0.2s ease;
}

.lyrics-translation-toggle input:checked + .toggle-track {
  background: rgba(88, 166, 255, 0.32);
}

.lyrics-translation-toggle input:checked + .toggle-track .toggle-thumb {
  transform: translateX(20px);
  background: var(--primary-color);
}

.lyrics-translation-toggle input:focus-visible + .toggle-track {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.toggle-label {
  line-height: 1;
}

.album-grid-visual-small {
  width: 80%;
  max-width: 400px;
  height: auto;
  border-radius: 8px;
  display: block;
  margin: 0 auto 15px auto;
}

.player-view-grid.single-panel {
  grid-template-columns: minmax(0, 1fr);
}

.player-view-grid.single-panel .player-view-left {
  max-width: 520px;
  width: 100%;
  justify-self: center;
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

.lyrics-original {
  line-height: 1.5;
}

.lyrics-translation {
  margin-top: 4px;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--text-secondary);
}

.lyrics-line.active .lyrics-translation {
  color: rgba(88, 166, 255, 0.85);
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

<style scoped>
.library-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.library-btn { border: 1px solid var(--primary-color); border-radius: 6px; background: transparent; color: var(--primary-color); padding: 6px 9px; cursor: pointer; }
.playlist-select { max-width: 150px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--card-bg); color: var(--text-color); padding: 6px; }
</style>

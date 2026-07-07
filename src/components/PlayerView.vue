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
              <span class="toggle-label">{{ t('player.translationToggle') }}</span>
            </label>
            <div v-if="authState.user && playerState.currentSong" class="library-actions">
              <button class="library-btn" type="button" :disabled="favoriteActionPending" :title="isFavoriteSong ? t('userLibrary.removeFavorite') : t('userLibrary.addFavorite')" @click="toggleFavoriteSong">
                <i :class="isFavoriteSong ? 'fas fa-heart' : 'far fa-heart'"></i>
              </button>
              <select v-model="selectedPlaylistId" class="playlist-select" @focus="loadUserPlaylists">
                <option value="">{{ t('userLibrary.selectPlaylist') }}</option>
                <option v-for="playlist in userPlaylists" :key="playlist.id" :value="playlist.id">{{ playlist.name }}</option>
              </select>
              <button class="library-btn" type="button" :disabled="isAddingToPlaylist" @click="addCurrentSongToPlaylist">{{ t('userLibrary.addToPlaylist') }}</button>
            </div>
            <div v-if="authState.user && playerState.currentSong" class="library-feedback-panel">
              <div class="playlist-membership" :class="{ empty: currentSongPlaylists.length === 0 }">
                <span class="membership-icon"><i class="fas fa-list-ul"></i></span>
                <div class="membership-content">
                  <span class="membership-label">
                    {{ currentSongPlaylists.length > 0 ? t('userLibrary.currentSongPlaylistGroup') : t('userLibrary.notInAnyPlaylist') }}
                  </span>
                  <div v-if="currentSongPlaylists.length > 0" class="playlist-chip-list" :title="currentSongPlaylistLabel">
                    <span v-for="playlist in visibleCurrentSongPlaylists" :key="playlist.id" class="playlist-chip">
                      {{ playlist.name }}
                    </span>
                    <span v-if="hiddenCurrentSongPlaylistCount > 0" class="playlist-chip more">
                      +{{ hiddenCurrentSongPlaylistCount }}
                    </span>
                  </div>
                </div>
              </div>
              <div v-if="libraryActionSuccess" class="library-action-toast success">
                <i class="fas fa-check-circle"></i>
                <span>{{ libraryActionSuccess }}</span>
              </div>
              <div v-if="libraryActionError" class="library-action-toast error">
                <i class="fas fa-exclamation-circle"></i>
                <span>{{ libraryActionError }}</span>
              </div>
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
  <div v-if="isCreatePlaylistDialogOpen" class="playlist-dialog-backdrop" @click.self="closeCreatePlaylistDialog">
    <section class="playlist-dialog" role="dialog" aria-modal="true" :aria-label="t('userLibrary.createPlaylistTitle')">
      <h3>{{ t('userLibrary.createPlaylistTitle') }}</h3>
      <p>{{ t('userLibrary.createPlaylistDescription') }}</p>
      <form class="playlist-dialog-form" @submit.prevent="createPlaylistAndAddCurrentSong">
        <label>
          <span>{{ t('userLibrary.playlistName') }}</span>
          <input
            v-model.trim="newPlaylistName"
            type="text"
            :placeholder="t('userLibrary.playlistNamePrompt')"
            maxlength="80"
            autofocus
          >
        </label>
        <p v-if="libraryActionError" class="library-action-error">{{ libraryActionError }}</p>
        <div class="playlist-dialog-actions">
          <button class="library-btn secondary" type="button" @click="closeCreatePlaylistDialog">
            {{ t('userLibrary.cancel') }}
          </button>
          <button class="library-btn primary" type="submit" :disabled="isAddingToPlaylist || !newPlaylistName.trim()">
            {{ isAddingToPlaylist ? t('userLibrary.adding') : t('userLibrary.createAndAdd') }}
          </button>
        </div>
      </form>
    </section>
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
const favoriteActionPending = ref(false);
const libraryActionError = ref('');
const libraryActionSuccess = ref('');
const userPlaylists = ref([]);
const selectedPlaylistId = ref('');
const isCreatePlaylistDialogOpen = ref(false);
const newPlaylistName = ref('');
const isAddingToPlaylist = ref(false);
let lyricsAnimationFrame = null;
let isUserScrolling = false;
let userScrollTimeout = null;
let shareStatusTimeout = null;
let libraryActionStatusTimeout = null;

const LYRICS_TIME_OFFSET = 0.5;

const clearLibraryActionStatus = () => {
  if (libraryActionStatusTimeout) {
    clearTimeout(libraryActionStatusTimeout);
    libraryActionStatusTimeout = null;
  }
  libraryActionError.value = '';
  libraryActionSuccess.value = '';
};

const setLibraryActionError = (error) => {
  clearLibraryActionStatus();
  libraryActionError.value = error?.message || t('userLibrary.actionFailed');
};

const setLibraryActionSuccess = (message) => {
  clearLibraryActionStatus();
  libraryActionSuccess.value = message;
  libraryActionStatusTimeout = setTimeout(() => {
    libraryActionSuccess.value = '';
    libraryActionStatusTimeout = null;
  }, 2400);
};

const loadUserPlaylists = async () => {
  if (!authState.user) return;
  userPlaylists.value = await fetchPlaylists();
};

const playlistNameSeparator = computed(() => {
  return ', ';
});

const currentSongPlaylists = computed(() => {
  const songId = playerState.currentSong?.cid;
  if (!songId) return [];

  return userPlaylists.value.filter((playlist) => {
    return (playlist.songs || []).some((song) => song.song_cid === songId);
  });
});

const visibleCurrentSongPlaylists = computed(() => currentSongPlaylists.value.slice(0, 3));

const hiddenCurrentSongPlaylistCount = computed(() => Math.max(currentSongPlaylists.value.length - visibleCurrentSongPlaylists.value.length, 0));

const currentSongPlaylistNames = computed(() => {
  return currentSongPlaylists.value.map((playlist) => playlist.name).join(playlistNameSeparator.value);
});

const currentSongPlaylistLabel = computed(() => {
  if (!currentSongPlaylistNames.value) {
    return t('userLibrary.notInAnyPlaylist');
  }

  return t('userLibrary.alreadyInPlaylists', { names: currentSongPlaylistNames.value });
});

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
  if (!authState.user || !songId || favoriteActionPending.value) return;

  clearLibraryActionStatus();
  favoriteActionPending.value = true;
  try {
    if (isFavoriteSong.value) {
      await removeFavoriteSong(songId);
      isFavoriteSong.value = false;
      return;
    }

    await addFavoriteSong(songId);
    isFavoriteSong.value = true;
  } catch (error) {
    setLibraryActionError(error);
  } finally {
    favoriteActionPending.value = false;
  }
};

const openCreatePlaylistDialog = () => {
  newPlaylistName.value = '';
  isCreatePlaylistDialogOpen.value = true;
};

const closeCreatePlaylistDialog = () => {
  if (isAddingToPlaylist.value) return;
  isCreatePlaylistDialogOpen.value = false;
  newPlaylistName.value = '';
};

const createPlaylistAndAddCurrentSong = async () => {
  const songId = playerState.currentSong?.cid;
  const playlistName = newPlaylistName.value.trim();
  if (!authState.user || !songId || !playlistName || isAddingToPlaylist.value) return;

  clearLibraryActionStatus();
  isAddingToPlaylist.value = true;
  try {
    const playlist = await createPlaylist(playlistName);
    selectedPlaylistId.value = playlist?.id || '';
    if (selectedPlaylistId.value) {
      await addSongToPlaylist(selectedPlaylistId.value, songId);
      await loadUserPlaylists();
      setLibraryActionSuccess(t('userLibrary.addedToPlaylist', { name: playlist?.name || playlistName }));
    }
    isCreatePlaylistDialogOpen.value = false;
    newPlaylistName.value = '';
  } catch (error) {
    setLibraryActionError(error);
  } finally {
    isAddingToPlaylist.value = false;
  }
};

const addCurrentSongToPlaylist = async () => {
  const songId = playerState.currentSong?.cid;
  if (!authState.user || !songId || isAddingToPlaylist.value) return;

  clearLibraryActionStatus();
  isAddingToPlaylist.value = true;
  try {
    await loadUserPlaylists();
  } catch (error) {
    setLibraryActionError(error);
    isAddingToPlaylist.value = false;
    return;
  }

  if (!selectedPlaylistId.value) {
    isAddingToPlaylist.value = false;
    openCreatePlaylistDialog();
    return;
  }

  try {
    const selectedPlaylist = userPlaylists.value.find((playlist) => playlist.id === selectedPlaylistId.value);
    const playlistName = selectedPlaylist?.name || '';
    const isAlreadyInPlaylist = (selectedPlaylist?.songs || []).some((song) => song.song_cid === songId);
    if (isAlreadyInPlaylist) {
      setLibraryActionSuccess(t('userLibrary.alreadyInPlaylist', { name: playlistName || selectedPlaylistId.value }));
      return;
    }

    await addSongToPlaylist(selectedPlaylistId.value, songId);
    await loadUserPlaylists();
    setLibraryActionSuccess(t('userLibrary.addedToPlaylist', { name: playlistName || selectedPlaylistId.value }));
  } catch (error) {
    setLibraryActionError(error);
  } finally {
    isAddingToPlaylist.value = false;
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
  return hasCopiedShareLink.value ? t('player.copiedShareLink') : t('player.shareSong');
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
    return t('player.repeatOne');
  }

  if (playerState.playMode === 'shuffle') {
    return t('player.shuffle');
  }

  return t('player.repeatAll');
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
  clearLibraryActionStatus();
  refreshFavoriteState().catch(() => {});
  loadUserPlaylists().catch(() => {});
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
  if (libraryActionStatusTimeout) {
    clearTimeout(libraryActionStatusTimeout);
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
  flex-wrap: wrap;
  position: relative;
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
.library-btn:disabled { cursor: not-allowed; opacity: 0.55; }
.library-btn.primary { background: var(--primary-color); color: #111; }
.library-btn.secondary { color: var(--text-secondary); border-color: var(--border-color); }
.playlist-select { max-width: 150px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--card-bg); color: var(--text-color); padding: 6px; }
.playlist-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 12, 0.72);
  backdrop-filter: blur(8px);
}

.playlist-dialog {
  width: min(430px, 100%);
  border: 1px solid rgba(92, 178, 255, 0.24);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(24, 31, 42, 0.98), rgba(13, 17, 23, 0.98));
  color: var(--text-color);
  padding: 22px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.playlist-dialog h3 {
  margin: 0 0 8px;
  color: var(--primary-color);
  font-size: 1.08rem;
  font-weight: 700;
}

.playlist-dialog p {
  margin: 0 0 16px;
  color: var(--text-secondary);
  line-height: 1.6;
  font-size: 0.92rem;
}

.playlist-dialog-form {
  display: grid;
  gap: 16px;
}

.playlist-dialog-form label {
  display: grid;
  gap: 8px;
  color: var(--text-color);
  font-size: 0.9rem;
}

.playlist-dialog-form input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color);
  padding: 11px 12px;
  outline: none;
  transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}

.playlist-dialog-form input:focus {
  border-color: var(--primary-color);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(92, 178, 255, 0.16);
}

.playlist-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  padding-top: 2px;
}

.playlist-dialog .library-btn {
  min-height: 36px;
  padding: 8px 12px;
  transition: transform 140ms ease, background 160ms ease, border-color 160ms ease, opacity 160ms ease;
}

.playlist-dialog .library-btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.playlist-dialog .library-btn.primary {
  border-color: var(--primary-color);
  box-shadow: 0 8px 22px rgba(92, 178, 255, 0.18);
}

.library-feedback-panel {
  position: relative;
  flex: 1 0 100%;
  min-width: 0;
  height: 42px;
  margin-top: 2px;
}

.playlist-membership {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  width: 100%;
  height: 42px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  padding: 7px 9px;
}

.membership-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: rgba(92, 178, 255, 0.14);
  color: var(--primary-color);
  font-size: 0.72rem;
}

.playlist-membership.empty .membership-icon {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
}

.membership-content {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.membership-label {
  color: var(--text-secondary);
  font-size: 0.76rem;
  line-height: 1.2;
  white-space: nowrap;
}

.playlist-membership.empty .membership-content {
  display: block;
}

.playlist-chip-list {
  min-width: 0;
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  overflow: hidden;
  padding: 1px 0;
}

.playlist-chip {
  flex: 0 1 auto;
  max-width: 112px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(92, 178, 255, 0.22);
  border-radius: 999px;
  background: rgba(92, 178, 255, 0.11);
  color: var(--text-color);
  padding: 3px 8px;
  font-size: 0.76rem;
  line-height: 1.2;
}

.playlist-chip.more {
  flex: 0 0 auto;
  color: var(--primary-color);
  background: rgba(92, 178, 255, 0.07);
}

.library-action-toast {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  width: fit-content;
  border-radius: 999px;
  padding: 7px 10px;
  font-size: 0.82rem;
  line-height: 1.3;
}

.library-action-toast span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-action-toast.success {
  border: 1px solid rgba(126, 231, 135, 0.24);
  background: rgba(18, 35, 24, 0.96);
  color: #7ee787;
}

.library-action-toast.error {
  border: 1px solid rgba(255, 139, 134, 0.26);
  background: rgba(42, 22, 24, 0.96);
  color: #ff8b86;
}

@media (max-width: 520px) {
  .playlist-dialog-backdrop {
    align-items: flex-end;
    padding: 12px;
  }

  .playlist-dialog {
    padding: 18px;
  }

  .playlist-dialog-actions {
    justify-content: stretch;
  }

  .playlist-dialog-actions .library-btn {
    flex: 1 1 140px;
  }
}
</style>

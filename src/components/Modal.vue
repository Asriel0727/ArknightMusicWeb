<template>
  <div class="modal" :class="{ show: modalState.isOpen }" @click="handleBackdropClick">
    <div class="modal-content" @click.stop>
      <button class="modal-close" @click="handleClose">
        <i v-if="modalState.currentView === 'player'" class="fas fa-arrow-left"></i>
        <span v-else>×</span>
      </button>
      <div id="modal-body">
        <AlbumDetails 
          v-if="modalState.currentView === 'album' && albumState.currentAlbumDetails"
          :key="(albumState.currentAlbumDetails?.cid || 'album') + '-' + locale"
          :album="albumState.currentAlbumDetails"
          @play-song="handlePlaySong"
        />
        <PlayerView v-else-if="modalState.currentView === 'player'" :key="'player-' + locale" />
        <CharacterDetails 
          v-else-if="modalState.currentView === 'character' && characterState.currentCharacterDetails"
          :key="characterDetailsKey"
          :character="characterState.currentCharacterDetails"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, defineAsyncComponent, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { modalState, albumState, playerState, characterState } from '../stores/player.js';

const AlbumDetails = defineAsyncComponent(() => import('./AlbumDetails.vue'));
const PlayerView = defineAsyncComponent(() => import('./PlayerView.vue'));
const CharacterDetails = defineAsyncComponent(() => import('./CharacterDetails.vue'));

const { locale } = useI18n();

const characterDetailsKey = computed(() => {
  const id = characterState.currentCharacterDetails?.id;
  return id ? `character-${id}-${locale.value}` : 'character';
});

const emit = defineEmits(['close']);

const handleClose = async () => {
  if (modalState.currentView === 'player') {
    // 返回專輯詳情 - 確保返回的是當前播放歌曲的專輯
    const currentSong = playerState.currentSong;
    if (currentSong && currentSong.albumCid) {
      // 如果當前專輯詳情不是播放歌曲所屬的專輯，則獲取正確的專輯
      if (!albumState.currentAlbumDetails || albumState.currentAlbumDetails.cid !== currentSong.albumCid) {
        try {
          const { fetchAlbumDetails } = await import('../services/api.js');
          albumState.currentAlbumDetails = await fetchAlbumDetails(currentSong.albumCid);
        } catch (error) {
          console.error('獲取專輯詳情失敗:', error);
        }
      }
    }
    modalState.currentView = 'album';
  } else {
    // 關閉Modal
    modalState.isOpen = false;
    emit('close');
  }
};

const handleBackdropClick = (event) => {
  if (event.target.classList.contains('modal')) {
    handleClose();
  }
};

const handlePlaySong = () => {
  modalState.currentView = 'player';
};

// 當有歌曲播放時，自動切換到播放器視圖
watch(() => playerState.currentSong, (newSong) => {
  if (newSong && modalState.isOpen) {
    modalState.currentView = 'player';
  }
});
</script>

<style scoped>
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: flex-end;
  align-items: center;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.22s ease;
  backdrop-filter: none;
}

.modal.show {
  opacity: 1;
  pointer-events: auto;
}

.modal-content {
  background: rgba(9, 12, 16, 0.98);
  border-left: 1px solid rgba(111, 122, 132, 0.45);
  border-radius: 0;
  padding: 25px;
  width: min(960px, 92vw);
  max-width: none;
  height: 100vh;
  max-height: none;
  color: var(--text-color);
  position: relative;
  box-shadow: -24px 0 60px rgba(0, 0, 0, 0.55);
  overflow-y: auto;
  transform: translateX(18px);
  transition: transform 0.22s ease;
}

.modal.show .modal-content {
  transform: translateX(0);
}

.modal-close {
  position: absolute;
  top: 15px;
  right: 15px;
  background: none;
  border: none;
  color: var(--text-color);
  font-size: 24px;
  cursor: pointer;
  transition: color 0.3s;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(111, 122, 132, 0.35);
  border-radius: 2px;
}

.modal-close:hover {
  color: var(--accent-orange);
  background: rgba(255, 138, 42, 0.12);
  border-color: var(--accent-orange);
}

@media (max-width: 480px) {
  .modal-content {
    padding: 15px;
    width: 100%;
  }
}
</style>


<template>
  <div class="modal" :class="{ show: modalState.isOpen }" @click="handleBackdropClick">
    <div class="modal-content" @click.stop>
      <button class="modal-nav modal-nav-left" title="回首頁" @click="handleClose">
        <i class="fas fa-home"></i>
      </button>
      <button
        v-if="modalState.currentView === 'player'"
        class="modal-nav modal-nav-right"
        title="回專輯頁面"
        @click="handleViewAlbumFromPlayer"
      >
        <i class="fas fa-compact-disc"></i>
      </button>
      <div id="modal-body">
        <AlbumDetails
          v-if="modalState.currentView === 'album' && albumState.currentAlbumDetails"
          :key="(albumState.currentAlbumDetails?.cid || 'album') + '-' + locale"
          :album="albumState.currentAlbumDetails"
          @play-song="handlePlaySong"
        />
        <PlayerView
          v-else-if="modalState.currentView === 'player'"
          :key="'player-' + locale"
        />
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

const closeModal = () => {
  modalState.isOpen = false;
  emit('close');
};

const handleClose = () => {
  closeModal();
};

const handleBackdropClick = (event) => {
  if (event.target.classList.contains('modal')) {
    handleClose();
  }
};

const handlePlaySong = () => {
  modalState.currentView = 'player';
};

const handleViewAlbumFromPlayer = async () => {
  const currentSong = playerState.currentSong;
  if (!currentSong?.albumCid) {
    return;
  }

  if (!albumState.currentAlbumDetails || albumState.currentAlbumDetails.cid !== currentSong.albumCid) {
    try {
      const { fetchAlbumDetails } = await import('../services/api.js');
      albumState.currentAlbumDetails = await fetchAlbumDetails(currentSong.albumCid);
    } catch (error) {
      console.error('Error fetching album details from player:', error);
      return;
    }
  }

  modalState.currentView = 'album';
};

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
  justify-content: center;
  align-items: center;
  z-index: 1000;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
  backdrop-filter: blur(5px);
}

.modal.show {
  opacity: 1;
  pointer-events: auto;
}

.modal-content {
  background: var(--card-bg);
  border-radius: 10px;
  padding: 25px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  color: var(--text-color);
  position: relative;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}

.modal-nav {
  position: absolute;
  top: 15px;
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
  border-radius: 50%;
}

.modal-nav-left {
  left: 15px;
}

.modal-nav-right {
  right: 15px;
}

.modal-nav:hover {
  color: var(--primary-color);
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 480px) {
  .modal-content {
    padding: 15px;
    width: 95%;
  }
}
</style>

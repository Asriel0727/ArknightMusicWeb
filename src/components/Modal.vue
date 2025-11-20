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
          :key="albumState.currentAlbumDetails?.cid || 'album'"
          :album="albumState.currentAlbumDetails"
          @play-song="handlePlaySong"
        />
        <PlayerView v-else-if="modalState.currentView === 'player'" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { watch } from 'vue';
import AlbumDetails from './AlbumDetails.vue';
import PlayerView from './PlayerView.vue';
import { modalState, albumState, playerState } from '../stores/player.js';

const emit = defineEmits(['close']);

const handleClose = () => {
  if (modalState.currentView === 'player') {
    // 返回專輯詳情
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
  border-radius: 50%;
}

.modal-close:hover {
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


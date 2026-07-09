<template>
  <div class="modal" :class="{ show: modalState.isOpen }" @click="handleBackdropClick">
    <div class="modal-content" @click.stop>
      <div class="modal-action-bar" :class="`view-${modalState.currentView}`" :aria-label="navText.actions">
        <div class="modal-action-group right">
          <button
            v-if="shouldShowHomeNav"
            class="modal-nav text"
            type="button"
            :title="navText.home"
            @click="handleHomeNav"
          >
            <i class="fas fa-house"></i>
            <span>{{ navText.home }}</span>
          </button>
          <button
            v-if="modalState.currentView === 'character'"
            class="modal-nav text"
            type="button"
            :title="navText.characterList"
            @click="handleCharacterListNav"
          >
            <i class="fas fa-users"></i>
            <span>{{ navText.characterList }}</span>
          </button>
        </div>
        <div class="modal-action-group right">
          <button
            v-if="modalState.currentView === 'player' && canNavigateToAlbum"
            class="modal-nav text primary"
            type="button"
            :title="navText.album"
            @click="handleViewAlbumFromPlayer"
          >
            <span>{{ navText.album }}</span>
            <i class="fas fa-compact-disc"></i>
          </button>
        </div>
      </div>

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
import { fetchAlbumDetails } from '../services/api.js';
import { modalState, albumState, playerState, characterState } from '../stores/player.js';

const AlbumDetails = defineAsyncComponent(() => import('./AlbumDetails.vue'));
const PlayerView = defineAsyncComponent(() => import('./PlayerView.vue'));
const CharacterDetails = defineAsyncComponent(() => import('./CharacterDetails.vue'));

const { locale } = useI18n();

const NAV_TEXT = {
  'zh-TW': {
    actions: '頁面導覽',
    home: '回首頁',
    album: '回專輯',
    characterList: '回角色列表',
  },
  'zh-CN': {
    actions: '页面导航',
    home: '回首页',
    album: '回专辑',
    characterList: '回角色列表',
  },
  en: {
    actions: 'Page navigation',
    home: 'Home',
    album: 'Album',
    characterList: 'Operator list',
  },
  ja: {
    actions: 'ページナビゲーション',
    home: 'ホームへ',
    album: 'アルバムへ',
    characterList: 'オペレーター一覧へ',
  },
  ko: {
    actions: '페이지 탐색',
    home: '홈으로',
    album: '앨범으로',
    characterList: '오퍼레이터 목록으로',
  },
};

const characterDetailsKey = computed(() => {
  const id = characterState.currentCharacterDetails?.id;
  return id ? `character-${id}-${locale.value}` : 'character';
});

const navText = computed(() => NAV_TEXT[locale.value] || NAV_TEXT.en);
const shouldShowHomeNav = computed(() => modalState.currentView === 'album' || modalState.currentView === 'player');
const canNavigateToAlbum = computed(() => Boolean(playerState.currentSong?.albumCid));

const emit = defineEmits(['close']);

const closeModal = (target = 'context') => {
  modalState.isOpen = false;
  emit('close', target);
};

const handleHomeNav = () => {
  closeModal('home');
};

const handleCharacterListNav = () => {
  closeModal('characters');
};

const handleBackdropClick = (event) => {
  if (event.target.classList.contains('modal')) {
    closeModal();
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
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 82px 25px 25px;
  width: 90%;
  max-width: 900px;
  max-height: 90vh;
  color: var(--text-color);
  position: relative;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.5);
  overflow-y: auto;
}

.modal-action-bar {
  position: absolute;
  top: 16px;
  left: 18px;
  right: 18px;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-action-group {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-action-group.right {
  justify-content: flex-end;
}

.modal-action-group:first-child {
  justify-content: flex-end;
}

.modal-nav {
  min-height: 38px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 8px;
  background: rgba(13, 17, 23, 0.82);
  color: var(--text-color);
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s, transform 0.2s;
}

.modal-nav.text {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 100%;
  padding: 0 13px;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.2;
  white-space: nowrap;
}

.modal-nav.primary {
  color: var(--primary-color);
  border-color: rgba(88, 166, 255, 0.36);
  background: rgba(88, 166, 255, 0.1);
}

.modal-nav:hover {
  color: var(--primary-color);
  background: rgba(88, 166, 255, 0.16);
  border-color: rgba(88, 166, 255, 0.42);
  transform: translateY(-1px);
}

.modal-nav:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

@media (max-width: 560px) {
  .modal-content {
    width: 95%;
    padding: 78px 15px 15px;
  }

  .modal-action-bar {
    top: 10px;
    left: 12px;
    right: 12px;
    gap: 8px;
  }

  .modal-nav.text {
    min-width: 0;
    padding: 0 10px;
    font-size: 0.82rem;
  }
}

@media (max-width: 380px) {
  .modal-action-bar {
    flex-wrap: wrap;
  }

  .modal-action-group,
  .modal-action-group.right {
    justify-content: stretch;
  }

  .modal-nav.text {
    width: 100%;
  }
}
</style>

<template>
  <main class="library-page">
    <h1 class="page-title">{{ t('userLibrary.pageTitle') }}</h1>
    <div v-if="!authState.user" class="library-empty">{{ t('userLibrary.loginRequired') }}</div>
    <div v-else class="library-grid">
      <section class="library-section">
        <h2><i class="fas fa-heart"></i> {{ t('userLibrary.favorites') }}</h2>
        <button class="refresh-btn" type="button" @click="loadLibrary">
          {{ t('userLibrary.refresh') }}
        </button>
        <div v-if="favorites.length === 0" class="library-empty">
          {{ t('userLibrary.noFavorites') }}
        </div>
        <button
          v-for="favorite in favorites"
          :key="favorite.song_cid"
          class="library-row"
          type="button"
          @click="playSong(favorite.song_cid)"
        >
          <span>{{ favorite.song_cid }}</span>
          <i class="fas fa-play"></i>
        </button>
      </section>

      <section class="library-section">
        <h2><i class="fas fa-list"></i> {{ t('userLibrary.playlists') }}</h2>
        <div v-if="playlists.length === 0" class="library-empty">
          {{ t('userLibrary.noPlaylists') }}
        </div>
        <article v-for="playlist in playlists" :key="playlist.id" class="library-group">
          <h3>{{ playlist.name }}</h3>
          <p v-if="playlist.description">{{ playlist.description }}</p>
          <div v-if="!playlist.songs || playlist.songs.length === 0" class="library-empty small">
            {{ t('userLibrary.noPlaylistSongs') }}
          </div>
          <button
            v-for="song in playlist.songs || []"
            :key="song.song_cid"
            class="library-row"
            type="button"
            @click="playSong(song.song_cid)"
          >
            <span>{{ song.song_cid }}</span>
            <i class="fas fa-play"></i>
          </button>
        </article>
      </section>

      <section class="library-section">
        <h2><i class="fas fa-users"></i> {{ t('userLibrary.characterLists') }}</h2>
        <div v-if="characterLists.length === 0" class="library-empty">
          {{ t('userLibrary.noCharacterLists') }}
        </div>
        <article v-for="list in characterLists" :key="list.id" class="library-group">
          <h3>{{ list.name }}</h3>
          <p v-if="list.description">{{ list.description }}</p>
          <div v-if="!list.items || list.items.length === 0" class="library-empty small">
            {{ t('userLibrary.noCharacterItems') }}
          </div>
          <div v-for="item in list.items || []" :key="item.character_id" class="library-row static">
            {{ item.character_id }}
          </div>
        </article>
      </section>
    </div>
  </main>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { modalState } from '../stores/player.js';
import { playSongFromMasterList } from '../stores/player.js';
import { authState } from '../services/auth.js';
import {
  fetchCharacterLists,
  fetchFavoriteSongs,
  fetchPlaylists,
} from '../services/userLibrary.js';

const { t } = useI18n();
const favorites = ref([]);
const playlists = ref([]);
const characterLists = ref([]);

const loadLibrary = async () => {
  if (!authState.user) {
    favorites.value = [];
    playlists.value = [];
    characterLists.value = [];
    return;
  }

  const [nextFavorites, nextPlaylists, nextCharacterLists] = await Promise.all([
    fetchFavoriteSongs(),
    fetchPlaylists(),
    fetchCharacterLists(),
  ]);
  favorites.value = nextFavorites;
  playlists.value = nextPlaylists;
  characterLists.value = nextCharacterLists;
};

const playSong = async (songCid) => {
  modalState.currentView = 'player';
  modalState.isOpen = true;
  await playSongFromMasterList({ cid: songCid });
};

watch(() => authState.user, () => {
  loadLibrary().catch(() => {});
});

onMounted(() => {
  loadLibrary().catch(() => {});
});
</script>

<style scoped>
.library-page {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px 40px;
}

.library-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.library-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  min-width: 0;
}

.library-section h2 {
  margin: 0 0 12px;
  color: var(--primary-color);
  font-size: 1.05rem;
}

.library-group {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  margin-top: 10px;
}

.library-group h3 {
  margin: 0 0 4px;
  color: var(--text-color);
  font-size: 1rem;
}

.library-group p {
  margin: 0 0 8px;
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.library-row {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  padding: 8px 10px;
  margin-top: 6px;
  display: flex;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  text-align: left;
}

.library-row.static {
  cursor: default;
}

.library-empty {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.library-empty.small {
  font-size: 0.82rem;
}

.refresh-btn {
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  background: transparent;
  color: var(--primary-color);
  padding: 6px 10px;
  cursor: pointer;
  margin-bottom: 10px;
}

@media (max-width: 900px) {
  .library-page {
    padding: 16px;
  }

  .library-grid {
    grid-template-columns: 1fr;
  }
}
</style>

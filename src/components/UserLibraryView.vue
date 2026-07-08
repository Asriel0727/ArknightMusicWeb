<template>
  <main class="library-page">
    <header class="library-header">
      <div>
        <h1 class="page-title">{{ t('userLibrary.pageTitle') }}</h1>
        <p v-if="authState.user" class="library-subtitle">{{ t('userLibrary.librarySubtitle') }}</p>
      </div>
      <button v-if="authState.user" class="library-action-btn" type="button" :disabled="isLoading" @click="loadLibrary">
        <i class="fas fa-rotate-right"></i>
        <span>{{ t('userLibrary.refresh') }}</span>
      </button>
    </header>

    <section v-if="!authState.user" class="library-empty-state">
      <i class="fas fa-lock"></i>
      <h2>{{ t('userLibrary.loginRequired') }}</h2>
    </section>

    <section v-else class="library-shell">
      <nav class="library-tabs" :aria-label="t('userLibrary.pageTitle')">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="library-tab"
          :class="{ active: activeTab === tab.id }"
          type="button"
          @click="activeTab = tab.id"
        >
          <i :class="tab.icon"></i>
          <span>{{ tab.label }}</span>
          <strong>{{ tab.count }}</strong>
        </button>
      </nav>

      <div v-if="isLoading" class="library-state-panel">
        <div v-for="index in 4" :key="index" class="library-skeleton"></div>
      </div>

      <div v-else-if="loadError" class="library-empty-state">
        <i class="fas fa-triangle-exclamation"></i>
        <h2>{{ t('userLibrary.loadFailed') }}</h2>
        <p>{{ loadError }}</p>
        <button class="library-action-btn primary" type="button" @click="loadLibrary">
          {{ t('userLibrary.retry') }}
        </button>
      </div>

      <section v-else-if="activeTab === 'favorites'" class="library-panel">
        <div class="library-panel-header">
          <h2>{{ t('userLibrary.favorites') }}</h2>
          <button class="library-action-btn" type="button" :disabled="favorites.length === 0" @click="playSongCollection(favoriteSongIds)">
            <i class="fas fa-play"></i>
            <span>{{ t('userLibrary.playAll') }}</span>
          </button>
        </div>

        <div v-if="favorites.length === 0" class="library-empty-state compact">
          <i class="far fa-heart"></i>
          <h2>{{ t('userLibrary.noFavorites') }}</h2>
        </div>

        <div v-else class="song-list">
          <article v-for="favorite in favorites" :key="favorite.song_cid" class="song-row">
            <button class="song-main" type="button" @click="playSongItem(favorite.song_cid)">
              <span class="song-cover">
                <img v-if="getSongImage(favorite.song_cid)" :src="getSongImage(favorite.song_cid)" :alt="getSongName(favorite.song_cid)">
                <i v-else class="fas fa-music"></i>
              </span>
              <span class="song-copy">
                <strong>{{ getSongName(favorite.song_cid) }}</strong>
                <small>{{ getSongArtists(favorite.song_cid) }}</small>
                <span class="song-tag-list">
                  <span v-for="tag in getSongTags(favorite.song_cid)" :key="tag">{{ tag }}</span>
                </span>
              </span>
            </button>
            <button class="row-icon-btn" type="button" :title="t('userLibrary.removeFavorite')" @click="removeFavorite(favorite.song_cid)">
              <i class="fas fa-heart-crack"></i>
            </button>
          </article>
        </div>
      </section>

      <section v-else-if="activeTab === 'playlists'" class="library-panel">
        <div class="library-panel-header">
          <h2>{{ t('userLibrary.playlists') }}</h2>
        </div>

        <div v-if="playlists.length === 0" class="library-empty-state compact">
          <i class="fas fa-list"></i>
          <h2>{{ t('userLibrary.noPlaylists') }}</h2>
        </div>

        <div v-else class="playlist-workspace" :class="{ 'detail-open': selectedPlaylist }">
          <div v-if="!selectedPlaylist || isWidePlaylistLayout" class="playlist-list">
            <article
              v-for="playlist in playlists"
              :key="playlist.id"
              class="playlist-list-item"
              :class="{ active: selectedPlaylistId === playlist.id }"
            >
              <button class="playlist-list-main" type="button" @click="selectPlaylist(playlist.id)">
                <span class="playlist-list-icon"><i class="fas fa-list-ul"></i></span>
                <span class="playlist-list-copy">
                  <span class="playlist-list-title-row">
                    <strong>{{ playlist.name }}</strong>
                    <small>{{ t('userLibrary.songCount', { count: getPlaylistSongIds(playlist).length }) }}</small>
                  </span>
                  <span v-if="playlist.description" class="playlist-list-description">{{ playlist.description }}</span>
                  <span v-else-if="getPlaylistSongIds(playlist).length > 0" class="playlist-list-tags">
                    <span v-for="tag in getPlaylistPreviewTags(playlist)" :key="tag">{{ tag }}</span>
                  </span>
                </span>
              </button>
              <button class="row-icon-btn playlist-open-btn" type="button" :title="t('userLibrary.openPlaylist')" @click="selectPlaylist(playlist.id)">
                <i class="fas fa-arrow-right"></i>
              </button>
            </article>
          </div>

          <aside v-if="selectedPlaylist" class="playlist-detail">
            <div class="playlist-detail-header">
              <button class="library-action-btn back" type="button" @click="backToPlaylists">
                <i class="fas fa-arrow-left"></i>
                <span>{{ t('userLibrary.backToPlaylists') }}</span>
              </button>
              <div>
                <h3>{{ selectedPlaylist.name }}</h3>
                <p>{{ t('userLibrary.songCount', { count: selectedPlaylistSongIds.length }) }}</p>
              </div>
              <div class="playlist-detail-actions">
                <button class="library-action-btn" type="button" :disabled="selectedPlaylistSongIds.length === 0" @click="playSongCollection(selectedPlaylistSongIds)">
                  <i class="fas fa-play"></i>
                  <span>{{ t('userLibrary.playAll') }}</span>
                </button>
                <button class="library-action-btn" type="button" @click="startEditPlaylist(selectedPlaylist)">
                  <i class="fas fa-pen"></i>
                  <span>{{ t('userLibrary.edit') }}</span>
                </button>
                <button class="library-action-btn danger" type="button" @click="requestDeletePlaylist(selectedPlaylist)">
                  <i class="fas fa-trash"></i>
                  <span>{{ t('userLibrary.delete') }}</span>
                </button>
              </div>
            </div>

            <form v-if="editingPlaylistId === selectedPlaylist.id" class="playlist-edit-form" @submit.prevent="savePlaylistEdit">
              <input v-model.trim="playlistEditName" type="text" :placeholder="t('userLibrary.playlistName')">
              <input v-model.trim="playlistEditDescription" type="text" :placeholder="t('userLibrary.description')">
              <div class="playlist-edit-actions">
                <button class="library-action-btn" type="button" @click="cancelEditPlaylist">{{ t('userLibrary.cancel') }}</button>
                <button class="library-action-btn primary" type="submit" :disabled="!playlistEditName || actionPending">
                  {{ t('userLibrary.save') }}
                </button>
              </div>
            </form>

            <div v-if="selectedPlaylistSongIds.length === 0" class="library-empty-state compact">
              <i class="fas fa-music"></i>
              <h2>{{ t('userLibrary.noPlaylistSongs') }}</h2>
            </div>

            <div v-else class="song-list compact-list">
              <article v-for="songCid in selectedPlaylistSongIds" :key="songCid" class="song-row playlist-song-row">
                <div class="song-main">
                  <span class="song-cover">
                    <img v-if="getSongImage(songCid)" :src="getSongImage(songCid)" :alt="getSongName(songCid)">
                    <i v-else class="fas fa-music"></i>
                  </span>
                  <span class="song-copy">
                    <strong>{{ getSongName(songCid) }}</strong>
                    <small>{{ getSongArtists(songCid) }}</small>
                    <span class="song-tag-list">
                      <span v-for="tag in getSongTags(songCid)" :key="tag">{{ tag }}</span>
                    </span>
                  </span>
                </div>
                <button class="row-icon-btn play" type="button" title="播放" @click="playSelectedPlaylistSong(songCid)">
                  <i class="fas fa-play"></i>
                </button>
                <button class="row-icon-btn danger" type="button" :title="t('userLibrary.removeFromPlaylist')" @click="removeSongFromSelectedPlaylist(songCid)">
                  <i class="fas fa-xmark"></i>
                </button>
              </article>
            </div>
          </aside>
        </div>
      </section>

      <section v-else class="library-panel">
        <div class="library-panel-header">
          <h2>{{ t('userLibrary.characterLists') }}</h2>
        </div>

        <div v-if="characterLists.length === 0" class="library-empty-state compact">
          <i class="fas fa-users"></i>
          <h2>{{ t('userLibrary.noCharacterLists') }}</h2>
        </div>

        <div v-else class="character-workspace" :class="{ 'detail-open': selectedCharacterList }">
          <div v-if="!selectedCharacterList || isWidePlaylistLayout" class="character-list">
            <article
              v-for="list in characterLists"
              :key="list.id"
              class="character-list-item"
              :class="{ active: selectedCharacterListId === list.id }"
            >
              <button class="character-list-main" type="button" @click="selectCharacterList(list.id)">
                <span class="character-list-icon"><i class="fas fa-users"></i></span>
                <span class="character-list-copy">
                  <span class="character-list-title-row">
                    <strong>{{ list.name }}</strong>
                    <small>{{ getCharacterListItemCount(list) }}</small>
                  </span>
                  <span v-if="list.description" class="character-list-description">{{ list.description }}</span>
                </span>
              </button>
              <button class="row-icon-btn character-open-btn" type="button" :title="t('userLibrary.selectCharacterList')" @click="selectCharacterList(list.id)">
                <i class="fas fa-arrow-right"></i>
              </button>
            </article>
          </div>

          <aside v-if="selectedCharacterList" class="character-detail">
            <div class="playlist-detail-header">
              <button class="library-action-btn back" type="button" @click="backToCharacterLists">
                <i class="fas fa-arrow-left"></i>
                <span>{{ t('userLibrary.selectCharacterList') }}</span>
              </button>
              <div>
                <h3>{{ selectedCharacterList.name }}</h3>
                <p>{{ getCharacterListItemCount(selectedCharacterList) }}</p>
              </div>
            </div>

            <div v-if="selectedCharacterItems.length === 0" class="library-empty-state compact">
              <i class="fas fa-user"></i>
              <h2>{{ t('userLibrary.noCharacterItems') }}</h2>
            </div>

            <div v-else class="character-row-list">
              <button
                v-for="item in selectedCharacterItems"
                :key="item.character_id"
                class="character-row"
                type="button"
                @click="openCharacterDetails(item.character_id)"
              >
                <span class="character-row-avatar">
                  <img
                    v-if="getCharacterImage(item.character_id)"
                    :src="getCharacterImage(item.character_id)"
                    :alt="getCharacterName(item.character_id)"
                    loading="lazy"
                    @error="handleCharacterAvatarError($event, item.character_id)"
                  >
                  <i class="fas fa-user"></i>
                </span>
                <span class="character-row-copy">
                  <strong>{{ getCharacterName(item.character_id) }}</strong>
                  <small>{{ getCharacterMetaText(item.character_id) }}</small>
                </span>
                <span class="row-icon-btn character-row-arrow" aria-hidden="true">
                  <i class="fas fa-arrow-right"></i>
                </span>
              </button>
            </div>
          </aside>
        </div>
      </section>
    </section>

    <p v-if="actionMessage" class="library-toast">{{ actionMessage }}</p>

    <div v-if="playlistPendingDelete" class="confirm-backdrop" @click.self="cancelDeletePlaylist">
      <section class="confirm-dialog" role="dialog" aria-modal="true" :aria-label="t('userLibrary.deletePlaylistTitle')">
        <div class="confirm-icon"><i class="fas fa-trash"></i></div>
        <h2>{{ t('userLibrary.deletePlaylistTitle') }}</h2>
        <p>{{ t('userLibrary.deletePlaylistConfirm', { name: playlistPendingDelete.name }) }}</p>
        <div class="confirm-actions">
          <button class="library-action-btn" type="button" @click="cancelDeletePlaylist">
            {{ t('userLibrary.cancel') }}
          </button>
          <button class="library-action-btn danger" type="button" :disabled="actionPending" @click="confirmDeletePlaylist">
            {{ t('userLibrary.delete') }}
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { characterState, modalState, playSongFromMasterList, playSongQueueFromMasterList } from '../stores/player.js';
import {
  fetchAlbums,
  fetchCharacterDetails,
  fetchRecruitCharacters,
  fetchSongs,
  getCharacterAvatarUrls,
  getProxyImageUrl,
} from '../services/api.js';
import { authState } from '../services/auth.js';
import {
  deletePlaylist,
  fetchCharacterLists,
  fetchFavoriteSongs,
  fetchPlaylists,
  removeFavoriteSong,
  removeSongFromPlaylist,
  updatePlaylist,
} from '../services/userLibrary.js';

const { t, te } = useI18n();
const activeTab = ref('favorites');
const favorites = ref([]);
const playlists = ref([]);
const characterLists = ref([]);
const songCatalog = ref({});
const albumCatalog = ref({});
const characterCatalog = ref({});
const characterAvatarIndexMap = ref(new Map());
const selectedPlaylistId = ref('');
const selectedCharacterListId = ref('');
const isLoading = ref(false);
const loadError = ref('');
const actionMessage = ref('');
const actionPending = ref(false);
const editingPlaylistId = ref('');
const playlistEditName = ref('');
const playlistEditDescription = ref('');
const playlistPendingDelete = ref(null);
const isWidePlaylistLayout = ref(false);

const tabs = computed(() => [
  { id: 'favorites', label: t('userLibrary.favorites'), icon: 'fas fa-heart', count: favorites.value.length },
  { id: 'playlists', label: t('userLibrary.playlists'), icon: 'fas fa-list', count: playlists.value.length },
  { id: 'characters', label: t('userLibrary.characterLists'), icon: 'fas fa-users', count: characterLists.value.length },
]);

const favoriteSongIds = computed(() => favorites.value.map((favorite) => favorite.song_cid).filter(Boolean));

const selectedPlaylist = computed(() => {
  return playlists.value.find((playlist) => playlist.id === selectedPlaylistId.value) || null;
});

const selectedPlaylistSongIds = computed(() => getPlaylistSongIds(selectedPlaylist.value));

const selectedCharacterList = computed(() => {
  return characterLists.value.find((list) => list.id === selectedCharacterListId.value) || null;
});

const selectedCharacterItems = computed(() => {
  return (selectedCharacterList.value?.items || []).filter((item) => item.character_id);
});

const setActionMessage = (message) => {
  actionMessage.value = message;
  window.setTimeout(() => {
    if (actionMessage.value === message) {
      actionMessage.value = '';
    }
  }, 2200);
};

const getPlaylistSongIds = (playlist) => {
  return (playlist?.songs || []).map((song) => song.song_cid).filter(Boolean);
};

const getCharacterListItemCount = (list) => {
  return t('userLibrary.characterCount', { count: (list?.items || []).length });
};

const getSongInfo = (songCid) => {
  return songCatalog.value[songCid] || { cid: songCid, name: songCid, artistes: [] };
};

const getSongName = (songCid) => {
  return getSongInfo(songCid).name || songCid;
};

const getSongArtists = (songCid) => {
  const artistes = getSongInfo(songCid).artistes;
  return Array.isArray(artistes) && artistes.length > 0 ? artistes.join(', ') : t('common.unknownArtist');
};

const getAlbumInfo = (albumCid) => {
  return albumCid ? albumCatalog.value[albumCid] || null : null;
};

const getSongAlbum = (songCid) => {
  const song = getSongInfo(songCid);
  return song.album || getAlbumInfo(song.albumCid) || null;
};

const getSongAlbumName = (songCid) => {
  return getSongAlbum(songCid)?.name || '';
};

const getSongTags = (songCid) => {
  const tags = [];
  const albumName = getSongAlbumName(songCid);

  if (albumName) {
    tags.push(albumName);
  }

  if (favoriteSongIds.value.includes(songCid)) {
    tags.push(t('userLibrary.favorites'));
  }

  return tags.slice(0, 3);
};

const getPlaylistPreviewTags = (playlist) => {
  const songIds = getPlaylistSongIds(playlist);
  const albumNames = [...new Set(songIds.map(getSongAlbumName).filter(Boolean))];

  if (albumNames.length === 0) {
    return [t('userLibrary.songCount', { count: songIds.length })];
  }

  const tags = albumNames.slice(0, 2);
  if (albumNames.length > 2) {
    tags.push(`+${albumNames.length - 2}`);
  }
  return tags;
};

const getSongImage = (songCid) => {
  const song = getSongInfo(songCid);
  const album = getSongAlbum(songCid);
  const imageUrl = song.coverUrl || album?.coverUrl || song.coverDeUrl || album?.coverDeUrl || '';
  return imageUrl ? getProxyImageUrl(imageUrl) : '';
};

const normalizeSongForPlayback = (songCid) => {
  const song = getSongInfo(songCid);
  const album = getSongAlbum(songCid);
  return {
    ...song,
    cid: song.cid || songCid,
    album,
    albumCid: song.albumCid || album?.cid,
    coverUrl: song.coverUrl || album?.coverUrl || '',
    coverDeUrl: song.coverDeUrl || album?.coverDeUrl || '',
    artistes: Array.isArray(song.artistes) && song.artistes.length > 0
      ? song.artistes
      : album?.artistes || [t('common.unknownArtist')],
  };
};

const getCharacterInfo = (characterId) => {
  return characterCatalog.value[characterId] || { id: characterId, name: characterId };
};

const getCharacterName = (characterId) => {
  return getCharacterInfo(characterId).name || characterId;
};

const getProfessionName = (characterId) => {
  const character = getCharacterInfo(characterId);
  const key = character.profession ? `profession.${character.profession}` : '';
  const translated = key ? t(key) : '';
  return translated && translated !== key ? translated : character.profession || '';
};

const getFactionName = (characterId) => {
  const character = getCharacterInfo(characterId);
  const key = character.factionId ? `nation.${character.factionId}` : '';
  const translated = key && te(key) ? t(key) : '';
  if (translated && translated !== key) {
    return translated;
  }
  return character.nationName || character.factionId || '';
};

const getCharacterMetaText = (characterId) => {
  return [getProfessionName(characterId), getFactionName(characterId)].filter(Boolean).join(' · ');
};

const getCharacterAvatarCandidates = (characterId) => {
  const avatarUrl = getCharacterInfo(characterId).avatarUrl || '';
  return [...new Set([avatarUrl, ...getCharacterAvatarUrls(characterId)].filter(Boolean))];
};

const getCharacterImage = (characterId) => {
  const urls = getCharacterAvatarCandidates(characterId);
  const currentIndex = characterAvatarIndexMap.value.get(characterId) || 0;
  const avatarUrl = urls[currentIndex] || urls[0] || '';
  return avatarUrl ? getProxyImageUrl(avatarUrl) : '';
};

const handleCharacterAvatarError = (event, characterId) => {
  const img = event.target;
  const urls = getCharacterAvatarCandidates(characterId);
  const currentIndex = characterAvatarIndexMap.value.get(characterId) || 0;
  const nextIndex = currentIndex + 1;

  if (nextIndex < urls.length) {
    characterAvatarIndexMap.value.set(characterId, nextIndex);
    img.src = getProxyImageUrl(urls[nextIndex]);
    return;
  }

  img.style.display = 'none';
};

const loadSongCatalog = async () => {
  const [songs, albums] = await Promise.all([
    fetchSongs(),
    fetchAlbums(),
  ]);

  albumCatalog.value = albums.reduce((nextCatalog, album) => {
    if (album?.cid) {
      nextCatalog[album.cid] = album;
    }
    return nextCatalog;
  }, {});
  songCatalog.value = songs.reduce((nextCatalog, song) => {
    if (song?.cid) {
      nextCatalog[song.cid] = song;
    }
    return nextCatalog;
  }, {});

  try {
    const characters = await fetchRecruitCharacters();
    characterCatalog.value = characters.reduce((nextCatalog, character) => {
      if (character?.id) {
        nextCatalog[character.id] = character;
      }
      return nextCatalog;
    }, {});
    characterAvatarIndexMap.value.clear();
  } catch (error) {
    console.warn('角色清單 catalog 載入失敗，將保留角色 ID fallback:', error);
    characterCatalog.value = {};
  }
};

const loadCharacterCatalog = async () => {
  try {
    const characters = await fetchRecruitCharacters();
    characterCatalog.value = characters.reduce((nextCatalog, character) => {
    if (character?.id) {
      nextCatalog[character.id] = character;
    }
    return nextCatalog;
  }, {});
    characterAvatarIndexMap.value.clear();
  } catch (error) {
    console.warn('角色清單 catalog 載入失敗，將保留角色 ID fallback:', error);
    characterCatalog.value = {};
  }
};

const loadLibrary = async () => {
  if (!authState.user) {
    favorites.value = [];
    playlists.value = [];
    characterLists.value = [];
    selectedCharacterListId.value = '';
    return;
  }

  isLoading.value = true;
  loadError.value = '';
  try {
    const [nextFavorites, nextPlaylists, nextCharacterLists] = await Promise.all([
      fetchFavoriteSongs(),
      fetchPlaylists(),
      fetchCharacterLists(),
      loadSongCatalog(),
    ]);
    favorites.value = nextFavorites || [];
    playlists.value = nextPlaylists || [];
    characterLists.value = nextCharacterLists || [];
    if (selectedPlaylistId.value && !playlists.value.some((playlist) => playlist.id === selectedPlaylistId.value)) {
      selectedPlaylistId.value = '';
    }
    if (selectedCharacterListId.value && !characterLists.value.some((list) => list.id === selectedCharacterListId.value)) {
      selectedCharacterListId.value = '';
    }
    if (!selectedCharacterListId.value && characterLists.value.length > 0) {
      selectedCharacterListId.value = characterLists.value[0].id;
    }
  } catch (error) {
    loadError.value = error?.message || t('userLibrary.loadFailed');
  } finally {
    isLoading.value = false;
  }
};

const openPlayer = () => {
  modalState.currentView = 'player';
  modalState.isOpen = true;
};

const playSongItem = async (songCid) => {
  await playSongFromMasterList(normalizeSongForPlayback(songCid));
  openPlayer();
};

const getLibraryPlaybackContext = () => {
  if (activeTab.value === 'playlists' && selectedPlaylist.value) {
    return {
      type: 'playlist',
      playlistId: selectedPlaylist.value.id,
      playlistName: selectedPlaylist.value.name,
    };
  }

  if (activeTab.value === 'favorites') {
    return { type: 'favorites' };
  }

  return { type: 'library' };
};

const playSongCollection = async (songCids, startIndex = 0) => {
  const queue = [...new Set(songCids)].map(normalizeSongForPlayback);
  if (queue.length === 0) return;

  await playSongQueueFromMasterList(queue, startIndex, getLibraryPlaybackContext());
  openPlayer();
};

const playSelectedPlaylistSong = async (songCid) => {
  const startIndex = selectedPlaylistSongIds.value.indexOf(songCid);
  await playSongCollection(selectedPlaylistSongIds.value, startIndex >= 0 ? startIndex : 0);
};

const openCharacterDetails = async (characterId) => {
  if (!characterId || actionPending.value) return;
  actionPending.value = true;
  try {
    characterState.currentCharacterDetails = await fetchCharacterDetails(characterId);
    modalState.currentView = 'character';
    modalState.isOpen = true;
  } catch (error) {
    console.error('載入角色詳情失敗:', error);
    setActionMessage(t('character.loadDetailError'));
  } finally {
    actionPending.value = false;
  }
};

const selectPlaylist = (playlistId) => {
  selectedPlaylistId.value = playlistId;
  cancelEditPlaylist();
};

const backToPlaylists = () => {
  selectedPlaylistId.value = '';
  cancelEditPlaylist();
};

const selectCharacterList = (listId) => {
  selectedCharacterListId.value = listId;
};

const backToCharacterLists = () => {
  selectedCharacterListId.value = '';
};

const syncPlaylistLayoutMode = () => {
  isWidePlaylistLayout.value = window.matchMedia('(min-width: 980px)').matches;
};

const removeFavorite = async (songCid) => {
  if (actionPending.value) return;
  actionPending.value = true;
  try {
    await removeFavoriteSong(songCid);
    favorites.value = favorites.value.filter((favorite) => favorite.song_cid !== songCid);
    setActionMessage(t('userLibrary.favoriteRemoved'));
  } finally {
    actionPending.value = false;
  }
};

const removeSongFromSelectedPlaylist = async (songCid) => {
  if (!selectedPlaylist.value || actionPending.value) return;
  actionPending.value = true;
  try {
    await removeSongFromPlaylist(selectedPlaylist.value.id, songCid);
    selectedPlaylist.value.songs = (selectedPlaylist.value.songs || []).filter((song) => song.song_cid !== songCid);
    setActionMessage(t('userLibrary.removedFromPlaylist', { name: selectedPlaylist.value.name }));
  } finally {
    actionPending.value = false;
  }
};

const startEditPlaylist = (playlist) => {
  selectedPlaylistId.value = playlist.id;
  editingPlaylistId.value = playlist.id;
  playlistEditName.value = playlist.name || '';
  playlistEditDescription.value = playlist.description || '';
};

const cancelEditPlaylist = () => {
  editingPlaylistId.value = '';
  playlistEditName.value = '';
  playlistEditDescription.value = '';
};

const savePlaylistEdit = async () => {
  if (!editingPlaylistId.value || !playlistEditName.value || actionPending.value) return;
  actionPending.value = true;
  try {
    const updatedPlaylist = await updatePlaylist(editingPlaylistId.value, {
      name: playlistEditName.value,
      description: playlistEditDescription.value,
    });
    const index = playlists.value.findIndex((playlist) => playlist.id === editingPlaylistId.value);
    if (index >= 0) {
      playlists.value[index] = { ...playlists.value[index], ...updatedPlaylist };
    }
    setActionMessage(t('userLibrary.playlistUpdated'));
    cancelEditPlaylist();
  } finally {
    actionPending.value = false;
  }
};

const requestDeletePlaylist = (playlist) => {
  if (!playlist?.id || actionPending.value) return;
  playlistPendingDelete.value = playlist;
};

const cancelDeletePlaylist = () => {
  if (actionPending.value) return;
  playlistPendingDelete.value = null;
};

const confirmDeletePlaylist = async () => {
  const playlist = playlistPendingDelete.value;
  if (!playlist?.id || actionPending.value) return;

  actionPending.value = true;
  try {
    await deletePlaylist(playlist.id);
    playlists.value = playlists.value.filter((item) => item.id !== playlist.id);
    selectedPlaylistId.value = '';
    playlistPendingDelete.value = null;
    cancelEditPlaylist();
    setActionMessage(t('userLibrary.playlistDeleted'));
  } finally {
    actionPending.value = false;
  }
};

watch(() => authState.user, () => {
  loadLibrary().catch(() => {});
});

onMounted(() => {
  syncPlaylistLayoutMode();
  window.addEventListener('resize', syncPlaylistLayoutMode);
  loadLibrary().catch(() => {});
});

onUnmounted(() => {
  window.removeEventListener('resize', syncPlaylistLayoutMode);
});
</script>

<style scoped>
.library-page {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 22px 32px;
}

.library-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.library-subtitle {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.92rem;
}

.library-shell {
  display: grid;
  gap: 16px;
}

.library-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.library-tab {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: var(--text-secondary);
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
}

.library-tab.active {
  color: var(--primary-color);
  border-color: rgba(92, 178, 255, 0.42);
  background: rgba(92, 178, 255, 0.11);
}

.library-tab strong {
  min-width: 22px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-color);
  padding: 2px 7px;
  font-size: 0.76rem;
}

.library-panel,
.library-state-panel,
.library-empty-state {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  padding: 18px;
}

.library-panel-header,
.playlist-detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.library-panel-header h2,
.playlist-detail h3,
.character-detail h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 1.08rem;
}

.library-action-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid rgba(92, 178, 255, 0.4);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  padding: 8px 12px;
  cursor: pointer;
}

.library-action-btn.primary {
  background: var(--primary-color);
  color: #0d1117;
}

.library-action-btn:disabled,
.row-icon-btn:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.song-list {
  display: grid;
  gap: 8px;
}

.song-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  padding: 8px;
}

.playlist-song-row {
  grid-template-columns: minmax(0, 1fr) 36px 36px;
}

.song-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
}

.song-cover {
  width: 44px;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 7px;
  background: rgba(92, 178, 255, 0.12);
  color: var(--primary-color);
}

.song-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.song-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.song-copy strong,
.playlist-list-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}

.song-copy small,
.playlist-list-main small,
.playlist-detail-header p {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.song-tag-list {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 2px;
}

.song-tag-list span {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid rgba(92, 178, 255, 0.18);
  border-radius: 999px;
  background: rgba(92, 178, 255, 0.08);
  color: var(--text-secondary);
  padding: 2px 7px;
  font-size: 0.72rem;
  line-height: 1.25;
}

.row-icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
}

.row-icon-btn:hover {
  color: var(--primary-color);
  border-color: rgba(92, 178, 255, 0.34);
}

.row-icon-btn.play {
  color: var(--primary-color);
  border-color: rgba(92, 178, 255, 0.3);
  background: rgba(92, 178, 255, 0.08);
}

.row-icon-btn.play:hover {
  background: rgba(92, 178, 255, 0.16);
}

.row-icon-btn.danger:hover {
  color: #ff8b86;
  border-color: rgba(255, 139, 134, 0.34);
}

.playlist-workspace {
  display: grid;
  gap: 16px;
}

.playlist-list,
.character-list,
.character-list-grid {
  display: grid;
  gap: 10px;
}

.character-list-grid {
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
}

.playlist-list-item,
.playlist-detail,
.character-list-item,
.character-detail,
.character-list-card {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  padding: 12px;
}

.playlist-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
}

.character-list-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
}

.playlist-list-item.active {
  border-color: rgba(92, 178, 255, 0.4);
  background: rgba(92, 178, 255, 0.08);
}

.character-list-item.active {
  border-color: rgba(92, 178, 255, 0.4);
  background: rgba(92, 178, 255, 0.08);
}

.playlist-list-main {
  width: 100%;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.character-list-main {
  width: 100%;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.playlist-list-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(92, 178, 255, 0.14);
  color: var(--primary-color);
}

.character-list-icon {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(92, 178, 255, 0.14);
  color: var(--primary-color);
}

.playlist-list-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.character-list-copy {
  min-width: 0;
  display: grid;
  gap: 5px;
}

.playlist-list-title-row {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
}

.character-list-title-row {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
}

.playlist-list-copy small {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px 7px;
  line-height: 1.25;
}

.character-list-copy small {
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  padding: 2px 7px;
  line-height: 1.25;
  font-size: 0.82rem;
}

.playlist-list-description,
.character-list-description,
.character-list-card p {
  color: var(--text-secondary);
  font-size: 0.86rem;
}

.character-list-card p {
  margin: 8px 0 0;
}

.playlist-list-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-height: 1.45;
}

.character-list-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
  line-height: 1.45;
}

.character-list-main strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}

.playlist-list-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.playlist-list-tags span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  padding: 4px 8px;
  font-size: 0.78rem;
}

.playlist-open-btn {
  color: var(--primary-color);
}

.character-open-btn {
  color: var(--primary-color);
}

.playlist-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.library-action-btn.back {
  justify-self: start;
}

.library-action-btn.danger {
  color: #ff8b86;
  border-color: rgba(255, 139, 134, 0.34);
}

.playlist-edit-form {
  display: grid;
  gap: 10px;
  margin-bottom: 14px;
}

.playlist-edit-form input {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  padding: 10px 11px;
  outline: none;
}

.playlist-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.compact-list {
  max-height: min(520px, calc(100vh - 320px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.character-list-card h3 {
  margin: 0;
  color: var(--text-color);
  font-size: 1rem;
}

.character-workspace {
  display: grid;
  gap: 16px;
}

.character-row-list {
  display: grid;
  gap: 8px;
  max-height: min(520px, calc(100vh - 320px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

.character-row {
  width: 100%;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 36px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.035);
  color: inherit;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.character-row:hover {
  border-color: rgba(92, 178, 255, 0.34);
  background: rgba(92, 178, 255, 0.08);
}

.character-row-avatar {
  width: 44px;
  height: 44px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(92, 178, 255, 0.12);
  color: var(--primary-color);
  overflow: hidden;
}

.character-row-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-row-avatar i {
  font-size: 1rem;
}

.character-row-copy {
  min-width: 0;
  display: grid;
  gap: 3px;
}

.character-row-copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-color);
}

.character-row-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.character-row-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--primary-color);
}

.character-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.character-chip {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  padding: 4px 8px;
  font: inherit;
  display: inline-grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  text-align: left;
  cursor: pointer;
  max-width: 100%;
}

.character-chip:hover {
  border-color: rgba(92, 178, 255, 0.34);
  background: rgba(92, 178, 255, 0.1);
}

.character-chip-avatar {
  width: 28px;
  height: 28px;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  color: var(--primary-color);
  overflow: hidden;
}

.character-chip-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.character-chip-avatar i {
  font-size: 0.8rem;
}

.character-chip strong,
.character-chip small {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  overflow: hidden;
}

.character-chip strong {
  color: var(--text-color);
  font-size: 0.8rem;
}

.character-chip small {
  color: var(--text-secondary);
  font-size: 0.68rem;
}


.library-empty-state {
  display: grid;
  justify-items: center;
  gap: 10px;
  color: var(--text-secondary);
  text-align: center;
}

.library-empty-state i {
  color: var(--primary-color);
  font-size: 1.4rem;
}

.library-empty-state h2 {
  margin: 0;
  color: var(--text-color);
  font-size: 1rem;
}

.library-empty-state p {
  margin: 0;
}

.library-empty-state.compact {
  padding: 28px 18px;
}

.library-empty.small {
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.library-skeleton {
  height: 62px;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.05));
  background-size: 200% 100%;
  animation: library-skeleton-loading 1.2s ease-in-out infinite;
}

.library-toast {
  position: fixed;
  left: 50%;
  bottom: 76px;
  transform: translateX(-50%);
  z-index: 1450;
  max-width: min(420px, calc(100vw - 32px));
  border: 1px solid rgba(126, 231, 135, 0.24);
  border-radius: 999px;
  background: rgba(18, 35, 24, 0.94);
  color: #7ee787;
  padding: 10px 14px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.36);
}

.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 12, 0.72);
  backdrop-filter: blur(8px);
}

.confirm-dialog {
  width: min(420px, 100%);
  border: 1px solid rgba(255, 139, 134, 0.28);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(24, 31, 42, 0.98), rgba(13, 17, 23, 0.98));
  color: var(--text-color);
  padding: 22px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.confirm-icon {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: rgba(255, 139, 134, 0.12);
  color: #ff8b86;
  margin-bottom: 12px;
}

.confirm-dialog h2 {
  margin: 0 0 8px;
  font-size: 1.08rem;
}

.confirm-dialog p {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.55;
}

.confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

@keyframes library-skeleton-loading {
  to {
    background-position: -200% 0;
  }
}

@media (min-width: 980px) {
  .playlist-workspace.detail-open {
    --playlist-panel-height: min(640px, calc(100vh - 260px));
    grid-template-columns: minmax(260px, 360px) minmax(420px, 1fr);
    align-items: start;
  }

  .playlist-workspace.detail-open .playlist-list {
    grid-template-columns: 1fr;
    max-height: var(--playlist-panel-height);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }

  .playlist-workspace.detail-open .playlist-detail {
    max-height: var(--playlist-panel-height);
    overflow: hidden;
  }

  .playlist-workspace.detail-open .compact-list {
    max-height: calc(var(--playlist-panel-height) - 110px);
  }

  .playlist-workspace.detail-open .library-action-btn.back {
    display: none;
  }

  .character-workspace.detail-open {
    --character-panel-height: min(640px, calc(100vh - 260px));
    grid-template-columns: minmax(260px, 360px) minmax(420px, 1fr);
    align-items: start;
  }

  .character-workspace.detail-open .character-list {
    grid-template-columns: 1fr;
    max-height: var(--character-panel-height);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 4px;
  }

  .character-workspace.detail-open .character-detail {
    max-height: var(--character-panel-height);
    overflow: hidden;
  }

  .character-workspace.detail-open .character-row-list {
    max-height: calc(var(--character-panel-height) - 72px);
  }

  .character-workspace.detail-open .library-action-btn.back {
    display: none;
  }
}

@media (max-width: 900px) {
  .library-page {
    padding: 16px;
  }

  .library-header,
  .library-panel-header,
  .playlist-detail-header {
    align-items: stretch;
    flex-direction: column;
  }

  .compact-list {
    max-height: none;
  }
}
</style>

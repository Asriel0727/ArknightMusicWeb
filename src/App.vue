<template>
  <div id="app">
    <ParticleBackground />
    <Navbar :currentPage="currentPage" @change-page="handlePageChange" />

    <template v-if="currentPage === 'auth'">
      <AuthView />
    </template>

    <template v-else-if="currentPage === 'albums'">
      <TopBar @search="handleSearch" />
      <AlbumList ref="albumListRef" @view-album="handleViewAlbum" />
      <Modal @close="handleModalClose" @view-album="handleViewAlbum" />
      <AlbumEntryTransition
        :active="albumTransition.active"
        :ready="albumTransition.ready"
        :settled="albumTransition.settled"
        :album="albumTransition.album"
        :songs="albumTransition.songs"
        :origin="albumTransition.origin"
        :error="albumTransition.error"
        @complete="completeAlbumTransition"
        @close="closeAlbumTransition"
        @play-song="handleTransitionPlaySong"
        @retry="retryAlbumTransition"
      />
    </template>

    <template v-else-if="currentPage === 'characters'">
      <CharacterList />
      <Modal @close="handleModalClose" />
    </template>

    <template v-else-if="currentPage === 'recruit'">
      <RecruitCardMaker />
    </template>

    <template v-else-if="currentPage === 'recruitment'">
      <RecruitmentCalculator @view-character="handleViewCharacter" />
      <Modal @close="handleModalClose" />
    </template>

    <template v-else-if="currentPage === 'activities'">
      <ActivityList @view-character="handleViewCharacter" />
      <Modal @close="handleModalClose" />
    </template>

    <template v-else-if="currentPage === 'library'">
      <UserLibraryView />
      <Modal @close="handleModalClose" />
    </template>

    <audio ref="audioPlayerRef" crossorigin="anonymous" :preload="audioPreloadMode" style="display:none;"></audio>
    <footer>
      <p>{{ $t('footer.credit') }}</p>
    </footer>
  </div>
</template>

<script setup>
import { defineAsyncComponent, ref, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import ParticleBackground from './components/ParticleBackground.vue';
import Navbar from './components/Navbar.vue';
import TopBar from './components/TopBar.vue';
import Modal from './components/Modal.vue';
import AlbumEntryTransition from './components/AlbumEntryTransition.vue';
import { fetchAlbumDetails, fetchCharacterDetails } from './services/api.js';
import {
  initAudioPlayer,
  modalState,
  albumState,
  characterState,
  playSongFromAlbum,
  playSongFromMasterList,
} from './stores/player.js';

const AlbumList = defineAsyncComponent(() => import('./components/AlbumList.vue'));
const CharacterList = defineAsyncComponent(() => import('./components/CharacterList.vue'));
const RecruitCardMaker = defineAsyncComponent(() => import('./components/RecruitCardMaker.vue'));
const RecruitmentCalculator = defineAsyncComponent(() => import('./components/RecruitmentCalculator.vue'));
const ActivityList = defineAsyncComponent(() => import('./components/ActivityList.vue'));
const UserLibraryView = defineAsyncComponent(() => import('./components/UserLibraryView.vue'));
const AuthView = defineAsyncComponent(() => import('./components/AuthView.vue'));

const { t, locale } = useI18n();

const HTML_LANG = {
  'zh-TW': 'zh-Hant',
  'zh-CN': 'zh-Hans',
  en: 'en',
  ja: 'ja',
  ko: 'ko',
};

watch(
  locale,
  () => {
    document.title = t('meta.documentTitle');
    document.documentElement.setAttribute('lang', HTML_LANG[locale.value] || 'en');
  },
  { immediate: true }
);

const audioPlayerRef = ref(null);
const albumListRef = ref(null);
const currentPage = ref('albums');
const audioPreloadMode = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  ? 'metadata'
  : 'auto';
const albumTransition = ref({
  active: false,
  ready: false,
  settled: false,
  album: null,
  songs: [],
});
let albumDetailLoadToken = 0;

const clearSharedCharacterUrl = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('operator') && !url.searchParams.has('portrait')) return;
  url.searchParams.delete('operator');
  url.searchParams.delete('portrait');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const handlePageChange = (page) => {
  if (albumTransition.value.active) closeAlbumTransition();
  clearSharedCharacterUrl();
  currentPage.value = page;
};

const handleSearch = (query) => {
  if (albumListRef.value && albumListRef.value.handleSearch) {
    albumListRef.value.handleSearch(query);
  }
};

const completeAlbumTransition = () => {
  if (!albumTransition.value.active) return;
  albumTransition.value = {
    ...albumTransition.value,
    settled: true,
  };
};

const closeAlbumTransition = () => {
  albumDetailLoadToken++;
  albumTransition.value = {
    active: false,
    ready: false,
    settled: false,
    album: null,
    songs: [],
  };
  albumState.currentAlbumDetails = null;
  albumState.isLoading = false;
  modalState.currentView = 'album';
  modalState.isOpen = false;
};

const handleTransitionPlaySong = async (songIndex) => {
  const albumId = albumTransition.value.album?.cid;
  if (!albumId || !Number.isInteger(songIndex)) return;
  albumDetailLoadToken++;

  albumTransition.value = {
    active: false,
    ready: false,
    settled: false,
    album: null,
    songs: [],
  };
  modalState.currentView = 'player';
  modalState.isOpen = true;
  await playSongFromAlbum(songIndex, albumId);
};

const handleViewAlbum = async (albumId, origin = null) => {
  const token = ++albumDetailLoadToken;
  const previewAlbum = albumState.allAlbums.find(
    album => String(album?.cid) === String(albumId),
  ) || { cid: albumId, name: t('album.trackList') };

  albumTransition.value = {
    active: true,
    ready: false,
    settled: false,
    album: previewAlbum,
    songs: [],
    origin,
    error: false,
  };
  albumState.currentAlbumDetails = null;
  albumState.isLoading = true;
  modalState.currentView = 'album';
  modalState.isOpen = false;
  try {
    const details = await fetchAlbumDetails(albumId);
    if (token !== albumDetailLoadToken || !albumTransition.value.active) return;
    albumState.currentAlbumDetails = details;
    albumTransition.value = {
      ...albumTransition.value,
      album: { ...previewAlbum, ...details },
      songs: Array.isArray(details?.songs) ? details.songs : [],
      ready: true,
    };
  } catch (error) {
    if (token !== albumDetailLoadToken || !albumTransition.value.active) return;
    console.error('Error fetching album details:', error);
    albumTransition.value = {
      ...albumTransition.value,
      ready: true,
      error: true,
    };
  } finally {
    if (token === albumDetailLoadToken) albumState.isLoading = false;
  }
};

const retryAlbumTransition = async () => {
  const albumId = albumTransition.value.album?.cid;
  if (!albumId || !albumTransition.value.active) return;
  const token = ++albumDetailLoadToken;
  albumTransition.value = { ...albumTransition.value, ready: false, error: false };
  try {
    const details = await fetchAlbumDetails(albumId);
    if (token !== albumDetailLoadToken || !albumTransition.value.active) return;
    albumState.currentAlbumDetails = details;
    albumTransition.value = { ...albumTransition.value, album: { ...albumTransition.value.album, ...details }, songs: details?.songs || [], ready: true };
  } catch {
    if (token !== albumDetailLoadToken || !albumTransition.value.active) return;
    albumTransition.value = { ...albumTransition.value, ready: true, error: true };
  }
};

let characterDetailLoadToken = 0;
const handleViewCharacter = async (character) => {
  if (!character?.id) return;

  const loadToken = ++characterDetailLoadToken;
  characterState.currentCharacterDetails = {
    ...character,
    rarity: Math.max(0, Number(character.rarity || 1) - 1),
    portraits: character.portraits || [],
    traitDescription: character.traitDescription || '',
  };
  modalState.currentView = 'character';
  modalState.isOpen = true;

  try {
    const details = await fetchCharacterDetails(character.id);
    if (
      loadToken === characterDetailLoadToken
      && modalState.isOpen
      && modalState.currentView === 'character'
      && characterState.currentCharacterDetails?.id === character.id
    ) {
      characterState.currentCharacterDetails = details;
    }
  } catch (error) {
    console.error('Error fetching recruitment operator details:', error);
  }
};

const handleModalClose = (target) => {
  closeAlbumTransition();
  clearSharedCharacterUrl();
  modalState.isOpen = false;
  if (target === 'home') {
    currentPage.value = 'albums';
  } else if (target === 'characters') {
    currentPage.value = 'characters';
  }
};

const handleSharedSongLink = async () => {
  const params = new URLSearchParams(window.location.search);
  const songId = params.get('song');

  if (!songId) {
    return;
  }

  modalState.currentView = 'player';
  modalState.isOpen = true;
  await playSongFromMasterList({ cid: songId });
};

const handleSharedCharacterLink = async () => {
  const params = new URLSearchParams(window.location.search);
  const characterId = params.get('operator');
  const portraitId = params.get('portrait') || '';
  if (!characterId) return;

  currentPage.value = 'characters';
  try {
    characterState.currentCharacterDetails = await fetchCharacterDetails(characterId);
    modalState.characterPortraitId = portraitId;
    modalState.currentView = 'character-share';
    modalState.isOpen = true;
    clearSharedCharacterUrl();
  } catch (error) {
    console.error('Error fetching shared operator:', error);
  }
};

onMounted(() => {
  if (audioPlayerRef.value) {
    initAudioPlayer(audioPlayerRef.value);
  }

  handleSharedCharacterLink();
  handleSharedSongLink();
});
</script>

<style>
/* Global styles are loaded from the existing CSS entry. */
</style>

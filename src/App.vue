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
      <Modal @close="handleModalClose" />
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
      <ActivityList />
    </template>

    <template v-else-if="currentPage === 'library'">
      <UserLibraryView />
      <Modal @close="handleModalClose" />
    </template>

    <audio ref="audioPlayerRef" :preload="audioPreloadMode" style="display:none;"></audio>
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
import { fetchAlbumDetails, fetchCharacterDetails } from './services/api.js';
import { initAudioPlayer, modalState, albumState, characterState, playSongFromMasterList } from './stores/player.js';

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

const clearSharedCharacterUrl = () => {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('operator') && !url.searchParams.has('portrait')) return;
  url.searchParams.delete('operator');
  url.searchParams.delete('portrait');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};

const handlePageChange = (page) => {
  clearSharedCharacterUrl();
  currentPage.value = page;
};

const handleSearch = (query) => {
  if (albumListRef.value && albumListRef.value.handleSearch) {
    albumListRef.value.handleSearch(query);
  }
};

const handleViewAlbum = async (albumId) => {
  try {
    albumState.currentAlbumDetails = await fetchAlbumDetails(albumId);
    modalState.currentView = 'album';
    modalState.isOpen = true;
  } catch (error) {
    console.error('Error fetching album details:', error);
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

  await playSongFromMasterList({ cid: songId });
  modalState.currentView = 'player';
  modalState.isOpen = true;
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

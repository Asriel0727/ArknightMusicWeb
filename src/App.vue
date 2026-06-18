<template>
  <div id="app">
    <ParticleBackground />
    <Navbar :currentPage="currentPage" @change-page="handlePageChange" />

    <template v-if="currentPage === 'albums'">
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
import { initAudioPlayer, modalState, albumState, playSongFromMasterList } from './stores/player.js';

const AlbumList = defineAsyncComponent(() => import('./components/AlbumList.vue'));
const CharacterList = defineAsyncComponent(() => import('./components/CharacterList.vue'));
const RecruitCardMaker = defineAsyncComponent(() => import('./components/RecruitCardMaker.vue'));

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

const handlePageChange = (page) => {
  currentPage.value = page;
};

const handleSearch = (query) => {
  if (albumListRef.value && albumListRef.value.handleSearch) {
    albumListRef.value.handleSearch(query);
  }
};

const handleViewAlbum = async (albumId) => {
  try {
    const { fetchAlbumDetails } = await import('./services/api.js');
    albumState.currentAlbumDetails = await fetchAlbumDetails(albumId);
    modalState.currentView = 'album';
    modalState.isOpen = true;
  } catch (error) {
    console.error('Error fetching album details:', error);
  }
};

const handleModalClose = () => {
  modalState.isOpen = false;
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

onMounted(() => {
  if (audioPlayerRef.value) {
    initAudioPlayer(audioPlayerRef.value);
  }

  handleSharedSongLink();
});
</script>

<style>
/* Global styles are loaded from the existing CSS entry. */
</style>

<template>
  <div id="app">
    <ParticleBackground />
    <Navbar />
    <TopBar @search="handleSearch" />
    <AlbumList ref="albumListRef" @view-album="handleViewAlbum" />
    <Modal @close="handleModalClose" />
    <audio ref="audioPlayerRef" style="display:none;"></audio>
    <footer>
      <p>明日方舟音樂播放器 &copy;</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import ParticleBackground from './components/ParticleBackground.vue';
import Navbar from './components/Navbar.vue';
import TopBar from './components/TopBar.vue';
import AlbumList from './components/AlbumList.vue';
import Modal from './components/Modal.vue';
import { initAudioPlayer, modalState, albumState } from './stores/player.js';
import { fetchAlbumDetails } from './services/api.js';

const audioPlayerRef = ref(null);
const albumListRef = ref(null);

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

const handleModalClose = () => {
  modalState.isOpen = false;
};

onMounted(() => {
  if (audioPlayerRef.value) {
    initAudioPlayer(audioPlayerRef.value);
  }
});
</script>

<style>
/* 全局樣式將從 styles.css 導入 */
</style>


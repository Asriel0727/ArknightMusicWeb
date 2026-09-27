<template>
  <section class="topbar-section">
    <div class="topbar-left">
      <NowPlayingBar @open-current-album="handleOpenCurrentAlbum" />
    </div>
    <div class="topbar-right">
      <SearchBar ref="searchBarRef" @search="handleSearch" />
    </div>
  </section>
</template>

<script setup>
import { ref } from 'vue';
import NowPlayingBar from './NowPlayingBar.vue';
import SearchBar from './SearchBar.vue';

const emit = defineEmits(['search', 'open-current-album']);
const searchBarRef = ref(null);

const handleSearch = (query) => {
  emit('search', query);
};

const handleOpenCurrentAlbum = () => {
  emit('open-current-album');
};

const clearSearch = () => {
  searchBarRef.value?.clearSearch();
};

defineExpose({ clearSearch });
</script>

<style scoped>
.topbar-section {
  width: 100%;
  max-width: 1880px;
  margin: 0 auto 18px auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 32px;
}

.topbar-left {
  flex: 1;
  min-width: 0;
}

.topbar-right {
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .topbar-section {
    padding: 0 15px;
    gap: 8px;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  
  .topbar-right {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .topbar-section {
    padding: 0 20px;
    gap: 4px;
  }
}
</style>


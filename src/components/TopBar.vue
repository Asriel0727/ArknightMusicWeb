<template>
  <section class="topbar-section">
    <div class="topbar-left">
      <NowPlayingBar />
    </div>
    <div class="topbar-right">
      <SearchBar @search="handleSearch" />
    </div>
  </section>
</template>

<script setup>
import NowPlayingBar from './NowPlayingBar.vue';
import SearchBar from './SearchBar.vue';

const emit = defineEmits(['search']);

const handleSearch = (query) => {
  emit('search', query);
};
</script>

<style scoped>
.topbar-section {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto 18px auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 40px;
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
    padding-left: 15px;
    padding-right: 15px;
    gap: 8px;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
}

@media (max-width: 600px) {
  .topbar-section {
    padding: 0 2px;
    gap: 4px;
  }
}
</style>


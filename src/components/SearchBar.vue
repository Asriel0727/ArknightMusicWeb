<template>
  <div class="search-container search-topbar">
    <input 
      type="text" 
      v-model="searchQuery"
      @keypress.enter="handleSearch"
      placeholder="搜尋專輯或歌曲..."
    >
    <button @click="handleSearch">
      <i class="fas fa-search"></i>
    </button>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { searchState } from '../stores/player.js';

const searchQuery = ref('');

const emit = defineEmits(['search']);

const handleSearch = () => {
  searchState.query = searchQuery.value.trim().toLowerCase();
  emit('search', searchState.query);
};
</script>

<style scoped>
.search-container {
  display: flex;
  max-width: 600px;
  margin: 0 auto;
  width: 100%;
  position: relative;
}

.search-topbar {
  background: var(--card-bg);
  border-radius: 8px;
  padding: 7px;
  box-shadow: 0 2px 8px rgba(88,166,255,0.08);
  width: 250px;
  height: 50px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  overflow: hidden;
}

.search-topbar input {
  flex: 1;
  background: transparent;
  border: none;
  border-radius: 0;
  color: var(--text-color);
  font-size: 1rem;
  padding: 0 12px;
  box-shadow: none;
  min-width: 0;
}

.search-topbar input:focus {
  outline: none;
  background: rgba(88,166,255,0.07);
}

.search-topbar button {
  background-color: var(--primary-color);
  color: #222;
  border-radius: 50%;
  min-width: 36px;
  max-width: 36px;
  width: 36px;
  min-height: 36px;
  max-height: 36px;
  height: 36px;
  margin-left: 8px;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  padding: 0;
  box-sizing: border-box;
  transition: background-color 0.2s, color 0.2s;
  cursor: pointer;
  flex-shrink: 0;
  flex-grow: 0;
  background-clip: padding-box;
  background-origin: padding-box;
}

.search-topbar button:hover {
  background-color: #3d8eff;
  color: #fff;
}

@media (max-width: 900px) {
  .search-container {
    max-width: 100%;
    margin: 0;
  }
  .search-topbar {
    width: 100%;
    min-width: 0;
    max-width: 100%;
  }
  .search-topbar input {
    font-size: 0.95rem;
    padding: 7px 6px;
  }
  .search-topbar button {
    min-width: 28px;
    max-width: 28px;
    width: 28px;
    min-height: 28px;
    max-height: 28px;
    height: 28px;
    font-size: 0.95rem;
  }
}

@media (max-width: 600px) {
  .search-container {
    max-width: 100%;
    margin: 0;
  }
  .search-topbar {
    width: 100%;
    min-width: 0;
    max-width: 100%;
    padding: 4px;
  }
  .search-topbar input {
    font-size: 0.8rem;
    padding: 0 6px;
  }
  .search-topbar button {
    min-width: 22px;
    max-width: 22px;
    width: 22px;
    min-height: 22px;
    max-height: 22px;
    height: 22px;
    font-size: 0.8rem;
  }
}
</style>


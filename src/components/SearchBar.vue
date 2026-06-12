<template>
  <div class="search-container search-topbar">
    <input 
      type="text" 
      v-model="searchQuery"
      @keypress.enter="handleSearch"
      :placeholder="$t('searchBar.albumPlaceholder')"
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
  background: rgba(13, 16, 19, 0.88);
  border: 1px solid rgba(111, 122, 132, 0.35);
  border-radius: 2px;
  padding: 4px;
  box-shadow: none;
  width: 300px;
  height: 38px;
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
  font-size: 0.9rem;
  padding: 0 12px;
  box-shadow: none;
  min-width: 0;
}

.search-topbar input:focus {
  outline: none;
  background: rgba(45, 212, 191, 0.06);
}

.search-topbar button {
  background-color: rgba(79, 182, 255, 0.14);
  color: var(--primary-color);
  border-radius: 2px;
  min-width: 30px;
  max-width: 30px;
  width: 30px;
  min-height: 30px;
  max-height: 30px;
  height: 30px;
  margin-left: 8px;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(79, 182, 255, 0.35);
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
  background-color: rgba(255, 138, 42, 0.16);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
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

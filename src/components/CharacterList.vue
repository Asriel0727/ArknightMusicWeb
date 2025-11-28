<template>
  <div class="character-page">
    <!-- 篩選區域 -->
    <div class="filter-section">
      <div class="filter-group">
        <label>稀有度</label>
        <div class="filter-buttons">
          <button 
            v-for="star in [6, 5, 4, 3, 2, 1]" 
            :key="star"
            :class="{ active: selectedRarity === star }"
            @click="toggleRarity(star)"
          >
            {{ star }}★
          </button>
          <button 
            :class="{ active: selectedRarity === null }"
            @click="selectedRarity = null"
          >
            全部
          </button>
        </div>
      </div>
      <div class="filter-group">
        <label>職業</label>
        <div class="filter-buttons">
          <button 
            v-for="prof in professions" 
            :key="prof.value"
            :class="{ active: selectedProfession === prof.value }"
            @click="toggleProfession(prof.value)"
          >
            {{ prof.label }}
          </button>
          <button 
            :class="{ active: selectedProfession === null }"
            @click="selectedProfession = null"
          >
            全部
          </button>
        </div>
      </div>
      <div class="filter-group search-group">
        <label>搜尋</label>
        <input 
          type="text" 
          v-model="searchQuery" 
          placeholder="輸入角色名稱..."
          class="search-input"
        />
      </div>
    </div>

    <!-- 角色數量統計 -->
    <div class="character-count">
      共 {{ filteredCharacters.length }} 位幹員
    </div>

    <!-- 載入中 -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner"></div>
      <p>正在載入角色數據...</p>
    </div>

    <!-- 錯誤提示 -->
    <div v-else-if="error" class="error-container">
      <i class="fas fa-exclamation-triangle"></i>
      <p>{{ error }}</p>
      <button @click="loadCharacters">重試</button>
    </div>

    <!-- 角色列表 -->
    <div v-else class="character-grid">
      <div 
        v-for="char in filteredCharacters" 
        :key="char.id"
        class="character-card"
        :class="`rarity-${getRarityStars(char.rarity)}`"
      >
        <div class="character-avatar">
          <img 
            :src="getCurrentAvatarUrl(char)" 
            :alt="char.name"
            :data-char-id="char.id"
            loading="lazy"
            @error="handleImageError($event, char)"
          />
          <div class="rarity-badge">{{ getRarityStars(char.rarity) }}★</div>
        </div>
        <div class="character-info">
          <h3 class="character-name">{{ char.name }}</h3>
          <p class="character-class">{{ getProfessionName(char.profession) }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { fetchCharacters, getCharacterAvatarFallbackUrl, getCharacterAvatarUrls } from '../services/api.js';

const characters = ref([]);
const isLoading = ref(true);
const error = ref(null);
const searchQuery = ref('');
const selectedRarity = ref(null);
const selectedProfession = ref(null);

// 記錄每個角色當前使用的圖片來源索引（使用 reactive Map）
const avatarIndexMap = ref(new Map());

// 獲取角色當前應該顯示的頭像 URL
const getCurrentAvatarUrl = (char) => {
  const currentIndex = avatarIndexMap.value.get(char.id) || 0;
  const urls = getCharacterAvatarUrls(char.id);
  return urls[currentIndex] || urls[0] || '';
};

const professions = [
  { value: 'PIONEER', label: '先鋒' },
  { value: 'WARRIOR', label: '近衛' },
  { value: 'TANK', label: '重裝' },
  { value: 'SNIPER', label: '狙擊' },
  { value: 'CASTER', label: '術師' },
  { value: 'MEDIC', label: '醫療' },
  { value: 'SUPPORT', label: '輔助' },
  { value: 'SPECIAL', label: '特種' },
];

const getProfessionName = (profession) => {
  const found = professions.find(p => p.value === profession);
  return found ? found.label : profession;
};

// 確保稀有度是數字並返回星級
const getRarityStars = (rarity) => {
  let numRarity = 0;
  if (typeof rarity === 'number') {
    numRarity = rarity;
  } else if (typeof rarity === 'string') {
    const match = rarity.match(/TIER_(\d+)/);
    if (match) {
      numRarity = parseInt(match[1]) - 1;
    } else {
      numRarity = parseInt(rarity) || 0;
    }
  }
  // 確保在 0-5 範圍內
  numRarity = Math.max(0, Math.min(5, numRarity));
  return numRarity + 1; // 返回 1-6 星
};

const filteredCharacters = computed(() => {
  return characters.value.filter(char => {
    // 搜尋篩選
    if (searchQuery.value) {
      const query = searchQuery.value.toLowerCase();
      const matchName = char.name.toLowerCase().includes(query);
      const matchAppellation = char.appellation?.toLowerCase().includes(query);
      if (!matchName && !matchAppellation) return false;
    }
    
    // 稀有度篩選
    if (selectedRarity.value !== null) {
      const charStars = getRarityStars(char.rarity);
      if (charStars !== selectedRarity.value) {
        return false;
      }
    }
    
    // 職業篩選
    if (selectedProfession.value !== null && char.profession !== selectedProfession.value) {
      return false;
    }
    
    return true;
  });
});

const toggleRarity = (rarity) => {
  selectedRarity.value = selectedRarity.value === rarity ? null : rarity;
};

const toggleProfession = (profession) => {
  selectedProfession.value = selectedProfession.value === profession ? null : profession;
};

const handleImageError = (event, char) => {
  const img = event.target;
  const charId = char.id;
  
  // 獲取當前嘗試的索引
  const currentIndex = avatarIndexMap.value.get(charId) || 0;
  const nextIndex = currentIndex + 1;
  
  // 獲取所有可用的圖片 URL
  const urls = getCharacterAvatarUrls(charId);
  
  // 如果還有下一個來源，嘗試它
  if (nextIndex < urls.length) {
    avatarIndexMap.value.set(charId, nextIndex);
    img.src = urls[nextIndex];
    return;
  }
  
  // 所有來源都失敗，使用預設圖片
  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect fill="%2330363d" width="100" height="100"/><text fill="%238b949e" x="50" y="55" text-anchor="middle" font-size="12">No Image</text></svg>';
};

const loadCharacters = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    const loadedChars = await fetchCharacters();
    characters.value = loadedChars;
    // 重置所有角色的圖片索引
    avatarIndexMap.value.clear();
    loadedChars.forEach(char => {
      avatarIndexMap.value.set(char.id, 0);
    });
  } catch (e) {
    error.value = '無法載入角色數據，請稍後再試';
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  loadCharacters();
});
</script>

<style scoped>
.character-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

/* 篩選區域 */
.filter-section {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-buttons button {
  background: var(--border-color);
  color: var(--text-color);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.filter-buttons button:hover {
  background: var(--primary-color);
  color: white;
}

.filter-buttons button.active {
  background: var(--primary-color);
  color: white;
}

.search-group {
  flex: 1;
  min-width: 200px;
}

.search-input {
  background: var(--border-color);
  border: none;
  padding: 10px 15px;
  border-radius: 8px;
  color: var(--text-color);
  font-size: 0.95rem;
  width: 100%;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--primary-color);
}

.search-input::placeholder {
  color: var(--text-secondary);
}

/* 角色數量 */
.character-count {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 15px;
  padding-left: 5px;
}

/* 載入中 */
.loading-container,
.error-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  gap: 15px;
  color: var(--text-secondary);
}

.error-container i {
  font-size: 2.5rem;
  color: #f85149;
}

.error-container button {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  margin-top: 10px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 角色卡片網格 */
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 15px;
}

/* 角色卡片 */
.character-card {
  background: var(--card-bg);
  border-radius: 10px;
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.character-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
}

/* 稀有度顏色 */
.character-card.rarity-6 {
  border: 2px solid #ff7e2f;
  box-shadow: 0 0 10px rgba(255, 126, 47, 0.3);
}

.character-card.rarity-5 {
  border: 2px solid #ffe650;
}

.character-card.rarity-4 {
  border: 2px solid #d1a0ff;
}

.character-card.rarity-3 {
  border: 2px solid #00b4ff;
}

.character-card.rarity-2 {
  border: 2px solid #8cff8c;
}

.character-card.rarity-1 {
  border: 2px solid #9e9e9e;
}

.character-avatar {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  background: linear-gradient(135deg, #1a1f26, #2d333b);
  overflow: hidden;
}

.character-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s;
}

.character-card:hover .character-avatar img {
  transform: scale(1.1);
}

.rarity-badge {
  position: absolute;
  top: 5px;
  right: 5px;
  background: rgba(0, 0, 0, 0.7);
  color: #ffc107;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
}

.character-info {
  padding: 10px;
  text-align: center;
}

.character-name {
  font-size: 0.95rem;
  color: var(--text-color);
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.character-class {
  font-size: 0.8rem;
  color: var(--text-secondary);
  margin: 0;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .character-page {
    padding: 15px;
  }
  
  .filter-section {
    padding: 15px;
    gap: 15px;
  }
  
  .filter-buttons button {
    padding: 5px 10px;
    font-size: 0.8rem;
  }
  
  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 10px;
  }
  
  .character-name {
    font-size: 0.85rem;
  }
  
  .character-class {
    font-size: 0.75rem;
  }
}

@media (max-width: 480px) {
  .character-grid {
    grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
    gap: 8px;
  }
  
  .character-info {
    padding: 8px;
  }
  
  .character-name {
    font-size: 0.8rem;
  }
}
</style>


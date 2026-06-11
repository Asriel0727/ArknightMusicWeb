<template>
  <div class="character-page" :key="locale">
    <h1 class="page-title">{{ t('character.pageTitle') }}</h1>
    <!-- 篩選區域 -->
    <div class="filter-section">
      <div class="filter-group">
        <label>{{ t('character.rarity') }}</label>
        <div class="filter-buttons">
          <button 
            v-for="star in [6, 5, 4, 3, 2, 1]" 
            :key="star"
            :class="{ active: selectedRarity.includes(star) }"
            @click="toggleRarity(star)"
          >
            {{ star }}★
          </button>
          <button 
            :class="{ active: selectedRarity.length === 0 }"
            @click="selectedRarity = []"
          >
            {{ t('common.all') }}
          </button>
        </div>
      </div>
      <div class="filter-group">
        <label>{{ t('character.profession') }}</label>
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
            {{ t('common.all') }}
          </button>
        </div>
      </div>
      <div class="filter-group faction-filter-group">
        <label>{{ t('character.nation') }}</label>
        <div class="faction-filter-controls">
          <button
            type="button"
            class="filter-toggle-button"
            :aria-expanded="isFactionFilterExpanded"
            @click="isFactionFilterExpanded = !isFactionFilterExpanded"
          >
            <i :class="isFactionFilterExpanded ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
            {{ isFactionFilterExpanded ? t('character.collapseFactions') : t('character.expandFactions') }}
          </button>
        </div>
        <div v-if="isFactionFilterExpanded" class="filter-buttons nation-buttons">
          <button
            v-for="faction in factionFilterOptions"
            :key="faction.id"
            :class="{ active: selectedFactions.includes(faction.id) }"
            @click="toggleFaction(faction.id)"
          >
            {{ faction.label }}
          </button>
          <button
            :class="{ active: selectedFactions.length === 0 }"
            @click="selectedFactions = []"
          >
            {{ t('common.all') }}
          </button>
        </div>
        <div v-else-if="selectedFactionLabels.length > 0" class="filter-collapsed-summary">
          {{ selectedFactionLabels.join('、') }}
        </div>
      </div>
      <div class="filter-group search-group">
        <label>{{ t('character.search') }}</label>
        <input 
          type="text" 
          v-model="searchQuery" 
          :placeholder="t('character.searchPlaceholder')"
          class="search-input"
        />
      </div>
    </div>

    <!-- 角色數量統計 -->
    <div class="character-count">
      {{ t('character.count', { n: filteredCharacters.length }) }}
    </div>

    <!-- 載入中 -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner"></div>
      <p>{{ t('character.loadList') }}</p>
    </div>

    <!-- 錯誤提示 -->
    <div v-else-if="error" class="error-container">
      <i class="fas fa-exclamation-triangle"></i>
      <p>{{ error }}</p>
      <button @click="loadCharacters">{{ t('character.retry') }}</button>
    </div>

    <!-- 角色列表 -->
    <div v-else class="character-grid">
      <div 
        v-for="char in filteredCharacters" 
        :key="char.id"
        class="character-card"
        :class="`rarity-${getRarityStars(char.rarity)}`"
        @click="handleCharacterClick(char)"
      >
        <div class="character-avatar">
          <img 
            :src="getCurrentAvatarUrl(char)" 
            :alt="char.name"
            :data-char-id="char.id"
            loading="lazy"
            decoding="async"
            fetchpriority="low"
            @error="handleImageError($event, char)"
          />
          <div class="rarity-badge">{{ getRarityStars(char.rarity) }}★</div>
        </div>
        <div class="character-info">
          <h3 class="character-name">{{ char.name }}</h3>
          <p class="character-class">{{ getProfessionName(char.profession) }}</p>
          <p v-if="getFactionLabel(char.factionId)" class="character-nation" :title="getFactionLabel(char.factionId)">
            {{ getFactionLabel(char.factionId) }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchRecruitCharacters, getCharacterAvatarFallbackUrl, getCharacterAvatarUrls, fetchCharacterDetails, syncFactionI18nMessages } from '../services/api.js';
import { modalState, characterState } from '../stores/player.js';
import { i18n } from '../i18n/index.js';

const { t, locale } = useI18n();

const characters = ref([]);
const isLoading = ref(true);
const error = ref(null);
const searchQuery = ref('');
const selectedRarity = ref([]); // 改為數組，支援多選
const selectedFactions = ref([]);
const selectedProfession = ref(null);
const isFactionFilterExpanded = ref(false);

// 記錄每個角色當前使用的圖片來源索引（使用 reactive Map）
const avatarIndexMap = ref(new Map());

// 獲取角色當前應該顯示的頭像 URL
const getCurrentAvatarUrl = (char) => {
  const currentIndex = avatarIndexMap.value.get(char.id) || 0;
  const urls = getCharacterAvatarUrls(char.id);
  return urls[currentIndex] || urls[0] || '';
};

const professions = computed(() => [
  { value: 'PIONEER', label: t('profession.PIONEER') },
  { value: 'WARRIOR', label: t('profession.WARRIOR') },
  { value: 'TANK', label: t('profession.TANK') },
  { value: 'SNIPER', label: t('profession.SNIPER') },
  { value: 'CASTER', label: t('profession.CASTER') },
  { value: 'MEDIC', label: t('profession.MEDIC') },
  { value: 'SUPPORT', label: t('profession.SUPPORT') },
  { value: 'SPECIAL', label: t('profession.SPECIAL') },
]);

const getProfessionName = (profession) => {
  const found = professions.value.find(p => p.value === profession);
  return found ? found.label : profession;
};

const getFactionLabel = (factionId) => {
  if (!factionId) return '';
  const key = `nation.${factionId}`;
  const label = t(key);
  return label === key ? factionId : label;
};

const factionFilterOptions = computed(() => {
  const byId = new Map();
  for (const char of characters.value) {
    if (!char.factionId || byId.has(char.factionId)) continue;
    byId.set(char.factionId, {
      id: char.factionId,
      order: char.factionOrder ?? 9999,
      label: getFactionLabel(char.factionId),
    });
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
});

const selectedFactionLabels = computed(() =>
  selectedFactions.value
    .map((factionId) => getFactionLabel(factionId))
    .filter(Boolean)
);

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
      const matchNation = getFactionLabel(char.factionId).toLowerCase().includes(query);
      if (!matchName && !matchAppellation && !matchNation) return false;
    }
    
    // 稀有度篩選（支援多選）
    if (selectedRarity.value.length > 0) {
      const charStars = getRarityStars(char.rarity);
      if (!selectedRarity.value.includes(charStars)) {
        return false;
      }
    }
    
    // 陣營篩選（支援多選）
    if (selectedFactions.value.length > 0 && !selectedFactions.value.includes(char.factionId)) {
      return false;
    }

    // 職業篩選
    if (selectedProfession.value !== null && char.profession !== selectedProfession.value) {
      return false;
    }
    
    return true;
  });
});

const toggleRarity = (rarity) => {
  const index = selectedRarity.value.indexOf(rarity);
  if (index > -1) {
    // 如果已選中，則移除
    selectedRarity.value.splice(index, 1);
  } else {
    // 如果未選中，則添加
    selectedRarity.value.push(rarity);
  }
};

const toggleFaction = (factionId) => {
  const index = selectedFactions.value.indexOf(factionId);
  if (index > -1) {
    selectedFactions.value.splice(index, 1);
  } else {
    selectedFactions.value.push(factionId);
  }
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

const handleCharacterClick = async (char) => {
  try {
    // 獲取角色詳細資料
    characterState.currentCharacterDetails = await fetchCharacterDetails(char.id);
    modalState.currentView = 'character';
    modalState.isOpen = true;
  } catch (error) {
    console.error('獲取角色詳情失敗:', error);
    alert(t('character.loadDetailError'));
  }
};

const loadCharacters = async () => {
  isLoading.value = true;
  error.value = null;
  
  try {
    const loadedChars = await fetchRecruitCharacters();
    characters.value = loadedChars;
    // 重置所有角色的圖片索引
    avatarIndexMap.value.clear();
    loadedChars.forEach(char => {
      avatarIndexMap.value.set(char.id, 0);
    });
  } catch (e) {
          error.value = t('character.loadListError');
    console.error(e);
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await syncFactionI18nMessages(i18n);
  loadCharacters();
});

watch(locale, async () => {
  await syncFactionI18nMessages(i18n);
  await loadCharacters();
  if (
    modalState.isOpen &&
    modalState.currentView === 'character' &&
    characterState.currentCharacterDetails?.id
  ) {
    try {
      characterState.currentCharacterDetails = await fetchCharacterDetails(
        characterState.currentCharacterDetails.id
      );
    } catch (e) {
      console.error(e);
    }
  }
});
</script>

<style scoped>
.character-page {
  padding: 20px;
  max-width: 1400px;
  margin: 0 auto;
}

.character-page > .page-title {
  margin: 0 0 16px 0;
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--text-color);
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

.faction-filter-controls {
  display: flex;
  align-items: center;
}

.filter-group label {
  font-size: 0.9rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.filter-toggle-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: rgba(88, 166, 255, 0.12);
  color: var(--primary-color);
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.filter-toggle-button:hover {
  background: rgba(88, 166, 255, 0.2);
}

.filter-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-collapsed-summary {
  color: var(--text-secondary);
  font-size: 0.85rem;
  line-height: 1.5;
}

.filter-buttons.nation-buttons {
  max-height: 140px;
  overflow-y: auto;
  padding-right: 4px;
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

.character-nation {
  font-size: 0.72rem;
  color: var(--primary-color);
  margin: 6px 0 0 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

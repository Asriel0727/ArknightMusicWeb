<template>
  <div class="character-details" v-if="character">
    <!-- 標題區域 -->
    <div class="character-details-header">
      <div class="character-avatar-large">
        <img 
          :src="getAvatarUrl(character.id)" 
          :alt="character.name"
          @error="handleImageError"
        />
        <div class="rarity-badge-large">{{ getRarityStars(character.rarity) }}★</div>
      </div>
      <div class="character-info-header">
        <h2 class="character-name-large">{{ character.name }}</h2>
        <p class="character-appellation">{{ character.appellation || character.id }}</p>
        <div class="character-tags">
          <span class="tag profession">{{ getProfessionName(character.profession) }}</span>
          <span class="tag position">{{ character.position === 'MELEE' ? '近戰' : '遠程' }}</span>
          <span v-if="character.nation" class="tag nation">{{ character.nation }}</span>
        </div>
      </div>
    </div>

    <div class="character-details-content">
      <!-- 1. 幹員立繪 -->
      <div class="detail-section" v-if="allPortraits.length > 0">
        <h3><i class="fas fa-user"></i> 1. 幹員立繪</h3>
        <div class="portrait-tabs">
          <button 
            v-for="(portrait, index) in allPortraits" 
            :key="index"
            :class="{ active: currentPortraitIndex === index }"
            @click="selectPortrait(index)"
          >
            {{ portrait.name }}
          </button>
        </div>
        <div class="portrait-display" v-if="currentPortraitUrl">
          <img 
            :src="currentPortraitUrl" 
            :alt="allPortraits[currentPortraitIndex]?.name || '立繪'"
            @error="handlePortraitError"
            class="portrait-image"
            @load="handlePortraitLoad"
          />
        </div>
        <div v-else class="portrait-loading">
          <p>載入中...</p>
        </div>
      </div>

      <!-- 2. 特性 -->
      <div class="detail-section" v-if="character.traitDescription">
        <h3><i class="fas fa-star"></i> 2. 特性</h3>
        <p class="trait-text">{{ character.traitDescription }}</p>
      </div>

      <!-- 3. 獲得方式 -->
      <div class="detail-section" v-if="character.obtainApproach">
        <h3><i class="fas fa-gift"></i> 3. 獲得方式</h3>
        <p>{{ character.obtainApproach }}</p>
      </div>

      <!-- 4. 屬性 -->
      <div class="detail-section" v-if="character.phases && character.phases.length > 0">
        <h3><i class="fas fa-chart-bar"></i> 4. 屬性</h3>
        <div class="attributes-table-wrapper">
          <table class="attributes-table">
            <thead>
              <tr>
                <th>等級</th>
                <th>生命</th>
                <th>攻擊</th>
                <th>防禦</th>
                <th>法抗</th>
                <th>再部署</th>
                <th>費用</th>
                <th>阻擋</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(phase, phaseIndex) in character.phases" :key="phaseIndex">
                <td class="phase-label">精英{{ phaseIndex }}</td>
                <td>{{ getAttribute(phase, 'maxHp') }}</td>
                <td>{{ getAttribute(phase, 'atk') }}</td>
                <td>{{ getAttribute(phase, 'def') }}</td>
                <td>{{ getAttribute(phase, 'magicResistance') }}%</td>
                <td>{{ getAttribute(phase, 'respawnTime') }}s</td>
                <td>{{ getAttribute(phase, 'cost') }}</td>
                <td>{{ getAttribute(phase, 'blockCnt') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 5. 攻擊範圍 -->
      <div class="detail-section" v-if="character.phaseRanges && character.phaseRanges.length > 0">
        <h3><i class="fas fa-crosshairs"></i> 5. 攻擊範圍</h3>
        <div class="range-phases">
          <div v-for="range in character.phaseRanges" :key="range.phase" class="range-phase-item">
            <h4>精英 {{ range.phase }}</h4>
            <div class="range-grid" :style="getRangeGridStyle(range.grids)">
              <div 
                v-for="(grid, idx) in range.grids" 
                :key="idx" 
                class="range-cell"
                :class="getCellClass(grid)"
                :style="getCellStyle(grid, range.grids)"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 6. 天賦 -->
      <div class="detail-section" v-if="character.talents && character.talents.length > 0">
        <h3><i class="fas fa-magic"></i> 6. 天賦</h3>
        <div class="talents-list">
          <template v-for="(talent, tIndex) in character.talents" :key="tIndex">
            <div 
              v-for="(candidate, cIndex) in talent.candidates" 
              :key="`${tIndex}-${cIndex}`" 
              class="talent-card"
            >
              <div class="talent-header">
                <span class="talent-name">{{ candidate.name || `天賦 ${tIndex + 1}` }}</span>
                <span class="talent-unlock">
                  精英{{ candidate.unlockCondition?.phase || 0 }} Lv{{ candidate.unlockCondition?.level || 1 }}
                  <span v-if="candidate.requiredPotentialRank > 0" class="potential-req">
                    潛能{{ candidate.requiredPotentialRank }}
                  </span>
                </span>
              </div>
              <p class="talent-desc">{{ candidate.description }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- 7. 潛能提升 -->
      <div class="detail-section" v-if="character.potentialRanks && character.potentialRanks.length > 0">
        <h3><i class="fas fa-arrow-up"></i> 7. 潛能提升</h3>
        <div class="potential-list">
          <div v-for="(rank, index) in character.potentialRanks" :key="index" class="potential-item">
            <span class="potential-level">潛能 {{ index + 2 }}</span>
            <span class="potential-effect">
              {{ rank.description || rank.buffDescription || '提升能力' }}
            </span>
          </div>
        </div>
      </div>

      <!-- 8. 技能 -->
      <div class="detail-section" v-if="character.skills && character.skills.length > 0">
        <h3><i class="fas fa-bolt"></i> 8. 技能</h3>
        <div class="skills-list">
          <div v-for="(skill, index) in character.skills" :key="skill.id" class="skill-card">
            <div class="skill-header">
              <span class="skill-index">技能 {{ index + 1 }}</span>
              <span class="skill-name">{{ skill.name }}</span>
            </div>
            <p class="skill-desc">{{ skill.description }}</p>
            <div class="skill-stats">
              <span v-if="skill.spData?.spCost"><i class="fas fa-bolt"></i> SP消耗: {{ skill.spData.spCost }}</span>
              <span v-if="skill.spData?.initSp"><i class="fas fa-play"></i> 初始SP: {{ skill.spData.initSp }}</span>
              <span v-if="skill.duration > 0"><i class="fas fa-clock"></i> 持續: {{ skill.duration }}s</span>
              <span v-if="skill.spData?.spType !== undefined"><i class="fas fa-sync"></i> {{ getSpTypeName(skill.spData.spType) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 9. 後勤技能 -->
      <div class="detail-section" v-if="character.buildingSkills && character.buildingSkills.length > 0">
        <h3><i class="fas fa-building"></i> 9. 後勤技能</h3>
        <div class="building-skills-list">
          <div v-for="skill in character.buildingSkills" :key="skill.id" class="building-skill-card">
            <div class="building-skill-header">
              <span class="building-skill-name">{{ skill.name || '基建技能' }}</span>
              <span class="building-skill-room" v-if="skill.roomType">{{ getRoomTypeName(skill.roomType) }}</span>
            </div>
            <p class="building-skill-desc">{{ skill.description }}</p>
            <div class="building-skill-unlock" v-if="skill.cond">
              <span v-if="skill.cond.phase !== undefined">精英{{ skill.cond.phase }}</span>
              <span v-if="skill.cond.level">Lv{{ skill.cond.level }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 10. 精英化材料 -->
      <div class="detail-section" v-if="character.evolveCosts && character.evolveCosts.length > 0">
        <h3><i class="fas fa-level-up-alt"></i> 10. 精英化材料</h3>
        <div class="evolve-costs">
          <div v-for="(cost, index) in character.evolveCosts" :key="index" class="evolve-phase">
            <h4>精英化 {{ cost.phase }}</h4>
            <div class="materials-grid">
              <div v-for="(item, itemIndex) in cost.cost" :key="itemIndex" class="material-item">
                <img 
                  :src="item.iconUrl" 
                  :alt="item.name"
                  @error="handleMaterialError"
                  class="material-icon"
                />
                <div class="material-info">
                  <span class="material-name">{{ item.name }}</span>
                  <span class="material-count">x{{ item.count }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 11. 技能升級材料 -->
      <div class="detail-section" v-if="character.skillUpgradeCosts && character.skillUpgradeCosts.length > 0">
        <h3><i class="fas fa-cogs"></i> 11. 技能升級材料</h3>
        <div class="skill-upgrade-costs">
          <div v-for="(upgrade, index) in character.skillUpgradeCosts" :key="index" class="upgrade-level">
            <h4>技能等級 {{ upgrade.level - 1 }} → {{ upgrade.level }}</h4>
            <div class="materials-grid" v-if="upgrade.lvlUpCost && upgrade.lvlUpCost.length > 0">
              <div v-for="(item, itemIndex) in upgrade.lvlUpCost" :key="itemIndex" class="material-item">
                <img 
                  :src="item.iconUrl" 
                  :alt="item.name"
                  @error="handleMaterialError"
                  class="material-icon"
                />
                <div class="material-info">
                  <span class="material-name">{{ item.name }}</span>
                  <span class="material-count">x{{ item.count }}</span>
                </div>
              </div>
            </div>
            <p v-else class="no-cost">無需材料</p>
          </div>
        </div>
      </div>

      <!-- 12. 模組 -->
      <div class="detail-section" v-if="character.modules && character.modules.length > 0">
        <h3><i class="fas fa-puzzle-piece"></i> 12. 模組</h3>
        <div class="modules-list">
          <div v-for="module in character.modules" :key="module.id" class="module-card">
            <div class="module-header">
              <span class="module-name">{{ module.uniEquipName || '模組' }}</span>
              <span class="module-type" v-if="module.typeName1 || module.typeName2">
                {{ module.typeName1 }}{{ module.typeName2 ? ` - ${module.typeName2}` : '' }}
              </span>
            </div>
            <p class="module-desc" v-if="module.uniEquipDesc">{{ module.uniEquipDesc }}</p>
            <div class="module-unlock">
              <span>解鎖條件: 精英{{ module.unlockEvolvePhase }} Lv{{ module.unlockLevel }}</span>
              <span v-if="module.unlockFavorPoint"> 信賴{{ module.unlockFavorPoint }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 13. 幹員檔案 -->
      <div class="detail-section" v-if="character.handbook && hasHandbookContent">
        <h3><i class="fas fa-book"></i> 13. 幹員檔案</h3>
        <div class="handbook-content">
          <div v-if="character.handbook.storyTextAudio && character.handbook.storyTextAudio.length > 0" class="handbook-stories">
            <div v-for="(story, index) in character.handbook.storyTextAudio" :key="index" class="story-card">
              <h4 @click="toggleStory(index)" class="story-title">
                <i :class="expandedStories.includes(index) ? 'fas fa-chevron-down' : 'fas fa-chevron-right'"></i>
                {{ story.storyTitle || `檔案 ${index + 1}` }}
              </h4>
              <p v-if="expandedStories.includes(index)" class="story-content">
                {{ story.stories?.[0]?.storyText || '' }}
              </p>
            </div>
          </div>
          <p v-else class="no-data">暫無檔案資料</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { getCharacterAvatarUrls } from '../services/api.js';

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
});

const currentPortraitIndex = ref(0);
const currentPortraitUrlIndex = ref(0);
const expandedStories = ref([0]); // 預設展開第一個檔案

const professions = {
  'PIONEER': '先鋒',
  'WARRIOR': '近衛',
  'TANK': '重裝',
  'SNIPER': '狙擊',
  'CASTER': '術師',
  'MEDIC': '醫療',
  'SUPPORT': '輔助',
  'SPECIAL': '特種'
};

const roomTypes = {
  'CONTROL': '控制中樞',
  'POWER': '發電站',
  'MANUFACTURE': '製造站',
  'TRADING': '貿易站',
  'DORMITORY': '宿舍',
  'MEETING': '會客室',
  'HIRE': '人力辦公室',
  'TRAINING': '訓練室',
  'WORKSHOP': '加工站'
};

const spTypes = {
  1: '自動回復',
  2: '攻擊回復',
  4: '受擊回復',
  8: '被動'
};

// 獲取立繪列表
const allPortraits = computed(() => {
  const list = [];
  
  console.log('[組件調試] character.portraits:', props.character.portraits);
  
  // 添加立繪
  if (props.character.portraits && props.character.portraits.length > 0) {
    props.character.portraits.forEach(p => {
      console.log('[組件調試] 添加立繪:', p.name, 'URLs:', p.urls);
      list.push({
        name: p.name,
        urls: p.urls
      });
    });
  }
  
  console.log('[組件調試] 最終allPortraits:', list);
  
  return list.length > 0 ? list : [{ name: '立繪', urls: [getAvatarUrl(props.character.id)] }];
});

const currentPortraitUrl = computed(() => {
  const portrait = allPortraits.value[currentPortraitIndex.value];
  if (!portrait || !portrait.urls) {
    console.log('[組件調試] 當前立繪為空或無URLs');
    return '';
  }
  const url = portrait.urls[currentPortraitUrlIndex.value] || portrait.urls[0] || '';
  console.log('[組件調試] 當前立繪URL:', url, '索引:', currentPortraitUrlIndex.value, '/', portrait.urls.length);
  return url;
});

const hasHandbookContent = computed(() => {
  return props.character.handbook && 
    props.character.handbook.storyTextAudio && 
    props.character.handbook.storyTextAudio.length > 0;
});

const selectPortrait = (index) => {
  console.log('[組件調試] 選擇立繪索引:', index);
  currentPortraitIndex.value = index;
  currentPortraitUrlIndex.value = 0; // 重置備用 URL 索引
  console.log('[組件調試] 重置URL索引為0');
};

const toggleStory = (index) => {
  const idx = expandedStories.value.indexOf(index);
  if (idx > -1) {
    expandedStories.value.splice(idx, 1);
  } else {
    expandedStories.value.push(index);
  }
};

const getProfessionName = (profession) => {
  return professions[profession] || profession;
};

const getRoomTypeName = (roomType) => {
  return roomTypes[roomType] || roomType;
};

const getSpTypeName = (spType) => {
  return spTypes[spType] || '自動回復';
};

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
  numRarity = Math.max(0, Math.min(5, numRarity));
  return numRarity + 1;
};

const getAvatarUrl = (charId) => {
  const urls = getCharacterAvatarUrls(charId);
  return urls[0] || '';
};

const getAttribute = (phase, attrName) => {
  if (!phase.attributesKeyFrames || phase.attributesKeyFrames.length === 0) {
    return '-';
  }
  const lastFrame = phase.attributesKeyFrames[phase.attributesKeyFrames.length - 1];
  const value = lastFrame.data?.[attrName];
  return value !== undefined ? value : '-';
};

// 攻擊範圍相關
const getRangeGridStyle = (grids) => {
  if (!grids || grids.length === 0) return {};
  
  // 找出範圍邊界
  let minRow = 0, maxRow = 0, minCol = 0, maxCol = 0;
  grids.forEach(g => {
    minRow = Math.min(minRow, g.row);
    maxRow = Math.max(maxRow, g.row);
    minCol = Math.min(minCol, g.col);
    maxCol = Math.max(maxCol, g.col);
  });
  
  const rows = maxRow - minRow + 1;
  const cols = maxCol - minCol + 1;
  
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 24px)`,
    gridTemplateRows: `repeat(${rows}, 24px)`,
    gap: '2px'
  };
};

const getCellClass = (grid) => {
  if (grid.row === 0 && grid.col === 0) return 'self-cell';
  return 'attack-cell';
};

const getCellStyle = (grid, allGrids) => {
  // 計算偏移
  let minRow = 0, minCol = 0;
  allGrids.forEach(g => {
    minRow = Math.min(minRow, g.row);
    minCol = Math.min(minCol, g.col);
  });
  
  return {
    gridRow: grid.row - minRow + 1,
    gridColumn: grid.col - minCol + 1
  };
};

const handleImageError = (event) => {
  event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%2330363d" width="200" height="200"/><text fill="%238b949e" x="100" y="110" text-anchor="middle" font-size="16">No Image</text></svg>';
};

const handlePortraitLoad = (event) => {
  console.log('[組件調試] 立繪載入成功:', event?.target?.src);
};

const handlePortraitError = (event) => {
  const failedUrl = event.target.src;
  console.log('[組件調試] 立繪載入失敗:', failedUrl);
  
  const portrait = allPortraits.value[currentPortraitIndex.value];
  console.log('[組件調試] 當前立繪索引:', currentPortraitIndex.value);
  console.log('[組件調試] 當前立繪數據:', portrait);
  console.log('[組件調試] 當前URL索引:', currentPortraitUrlIndex.value, '/', portrait?.urls?.length || 0);
  
  if (portrait && portrait.urls) {
    // 檢查是否還有更多 URL 可以嘗試
    if (currentPortraitUrlIndex.value < portrait.urls.length - 1) {
      // 嘗試下一個備用 URL
      currentPortraitUrlIndex.value++;
      const nextUrl = portrait.urls[currentPortraitUrlIndex.value];
      console.log('[組件調試] 嘗試下一個URL:', nextUrl, '索引:', currentPortraitUrlIndex.value, '/', portrait.urls.length);
      
      if (nextUrl && nextUrl !== failedUrl) {
        // 使用 nextTick 確保響應式更新
        setTimeout(() => {
          console.log('[組件調試] 設置新URL:', nextUrl);
          // 先設置一個空白圖片，然後再設置新 URL，確保觸發載入
          event.target.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          setTimeout(() => {
            event.target.src = nextUrl;
          }, 50);
        }, 100);
        return; // 返回，不顯示佔位符
      }
    }
    
    // 所有 URL 都失敗，顯示佔位符
    console.log('[組件調試] 所有URL都失敗，顯示佔位符。已嘗試:', currentPortraitUrlIndex.value + 1, '個URL');
    event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect fill="%2330363d" width="400" height="600"/><text fill="%238b949e" x="200" y="310" text-anchor="middle" font-size="20">立繪載入失敗</text></svg>';
  } else {
    // 沒有立繪數據
    console.log('[組件調試] 沒有立繪數據');
    event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect fill="%2330363d" width="400" height="600"/><text fill="%238b949e" x="200" y="310" text-anchor="middle" font-size="20">立繪載入失敗</text></svg>';
  }
};

const handleMaterialError = (event) => {
  event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect fill="%2330363d" width="60" height="60" rx="6"/><text fill="%238b949e" x="30" y="35" text-anchor="middle" font-size="10">?</text></svg>';
};
</script>

<style scoped>
.character-details {
  padding: 20px;
  max-height: 80vh;
  overflow-y: auto;
}

.character-details-header {
  display: flex;
  gap: 30px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color);
}

.character-avatar-large {
  position: relative;
  width: 150px;
  height: 150px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #1a1f26, #2d333b);
}

.character-avatar-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rarity-badge-large {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.8);
  color: #ffc107;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: bold;
}

.character-info-header {
  flex: 1;
}

.character-name-large {
  font-size: 1.8rem;
  color: var(--primary-color);
  margin: 0 0 8px 0;
}

.character-appellation {
  font-size: 1rem;
  color: var(--text-secondary);
  margin: 0 0 12px 0;
  font-style: italic;
}

.character-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 500;
}

.tag.profession { background: var(--primary-color); color: white; }
.tag.position { background: var(--border-color); color: var(--text-color); }
.tag.nation { background: rgba(88, 166, 255, 0.2); color: var(--primary-color); }

.character-details-content {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.detail-section {
  background: rgba(13, 17, 23, 0.5);
  padding: 20px;
  border-radius: 10px;
}

.detail-section h3 {
  font-size: 1.2rem;
  color: var(--primary-color);
  margin: 0 0 15px 0;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 10px;
}

.detail-section h3 i {
  font-size: 1rem;
}

.detail-section h4 {
  font-size: 1rem;
  color: var(--primary-color);
  margin: 0 0 10px 0;
}

.detail-section p {
  line-height: 1.7;
  color: var(--text-color);
  margin: 0;
}

/* 立繪 */
.portrait-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 15px;
}

.portrait-tabs button {
  padding: 8px 16px;
  background: var(--border-color);
  border: none;
  border-radius: 6px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.9rem;
}

.portrait-tabs button:hover,
.portrait-tabs button.active {
  background: var(--primary-color);
  color: white;
}

.portrait-display {
  text-align: center;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 20px;
}

.portrait-image {
  max-width: 100%;
  max-height: 500px;
  border-radius: 8px;
  object-fit: contain;
}

/* 特性 */
.trait-text {
  background: rgba(88, 166, 255, 0.1);
  padding: 15px;
  border-radius: 8px;
  border-left: 3px solid var(--primary-color);
}

/* 屬性表格 */
.attributes-table-wrapper {
  overflow-x: auto;
}

.attributes-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.attributes-table th,
.attributes-table td {
  padding: 12px 8px;
  text-align: center;
  border: 1px solid var(--border-color);
}

.attributes-table th {
  background: var(--border-color);
  color: var(--text-color);
  font-weight: 600;
}

.phase-label {
  font-weight: 600;
  color: var(--primary-color);
}

/* 攻擊範圍 */
.range-phases {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.range-phase-item {
  background: rgba(0, 0, 0, 0.2);
  padding: 15px;
  border-radius: 8px;
}

.range-grid {
  margin-top: 10px;
}

.range-cell {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.attack-cell {
  background: rgba(88, 166, 255, 0.6);
  border: 1px solid var(--primary-color);
}

.self-cell {
  background: rgba(255, 193, 7, 0.8);
  border: 1px solid #ffc107;
}

/* 天賦 */
.talents-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.talent-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid var(--primary-color);
}

.talent-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
}

.talent-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--primary-color);
}

.talent-unlock {
  font-size: 0.85rem;
  color: var(--text-secondary);
  background: var(--border-color);
  padding: 4px 10px;
  border-radius: 4px;
}

.potential-req {
  color: #ffc107;
  margin-left: 5px;
}

.talent-desc {
  color: var(--text-color);
  font-size: 0.95rem;
  line-height: 1.6;
}

/* 潛能 */
.potential-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.potential-item {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 12px 15px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 6px;
}

.potential-level {
  font-weight: 600;
  color: var(--primary-color);
  min-width: 70px;
}

.potential-effect {
  color: var(--text-color);
}

/* 技能 */
.skills-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skill-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid var(--primary-color);
}

.skill-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.skill-index {
  background: var(--primary-color);
  color: white;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
}

.skill-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color);
}

.skill-desc {
  color: var(--text-secondary);
  margin-bottom: 12px;
  line-height: 1.6;
}

.skill-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  font-size: 0.85rem;
  color: var(--text-secondary);
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.skill-stats span {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* 后勤技能 */
.building-skills-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.building-skill-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid #4caf50;
}

.building-skill-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.building-skill-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #4caf50;
}

.building-skill-room {
  font-size: 0.85rem;
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
  padding: 4px 10px;
  border-radius: 4px;
}

.building-skill-desc {
  color: var(--text-secondary);
  line-height: 1.6;
}

.building-skill-unlock {
  margin-top: 10px;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 材料 */
.evolve-costs,
.skill-upgrade-costs {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.evolve-phase,
.upgrade-level {
  background: rgba(88, 166, 255, 0.05);
  padding: 15px;
  border-radius: 8px;
}

.materials-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.material-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.material-icon {
  width: 50px;
  height: 50px;
  object-fit: contain;
  border-radius: 4px;
}

.material-info {
  display: flex;
  flex-direction: column;
}

.material-name {
  font-size: 0.85rem;
  color: var(--text-color);
}

.material-count {
  font-size: 0.95rem;
  color: var(--primary-color);
  font-weight: 600;
}

.no-cost {
  color: var(--text-secondary);
  font-style: italic;
}

/* 模組 */
.modules-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-card {
  padding: 16px;
  background: rgba(88, 166, 255, 0.08);
  border-radius: 8px;
  border-left: 4px solid #ffc107;
}

.module-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  flex-wrap: wrap;
  gap: 8px;
}

.module-name {
  font-size: 1.1rem;
  font-weight: 600;
  color: #ffc107;
}

.module-type {
  font-size: 0.85rem;
  background: rgba(255, 193, 7, 0.2);
  color: #ffc107;
  padding: 4px 10px;
  border-radius: 4px;
}

.module-desc {
  color: var(--text-secondary);
  line-height: 1.6;
  margin-bottom: 10px;
}

.module-unlock {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

/* 檔案 */
.handbook-stories {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.story-card {
  background: rgba(88, 166, 255, 0.05);
  border-radius: 8px;
  overflow: hidden;
}

.story-title {
  padding: 12px 15px;
  margin: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.2);
  transition: background 0.2s;
}

.story-title:hover {
  background: rgba(88, 166, 255, 0.1);
}

.story-title i {
  font-size: 0.8rem;
  color: var(--primary-color);
}

.story-content {
  padding: 15px;
  color: var(--text-secondary);
  white-space: pre-wrap;
  line-height: 1.8;
}

.no-data {
  color: var(--text-secondary);
  text-align: center;
  padding: 20px;
  font-style: italic;
}

@media (max-width: 768px) {
  .character-details-header {
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .character-avatar-large {
    width: 120px;
    height: 120px;
  }

  .character-name-large {
    font-size: 1.4rem;
  }

  .character-details {
    padding: 15px;
  }

  .materials-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }

  .portrait-image {
    max-height: 350px;
  }

  .talent-header,
  .skill-header,
  .module-header,
  .building-skill-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

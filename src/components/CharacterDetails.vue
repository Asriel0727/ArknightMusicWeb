<template>
  <div class="character-details" v-if="character">
    <!-- 標題區域 -->
    <div class="character-details-header">
      <div class="character-avatar-large">
        <img 
          :src="currentAvatarUrl" 
          :alt="character.name"
          decoding="async"
          fetchpriority="high"
          @error="handleImageError"
        />
        <div class="rarity-badge-large">{{ getRarityStars(character.rarity) }}★</div>
      </div>
      <div class="character-info-header">
        <h2 class="character-name-large">{{ character.name }}</h2>
        <p class="character-appellation">{{ character.appellation || character.id }}</p>
        <div class="character-tags">
          <span class="tag profession">{{ getProfessionName(character.profession) }}</span>
          <span class="tag position">{{ character.position === 'MELEE' ? t('character.melee') : t('character.ranged') }}</span>
          <span v-if="getFactionLabel(character.factionId)" class="tag nation">{{ getFactionLabel(character.factionId) }}</span>
        </div>
        <div v-if="authState.user" class="character-list-actions">
          <button class="character-list-btn" type="button" @click="openCharacterListManager">
            <i class="fas fa-list-check"></i>
            <span>{{ t('userLibrary.manageCharacterLists') }}</span>
          </button>
          <span class="character-list-status">{{ currentCharacterListLabel }}</span>
        </div>
      </div>
    </div>

    <nav class="operator-data-nav" :aria-label="t('character.sections.handbook')">
      <button v-for="tab in detailTabs" :key="tab.id" type="button"
        :class="{ active: activeDetailTab === tab.id }" :aria-pressed="activeDetailTab === tab.id"
        @click="activeDetailTab = tab.id">
        <i :class="tab.icon"></i>
        <span>{{ tab.label }}</span>
      </button>
    </nav>

    <section class="operator-game-stage">
      <div class="operator-art-zone">
        <div class="operator-art" v-if="currentPortraitUrl">
          <img :src="currentPortraitUrl" :alt="character.name" decoding="async" fetchpriority="high"
            @error="handlePortraitError" @load="handlePortraitLoad">
        </div>
        <div class="operator-skin-switcher" v-if="allPortraits.length > 1">
          <button type="button" :aria-label="t('character.navigation.previous')" :title="t('character.navigation.previous')"
            @click="stepPortrait(-1)"><i class="fas fa-chevron-left"></i></button>
          <span :title="allPortraits[currentPortraitIndex]?.name">{{ allPortraits[currentPortraitIndex]?.name }}</span>
          <button type="button" :aria-label="t('character.navigation.next')" :title="t('character.navigation.next')"
            @click="stepPortrait(1)"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="operator-identity">
          <span class="operator-rarity">{{ getRarityStars(character.rarity) }}★</span>
          <h2>{{ character.name }}</h2>
          <p>{{ character.appellation || character.id }}</p>
          <div class="operator-role-line">
            <span>{{ getProfessionName(character.profession) }}</span>
            <span>{{ character.position === 'MELEE' ? t('character.melee') : t('character.ranged') }}</span>
            <span v-if="getFactionLabel(character.factionId)">{{ getFactionLabel(character.factionId) }}</span>
          </div>
        </div>
      </div>

      <aside class="operator-info-console">
        <header class="console-header">
          <span>OPERATOR / {{ activeDetailTab.toUpperCase() }}</span>
          <strong>{{ activeTabLabel }}</strong>
        </header>

        <div v-if="activeDetailTab === 'overview'" class="console-view overview-view">
          <div class="console-selector" v-if="character.phases?.length">
            <button type="button" :disabled="selectedPhaseIndex === 0" :aria-label="t('character.navigation.previous')"
              :title="t('character.navigation.previous')" @click="stepPhase(-1)"><i class="fas fa-chevron-left"></i></button>
            <span>{{ t('character.phaseLabel', { phase: selectedPhaseIndex }) }}</span>
            <button type="button" :disabled="selectedPhaseIndex >= character.phases.length - 1"
              :aria-label="t('character.navigation.next')" :title="t('character.navigation.next')"
              @click="stepPhase(1)"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="console-stat-grid" v-if="selectedPhase">
            <div v-for="stat in selectedPhaseStats" :key="stat.key">
              <span>{{ stat.label }}</span><strong>{{ stat.value }}</strong>
            </div>
          </div>
          <div class="console-block" v-if="character.traitDescription">
            <span class="console-label">{{ cleanSectionLabel('trait') }}</span>
            <p class="api-pre-line">{{ currentTraitPage }}</p>
            <div class="inline-pager" v-if="traitPages.length > 1">
              <button type="button" :disabled="traitPageIndex === 0" :aria-label="t('character.navigation.previous')"
                @click="traitPageIndex--"><i class="fas fa-chevron-left"></i></button>
              <span>{{ traitPageIndex + 1 }} / {{ traitPages.length }}</span>
              <button type="button" :disabled="traitPageIndex >= traitPages.length - 1" :aria-label="t('character.navigation.next')"
                @click="traitPageIndex++"><i class="fas fa-chevron-right"></i></button>
            </div>
          </div>
          <div class="console-range" v-if="selectedRange">
            <span class="console-label">{{ cleanSectionLabel('range') }}</span>
            <div class="range-grid" :style="getRangeGridStyle(selectedRange.grids)">
              <div v-for="(grid, idx) in selectedRange.grids" :key="idx" class="range-cell"
                :class="getCellClass(grid)" :style="getCellStyle(grid, selectedRange.grids)"></div>
            </div>
          </div>
        </div>

        <div v-else-if="activeDetailTab === 'combat'" class="console-view combat-view">
          <div class="console-selector skill-selector" v-if="character.skills?.length">
            <button type="button" :disabled="selectedSkillIndex === 0" :aria-label="t('character.navigation.previous')"
              :title="t('character.navigation.previous')" @click="stepSkill(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="selector-current skill-current" :title="selectedSkill?.name">
              <img v-if="selectedSkillIconUrls.length" :src="getProxyImageUrl(selectedSkillIconUrls[0])"
                :alt="selectedSkill?.name" @error="handleAssetCandidateError($event, selectedSkillIconUrls)">
              <span>{{ selectedSkill?.name }}</span>
            </span>
            <button type="button" :disabled="selectedSkillIndex >= character.skills.length - 1"
              :aria-label="t('character.navigation.next')" :title="t('character.navigation.next')"
              @click="stepSkill(1)"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="selected-skill" v-if="selectedSkill">
            <span class="console-label">{{ t('character.skillIndex', { n: selectedSkillIndex + 1 }) }}</span>
            <h3>{{ selectedSkill.name }}</h3>
            <p class="api-pre-line">{{ currentSkillDescriptionPage }}</p>
            <div class="inline-pager" v-if="skillDescriptionPages.length > 1">
              <button type="button" :disabled="skillPageIndex === 0" :aria-label="t('character.navigation.previous')"
                @click="skillPageIndex--"><i class="fas fa-chevron-left"></i></button>
              <span>{{ skillPageIndex + 1 }} / {{ skillDescriptionPages.length }}</span>
              <button type="button" :disabled="skillPageIndex >= skillDescriptionPages.length - 1" :aria-label="t('character.navigation.next')"
                @click="skillPageIndex++"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="skill-metrics">
              <span v-if="selectedSkill.spData?.spCost">SP {{ selectedSkill.spData.spCost }}</span>
              <span v-if="selectedSkill.spData?.initSp">INIT {{ selectedSkill.spData.initSp }}</span>
              <span v-if="selectedSkill.duration > 0">{{ selectedSkill.duration }}s</span>
              <span v-if="selectedSkill.spData?.spType !== undefined">{{ getSpTypeName(selectedSkill.spData.spType) }}</span>
            </div>
          </div>
          <div class="compact-talents" v-if="combatTalents.length">
            <span class="console-label">{{ cleanSectionLabel('talents') }}</span>
            <div v-for="(talent, index) in combatTalents" :key="talent._groupKey || index" class="talent-summary"
              @mouseenter="activeTalentTooltipKey = talent._groupKey" @mouseleave="activeTalentTooltipKey = ''">
              <div class="talent-summary-header">
                <strong>{{ talent.name || t('character.talentFallback', { n: index + 1 }) }}</strong>
                <button v-if="talent._variants.length" type="button" class="talent-variant-trigger"
                  :aria-expanded="activeTalentTooltipKey === talent._groupKey"
                  :aria-label="cleanSectionLabel('potential')"
                  @click.stop="toggleTalentTooltip(talent._groupKey)"
                  @focus="activeTalentTooltipKey = talent._groupKey" @blur="activeTalentTooltipKey = ''">
                  <i class="fas fa-info-circle"></i>
                  <span>+{{ talent._variants.length }}</span>
                </button>
              </div>
              <p class="api-pre-line">{{ talent.description }}</p>
              <div v-if="talent._variants.length && activeTalentTooltipKey === talent._groupKey"
                class="talent-variant-tooltip" role="tooltip">
                <div v-for="(variant, variantIndex) in talent._variants" :key="variantIndex">
                  <strong>{{ talentVariantLabel(variant) }}</strong>
                  <p class="api-pre-line">{{ variant.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="activeDetailTab === 'growth'" class="console-view growth-view">
          <div class="growth-mode-selector">
            <button v-for="mode in growthModes" :key="mode.id" type="button"
              :class="{ active: activeGrowthMode === mode.id }" @click="selectGrowthMode(mode.id)">
              <i :class="mode.icon"></i><span>{{ mode.label }}</span>
            </button>
          </div>
          <div class="console-selector entry-selector" v-if="activeGrowthEntries.length > 1">
            <button type="button" :disabled="selectedGrowthIndex === 0" :aria-label="t('character.navigation.previous')"
              :title="t('character.navigation.previous')" @click="stepGrowthEntry(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="selector-current" :title="growthEntrySelectorLabel">{{ growthEntrySelectorLabel }}</span>
            <button type="button" :disabled="selectedGrowthIndex >= activeGrowthEntries.length - 1"
              :aria-label="t('character.navigation.next')" :title="t('character.navigation.next')"
              @click="stepGrowthEntry(1)"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="growth-entry" v-if="selectedGrowthEntry">
            <template v-if="activeGrowthMode === 'logistics'">
              <span class="console-label">{{ selectedGrowthEntry.roomType ? getRoomTypeName(selectedGrowthEntry.roomType) : cleanSectionLabel('logistics') }}</span>
              <h3>{{ selectedGrowthEntry.name || t('character.logisticsDefault') }}</h3>
              <p class="api-pre-line">{{ currentGrowthDescriptionPage }}</p>
            </template>
            <template v-else-if="activeGrowthMode === 'modules'">
              <span class="console-label">{{ selectedGrowthEntry.typeName1 }} {{ selectedGrowthEntry.typeName2 }}</span>
              <h3>{{ selectedGrowthEntry.uniEquipName || t('character.moduleDefault') }}</h3>
              <p class="api-pre-line">{{ currentGrowthDescriptionPage }}</p>
            </template>
            <template v-else>
              <span class="console-label">{{ growthEntryTitle }}</span>
              <div class="console-materials" v-if="selectedGrowthMaterials.length">
                <div v-for="(item, index) in selectedGrowthMaterials" :key="index">
                  <img :src="item.iconUrl" :alt="item.name" loading="lazy" @error="handleMaterialError">
                  <span>{{ item.name }}</span><strong>x{{ item.count }}</strong>
                </div>
              </div>
              <p v-else>{{ t('character.noMaterials') }}</p>
            </template>
            <div class="inline-pager" v-if="growthDescriptionPages.length > 1">
              <button type="button" :disabled="growthPageIndex === 0" :aria-label="t('character.navigation.previous')"
                @click="growthPageIndex--"><i class="fas fa-chevron-left"></i></button>
              <span>{{ growthPageIndex + 1 }} / {{ growthDescriptionPages.length }}</span>
              <button type="button" :disabled="growthPageIndex >= growthDescriptionPages.length - 1" :aria-label="t('character.navigation.next')"
                @click="growthPageIndex++"><i class="fas fa-chevron-right"></i></button>
            </div>
          </div>
        </div>

        <div v-else class="console-view archive-view">
          <div class="console-selector story-selector" v-if="archiveStories.length">
            <button type="button" :disabled="selectedStoryIndex === 0" :aria-label="t('character.navigation.previous')"
              :title="t('character.navigation.previous')" @click="stepStory(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="selector-current" :title="selectedStoryTitle">{{ selectedStoryTitle }}</span>
            <button type="button" :disabled="selectedStoryIndex >= archiveStories.length - 1"
              :aria-label="t('character.navigation.next')" :title="t('character.navigation.next')"
              @click="stepStory(1)"><i class="fas fa-chevron-right"></i></button>
          </div>
          <div class="archive-page" v-if="selectedStory">
            <span class="console-label">RECORD {{ String(selectedStoryIndex + 1).padStart(2, '0') }}</span>
            <h3>{{ selectedStory.storyTitle || t('character.storyFallback', { n: selectedStoryIndex + 1 }) }}</h3>
            <p class="api-pre-line">{{ currentStoryPage }}</p>
          </div>
          <div class="console-pager" v-if="storyPages.length > 1">
            <button type="button" :disabled="storyPageIndex === 0" @click="storyPageIndex--"><i class="fas fa-chevron-left"></i></button>
            <span>{{ storyPageIndex + 1 }} / {{ storyPages.length }}</span>
            <button type="button" :disabled="storyPageIndex >= storyPages.length - 1" @click="storyPageIndex++"><i class="fas fa-chevron-right"></i></button>
          </div>
        </div>
      </aside>
    </section>

    <div v-if="false" class="character-details-content">
      <!-- 1. 幹員立繪 -->
      <div class="detail-section portrait-stage" v-if="allPortraits.length > 0">
        <h3><i class="fas fa-user"></i> {{ t('character.sections.portrait') }}</h3>
        <div class="portrait-tabs">
          <button 
            v-for="(portrait, index) in allPortraits" 
            :key="portrait.skinId || `portrait-${index}`"
            :class="{ active: currentPortraitIndex === index }"
            @click="selectPortrait(index)"
          >
            {{ portrait.name }}
          </button>
        </div>
        <div class="portrait-display" v-if="currentPortraitUrl">
          <img 
            :src="currentPortraitUrl" 
            :alt="allPortraits[currentPortraitIndex]?.name || t('character.portraitFallback')"
            decoding="async"
            fetchpriority="high"
            @error="handlePortraitError"
            class="portrait-image"
            @load="handlePortraitLoad"
          />
        </div>
        <div v-else class="portrait-loading">
          <p>{{ t('character.portraitLoading') }}</p>
        </div>
      </div>

      <!-- 2. 特性 -->
      <div v-show="activeDetailTab === 'overview'" class="detail-section" v-if="character.traitDescription">
        <h3><i class="fas fa-star"></i> {{ t('character.sections.trait') }}</h3>
        <p class="trait-text api-pre-line">{{ character.traitDescription }}</p>
      </div>

      <!-- 3. 獲得方式 -->
      <div v-show="activeDetailTab === 'overview'" class="detail-section" v-if="character.obtainApproach">
        <h3><i class="fas fa-gift"></i> {{ t('character.sections.obtain') }}</h3>
        <p class="api-pre-line">{{ character.obtainApproach }}</p>
      </div>

      <!-- 4. 屬性 -->
      <div v-show="activeDetailTab === 'overview'" class="detail-section" v-if="character.phases && character.phases.length > 0">
        <h3><i class="fas fa-chart-bar"></i> {{ t('character.sections.stats') }}</h3>
        <div class="attributes-table-wrapper">
          <table class="attributes-table">
            <thead>
              <tr>
                <th>{{ t('character.stats.phase') }}</th>
                <th>{{ t('character.stats.hp') }}</th>
                <th>{{ t('character.stats.atk') }}</th>
                <th>{{ t('character.stats.def') }}</th>
                <th>{{ t('character.stats.res') }}</th>
                <th>{{ t('character.stats.respawn') }}</th>
                <th>{{ t('character.stats.cost') }}</th>
                <th>{{ t('character.stats.block') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(phase, phaseIndex) in character.phases" :key="phaseIndex">
                <td class="phase-label">{{ t('character.phaseLabel', { phase: phaseIndex }) }}</td>
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
      <div v-show="activeDetailTab === 'overview'" class="detail-section" v-if="character.phaseRanges && character.phaseRanges.length > 0">
        <h3><i class="fas fa-crosshairs"></i> {{ t('character.sections.range') }}</h3>
        <div class="range-phases">
          <div v-for="range in character.phaseRanges" :key="range.phase" class="range-phase-item">
            <h4>{{ t('character.eliteRangeTitle', { phase: range.phase }) }}</h4>
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
      <div v-show="activeDetailTab === 'combat'" class="detail-section" v-if="character.talents && character.talents.length > 0">
        <h3><i class="fas fa-magic"></i> {{ t('character.sections.talents') }}</h3>
        <div class="talents-list">
          <template v-for="(talent, tIndex) in character.talents" :key="tIndex">
            <div 
              v-for="(candidate, cIndex) in talent.candidates" 
              :key="`${tIndex}-${cIndex}`" 
              class="talent-card"
            >
              <div class="talent-header">
                <span class="talent-name">{{ candidate.name || t('character.talentFallback', { n: tIndex + 1 }) }}</span>
                <span class="talent-unlock">
                  {{ t('character.unlockLine', { elite: candidate.unlockCondition?.phase || 0, level: candidate.unlockCondition?.level || 1 }) }}
                  <span v-if="candidate.requiredPotentialRank > 0" class="potential-req">
                    {{ t('character.potentialReq', { rank: candidate.requiredPotentialRank }) }}
                  </span>
                </span>
              </div>
              <p class="talent-desc api-pre-line">{{ candidate.description }}</p>
            </div>
          </template>
        </div>
      </div>

      <!-- 7. 潛能提升 -->
      <div v-show="activeDetailTab === 'combat'" class="detail-section" v-if="character.potentialRanks && character.potentialRanks.length > 0">
        <h3><i class="fas fa-arrow-up"></i> {{ t('character.sections.potential') }}</h3>
        <div class="potential-list">
          <div v-for="(rank, index) in character.potentialRanks" :key="index" class="potential-item">
            <span class="potential-level">{{ t('character.potentialLevel', { n: index + 2 }) }}</span>
            <span class="potential-effect api-pre-line">
              {{ rank.description || rank.buffDescription || t('character.improveDefault') }}
            </span>
          </div>
        </div>
      </div>

      <!-- 8. 技能 -->
      <div v-show="activeDetailTab === 'combat'" class="detail-section" v-if="character.skills && character.skills.length > 0">
        <h3><i class="fas fa-bolt"></i> {{ t('character.sections.skills') }}</h3>
        <div class="skills-list">
          <div v-for="(skill, index) in character.skills" :key="skill.id" class="skill-card">
            <div class="skill-header">
              <span class="skill-index">{{ t('character.skillIndex', { n: index + 1 }) }}</span>
              <span class="skill-name">{{ skill.name }}</span>
            </div>
            <p class="skill-desc api-pre-line">{{ skill.description }}</p>
            <div class="skill-stats">
              <span v-if="skill.spData?.spCost"><i class="fas fa-bolt"></i> {{ t('character.spCost') }}: {{ skill.spData.spCost }}</span>
              <span v-if="skill.spData?.initSp"><i class="fas fa-play"></i> {{ t('character.initSp') }}: {{ skill.spData.initSp }}</span>
              <span v-if="skill.duration > 0"><i class="fas fa-clock"></i> {{ t('character.duration') }}: {{ skill.duration }}s</span>
              <span v-if="skill.spData?.spType !== undefined"><i class="fas fa-sync"></i> {{ getSpTypeName(skill.spData.spType) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 9. 後勤技能 -->
      <div v-show="activeDetailTab === 'growth'" class="detail-section" v-if="character.buildingSkills && character.buildingSkills.length > 0">
        <h3><i class="fas fa-building"></i> {{ t('character.sections.logistics') }}</h3>
        <div class="building-skills-list">
          <div v-for="skill in character.buildingSkills" :key="skill.id" class="building-skill-card">
            <div class="building-skill-header">
              <span class="building-skill-name">{{ skill.name || t('character.logisticsDefault') }}</span>
              <span class="building-skill-room" v-if="skill.roomType">{{ getRoomTypeName(skill.roomType) }}</span>
            </div>
            <p class="building-skill-desc api-pre-line">{{ skill.description }}</p>
            <div class="building-skill-unlock" v-if="skill.cond">
              <span v-if="skill.cond.phase !== undefined">{{ t('character.phaseLabel', { phase: skill.cond.phase }) }}</span>
              <span v-if="skill.cond.level">Lv{{ skill.cond.level }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 10. 精英化材料 -->
      <div v-show="activeDetailTab === 'growth'" class="detail-section" v-if="character.evolveCosts && character.evolveCosts.length > 0">
        <h3><i class="fas fa-level-up-alt"></i> {{ t('character.sections.evolve') }}</h3>
        <div class="evolve-costs">
          <div v-for="(cost, index) in character.evolveCosts" :key="index" class="evolve-phase">
            <h4>{{ t('character.evolveTitle', { phase: cost.phase }) }}</h4>
            <div class="materials-grid">
              <div v-for="(item, itemIndex) in cost.cost" :key="itemIndex" class="material-item">
                <img 
                  :src="item.iconUrl" 
                  :alt="item.name"
                  loading="lazy"
                  decoding="async"
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
      <div v-show="activeDetailTab === 'growth'" class="detail-section" v-if="character.skillUpgradeCosts && character.skillUpgradeCosts.length > 0">
        <h3><i class="fas fa-cogs"></i> {{ t('character.sections.skillCost') }}</h3>
        <div class="skill-upgrade-costs">
          <div v-for="(upgrade, index) in character.skillUpgradeCosts" :key="index" class="upgrade-level">
            <h4>{{ t('character.skillRankTitle', { from: upgrade.level - 1, to: upgrade.level }) }}</h4>
            <div class="materials-grid" v-if="upgrade.lvlUpCost && upgrade.lvlUpCost.length > 0">
              <div v-for="(item, itemIndex) in upgrade.lvlUpCost" :key="itemIndex" class="material-item">
                <img 
                  :src="item.iconUrl" 
                  :alt="item.name"
                  loading="lazy"
                  decoding="async"
                  @error="handleMaterialError"
                  class="material-icon"
                />
                <div class="material-info">
                  <span class="material-name">{{ item.name }}</span>
                  <span class="material-count">x{{ item.count }}</span>
                </div>
              </div>
            </div>
            <p v-else class="no-cost">{{ t('character.noMaterials') }}</p>
          </div>
        </div>
      </div>

      <!-- 12. 模組 -->
      <div v-show="activeDetailTab === 'growth'" class="detail-section" v-if="character.modules && character.modules.length > 0">
        <h3><i class="fas fa-puzzle-piece"></i> {{ t('character.sections.modules') }}</h3>
        <div class="modules-list">
          <div v-for="module in character.modules" :key="module.id" class="module-card">
            <div class="module-header">
              <span class="module-name">{{ module.uniEquipName || t('character.moduleDefault') }}</span>
              <span class="module-type" v-if="module.typeName1 || module.typeName2">
                {{ module.typeName1 }}{{ module.typeName2 ? ` - ${module.typeName2}` : '' }}
              </span>
            </div>
            <p class="module-desc api-pre-line" v-if="module.uniEquipDesc">{{ module.uniEquipDesc }}</p>
            <div class="module-unlock">
              <span>{{ t('character.unlockModule') }}: {{ t('character.phaseLabel', { phase: module.unlockEvolvePhase }) }} Lv{{ module.unlockLevel }}</span>
              <span v-if="module.unlockFavorPoint"> {{ t('character.trust', { points: module.unlockFavorPoint }) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 13. 幹員檔案 -->
      <div v-show="activeDetailTab === 'archive'" class="detail-section" v-if="character.handbook && hasHandbookContent">
        <h3><i class="fas fa-book"></i> {{ t('character.sections.handbook') }}</h3>
        <div class="handbook-content">
          <div v-if="character.handbook.storyTextAudio && character.handbook.storyTextAudio.length > 0" class="handbook-stories">
            <div v-for="(story, index) in character.handbook.storyTextAudio" :key="index" class="story-card">
              <h4 @click="toggleStory(index)" class="story-title">
                <i :class="expandedStories.includes(index) ? 'fas fa-chevron-down' : 'fas fa-chevron-right'"></i>
                {{ story.storyTitle || t('character.storyFallback', { n: index + 1 }) }}
              </h4>
              <p v-if="expandedStories.includes(index)" class="story-content api-pre-line">
                {{ story.stories?.[0]?.storyText || '' }}
              </p>
            </div>
          </div>
          <p v-else class="no-data">{{ t('character.noHandbook') }}</p>
        </div>
      </div>
    </div>
  </div>

  <div v-if="isCreateCharacterListDialogOpen" class="character-list-dialog-backdrop create" @click.self="closeCreateCharacterListDialog">
    <section class="character-list-dialog" role="dialog" aria-modal="true" :aria-label="t('userLibrary.createCharacterListTitle')">
      <h3>{{ t('userLibrary.createCharacterListTitle') }}</h3>
      <form class="character-list-dialog-form" @submit.prevent="createCharacterListAndAddCurrentCharacter">
        <label>
          <span>{{ t('userLibrary.characterListName') }}</span>
          <input v-model.trim="newCharacterListName" type="text" :placeholder="t('userLibrary.characterListNamePrompt')" maxlength="80" autofocus>
        </label>
        <p v-if="characterListActionError" class="character-list-action-error">{{ characterListActionError }}</p>
        <div class="character-list-dialog-actions">
          <button class="character-list-btn secondary" type="button" @click="closeCreateCharacterListDialog">
            {{ t('userLibrary.cancel') }}
          </button>
          <button class="character-list-btn primary" type="submit" :disabled="isCharacterListActionPending || !newCharacterListName.trim()">
            {{ isCharacterListActionPending ? t('userLibrary.adding') : t('userLibrary.createAndAdd') }}
          </button>
        </div>
      </form>
    </section>
  </div>

  <div v-if="isCharacterListManagerOpen" class="character-list-dialog-backdrop" @click.self="closeCharacterListManager">
    <section class="character-list-dialog character-list-manager-dialog" role="dialog" aria-modal="true"
      :aria-label="t('userLibrary.manageCharacterListTitle')">
      <div class="character-list-manager-header">
        <div>
          <h3>{{ t('userLibrary.manageCharacterListTitle') }}</h3>
          <p>{{ character.name }}</p>
        </div>
        <button class="character-list-icon-btn" type="button" :title="t('userLibrary.cancel')" @click="closeCharacterListManager">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <input v-model.trim="characterListSearchQuery" class="character-list-manager-search" type="search"
        :placeholder="t('userLibrary.searchCharacterLists')">
      <div class="character-list-manager-list">
        <label v-for="list in filteredUserCharacterLists" :key="list.id" class="character-list-manager-item">
          <input type="checkbox" :checked="isCharacterInList(list)" :disabled="isCharacterListMembershipPending(list.id)"
            @change="toggleCharacterListMembership(list, $event.target.checked)">
          <span class="character-list-manager-check" aria-hidden="true">
            <i class="fas fa-check"></i>
          </span>
          <span class="character-list-manager-name">{{ list.name }}</span>
        </label>
        <p v-if="filteredUserCharacterLists.length === 0" class="character-list-manager-empty">
          {{ t('userLibrary.noCharacterLists') }}
        </p>
      </div>
      <div class="character-list-dialog-actions">
        <button class="character-list-btn secondary" type="button" @click="openCreateCharacterListDialog">
          {{ t('userLibrary.createCharacterListTitle') }}
        </button>
        <button class="character-list-btn primary" type="button" @click="closeCharacterListManager">
          {{ t('userLibrary.done') }}
        </button>
      </div>
    </section>
  </div>

  <div v-if="characterListActionSuccess || characterListActionError" class="character-list-toast"
    :class="{ success: characterListActionSuccess, error: characterListActionError }">
    <i :class="characterListActionSuccess ? 'fas fa-check-circle' : 'fas fa-exclamation-circle'"></i>
    <span>{{ characterListActionSuccess || characterListActionError }}</span>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { getCharacterAvatarUrls, getProxyImageUrl } from '../services/api.js';
import {
  getLocalOperatorAvatarUrl,
  getLocalSkillIconUrl,
  loadOperatorAssetManifest,
} from '../services/operatorAssetManifest.js';
import { authState } from '../services/auth.js';
import {
  addCharacterToList,
  createCharacterList,
  fetchCharacterLists,
  removeCharacterFromList,
} from '../services/userLibrary.js';

const { t, te } = useI18n();

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
});

const currentPortraitIndex = ref(0);
const currentPortraitUrlIndex = ref(0);
const activeDetailTab = ref('overview');
const selectedPhaseIndex = ref(0);
const selectedSkillIndex = ref(0);
const selectedTalentIndex = ref(0);
const activeGrowthMode = ref('evolve');
const selectedGrowthIndex = ref(0);
const selectedStoryIndex = ref(0);
const storyPageIndex = ref(0);
const traitPageIndex = ref(0);
const skillPageIndex = ref(0);
const growthPageIndex = ref(0);
const talentPageIndex = ref(0);
const activeTalentTooltipKey = ref('');
const userCharacterLists = ref([]);
const characterListSearchQuery = ref('');
const characterListActionError = ref('');
const characterListActionSuccess = ref('');
const characterListMembershipPendingIds = ref(new Set());
const isCharacterListManagerOpen = ref(false);
const isCreateCharacterListDialogOpen = ref(false);
const isCharacterListActionPending = ref(false);
const newCharacterListName = ref('');
const assetManifestVersion = ref(0);

const cleanSectionLabel = (key) => t(`character.sections.${key}`).replace(/^\d+\.\s*/, '');
const detailTabs = computed(() => [
  { id: 'overview', label: cleanSectionLabel('stats'), icon: 'fas fa-chart-bar' },
  { id: 'combat', label: cleanSectionLabel('skills'), icon: 'fas fa-bolt' },
  { id: 'growth', label: cleanSectionLabel('evolve'), icon: 'fas fa-level-up-alt' },
  { id: 'archive', label: cleanSectionLabel('handbook'), icon: 'fas fa-book' },
]);
const activeTabLabel = computed(() => detailTabs.value.find((tab) => tab.id === activeDetailTab.value)?.label || '');
const selectedPhase = computed(() => props.character?.phases?.[selectedPhaseIndex.value] || null);
const selectedPhaseStats = computed(() => {
  const phase = selectedPhase.value;
  if (!phase) return [];
  return [
    { key: 'maxHp', label: t('character.stats.hp'), value: getAttribute(phase, 'maxHp') },
    { key: 'atk', label: t('character.stats.atk'), value: getAttribute(phase, 'atk') },
    { key: 'def', label: t('character.stats.def'), value: getAttribute(phase, 'def') },
    { key: 'magicResistance', label: t('character.stats.res'), value: `${getAttribute(phase, 'magicResistance')}%` },
    { key: 'respawnTime', label: t('character.stats.respawn'), value: `${getAttribute(phase, 'respawnTime')}s` },
    { key: 'cost', label: t('character.stats.cost'), value: getAttribute(phase, 'cost') },
    { key: 'blockCnt', label: t('character.stats.block'), value: getAttribute(phase, 'blockCnt') },
  ];
});
const selectedRange = computed(() => {
  const ranges = props.character?.phaseRanges || [];
  return ranges.find((range) => Number(range.phase) === selectedPhaseIndex.value) || ranges[selectedPhaseIndex.value] || null;
});
const selectedSkill = computed(() => props.character?.skills?.[selectedSkillIndex.value] || null);
const getSkillIconUrls = (skill) => {
  void assetManifestVersion.value;
  const iconId = skill?.iconId || skill?.id;
  return [...new Set([
    getLocalSkillIconUrl(iconId),
    ...(skill?.iconUrls || []),
    skill?.iconUrl,
  ].filter(Boolean))];
};
const selectedSkillIconUrls = computed(() => getSkillIconUrls(selectedSkill.value));
const combatTalents = computed(() => {
  const groups = new Map();
  for (const candidate of (props.character?.talents || []).flatMap((talent) => talent.candidates || [])) {
    const key = String(candidate.name || candidate.description || '').trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }

  return [...groups.entries()].map(([key, candidates]) => {
    const baseCandidates = candidates.filter((candidate) => Number(candidate.requiredPotentialRank || 0) === 0);
    const source = baseCandidates.length ? baseCandidates : candidates;
    const base = source.reduce((current, candidate) => {
      if (!current) return candidate;
      const currentUnlock = Number(current.unlockCondition?.phase || 0) * 1000 + Number(current.unlockCondition?.level || 0);
      const candidateUnlock = Number(candidate.unlockCondition?.phase || 0) * 1000 + Number(candidate.unlockCondition?.level || 0);
      return candidateUnlock >= currentUnlock ? candidate : current;
    }, null);
    const seenVariants = new Set();
    const variants = candidates
      .filter((candidate) => candidate !== base)
      .filter((candidate) => {
        const variantKey = [
          candidate.requiredPotentialRank || 0,
          candidate.unlockCondition?.phase || 0,
          candidate.unlockCondition?.level || 0,
          candidate.description || '',
        ].join('|');
        if (seenVariants.has(variantKey)) return false;
        seenVariants.add(variantKey);
        return true;
      })
      .sort((a, b) => Number(a.requiredPotentialRank || 0) - Number(b.requiredPotentialRank || 0));
    return {
      ...base,
      _groupKey: key,
      _variants: variants,
    };
  });
});
const talentVariantLabel = (candidate) => {
  const labels = [];
  if (Number(candidate?.requiredPotentialRank || 0) > 0) {
    labels.push(t('character.potentialReq', { rank: candidate.requiredPotentialRank }));
  }
  if (candidate?.unlockCondition) {
    labels.push(t('character.unlockLine', {
      elite: candidate.unlockCondition.phase || 0,
      level: candidate.unlockCondition.level || 1,
    }));
  }
  return labels.join(' · ');
};
const toggleTalentTooltip = (key) => {
  activeTalentTooltipKey.value = activeTalentTooltipKey.value === key ? '' : key;
};
const selectedTalent = computed(() => combatTalents.value[selectedTalentIndex.value] || combatTalents.value[0] || null);
const growthModes = computed(() => [
  { id: 'evolve', label: cleanSectionLabel('evolve'), icon: 'fas fa-level-up-alt' },
  { id: 'skillCost', label: cleanSectionLabel('skillCost'), icon: 'fas fa-cogs' },
  { id: 'modules', label: cleanSectionLabel('modules'), icon: 'fas fa-puzzle-piece' },
  { id: 'logistics', label: cleanSectionLabel('logistics'), icon: 'fas fa-building' },
].filter((mode) => ({
  evolve: props.character?.evolveCosts?.length,
  skillCost: props.character?.skillUpgradeCosts?.length,
  modules: props.character?.modules?.length,
  logistics: props.character?.buildingSkills?.length,
})[mode.id]));
const activeGrowthEntries = computed(() => ({
  evolve: props.character?.evolveCosts || [],
  skillCost: props.character?.skillUpgradeCosts || [],
  modules: props.character?.modules || [],
  logistics: props.character?.buildingSkills || [],
})[activeGrowthMode.value] || []);
const selectedGrowthEntry = computed(() => activeGrowthEntries.value[selectedGrowthIndex.value] || activeGrowthEntries.value[0] || null);
const selectedGrowthMaterials = computed(() => {
  if (activeGrowthMode.value === 'evolve') return selectedGrowthEntry.value?.cost || [];
  if (activeGrowthMode.value === 'skillCost') return selectedGrowthEntry.value?.lvlUpCost || [];
  return [];
});
const growthEntryTitle = computed(() => {
  if (!selectedGrowthEntry.value) return '';
  if (activeGrowthMode.value === 'evolve') return t('character.evolveTitle', { phase: selectedGrowthEntry.value.phase });
  return t('character.skillRankTitle', {
    from: selectedGrowthEntry.value.level - 1,
    to: selectedGrowthEntry.value.level,
  });
});
const archiveStories = computed(() => props.character?.handbook?.storyTextAudio || []);
const selectedStory = computed(() => archiveStories.value[selectedStoryIndex.value] || null);
const paginateText = (text, maxLength = 360) => {
  const paragraphs = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const pages = [];
  let page = '';
  for (const sourceParagraph of paragraphs) {
    let paragraph = sourceParagraph;
    while (paragraph.length > maxLength) {
      if (page) {
        pages.push(page);
        page = '';
      }
      pages.push(paragraph.slice(0, maxLength));
      paragraph = paragraph.slice(maxLength);
    }
    if (page && page.length + paragraph.length + 1 > maxLength) {
      pages.push(page);
      page = paragraph;
    } else if (paragraph) {
      page = page ? `${page}\n${paragraph}` : paragraph;
    }
  }
  if (page) pages.push(page);
  return pages.length ? pages : [''];
};
const traitPages = computed(() => paginateText(props.character?.traitDescription || '', 220));
const currentTraitPage = computed(() => traitPages.value[traitPageIndex.value] || traitPages.value[0] || '');
const skillDescriptionPages = computed(() => paginateText(selectedSkill.value?.description || '', 240));
const currentSkillDescriptionPage = computed(() => skillDescriptionPages.value[skillPageIndex.value] || skillDescriptionPages.value[0] || '');
const talentDescriptionPages = computed(() => paginateText(selectedTalent.value?.description || '', 210));
const currentTalentDescriptionPage = computed(() => talentDescriptionPages.value[talentPageIndex.value] || talentDescriptionPages.value[0] || '');
const growthDescriptionPages = computed(() => paginateText(
  activeGrowthMode.value === 'modules'
    ? selectedGrowthEntry.value?.uniEquipDesc
    : activeGrowthMode.value === 'logistics'
      ? selectedGrowthEntry.value?.description
      : '',
  260
));
const currentGrowthDescriptionPage = computed(() => growthDescriptionPages.value[growthPageIndex.value] || growthDescriptionPages.value[0] || '');
const storyPages = computed(() => paginateText(selectedStory.value?.stories?.[0]?.storyText || '', 280));
const currentStoryPage = computed(() => storyPages.value[storyPageIndex.value] || storyPages.value[0] || '');
const growthEntrySelectorLabel = computed(() => {
  if (!selectedGrowthEntry.value) return '';
  if (activeGrowthMode.value === 'modules') return selectedGrowthEntry.value.uniEquipName || t('character.moduleDefault');
  if (activeGrowthMode.value === 'logistics') return selectedGrowthEntry.value.name || t('character.logisticsDefault');
  return growthEntryTitle.value;
});
const selectedStoryTitle = computed(() => selectedStory.value?.storyTitle || t('character.storyFallback', { n: selectedStoryIndex.value + 1 }));
const clampIndex = (value, delta, length) => Math.min(Math.max(value + delta, 0), Math.max(length - 1, 0));
const stepPortrait = (delta) => selectPortrait(clampIndex(currentPortraitIndex.value, delta, allPortraits.value.length));
const stepPhase = (delta) => {
  selectedPhaseIndex.value = clampIndex(selectedPhaseIndex.value, delta, props.character?.phases?.length || 0);
  traitPageIndex.value = 0;
};
const stepSkill = (delta) => {
  selectedSkillIndex.value = clampIndex(selectedSkillIndex.value, delta, props.character?.skills?.length || 0);
  skillPageIndex.value = 0;
};
const stepTalent = (delta) => {
  selectedTalentIndex.value = clampIndex(selectedTalentIndex.value, delta, combatTalents.value.length);
  talentPageIndex.value = 0;
  activeTalentTooltipKey.value = '';
};
const stepGrowthEntry = (delta) => {
  selectedGrowthIndex.value = clampIndex(selectedGrowthIndex.value, delta, activeGrowthEntries.value.length);
  growthPageIndex.value = 0;
};
const stepStory = (delta) => selectStory(clampIndex(selectedStoryIndex.value, delta, archiveStories.value.length));
const selectGrowthMode = (mode) => {
  activeGrowthMode.value = mode;
  selectedGrowthIndex.value = 0;
  growthPageIndex.value = 0;
};
const selectStory = (index) => {
  selectedStoryIndex.value = index;
  storyPageIndex.value = 0;
};

const currentCharacterLists = computed(() => {
  const characterId = props.character?.id;
  if (!characterId) return [];
  return userCharacterLists.value.filter((list) => {
    return (list.items || []).some((item) => item.character_id === characterId);
  });
});

const filteredUserCharacterLists = computed(() => {
  const keyword = characterListSearchQuery.value.trim().toLowerCase();
  if (!keyword) return userCharacterLists.value;
  return userCharacterLists.value.filter((list) => {
    return String(list.name || '').toLowerCase().includes(keyword);
  });
});

const currentCharacterListLabel = computed(() => {
  if (currentCharacterLists.value.length === 0) {
    return t('userLibrary.notInAnyCharacterList');
  }
  return t('userLibrary.alreadyInCharacterLists', {
    names: currentCharacterLists.value.map((list) => list.name).join('、'),
  });
});

const setCharacterListActionSuccess = (message) => {
  characterListActionSuccess.value = message;
  characterListActionError.value = '';
  window.setTimeout(() => {
    if (characterListActionSuccess.value === message) {
      characterListActionSuccess.value = '';
    }
  }, 2200);
};

const setCharacterListActionError = (message) => {
  characterListActionError.value = message;
  characterListActionSuccess.value = '';
};

const loadUserCharacterLists = async () => {
  if (!authState.user) return;
  userCharacterLists.value = await fetchCharacterLists();
};

const isCharacterInList = (list) => {
  const characterId = props.character?.id;
  return (list?.items || []).some((item) => item.character_id === characterId);
};

const isCharacterListMembershipPending = (listId) => {
  return characterListMembershipPendingIds.value.has(listId);
};

const setCharacterListMembershipPending = (listId, isPending) => {
  const nextPendingIds = new Set(characterListMembershipPendingIds.value);
  if (isPending) {
    nextPendingIds.add(listId);
  } else {
    nextPendingIds.delete(listId);
  }
  characterListMembershipPendingIds.value = nextPendingIds;
};

const openCharacterListManager = async () => {
  characterListSearchQuery.value = '';
  setCharacterListActionError('');
  isCharacterListManagerOpen.value = true;
  await loadUserCharacterLists();
};

const closeCharacterListManager = () => {
  isCharacterListManagerOpen.value = false;
  characterListSearchQuery.value = '';
};

const openCreateCharacterListDialog = () => {
  newCharacterListName.value = '';
  setCharacterListActionError('');
  isCreateCharacterListDialogOpen.value = true;
};

const closeCreateCharacterListDialog = () => {
  if (isCharacterListActionPending.value) return;
  isCreateCharacterListDialogOpen.value = false;
  newCharacterListName.value = '';
};

const toggleCharacterListMembership = async (list, shouldIncludeCharacter) => {
  const characterId = props.character?.id;
  if (!authState.user || !characterId || !list?.id || isCharacterListMembershipPending(list.id)) return;

  setCharacterListMembershipPending(list.id, true);
  try {
    if (shouldIncludeCharacter) {
      const item = await addCharacterToList(list.id, characterId);
      list.items = [...(list.items || []).filter((existingItem) => existingItem.character_id !== characterId), item || { character_id: characterId }];
      setCharacterListActionSuccess(t('userLibrary.addedToCharacterList', { name: list.name || list.id }));
    } else {
      await removeCharacterFromList(list.id, characterId);
      list.items = (list.items || []).filter((item) => item.character_id !== characterId);
      setCharacterListActionSuccess(t('userLibrary.removedFromCharacterList', { name: list.name || list.id }));
    }
  } catch (error) {
    setCharacterListActionError(error?.message || t('userLibrary.actionFailed'));
  } finally {
    setCharacterListMembershipPending(list.id, false);
  }
};

const createCharacterListAndAddCurrentCharacter = async () => {
  const characterId = props.character?.id;
  const listName = newCharacterListName.value.trim();
  if (!authState.user || !characterId || !listName || isCharacterListActionPending.value) return;

  isCharacterListActionPending.value = true;
  try {
    const list = await createCharacterList(listName);
    if (list?.id) {
      const item = await addCharacterToList(list.id, characterId);
      userCharacterLists.value = [
        { ...list, items: [item || { character_id: characterId }] },
        ...userCharacterLists.value.filter((existingList) => existingList.id !== list.id),
      ];
      setCharacterListActionSuccess(t('userLibrary.addedToCharacterList', { name: list?.name || listName }));
    }
    isCreateCharacterListDialogOpen.value = false;
    newCharacterListName.value = '';
  } catch (error) {
    setCharacterListActionError(error?.message || t('userLibrary.actionFailed'));
  } finally {
    isCharacterListActionPending.value = false;
  }
};

watch(() => authState.user, () => {
  loadUserCharacterLists().catch(() => {});
});

watch(() => props.character?.id, () => {
  activeDetailTab.value = 'overview';
  selectedPhaseIndex.value = 0;
  selectedSkillIndex.value = 0;
  selectedTalentIndex.value = 0;
  activeGrowthMode.value = growthModes.value[0]?.id || 'evolve';
  selectedGrowthIndex.value = 0;
  selectedStoryIndex.value = 0;
  storyPageIndex.value = 0;
  traitPageIndex.value = 0;
  skillPageIndex.value = 0;
  growthPageIndex.value = 0;
  talentPageIndex.value = 0;
  activeTalentTooltipKey.value = '';
  currentPortraitIndex.value = 0;
  currentPortraitUrlIndex.value = 0;
});

onMounted(() => {
  loadOperatorAssetManifest()
    .then(() => {
      assetManifestVersion.value += 1;
    })
    .catch((error) => {
      console.warn('Operator asset manifest load failed:', error);
    });
  loadUserCharacterLists().catch(() => {});
});
const expandedStories = ref([0]); // 預設展開第一個檔案

// 詳細資料頭像多來源索引
const avatarIndex = ref(0);

// 取得當前角色可用的所有頭像 URL
const avatarUrls = computed(() => {
  void assetManifestVersion.value;
  return [...new Set([
    getLocalOperatorAvatarUrl(props.character.id),
    props.character.avatarUrl,
    ...getCharacterAvatarUrls(props.character.id),
  ].filter(Boolean))];
});

// 目前應顯示的頭像 URL（會隨錯誤自動切換來源）
const currentAvatarUrl = computed(() => {
  const urls = avatarUrls.value || [];
  const url = urls[avatarIndex.value] || urls[0] || '';
  return url ? getProxyImageUrl(url) : '';
});

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
        urls: p.urls,
        skinId: p.skinId ?? null
      });
    });
  }
  
  console.log('[組件調試] 最終allPortraits:', list);
  
  // 如果沒有從 API 解析出的立繪，就使用頭像多來源作為備用立繪
  return list.length > 0 ? list : [{ name: t('character.portraitFallback'), urls: avatarUrls.value }];
});

const currentPortraitUrl = computed(() => {
  const portrait = allPortraits.value[currentPortraitIndex.value];
  if (!portrait || !portrait.urls) {
    console.log('[組件調試] 當前立繪為空或無URLs');
    return '';
  }
  const url = portrait.urls[currentPortraitUrlIndex.value] || portrait.urls[0] || '';
  console.log('[組件調試] 當前立繪URL:', url, '索引:', currentPortraitUrlIndex.value, '/', portrait.urls.length);
  return url ? getProxyImageUrl(url) : '';
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
  const key = `profession.${profession}`;
  const translated = t(key);
  return translated === key ? profession : translated;
};

const getFactionLabel = (factionId) => {
  if (!factionId) return '';
  const key = `nation.${factionId}`;
  const translated = te(key) ? t(key) : '';
  return translated || factionId;
};

const getRoomTypeName = (roomType) => {
  const key = `roomType.${roomType}`;
  const translated = t(key);
  return translated === key ? roomType : translated;
};

const getSpTypeName = (spType) => {
  const key = `spType.${String(spType)}`;
  const translated = t(key);
  return translated === key ? t('spType.default') : translated;
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
  const img = event.target;
  const urls = avatarUrls.value || [];
  const nextIndex = avatarIndex.value + 1;

  // 嘗試下一個頭像來源
  if (nextIndex < urls.length) {
    avatarIndex.value = nextIndex;
    img.src = getProxyImageUrl(urls[nextIndex]);
    return;
  }

  // 所有來源都失敗才顯示占位圖
  img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect fill="%2330363d" width="200" height="200"/><text fill="%238b949e" x="100" y="110" text-anchor="middle" font-size="16">No Image</text></svg>';
};

const portraitFailedDataUrl = () => {
  const msg = t('character.portraitLoadFailed');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect fill="#30363d" width="400" height="600"/><text fill="#8b949e" x="200" y="310" text-anchor="middle" font-size="18">${msg}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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
        event.target.src = getProxyImageUrl(nextUrl);
        return;
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
    event.target.src = portraitFailedDataUrl();
  } else {
    // 沒有立繪數據
    console.log('[組件調試] 沒有立繪數據');
    event.target.src = portraitFailedDataUrl();
  }
};

const handleMaterialError = (event) => {
  event.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60"><rect fill="%2330363d" width="60" height="60" rx="6"/><text fill="%238b949e" x="30" y="35" text-anchor="middle" font-size="10">?</text></svg>';
};

const handleAssetCandidateError = (event, urls = []) => {
  const image = event.target;
  const nextIndex = Number(image.dataset.assetCandidateIndex || 0) + 1;
  if (nextIndex < urls.length) {
    image.dataset.assetCandidateIndex = String(nextIndex);
    image.src = getProxyImageUrl(urls[nextIndex]);
    return;
  }
  handleMaterialError(event);
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
  min-width: 0;
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

.api-pre-line {
  white-space: pre-line;
}
</style>

<style scoped>
.character-list-actions {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  max-width: 100%;
}

.character-list-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
  font-size: 0.82rem;
}

.character-list-btn {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  background: transparent;
  color: var(--primary-color);
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
}

.character-list-btn.primary {
  background: var(--primary-color);
  color: #0d1117;
}

.character-list-btn.secondary {
  border-color: rgba(92, 178, 255, 0.32);
}

.character-list-btn:disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.character-list-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(2, 6, 12, 0.72);
  backdrop-filter: blur(8px);
}

.character-list-dialog-backdrop.create {
  z-index: 1510;
}

.character-list-dialog {
  width: min(420px, 100%);
  border: 1px solid rgba(92, 178, 255, 0.24);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(24, 31, 42, 0.98), rgba(13, 17, 23, 0.98));
  color: var(--text-color);
  padding: 18px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.5);
}

.character-list-dialog h3 {
  margin: 0 0 12px;
  font-size: 1.08rem;
}

.character-list-dialog-form {
  display: grid;
  gap: 12px;
}

.character-list-dialog-form label {
  display: grid;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.character-list-dialog-form input,
.character-list-manager-search {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-color);
  padding: 10px 11px;
  outline: none;
}

.character-list-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.character-list-manager-dialog {
  width: min(520px, 100%);
}

.character-list-manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.character-list-manager-header h3,
.character-list-manager-header p {
  margin: 0;
}

.character-list-manager-header p {
  color: var(--text-secondary);
  font-size: 0.84rem;
  margin-top: 4px;
}

.character-list-icon-btn {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-secondary);
  cursor: pointer;
}

.character-list-manager-list {
  display: grid;
  gap: 8px;
  max-height: min(300px, 42vh);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 10px 4px 0 0;
}

.character-list-manager-item {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 10px;
  cursor: pointer;
}

.character-list-manager-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.character-list-manager-check {
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(92, 178, 255, 0.32);
  border-radius: 6px;
  color: transparent;
}

.character-list-manager-item input:checked + .character-list-manager-check {
  background: var(--primary-color);
  color: #0d1117;
}

.character-list-manager-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.character-list-manager-empty,
.character-list-action-error {
  color: var(--text-secondary);
  font-size: 0.84rem;
}

.character-list-action-error {
  color: #ff8b86;
}

.character-list-toast {
  position: fixed;
  left: 50%;
  bottom: 72px;
  z-index: 1550;
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(420px, calc(100vw - 32px));
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(18, 35, 24, 0.94);
  color: #7ee787;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.36);
}

.character-list-toast.error {
  background: rgba(48, 20, 20, 0.94);
  color: #ff8b86;
}

@media (max-width: 640px) {
  .character-list-actions {
    grid-template-columns: 1fr;
  }

  .character-list-btn {
    width: 100%;
  }
}
</style>

<style scoped>
.character-details {
  height: min(720px, calc(90vh - 118px));
  min-height: 560px;
  max-height: none;
  padding: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(13, 17, 23, 0.96);
}

.character-details-header,
.character-details-content {
  display: none;
}

.operator-data-nav {
  position: relative;
  top: auto;
  height: 58px;
  z-index: 10;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  border-bottom: 1px solid rgba(88, 166, 255, 0.22);
  border-radius: 0;
  background: rgba(13, 17, 23, 0.98);
  backdrop-filter: blur(12px);
}

.operator-data-nav button {
  min-width: 0;
  min-height: 58px;
  border: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 0;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  transition: color 180ms ease, background 180ms ease;
}

.operator-data-nav button:hover {
  background: rgba(88, 166, 255, 0.08);
  color: var(--text-color);
}

.operator-data-nav button.active {
  background: rgba(88, 166, 255, 0.16);
  color: var(--primary-color);
  box-shadow: inset 0 -3px var(--primary-color);
}

.operator-game-stage {
  position: relative;
  height: calc(100% - 58px);
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 58%) minmax(320px, 42%);
  overflow: hidden;
  background:
    linear-gradient(90deg, rgba(88, 166, 255, 0.035) 1px, transparent 1px),
    linear-gradient(rgba(88, 166, 255, 0.035) 1px, transparent 1px),
    #0d1117;
  background-size: 44px 44px;
}

.operator-art-zone {
  position: relative;
  min-width: 0;
  overflow: hidden;
}

.operator-art-zone::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(90deg, transparent 52%, rgba(13, 17, 23, 0.9) 100%);
}

.operator-art {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: end center;
}

.operator-art img {
  width: 108%;
  height: 106%;
  max-width: none;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.48));
}

.operator-identity {
  position: absolute;
  left: 24px;
  bottom: 28px;
  z-index: 3;
  max-width: min(78%, 430px);
  padding-left: 14px;
  border-left: 3px solid var(--primary-color);
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.9);
}

.operator-identity h2 {
  margin: 2px 0 0;
  color: #fff;
  font-size: clamp(2rem, 5vw, 4.4rem);
  line-height: 0.95;
}

.operator-identity p {
  margin: 7px 0 10px;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}

.operator-rarity {
  color: #ffc107;
  font-weight: 800;
}

.operator-role-line {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.operator-role-line span {
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 4px;
  background: rgba(13, 17, 23, 0.72);
  color: var(--text-color);
  font-size: 0.75rem;
}

.operator-skin-switcher {
  position: absolute;
  left: 24px;
  top: 22px;
  z-index: 4;
  display: flex;
  gap: 5px;
}

.operator-skin-switcher button,
.console-selector button,
.console-pager button {
  min-width: 40px;
  min-height: 36px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: rgba(13, 17, 23, 0.82);
  color: var(--text-secondary);
  cursor: pointer;
}

.operator-skin-switcher button.active,
.console-selector button.active {
  border-color: var(--primary-color);
  background: rgba(88, 166, 255, 0.18);
  color: var(--primary-color);
  box-shadow: inset 0 -2px var(--primary-color);
}

.operator-info-console {
  position: relative;
  z-index: 4;
  min-width: 0;
  height: 100%;
  padding: 18px;
  border-left: 1px solid rgba(88, 166, 255, 0.2);
  background: rgba(22, 27, 34, 0.9);
  backdrop-filter: blur(14px);
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  overflow: hidden;
}

.console-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
}

.console-header span,
.console-label {
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.68rem;
}

.console-header strong {
  color: var(--primary-color);
  font-size: 0.95rem;
}

.console-view {
  min-height: 0;
  padding-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  animation: console-view-in 180ms ease-out;
}

.console-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.console-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.console-stat-grid > div {
  min-height: 60px;
  padding: 8px;
  border-top: 2px solid rgba(88, 166, 255, 0.45);
  background: rgba(13, 17, 23, 0.52);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.console-stat-grid span {
  color: var(--text-secondary);
  font-size: 0.68rem;
}

.console-stat-grid strong {
  color: var(--text-color);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
}

.console-block,
.console-range,
.selected-skill,
.compact-talents,
.growth-entry,
.archive-page {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 2px solid var(--primary-color);
  border-radius: 6px;
  background: rgba(13, 17, 23, 0.42);
}

.console-block p,
.selected-skill p,
.compact-talents p,
.growth-entry p,
.archive-page p {
  margin: 6px 0 0;
  color: var(--text-color);
  font-size: 0.79rem;
  line-height: 1.5;
}

.console-range {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.selected-skill h3,
.growth-entry h3,
.archive-page h3 {
  margin: 5px 0 0;
  color: var(--primary-color);
  font-size: 1.08rem;
}

.skill-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}

.skill-metrics span {
  padding: 4px 7px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.68rem;
}

.compact-talents {
  display: grid;
  gap: 8px;
}

.compact-talents > div {
  padding-top: 7px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.compact-talents strong {
  color: var(--text-color);
  font-size: 0.8rem;
}

.growth-mode-selector {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.growth-mode-selector button {
  min-height: 44px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: rgba(13, 17, 23, 0.45);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.growth-mode-selector button.active {
  border-color: rgba(26, 188, 156, 0.5);
  background: rgba(26, 188, 156, 0.12);
  color: var(--secondary-color);
}

.console-materials {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 12px;
}

.console-materials > div {
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  background: rgba(22, 27, 34, 0.7);
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 4px 7px;
  align-items: center;
}

.console-materials img {
  grid-row: 1 / span 2;
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.console-materials span {
  overflow: hidden;
  color: var(--text-color);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-materials strong {
  color: var(--primary-color);
  font-size: 0.7rem;
}

.archive-page {
  flex: 1;
  min-height: 0;
}

.archive-page p {
  font-size: 0.8rem;
  line-height: 1.6;
}

.console-pager {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}

.console-pager span {
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.75rem;
}

.console-pager button:disabled {
  opacity: 0.38;
  cursor: default;
}

@keyframes console-view-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .console-view { animation: none; }
}

@media (max-width: 700px) {
  .character-details {
    height: min(720px, calc(92vh - 92px));
    min-height: 540px;
  }

  .operator-data-nav button span {
    display: none;
  }

  .operator-game-stage {
    grid-template-columns: 1fr;
  }

  .operator-art-zone {
    position: absolute;
    inset: 0;
    opacity: 0.3;
  }

  .operator-info-console {
    grid-column: 1;
    border-left: 0;
    background: rgba(13, 17, 23, 0.78);
  }

  .operator-identity {
    display: none;
  }

  .console-stat-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}
</style>

<style scoped media="not all">
.character-details {
  --operator-surface: rgba(22, 27, 34, 0.82);
  --operator-surface-strong: rgba(13, 17, 23, 0.94);
  --operator-line: rgba(88, 166, 255, 0.2);
  position: relative;
  padding: 18px;
  background: transparent;
}

.character-details-header {
  position: relative;
  min-height: 128px;
  margin: 0 0 14px;
  padding: 20px;
  border: 1px solid var(--operator-line);
  border-radius: 8px;
  background: var(--operator-surface-strong);
  overflow: hidden;
}

.character-details-header::after {
  content: '';
  position: absolute;
  right: 0;
  bottom: 0;
  width: 34%;
  height: 2px;
  background: var(--secondary-color);
}

.character-avatar-large {
  width: 104px;
  height: 104px;
  border: 1px solid rgba(88, 166, 255, 0.38);
  border-radius: 8px;
  background: var(--dark-bg);
}

.character-name-large {
  color: var(--text-color);
  font-size: clamp(1.8rem, 3vw, 2.8rem);
  line-height: 1;
}

.character-appellation {
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-style: normal;
}

.tag {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: rgba(48, 54, 61, 0.48);
}

.tag.profession {
  border-color: rgba(88, 166, 255, 0.45);
  background: rgba(88, 166, 255, 0.13);
  color: var(--primary-color);
}

.tag.nation {
  border-color: rgba(26, 188, 156, 0.34);
  background: rgba(26, 188, 156, 0.1);
  color: var(--secondary-color);
}

.operator-data-nav {
  position: sticky;
  top: 0;
  z-index: 8;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
  padding: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: rgba(13, 17, 23, 0.94);
  backdrop-filter: blur(12px);
}

.operator-data-nav button {
  min-height: 46px;
  padding: 8px 14px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  transition: color 180ms ease, background 180ms ease, border-color 180ms ease;
}

.operator-data-nav button:hover {
  border-color: rgba(88, 166, 255, 0.2);
  background: rgba(88, 166, 255, 0.07);
  color: var(--text-color);
}

.operator-data-nav button.active {
  border-color: rgba(88, 166, 255, 0.4);
  background: rgba(88, 166, 255, 0.14);
  color: var(--primary-color);
  box-shadow: inset 0 -2px var(--primary-color);
}

.character-details-content {
  display: grid;
  grid-template-columns: minmax(300px, 0.86fr) minmax(430px, 1.14fr);
  gap: 14px;
  align-items: start;
}

.detail-section {
  grid-column: 2;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  background: var(--operator-surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  animation: operator-content-in 180ms ease-out;
}

.detail-section h3 {
  color: var(--primary-color);
  border-bottom-color: var(--border-color);
}

.portrait-stage {
  position: sticky;
  top: 70px;
  grid-column: 1;
  grid-row: 1 / span 20;
  padding: 16px;
  background-color: rgba(13, 17, 23, 0.82);
  background-image:
    linear-gradient(rgba(88, 166, 255, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(88, 166, 255, 0.045) 1px, transparent 1px);
  background-size: 36px 36px;
  overflow: hidden;
}

.portrait-stage::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  bottom: 14px;
  height: 2px;
  background: linear-gradient(90deg, var(--primary-color) 0 64%, var(--secondary-color) 64% 100%);
}

.portrait-display {
  min-height: 510px;
  padding: 10px 8px 22px;
  display: grid;
  place-items: end center;
  background: transparent;
}

.portrait-image {
  width: 100%;
  height: 510px;
  max-height: none;
  object-fit: contain;
  object-position: center bottom;
  filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.42));
}

.portrait-tabs button {
  border: 1px solid var(--border-color);
  background: rgba(13, 17, 23, 0.78);
}

.portrait-tabs button:hover,
.portrait-tabs button.active {
  border-color: rgba(88, 166, 255, 0.48);
  background: rgba(88, 166, 255, 0.15);
  color: var(--primary-color);
}

.trait-text,
.talent-card,
.skill-card,
.building-skill-card,
.module-card,
.evolve-phase,
.upgrade-level,
.potential-item,
.range-phase-item,
.story-card,
.material-item {
  border-color: rgba(88, 166, 255, 0.22);
  background: rgba(13, 17, 23, 0.42);
  box-shadow: none;
}

.trait-text,
.skill-card,
.talent-card {
  border-left-color: var(--primary-color);
}

.attributes-table th {
  background: rgba(88, 166, 255, 0.11);
}

.attributes-table th,
.attributes-table td {
  border-color: var(--border-color);
  font-variant-numeric: tabular-nums;
}

.self-cell {
  border-color: var(--secondary-color);
  background: rgba(26, 188, 156, 0.72);
}

@keyframes operator-content-in {
  from { opacity: 0; transform: translateX(10px); }
  to { opacity: 1; transform: translateX(0); }
}

@media (prefers-reduced-motion: reduce) {
  .detail-section { animation: none; }
}

@media (max-width: 820px) {
  .operator-data-nav {
    grid-template-columns: repeat(4, minmax(108px, 1fr));
    overflow-x: auto;
  }

  .character-details-content {
    display: flex;
    flex-direction: column;
  }

  .portrait-stage {
    position: relative;
    top: auto;
    width: 100%;
    order: -1;
  }

  .detail-section {
    width: 100%;
  }

  .portrait-display {
    min-height: 360px;
  }

  .portrait-image {
    height: 360px;
  }
}

@media (max-width: 560px) {
  .character-details {
    padding: 10px;
  }

  .character-details-header {
    padding: 16px;
  }

  .operator-data-nav {
    top: -10px;
    margin-inline: -2px;
  }

  .operator-data-nav button {
    min-height: 44px;
    padding: 7px 10px;
  }
}
</style>

<style scoped>
.operator-skin-switcher,
.console-selector {
  width: 100%;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) 38px;
  align-items: center;
  gap: 6px;
}

.operator-skin-switcher {
  right: 24px;
  width: min(280px, calc(100% - 48px));
}

.operator-skin-switcher > span,
.console-selector > span,
.selector-current {
  min-width: 0;
  height: 38px;
  padding: 0 10px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 4px;
  background: rgba(13, 17, 23, 0.7);
  color: var(--text-color);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.skill-current {
  height: 50px;
  justify-content: flex-start;
  gap: 9px;
  text-align: left;
}

.skill-current img {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  object-fit: contain;
}

.skill-current > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.console-selector button:disabled,
.operator-skin-switcher button:disabled {
  opacity: 0.36;
  cursor: default;
}

.console-block p,
.selected-skill p,
.growth-entry p,
.archive-page p,
.compact-talents p {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.inline-pager,
.console-pager {
  min-height: 30px;
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}

.inline-pager button,
.console-pager button {
  width: 30px;
  min-width: 30px;
  height: 30px;
  min-height: 30px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: rgba(13, 17, 23, 0.72);
  color: var(--text-secondary);
  cursor: pointer;
}

.inline-pager button:not(:disabled):hover,
.console-pager button:not(:disabled):hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.inline-pager button:disabled,
.console-pager button:disabled {
  opacity: 0.35;
  cursor: default;
}

.inline-pager span,
.console-pager span {
  min-width: 44px;
  color: var(--text-secondary);
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: 0.7rem;
  text-align: center;
}

.growth-mode-selector button span,
.operator-data-nav button span,
.growth-entry h3,
.archive-page h3,
.selected-skill h3 {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-height: 760px) and (min-width: 701px) {
  .character-details {
    height: calc(90vh - 108px);
    min-height: 520px;
  }

  .operator-info-console {
    padding: 13px;
    grid-template-rows: 40px minmax(0, 1fr);
  }

  .console-view {
    gap: 8px;
    padding-top: 9px;
  }

  .console-stat-grid > div {
    min-height: 50px;
    padding: 6px;
  }

  .console-block,
  .console-range,
  .selected-skill,
  .compact-talents,
  .growth-entry,
  .archive-page {
    padding: 9px;
  }

  .console-block p,
  .selected-skill p,
  .compact-talents p,
  .growth-entry p,
  .archive-page p {
    font-size: 0.72rem;
    line-height: 1.4;
  }

  .growth-mode-selector button {
    min-height: 38px;
  }

  .console-materials > div {
    padding: 6px;
  }
}
</style>

<style scoped>
.operator-info-console > .console-header {
  position: static;
  inset: auto;
  width: auto;
  min-height: 0;
  height: 40px;
  margin: 0;
  padding: 0 0 9px;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}

.operator-info-console {
  grid-template-rows: 40px minmax(0, 1fr);
}

.operator-info-console > .console-view {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  padding-right: 7px;
  padding-bottom: 14px;
}

.operator-info-console > .console-view::-webkit-scrollbar {
  width: 6px;
}

.operator-info-console > .console-view::-webkit-scrollbar-track {
  background: rgba(13, 17, 23, 0.32);
}

.operator-info-console > .console-view::-webkit-scrollbar-thumb {
  border: 0;
  border-radius: 3px;
  background: rgba(88, 166, 255, 0.42);
}

.console-header strong,
.console-header span {
  position: static;
  margin: 0;
  padding: 0;
  line-height: 1.2;
  white-space: nowrap;
}

@media (max-height: 760px) and (min-width: 701px) {
  .operator-info-console > .console-header {
    height: 34px;
    padding-bottom: 7px;
  }

  .operator-info-console {
    grid-template-rows: 34px minmax(0, 1fr);
  }
}
</style>

<style scoped>
.operator-skin-switcher {
  left: 20px;
  right: auto;
  width: min(210px, calc(100% - 40px));
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  gap: 4px;
}

.operator-skin-switcher button {
  min-width: 32px;
  width: 32px;
  min-height: 32px;
  height: 32px;
  padding: 0;
}

.operator-skin-switcher > span {
  height: 32px;
  padding-inline: 8px;
  font-size: 0.72rem;
}

.archive-view {
  align-content: start;
}

.archive-page {
  flex: 0 0 auto;
  min-height: auto;
  height: auto;
  overflow: visible;
}

.archive-page p {
  max-height: none;
  overflow: visible;
}

.archive-view .console-pager {
  flex: 0 0 auto;
  position: sticky;
  bottom: 0;
  padding: 7px 0 2px;
  background: rgba(22, 27, 34, 0.96);
}

.selected-talent,
.selected-talent p {
  max-height: none;
  overflow: visible;
}

@media (max-width: 700px) {
  .operator-skin-switcher {
    width: min(190px, calc(100% - 32px));
    left: 16px;
  }
}
</style>

<style scoped>
.talent-summary {
  position: relative;
  min-width: 0;
}

.talent-summary-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.talent-summary-header > strong {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.talent-variant-trigger {
  flex: 0 0 auto;
  min-width: 42px;
  min-height: 28px;
  padding: 3px 7px;
  border: 1px solid rgba(26, 188, 156, 0.38);
  border-radius: 4px;
  background: rgba(26, 188, 156, 0.09);
  color: var(--secondary-color);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font-size: 0.7rem;
}

.talent-variant-trigger:hover,
.talent-variant-trigger:focus-visible,
.talent-variant-trigger[aria-expanded='true'] {
  border-color: var(--secondary-color);
  background: rgba(26, 188, 156, 0.16);
  outline: none;
}

.talent-variant-tooltip {
  position: relative;
  z-index: 6;
  margin-top: 8px;
  max-height: 220px;
  padding: 9px;
  border: 1px solid rgba(26, 188, 156, 0.36);
  border-radius: 5px;
  background: rgba(8, 14, 19, 0.98);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.38);
  overflow-y: auto;
}

.talent-variant-tooltip > div + div {
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.talent-variant-tooltip strong {
  display: block;
  color: var(--secondary-color);
  font-size: 0.7rem;
  line-height: 1.4;
  white-space: normal;
}

.talent-variant-tooltip p {
  margin: 4px 0 0;
  color: var(--text-color);
  font-size: 0.72rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (hover: none) {
  .talent-variant-trigger {
    min-width: 44px;
    min-height: 36px;
  }
}
</style>

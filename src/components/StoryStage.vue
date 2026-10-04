<template>
  <main class="story-page" @pointerdown.capture="unlockMemorySound" @keydown.capture="unlockMemorySound" @wheel.capture="unlockMemorySound">
    <header class="story-heading">
      <div>
        <p class="eyebrow">{{ screen === 'player' ? `STORY / ${manifest?.storyId || selectedStory?.page || 'PRTS'}` : 'TERRA / FILM ARCHIVE' }}</p>
        <h1 ref="screenHeading" tabindex="-1">{{ screen === 'player' ? localize(manifest?.title || selectedStory?.title) : screen === 'episodes' ? localize(activeCollection?.label) : labels.archive }}</h1>
        <p>{{ screen === 'player' ? labels.subtitle : screen === 'episodes' ? labels.chooseEpisode : labels.chooseCollection }}</p>
      </div>
      <div class="heading-actions"><div v-if="screen !== 'player'" class="archive-audio"><button type="button" :aria-pressed="audioEnabled" @click="toggleAudio">{{ audioEnabled ? labels.audioOn : labels.audioOff }}</button><label>{{ mediaLabels.volume }}<input v-model.number="audioVolume" type="range" min="0" max="1" step=".01" :aria-label="mediaLabels.volume"><output>{{ Math.round(audioVolume * 100) }}%</output></label></div><button v-if="screen === 'player'" type="button" @click="returnToEpisodes">← {{ labels.backToEpisodes }}</button><button v-else-if="screen === 'episodes'" type="button" @click="returnToCollections">← {{ labels.backToCollections }}</button><a :href="screen === 'player' ? manifest?.sourcePage || selectedStory?.sourcePage : 'https://prts.wiki/w/剧情一览'" target="_blank" rel="noopener noreferrer">PRTS ↗</a></div>
    </header>
    <section class="story-progress-sync" :aria-label="t('storyProgress.title')">
      <div><strong v-if="progressOwner">{{ t('storyProgress.account', { name: authState.session?.user?.loginKey || progressOwner }) }}</strong><span role="status">{{ t('storyProgress.' + progressStatus) }}</span><span v-if="progressStorageFailed" class="progress-storage-warning">{{ t('storyProgress.storageFailed') }}</span></div>
      <button v-if="!progressOwner || progressStatus === 'expired'" type="button" @click="emit('sign-in')">{{ t('storyProgress.signIn') }}</button>
      <button v-if="progressOwner" type="button" :disabled="progressSyncing" @click="syncReadingProgress(true)">{{ t('storyProgress.retry') }}</button>
      <button v-if="progressImportCount" type="button" :disabled="progressSyncing" @click="importGuestProgress">{{ t('storyProgress.import', { count: progressImportCount }) }}</button>
    </section>

    <Transition name="archive-screen" mode="out-in">
    <div :key="screen" class="archive-screen">
    <section v-if="catalog.length && screen !== 'player'" class="story-library" :class="`view-${viewMode}`" :aria-label="labels.selectStory">
      <div class="library-heading">
        <div><span class="eyebrow">{{ screen === 'collections' ? '01 / SELECT CHAPTER OR EVENT' : '02 / SELECT STORY' }}</span><p>{{ screen === 'collections' ? labels.collectionNames : localize(activeCollection?.label) }} <span>{{ screen === 'collections' ? filteredCollections.length : groupStories.length }}</span></p></div>
        <span class="archive-hint">{{ screen === 'collections' ? labels.chooseCollection : labels.chooseEpisode }}</span>
      </div>
      <div v-if="screen === 'collections' && viewMode !== 'sequence'" class="library-filters">
        <select v-model="selectedCategory" :aria-label="labels.category"><option value="">{{ labels.allCategories }}</option><option v-for="category in categories" :key="category.id" :value="category.id">{{ categoryLabel(category.id) }}</option></select>
        <select v-model="selectedLine" :aria-label="labels.series"><option value="">{{ labels.allSeries }}</option><option v-for="line in availableLines" :key="line.id" :value="line.id">{{ localize(line.name) }} ({{ line.count }})</option></select>
        <select v-model="selectedCollectionFilter" :aria-label="labels.collectionNames"><option value="">{{ labels.allCollections }}</option><option v-for="collection in groups" :key="collection.key" :value="collection.key">{{ localize(collection.label) }}</option></select>
        <input v-model="search" type="search" :placeholder="labels.search" :aria-label="labels.search">
      </div>
      <div v-else-if="viewMode !== 'sequence'" class="library-filters">
        <input v-model="episodeSearch" type="search" :placeholder="labels.searchEpisodes" :aria-label="labels.searchEpisodes">
        <select v-model="selectedPhase" :aria-label="labels.phase"><option value="">{{ labels.allPhases }}</option><option v-for="phase in phases" :key="phase" :value="phase">{{ labels.phases[phase] }}</option></select>
      </div>
      <div v-else class="reading-plan-heading">
        <label v-if="screen === 'collections'">{{ labels.readingPath }}<select v-model="readingLineId" @change="guideTrail = []"><option v-for="line in archiveMetadata.lines || []" :key="line.id" :value="line.id">{{ localize(line.name) }}</option></select></label>
        <details class="compact-note"><summary>{{ mediaLabels.context }}</summary><p>{{ screen === 'collections' ? localize(readingGuideIntro(readingLineId)) : groupStories.every(story => story.orderSource === 'game') ? labels.gameOrder : labels.catalogOrder }}</p></details>
      </div>
      <div v-if="viewMode === 'sequence'" class="guide-tools">
        <button v-if="guideTrail.length" type="button" @click="returnToGuide">← {{ labels.returnGuide }} · {{ localize(guideTrail[guideTrail.length - 1].group) }}</button>
        <button v-if="screen === 'collections' && readingResumeIndex >= 0" type="button" @click="seekRack(readingResumeIndex)">{{ labels.resumeGuide }} → {{ localize(readingRoute[readingResumeIndex]?.label) }}</button>
        <details class="compact-note"><summary>{{ mediaLabels.details }}</summary><p>{{ labels.routeBasis }}</p></details>
      </div>
      <div class="archive-toolbar">
        <div class="view-switch" role="group" :aria-label="labels.view"><button v-for="mode in ['banner', 'sequence']" :key="mode" type="button" :class="{ active: viewMode === mode }" :aria-pressed="viewMode === mode" @click="viewMode = mode">{{ labels.views[mode] }}</button></div>
        <button v-if="screen === 'collections' && viewMode !== 'sequence'" class="filter-toggle" type="button" :aria-expanded="advancedFilters" @click="advancedFilters = !advancedFilters">{{ labels.refine }} <span aria-hidden="true">{{ advancedFilters ? '−' : '+' }}</span></button>
        <span v-if="screen === 'episodes'">{{ completedCount }} / {{ groupStories.length }} {{ labels.read }}</span>
      </div>
      <Transition name="filter-reveal"><div v-if="screen === 'collections' && viewMode !== 'sequence' && advancedFilters" class="library-filters advanced-filters"><select v-if="sections.length > 1" v-model="selectedSection" :aria-label="labels.section"><option value="">{{ labels.allSections }}</option><option v-for="section in sections" :key="section" :value="section">{{ localize(section) }}</option></select><select v-model="collectionSort" :aria-label="labels.sort"><option value="line">{{ labels.lineOrder }}</option><option value="release">{{ labels.releaseOrder }}</option><option value="name">{{ labels.nameOrder }}</option></select></div></Transition>
      <div v-if="screen === 'episodes' && viewMode === 'sequence'" class="reading-route">
        <p v-if="activeGuideNode"><button type="button" class="guide-context" @click="showGuide(readingLineId, activeCollection.group)">{{ labels.currentGuide }}：{{ localize(readingLineName) }} · {{ localize(activeCollection.label) }} ↗</button></p>
        <p>{{ labels.orderNote }} <span>{{ groupStories.every(story => story.orderSource === 'game') ? labels.gameOrder : labels.catalogOrder }}</span></p>
        <details v-if="activeRoute.length > 1"><summary>{{ labels.storyLines }} / {{ labels.order }}</summary><nav :aria-label="labels.lineOrder"><template v-for="(node, index) in activeRoute" :key="`${index}-${node.group}`"><span v-if="index" class="route-arrow" aria-hidden="true">{{ node.independent ? '·' : '→' }}</span><button type="button" :disabled="!findCollection(node.group)" :class="{ current: node.group === activeCollection.group, intersection: node.intersection }" @click="openCollection(findCollection(node.group))">{{ localize(node.group) }}<small v-if="node.intersection">{{ labels.intersection }}</small></button></template></nav></details>
      </div>
      <p v-if="viewMode !== 'sequence'" class="archive-breadcrumb">{{ screen === 'episodes' ? categoryLabel(activeCollection?.category) : selectedCategory ? categoryLabel(selectedCategory) : labels.allCategories }}<template v-if="screen === 'collections' && selectedSection"> / {{ localize(selectedSection) }}</template><template v-if="screen === 'episodes'"> / {{ localize(activeCollection?.label) }}</template><template v-if="screen === 'episodes' && selectedPhase"> / {{ labels.phases[selectedPhase] }}</template></p>
      <div v-if="rackEntries.length" class="story-rack-shell">
        <div ref="rackElement" class="story-rack" :class="{ dragging: rackDragging, moving: rackAnimating }" :style="{ '--film-position': `${-rackIndex * rackStep + rackDragOffset}px` }" tabindex="0" role="region" aria-roledescription="carousel" :aria-label="labels.selectStory"
          @keydown.left.prevent="moveRack(-1, true)" @keydown.right.prevent="moveRack(1, true)" @keydown.home.prevent="seekRack(0)" @keydown.end.prevent="seekRack(rackEntries.length - 1)" @keydown.enter.self.prevent="activateRackCard(rackIndex)" @keydown.space.self.prevent="activateRackCard(rackIndex)"
          @pointerdown="beginRackDrag" @pointermove="dragRack" @pointerup="endRackDrag" @pointercancel="cancelRackDrag" @pointerleave="leaveRack" @lostpointercapture="lostRackCapture" @dragstart.prevent @wheel="wheelRack" @click.capture="guardRackClick">
          <Transition name="ambient-fade" mode="out-in"><img v-if="rackActive" :key="rackActive.key" class="rack-ambient" :src="coverPath(rackActive.cover)" alt="" aria-hidden="true" @error="event => { event.target.style.visibility = 'hidden'; }"></Transition>
          <div class="rack-horizon" aria-hidden="true"></div>
          <div class="film-perforations film-perforations-top" aria-hidden="true"></div><div class="film-perforations film-perforations-bottom" aria-hidden="true"></div>
          <div class="rack-line-label">{{ localize(viewMode === 'sequence' ? rackActive?.act || activeCollection?.label : rackActive?.lineName || activeCollection?.lineName) }}</div>
          <button v-for="item in visibleRackEntries" :key="item.key" type="button" class="rack-card" :class="{ active: item.index === rackIndex }" :style="rackCardStyle(item.index)" :tabindex="item.index === rackIndex ? 0 : -1" :aria-label="localize(item.label)" @keydown.enter.stop.prevent="activateRackCard(item.index)" @keydown.space.stop.prevent="activateRackCard(item.index)" @click="activateRackCard(item.index)">
            <span class="rack-art" :class="{ 'operator-portrait': item.operatorPortrait }"><img :src="item.operatorPortrait ? root + item.operatorPortrait : coverPath(item.cover)" :data-original-src="item.cover" :data-story-cover="coverPath(item.cover)" alt="" draggable="false" :loading="Math.abs(item.index - rackIndex) <= 1 ? 'eager' : 'lazy'" decoding="async" @error="handleCoverError"><span class="rack-number">{{ item.orderLabel }}</span></span>
            <span class="rack-caption"><small>{{ localize(item.subtitle) }}</small><strong>{{ localize(item.label) }}</strong><span v-if="screen === 'episodes'" class="reading-status" :class="{ read: completedStories[item.id] }">{{ completedStories[item.id] ? '✓ ' + labels.read : labels.unread }}</span><span v-if="screen === 'collections' && !item.missing" class="collection-open">{{ item.count }} {{ labels.stories }}</span><span class="rack-open">{{ item.missing ? labels.notCollected : screen === 'collections' ? labels.browseEpisodes : labels.playStory }} <span v-if="!item.missing" aria-hidden="true">→</span></span></span>
          </button>
        </div>
        <section v-if="viewMode === 'sequence' && rackActive" class="reading-detail" aria-live="polite">
          <template v-if="screen === 'collections'">
            <div class="reading-detail-title"><span>{{ localize(rackActive.role) }}</span><strong>{{ localize(rackActive.act) }}</strong><small>{{ labels.routeStation }} {{ rackIndex + 1 }} / {{ rackEntries.length }}</small></div>
            <details class="compact-note guide-description"><summary>{{ mediaLabels.context }}</summary><p>{{ localize(rackActive.note) }}</p></details>
            <div v-if="rackActive.prerequisites.length" class="guide-connections">
              <h3>{{ labels.readFirst }}</h3>
              <div v-for="link in rackActive.prerequisites" :key="link.group" class="guide-connection">
                <button type="button" :disabled="link.missing || !link.routeId" @click="visitGuide(link.routeId, link.group)">{{ localize(link.group) }} ↗ <small>{{ collectionReadLabel(link.group) }}</small></button>
                <p>{{ localize(link.note) }}<span v-if="link.missing"> {{ labels.notCollected }}</span></p>
              </div>
            </div>
            <div v-if="rackActive.supplements.length" class="guide-connections guide-supplements">
              <h3>{{ labels.extraContext }}</h3>
              <div v-for="link in rackActive.supplements" :key="link.group" class="guide-connection">
                <button type="button" :disabled="link.missing || !link.routeId" @click="visitGuide(link.routeId, link.group)">{{ localize(link.group) }} ↗ <small>{{ collectionReadLabel(link.group) }}</small></button>
                <p>{{ labels.extraContextNote }}</p>
              </div>
            </div>
            <div class="reading-neighbors">
              <button v-if="rackActive.previous" type="button" @click="moveRack(-1)">← {{ rackActive.independent ? labels.relatedReading : labels.readBefore }}：{{ localize(rackActive.previous) }}</button><span v-else>{{ labels.routeStart }}</span>
              <button v-if="rackActive.next" type="button" @click="moveRack(1)">{{ rackActive.independent ? labels.relatedReading : labels.continueGuide }}：{{ localize(rackActive.next) }} →</button><span v-else>{{ labels.routeEnd }}</span>
            </div>
            <details v-if="rackActive.branches.length || rackActive.relatedLine" class="guide-branches">
              <summary>{{ labels.branchReading }}</summary>
              <button v-for="link in rackActive.branches" :key="link.group" type="button" :disabled="link.missing || !link.routeId" @click="visitGuide(link.routeId, link.group)">{{ localize(link.group) }} ↗</button>
              <button v-if="rackActive.relatedLine" type="button" @click="visitGuide(rackActive.relatedLine, rackActive.group)">{{ labels.relatedRoute }}：{{ localize(archiveMetadata.lines?.find(line => line.id === rackActive.relatedLine)?.name) }} ↗</button>
            </details>
            <a class="guide-source" :href="readingGuideSource" target="_blank" rel="noopener noreferrer">{{ labels.guideSource }} ↗</a>
          </template>
          <template v-else><p>{{ rackActive.phase === 'branch' ? labels.branchNote : labels.segmentNote }}</p><div class="reading-neighbors"><span>{{ labels.readBefore }}：{{ localize(groupStories[Number(episodeNumber(rackActive)) - 2]?.title) || labels.routeStart }}</span><span>{{ labels.readAfter }}：{{ localize(groupStories[Number(episodeNumber(rackActive))]?.title) || labels.routeEnd }}</span></div></template>
        </section>
        <div class="rack-navigation"><button type="button" :disabled="rackIndex === 0" :aria-label="labels.previousReel" @click="moveRack(-1)">←</button><span aria-live="polite">{{ rackIndex + 1 }} <small>/ {{ rackEntries.length }}</small></span><button type="button" :disabled="rackIndex + 1 >= rackEntries.length" :aria-label="labels.nextReel" @click="moveRack(1)">→</button></div>
        <div class="rack-scrubber"><span>{{ labels.swipeHint }}</span><input v-if="rackEntries.length > 1" :value="rackIndex" @input="scrubRack" type="range" min="0" :max="rackEntries.length - 1" :aria-label="labels.selectStory" :aria-valuetext="localize(rackActive?.label)"></div>
      </div>
      <p v-else class="library-empty">{{ labels.noResults }}</p>
      <p class="progress-note">{{ t('storyProgress.completionNote') }}</p>
    </section>

    <template v-if="screen === 'player'">
    <p v-if="translationNotice" class="translation-notice" role="status">{{ translationNotice }}</p>
    <div v-if="error" class="story-message" role="alert">{{ error }}</div>
    <div v-else-if="!frame" class="story-message" role="status">{{ labels.loading }}</div>
    <section v-else class="story-shell" aria-label="Story stage">
      <div class="stage-wrap" :class="{ 'video-mode': frame.type === 'video' }">
      <div class="story-stage" :class="{ grayscale: frame.state.grayscale }" @click="advance">
        <div ref="sceneCamera" class="scene-camera">
        <img v-if="backgroundPreview(frame.state.background)" class="scene-backdrop scene-preview" :src="backgroundPreview(frame.state.background)" alt="" aria-hidden="true" decoding="async">
        <img v-if="frame.state.background && assetPath(frame.state.background)" class="scene-backdrop"
          :key="`background-${frame.state.background}`"
          :src="assetPath(frame.state.background)" :data-original-src="originalAssetPath(frame.state.background)" alt="" aria-hidden="true" fetchpriority="high" decoding="async" @error="handleSceneImageError">
        <img v-if="frame.state.image && assetPath(frame.state.image)" class="scene-image"
          :key="`image-${frame.state.image}`"
          :src="assetPath(frame.state.image)" :data-original-src="originalAssetPath(frame.state.image)" alt="" aria-hidden="true" fetchpriority="high" decoding="async" @error="handleSceneImageError">
        <div class="scene-vignette"></div>
        <div class="portrait-row" aria-hidden="true">
          <template v-for="portrait in frame.state.portraits" :key="portrait.slot">
            <StoryPortrait v-if="portraitVisual(portrait.name)" class="portrait" :class="[`portrait-${portrait.slot}`, { subdued: portrait.dimmed }]" :visual="portraitVisual(portrait.name)"/>
            <img v-else-if="assetPath(portrait.name)" class="portrait" :class="[`portrait-${portrait.slot}`, { subdued: portrait.dimmed }]" :src="assetPath(portrait.name)" :data-original-src="originalAssetPath(portrait.name)" alt="" draggable="false" decoding="async" @error="handleSceneImageError">
          </template>
        </div>
        </div>
        <div v-if="frame.state.shade" class="scene-shade" :style="shadeStyle"></div>
        <video ref="sceneVideo" v-if="frame.type === 'video' && videoPath(frame.videoId)" :key="`${selectedStoryId}-${frame.command?.line}-${videoAttempt}`" class="scene-video"
          :src="videoPath(frame.videoId)" :muted="!audioEnabled" controls autoplay playsinline preload="metadata"
          @loadedmetadata="applyVideoVolume" @error="videoFailed = true" @playing="videoFailed = false" @ended="advanceVideo" @click.stop @keydown.stop></video>
      </div>

      <div class="story-dialogue-panel">
        <div v-if="frame.type === 'dialogue'" class="dialogue-box" @click="advance">
          <span class="speaker">{{ localize(frame.speaker) || labels.narrator }}</span>
          <p>{{ visibleText }}<span v-if="isTyping" class="cursor" aria-hidden="true">▍</span></p>
          <span class="continue-hint">{{ labels.continue }} ›</span>
        </div>
        <div v-else-if="frame.type === 'decision'" class="decision-box">
          <p>{{ labels.choose }}</p>
          <button v-for="option in frame.options" :key="option.value" type="button"
            @click="choose(option.value)">{{ localize(option.label) }}</button>
        </div>
        <div v-else-if="frame.type === 'video'" class="end-box">
          <p>{{ videoFailed ? mediaLabels.videoFailed : videoPath(frame.videoId) ? mediaLabels.videoHint : mediaLabels.videoMissing }}</p>
          <button v-if="videoFailed" type="button" @click="videoFailed = false; videoAttempt++">{{ mediaLabels.retry }}</button>
          <a v-if="videoFailed || !videoPath(frame.videoId)" :href="manifest.sourcePage" target="_blank" rel="noopener noreferrer">PRTS ↗</a>
          <button type="button" @click="advanceVideo">{{ labels.next }} →</button>
        </div>
        <div v-else class="end-box">
          <h2>{{ labels.finished }}</h2>
          <button type="button" @click="openEnding">{{ mediaLabels.continueChoice }}</button>
        </div>
      </div>
      </div>

      <footer class="story-controls">
        <button type="button" :disabled="!canGoBack" @click="goBack">← {{ labels.previous }}</button>
        <span class="story-line-progress">{{ frame.command?.line || commandCount }} / {{ commandCount }}</span>
        <button type="button" :aria-pressed="audioEnabled" @click="toggleAudio">{{ audioEnabled ? labels.audioOn : labels.audioOff }}</button>
        <label class="story-volume">{{ mediaLabels.volume }}<input v-model.number="audioVolume" type="range" min="0" max="1" step=".01" :aria-label="mediaLabels.volume"><output>{{ Math.round(audioVolume * 100) }}%</output></label>
        <button type="button" :aria-expanded="logOpen" aria-controls="story-log" @click="openLog">{{ mediaLabels.log }}</button>
        <button type="button" :disabled="frame.type !== 'dialogue'" @click="advance">{{ labels.next }} →</button>
      </footer>
      <p v-if="audioEnabled && audioProblem" class="story-note" role="status">
        {{ mediaLabels[audioProblem] }} <button type="button" @click="retryAudio">{{ audioProblem === 'blocked' ? mediaLabels.enable : mediaLabels.retry }}</button>
      </p>
      <nav class="episode-navigation" :aria-label="labels.order"><button type="button" :disabled="!previousStory" @click="selectStoryId(previousStory.id)">← {{ labels.previousStory }}</button><span>{{ episodeNumber(selectedStory) }} / {{ groupStories.length }} · {{ localize(activeCollection?.label) }}</span><button type="button" :disabled="!nextStory" @click="selectStoryId(nextStory.id)">{{ labels.nextStory }} →</button></nav>
      <details class="story-note compact-note"><summary>{{ mediaLabels.credits }}</summary><p>{{ labels.note }}</p></details>
    </section>
    </template>
    <div v-else-if="catalogError" class="story-message" role="alert">{{ catalogError }}</div>
    <div v-else-if="!catalog.length" class="story-message" role="status">{{ labels.loading }}</div>
    </div>
    </Transition>
  </main>
  <Teleport to="body">
    <dialog ref="endingDialog" class="story-log-dialog story-ending-dialog" aria-labelledby="story-ending-title" @click.capture="guardEndingClick" @keydown.capture="guardEndingKey" @cancel.prevent="closeEnding" @close="resetEndingGuard">
      <header><h2 id="story-ending-title" tabindex="-1">{{ labels.finished }}</h2><button type="button" :disabled="!endingArmed" @click="closeEnding">{{ mediaLabels.close }}</button></header>
      <p class="story-log-title">{{ localize(manifest?.title || selectedStory?.title) }}</p>
      <p>{{ mediaLabels.continueChoice }}</p>
      <div class="ending-actions">
        <button v-if="nextStory" class="ending-primary" type="button" :disabled="!endingArmed" @click="closeEnding(); selectStoryId(nextStory.id)">{{ labels.nextStory }} →<strong>{{ localize(nextStory.title) }}</strong></button>
        <button v-else-if="nextGuideNode" class="ending-primary" type="button" :disabled="!endingArmed" @click="closeEnding(); showGuide(readingLineId, nextGuideNode.group)">{{ labels.continueGuide }} →<strong>{{ localize(nextGuideNode.label) }}</strong></button>
        <button type="button" :disabled="!endingArmed" @click="closeEnding(); returnToEpisodes()">← {{ labels.backToEpisodes }}</button>
        <button type="button" :disabled="!endingArmed" @click="closeEnding(); restart()">{{ labels.restart }}</button>
      </div>
    </dialog>
    <dialog id="story-log" ref="logDialog" class="story-log-dialog" aria-labelledby="story-log-title" @cancel.prevent="closeLog" @close="logOpen = false" @click="dismissLogBackdrop">
      <header><h2 id="story-log-title">{{ mediaLabels.log }}</h2><button type="button" @click="closeLog">{{ mediaLabels.close }}</button></header>
      <p class="story-log-title">{{ localize(manifest?.title || selectedStory?.title) }}</p>
      <div class="story-log-entries" tabindex="0" :aria-label="mediaLabels.log">
        <p v-if="!storyLog.length">{{ mediaLabels.emptyLog }}</p>
        <article v-for="(entry, index) in storyLog" :key="index" :class="{ choice: entry.kind === 'choice', current: entry.line === frame?.command?.line }">
          <strong>{{ entry.kind === 'choice' ? mediaLabels.choice : localize(entry.speaker) || labels.narrator }}</strong>
          <p>{{ localize(entry.text) }}</p>
        </article>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { authState } from '../services/auth.js';
import { useStoryReadingProgress } from '../services/storyReadingProgress.js';
import { normalizeChineseMusicText } from '../utils/s2tApiText.js';
import { loadLocalizedStory } from '../services/storyLocalizations.js';
import { storyMediaMessages } from '../i18n/storyMediaMessages.js';
import { createMemorySound } from '../utils/storyMemorySound.js';
import StoryPortrait from './StoryPortrait.vue';
import { resolveStoryPortrait } from '../utils/storyPortraits.js';
import { createStoryRunner, parseStoryScript } from '../utils/storyScript.js';
import { classifyStory, storyCategories, storyGroupLabel } from '../utils/storyCatalog.js';
import { prtsThumbnailUrl, fillStoryCoverFallbacks, storyCoverPlaceholder } from '../utils/storyImages.js';
import { archiveStory, compareStoryOrder } from '../utils/storyArchive.js';
import { collectionFamily, buildReadingRoute, readingGuideIntro, readingGuideSource } from '../utils/storyReadingOrder.js';

const { locale, t } = useI18n();
const mediaLabels = computed(() => storyMediaMessages[locale.value] || storyMediaMessages.en);
const emit = defineEmits(['sign-in']);
const copies = {
  'zh-TW': { title: '劇情', subtitle: '明日方舟 · 劇情演出', loading: '正在載入本地劇情…', narrator: '旁白', continue: '點擊或按空白鍵繼續', choose: '選擇回應', finished: '劇情結束', battle: '可以重新播放或選擇其他劇情。', restart: '重新播放', previous: '上一句', next: '下一句', audioOn: '🔊 音效開啟', audioOff: '🔇 開啟音效', videoHint: '影片播放完畢後繼續。', selectStory: '選擇劇情', note: '劇情及素材出處：明日方舟／PRTS。劇本與已匯入影音由本站載入，未匯入素材可能連線至 PRTS；部分表情與鏡頭指令仍未完整重現。' },
  'zh-CN': { title: '剧情', subtitle: '明日方舟 · 剧情演出', loading: '正在载入本地剧情…', narrator: '旁白', continue: '点击或按空格键继续', choose: '选择回应', finished: '剧情结束', battle: '可以重新播放或选择其他剧情。', restart: '重新播放', previous: '上一句', next: '下一句', audioOn: '🔊 音效开启', audioOff: '🔇 开启音效', videoHint: '视频播放完毕后继续。', selectStory: '选择剧情', note: '剧情及素材出处：明日方舟／PRTS。剧本与已导入影音由本站加载，未导入素材可能连接至 PRTS；部分表情与镜头指令仍未完整重现。' },
  en: { title: 'Story', subtitle: 'Arknights · story stage', loading: 'Loading local story…', narrator: 'Narration', continue: 'Click or press Space to continue', choose: 'Choose a response', finished: 'Story complete', battle: 'Restart or choose another story.', restart: 'Restart', previous: 'Previous', next: 'Next', audioOn: '🔊 Audio on', audioOff: '🔇 Enable audio', videoHint: 'Continue after the video.', selectStory: 'Select story', note: 'Story and art: Arknights / PRTS. Scripts and imported media load locally; remaining media may stream from PRTS; some expression and camera commands are not yet reproduced.' },
};
const labels = computed(() => copies[locale.value] || copies.en);
Object.assign(copies['zh-TW'], { archive: '劇情典藏', search: '搜尋劇情、章節、干員…', category: '劇情類型', chapter: '章節', allCategories: '全部類型', allChapters: '全部章節', stories: '篇劇情', pauseReel: 'Ⅱ 暫停膠捲', playReel: '▶ 播放膠捲', previousReel: '上一卷', nextReel: '下一卷', noResults: '沒有符合條件的劇情。', unavailable: '這篇劇情暫時無法載入，可由上方連結前往 PRTS 閱讀。', note: '劇情及素材出處：明日方舟／PRTS。劇本文本由本地快照載入，新增劇情的圖片與音訊依需要從 PRTS 載入；部分影片、表情與鏡頭演出尚未完整重現。' });
Object.assign(copies['zh-CN'], { archive: '剧情典藏', search: '搜索剧情、章节、干员…', category: '剧情类型', chapter: '章节', allCategories: '全部类型', allChapters: '全部章节', stories: '篇剧情', pauseReel: 'Ⅱ 暂停胶卷', playReel: '▶ 播放胶卷', previousReel: '上一卷', nextReel: '下一卷', noResults: '没有符合条件的剧情。', unavailable: '这篇剧情暂时无法载入，可由上方链接前往 PRTS 阅读。', note: '剧情及素材出处：明日方舟／PRTS。剧本文本由本地快照加载，新增剧情的图片与音频按需从 PRTS 加载；部分视频、表情与镜头演出尚未完整重现。' });
Object.assign(copies.en, { archive: 'Story archive', search: 'Search stories, chapters, operators…', category: 'Story type', chapter: 'Chapter', allCategories: 'All types', allChapters: 'All chapters', stories: 'stories', pauseReel: 'Ⅱ Pause reel', playReel: '▶ Play reel', previousReel: 'Previous reel', nextReel: 'Next reel', noResults: 'No matching stories.', unavailable: 'This story is currently unavailable. Open the PRTS link above to read it.', note: 'Story and art: Arknights / PRTS. Scripts are local snapshots; additional images and audio load from PRTS on demand. Some videos, expressions and camera effects are not yet reproduced.' });
copies['zh-TW'].externalVideo = '這段影片請前往 PRTS 觀看，觀看後可繼續下一段。';
copies['zh-CN'].externalVideo = '这段视频请前往 PRTS 观看，观看后可继续下一段。';
copies.en.externalVideo = 'Watch this video on PRTS, then continue to the next scene.';
Object.assign(copies['zh-TW'], { archiveHint: '依分類選擇你的下一段故事', section: '子分類', allSections: '全部子分類', allChapters: '全部章節／活動', allOperators: '全部干員', phase: '劇情段落', allPhases: '全部段落', previousReel: '上一頁', nextReel: '下一頁', phases: { before: '行動前', after: '行動後', node: '故事段落', branch: '分支結局', entry: '序曲' } });
Object.assign(copies['zh-CN'], { archiveHint: '按分类选择你的下一段故事', section: '子分类', allSections: '全部子分类', allChapters: '全部章节／活动', allOperators: '全部干员', phase: '剧情段落', allPhases: '全部段落', previousReel: '上一页', nextReel: '下一页', phases: { before: '行动前', after: '行动后', node: '故事段落', branch: '分支结局', entry: '序曲' } });
Object.assign(copies.en, { archiveHint: 'Browse your next story by category', section: 'Subcategory', allSections: 'All subcategories', allChapters: 'All chapters / events', allOperators: 'All operators', phase: 'Story segment', allPhases: 'All segments', previousReel: 'Previous page', nextReel: 'Next page', phases: { before: 'Before operation', after: 'After operation', node: 'Story segment', branch: 'Branch ending', entry: 'Prologue' } });
Object.assign(copies['zh-TW'], { chooseCollection: '先選活動名稱或章節名稱，再選擇劇情段落。', chooseEpisode: '選擇一段劇情，進入獨立演出畫面。', collectionNames: '活動／章節目錄', collections: '個活動／章節', browseEpisodes: '查看劇情段落', search: '搜尋活動名稱、章節名稱、干員…', searchEpisodes: '搜尋此章節的劇情段落…', backToEpisodes: '返回劇情段落', backToCollections: '返回活動／章節目錄' });
Object.assign(copies['zh-CN'], { chooseCollection: '先选活动名称或章节名称，再选择剧情段落。', chooseEpisode: '选择一段剧情，进入独立演出画面。', collectionNames: '活动／章节目录', collections: '个活动／章节', browseEpisodes: '查看剧情段落', search: '搜索活动名称、章节名称、干员…', searchEpisodes: '搜索本章节的剧情段落…', backToEpisodes: '返回剧情段落', backToCollections: '返回活动／章节目录' });
Object.assign(copies.en, { chooseCollection: 'Choose an event or chapter, then select a story segment.', chooseEpisode: 'Select a story to open the performance screen.', collectionNames: 'Events / chapters', collections: 'events / chapters', browseEpisodes: 'Browse stories', search: 'Search event names, chapter names, operators…', searchEpisodes: 'Search stories in this chapter…', backToEpisodes: 'Back to stories', backToCollections: 'Back to events / chapters' });
const root = `${import.meta.env.BASE_URL}story/`;
Object.assign(copies['zh-TW'], { view: '檢視方式', views: { grid: '▦ 封面', list: '☷ 清單', sequence: '◇ 觀看順序' }, sort: '排序方式', lineOrder: '樂章順序', releaseOrder: '實裝順序', nameOrder: '名稱排序', storyLines: '故事線', allLines: '全部故事線', order: '觀看順序', orderNote: '編號固定，不隨搜尋或段落篩選變動。', gameOrder: '依遊戲段落順序', catalogOrder: '遊戲排序優先；其餘依章節代碼排列，分支另列。', read: '已讀', unread: '未讀', baseArt: '基礎全身立繪', nextStory: '下一段劇情', previousStory: '上一段劇情', intersection: '故事線交點' });
Object.assign(copies['zh-CN'], { view: '查看方式', views: { grid: '▦ 封面', list: '☷ 列表', sequence: '◇ 观看顺序' }, sort: '排序方式', lineOrder: '乐章顺序', releaseOrder: '实装顺序', nameOrder: '名称排序', storyLines: '故事线', allLines: '全部故事线', order: '观看顺序', orderNote: '编号固定，不随搜索或段落筛选变化。', gameOrder: '按游戏段落顺序', catalogOrder: '游戏排序优先；其余按章节代码排列，分支另列。', read: '已读', unread: '未读', baseArt: '基础全身立绘', nextStory: '下一段剧情', previousStory: '上一段剧情', intersection: '故事线交点' });
Object.assign(copies.en, { view: 'View', views: { grid: '▦ Covers', list: '☷ List', sequence: '◇ Reading order' }, sort: 'Sort', lineOrder: 'Story line order', releaseOrder: 'Release order', nameOrder: 'Name', storyLines: 'Story lines', allLines: 'All story lines', order: 'Reading order', orderNote: 'Numbers stay fixed when you search or filter.', gameOrder: 'Game segment order', catalogOrder: 'Game order first; remaining stories by chapter code, branches separate.', read: 'Read', unread: 'Unread', baseArt: 'Base full illustration', nextStory: 'Next story', previousStory: 'Previous story', intersection: 'Story line intersection' });
function storedPreference(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function savePreference(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Reading works when storage is disabled. */ } }
const savedView = storedPreference('story-archive-view-v2', 'banner');
copies['zh-TW'].views = { banner: '劇情典藏', sequence: '敘事脈絡' };
copies['zh-CN'].views = { banner: '剧情典藏', sequence: '叙事脉络' };
copies.en.views = { banner: 'Story Archive', sequence: 'Narrative Paths' };
Object.assign(copies['zh-TW'], { series: '故事線／系列', allSeries: '全部故事線／系列', readingPath: '選擇閱讀路徑', routeBasis: '依章節與樂章交點編排，穿插相關活動。這是閱讀建議，並非故事內年代排序。', readBefore: '前一篇', readAfter: '下一篇', routeStart: '從這裡開始', routeEnd: '本路徑結束', relatedRoute: '查看這篇所屬的完整路徑', notCollected: '尚未收錄', segmentNote: '依本章段落順序閱讀；行動前、行動後及幕間各自保留位置。', branchNote: '此段為分支內容。請先讀同章主要段落，再依分支閱讀；列表位置不代表所有分支連續發生。' });
Object.assign(copies['zh-CN'], { series: '故事线／系列', allSeries: '全部故事线／系列', readingPath: '选择阅读路径', routeBasis: '按章节与乐章交点编排，穿插相关活动。这是阅读建议，并非故事内年代排序。', readBefore: '前一篇', readAfter: '下一篇', routeStart: '从这里开始', routeEnd: '本路径结束', relatedRoute: '查看这篇所属的完整路径', notCollected: '尚未收录', segmentNote: '按本章段落顺序阅读；行动前、行动后及幕间各自保留位置。', branchNote: '此段为分支内容。请先读同章主要段落，再按分支阅读；列表位置不代表所有分支连续发生。' });
Object.assign(copies.en, { series: 'Story line / series', allSeries: 'All story lines / series', readingPath: 'Reading route', routeBasis: 'A reading guide following chapter order and story-line intersections, with related events inserted. Not an in-world timeline.', readBefore: 'Previous', readAfter: 'Next', routeStart: 'Start here', routeEnd: 'End of route', relatedRoute: 'Explore the full related route', notCollected: 'Not collected yet', segmentNote: 'Follow chapter segment order, including before/after operation and interludes.', branchNote: 'This is a branch. Read the main chapter first; separate branches do not necessarily occur consecutively.' });
copies['zh-TW'].swipeHint = '短距離左右拖曳或使用滾輪 · 點選中央封面進入';
copies['zh-CN'].swipeHint = '短距离左右拖动或使用滚轮 · 点击中央封面进入';
copies.en.swipeHint = 'Short drags or mouse wheel · Open the center cover';
Object.assign(copies['zh-TW'], { refine: '進階篩選', playStory: '開始觀看' });
Object.assign(copies['zh-CN'], { refine: '进阶筛选', playStory: '开始观看' });
Object.assign(copies.en, { refine: 'Refine', playStory: 'Watch story' });

Object.assign(copies['zh-TW'], { routeBasis: '左右依站閱讀；跨線前置另列。章內依段落順序，系列選讀不強制先後。', extraContext: '建議補充', extraContextNote: '先補充相關人物背景，再接本篇；這是導讀建議，不是必須完成的解鎖條件。', returnGuide: '回到原閱讀位置', resumeGuide: '接續未讀', routeStation: '閱讀站', readFirst: '讀這篇之前，先補齊', continueGuide: '接下來讀', branchReading: '讀完後可延伸的故事線', relatedReading: '同系列選讀', currentGuide: '目前閱讀路徑', guideSource: '關聯來源：PRTS 曲譜；導讀文字為本站編排' });
Object.assign(copies['zh-CN'], { routeBasis: '左右按站阅读；跨线前置另列。章内按段落顺序，系列选读不强制先后。', extraContext: '建议补充', extraContextNote: '先补充相关人物背景，再接本篇；这是导读建议，不是必须完成的解锁条件。', returnGuide: '回到原阅读位置', resumeGuide: '接续未读', routeStation: '阅读站', readFirst: '读这一篇之前，先补齐', continueGuide: '接下来读', branchReading: '读完后可延伸的故事线', relatedReading: '同系列选读', currentGuide: '当前阅读路径', guideSource: '关联来源：PRTS 曲谱；导读文字为本站编排' });
Object.assign(copies.en, { routeBasis: 'Follow the route sideways. Cross-line prerequisites are listed separately; anthology entries are optional.', extraContext: 'Recommended background', extraContextNote: 'Read this for additional character context. This is reading advice, not an unlock requirement.', returnGuide: 'Return to reading position', resumeGuide: 'Continue unread stories', routeStation: 'Route stop', readFirst: 'Read these before starting', continueGuide: 'Read next', branchReading: 'Related routes to explore afterward', relatedReading: 'Another standalone story', currentGuide: 'Current reading route', guideSource: 'Connections: PRTS Score; reading guidance curated by this site' });
const advancedFilters = ref(false);
copies['zh-TW'].allCollections = '全部活動／章節／干員';
copies['zh-CN'].allCollections = '全部活动／章节／干员';
copies.en.allCollections = 'All events / chapters / operators';
copies['zh-TW'].progressNote = '已讀進度只記錄在這個瀏覽器；播放到段落結束後自動標記。';
copies['zh-CN'].progressNote = '已读进度仅保存在此浏览器；播放到段落结尾后自动标记。';
copies.en.progressNote = 'Reading progress is saved in this browser when you reach the end of a story.';
const viewMode = ref(['banner', 'sequence'].includes(savedView) ? savedView : 'banner');
const collectionSort = ref('line');
const selectedLine = ref('');
const selectedCollectionFilter = ref('');
const readingLineId = ref('MS');
const readingOffset = ref(0);
const archiveMetadata = ref({});
const { completed: completedStories, owner: progressOwner, status: progressStatus, syncing: progressSyncing, storageFailed: progressStorageFailed, importCount: progressImportCount, markCompleted, importGuest: importGuestProgress, sync: syncReadingProgress } = useStoryReadingProgress();
watch(viewMode, value => savePreference('story-archive-view-v2', value));
const screen = ref('collections');
const activeCollection = ref(null);
const catalogError = ref('');
const selectedStoryId = ref('');
const catalog = ref([]);
const selectedStory = computed(() => catalog.value.find(story => story.id === selectedStoryId.value));
const search = ref('');
const episodeSearch = ref('');
const selectedCategory = ref('');
const selectedSection = ref('');
const selectedGroup = ref('');
const selectedPhase = ref('');
const categories = computed(() => storyCategories.map(category => ({ ...category, count: catalog.value.filter(story => story.archiveCategory === category.id).length })).filter(category => category.count));
function categoryLabel(id) { const category = storyCategories.find(category => category.id === id); return category?.labels[locale.value] || category?.labels.en || ''; }
const categoryStories = computed(() => catalog.value.filter(story => !selectedCategory.value || story.archiveCategory === selectedCategory.value));
const sections = computed(() => [...new Set(categoryStories.value.filter(story => !selectedLine.value || collectionFamily({ ...story, category: story.archiveCategory }).id === selectedLine.value).map(story => story.section))]);
const sectionStories = computed(() => categoryStories.value.filter(story => !selectedSection.value || story.section === selectedSection.value));
function groupKey(story) { return `${story.archiveCategory}/${story.archiveCategory === 'beta' ? `${story.section}/` : ''}${story.group}`; }
const allCollections = computed(() => {
  const entries = new Map();
  for (const story of catalog.value) {
    const key = groupKey(story);
    const label = story.archiveCategory === 'beta' ? `${story.section} · ${story.group}` : storyGroupLabel(story);
    if (!entries.has(key)) entries.set(key, { key, group: story.group, label, count: 0, cover: '', operatorPortrait: story.operatorPortrait, category: story.archiveCategory, section: story.section, storyLine: story.storyLine, lineName: story.lineName, collectionOrder: story.collectionOrder, releaseTime: story.releaseTime, stories: [] });
    const collection = entries.get(key);
    collection.count++;
    collection.stories.push(story);
    if (!collection.cover && story.cover) collection.cover = story.cover;
  }
  return [...entries.values()].map(collection => ({ ...collection, stories: collection.stories.sort(compareStoryOrder), orderLabel: collection.collectionOrder == null ? 'ARCHIVE' : `${collection.storyLine === 'MS' ? 'EP' : collection.storyLine} ${String(collection.collectionOrder + (collection.storyLine === 'MS' ? 0 : 1)).padStart(2, '0')}` }));
});
const availableLines = computed(() => {
  const families = new Map();
  for (const collection of allCollections.value) {
    if (selectedCategory.value && collection.category !== selectedCategory.value) continue;
    const family = collectionFamily(collection);
    if (!families.has(family.id)) families.set(family.id, { ...family, count: 0 });
    families.get(family.id).count++;
  }
  return [...families.values()];
});
const readingRoute = computed(() => buildReadingRoute(archiveMetadata.value.lines?.find(line => line.id === readingLineId.value), allCollections.value, archiveMetadata.value.lines || []));
const guideTrail = ref([]);
const readingLineName = computed(() => archiveMetadata.value.lines?.find(line => line.id === readingLineId.value)?.name || '');
const activeGuideNode = computed(() => readingRoute.value.find(node => node.group === activeCollection.value?.group));
const nextGuideNode = computed(() => {
  if (viewMode.value !== 'sequence' || !activeGuideNode.value || activeGuideNode.value.independent) return null;
  return readingRoute.value[readingRoute.value.indexOf(activeGuideNode.value) + 1] || null;
});
const readingResumeIndex = computed(() => readingRoute.value.findIndex(node => !node.missing && node.stories?.some(story => !completedStories.value[story.id])));
function collectionReadLabel(group) {
  const collection = findCollection(group);
  if (!collection) return labels.value.notCollected;
  const count = collection.stories.filter(story => completedStories.value[story.id]).length;
  return count + ' / ' + collection.stories.length + ' ' + labels.value.read;
}
async function showGuide(id, group) {
  if (screen.value === 'player') clearPlayback();
  viewMode.value = 'sequence';
  screen.value = 'collections';
  await nextTick();
  readingLineId.value = id;
  await nextTick();
  readingOffset.value = Math.max(0, readingRoute.value.findIndex(node => node.group === group));
  focusScreenHeading();
}
function visitGuide(id, group) {
  if (!id) return;
  guideTrail.value.push({ line: readingLineId.value, group: rackActive.value?.group || activeCollection.value?.group });
  showGuide(id, group);
}
function returnToGuide() {
  const previous = guideTrail.value.pop();
  if (previous) showGuide(previous.line, previous.group);
}
const groups = computed(() => {
  const keys = new Set(sectionStories.value.map(groupKey));
  const lineIndex = id => (archiveMetadata.value.lines || []).findIndex(line => line.id === id);
  const nameCompare = (a, b) => localize(a.label).localeCompare(localize(b.label), locale.value, { numeric: true });
  return allCollections.value.filter(collection => keys.has(collection.key) && (!selectedLine.value || collectionFamily(collection).id === selectedLine.value)).sort((a, b) => {
    if (collectionSort.value === 'name' || (collectionSort.value === 'line' && selectedCategory.value === 'operator')) return nameCompare(a, b);
    if (collectionSort.value === 'release') return (a.releaseTime || Number.MAX_SAFE_INTEGER) - (b.releaseTime || Number.MAX_SAFE_INTEGER) || nameCompare(a, b);
    const indexA = lineIndex(a.storyLine), indexB = lineIndex(b.storyLine);
    return (indexA < 0 ? 99 : indexA) - (indexB < 0 ? 99 : indexB) || (a.collectionOrder ?? 999) - (b.collectionOrder ?? 999) || nameCompare(a, b);
  });
});
const filteredCollections = computed(() => {
  const query = search.value.trim().toLowerCase();
  return groups.value.filter(collection => (!selectedCollectionFilter.value || collection.key === selectedCollectionFilter.value) && (!query || [collection.label, ...collection.stories.map(story => `${story.title} ${story.group} ${story.page}`)].some(text => text.toLowerCase().includes(query) || localize(text).toLowerCase().includes(query))));
});
const groupStories = computed(() => catalog.value.filter(story => groupKey(story) === selectedGroup.value).sort(compareStoryOrder));
const completedCount = computed(() => groupStories.value.filter(story => completedStories.value[story.id]).length);
function episodeNumber(story) { return String(groupStories.value.findIndex(entry => entry.id === story?.id) + 1).padStart(3, '0'); }
const previousStory = computed(() => groupStories.value[groupStories.value.findIndex(story => story.id === selectedStoryId.value) - 1]);
const nextStory = computed(() => groupStories.value[groupStories.value.findIndex(story => story.id === selectedStoryId.value) + 1]);
const activeRoute = computed(() => readingRoute.value);
function findCollection(group) { return allCollections.value.find(collection => collection.group === group); }
const phases = computed(() => ['before', 'after', 'node', 'branch', 'entry'].filter(phase => groupStories.value.some(story => story.phase === phase)));
const filteredStories = computed(() => {
  const query = episodeSearch.value.trim().toLowerCase();
  return groupStories.value.filter(story => (!selectedPhase.value || story.phase === selectedPhase.value) && (!query || localize(`${story.title} ${storyGroupLabel(story)} ${story.page}`).toLowerCase().includes(query) || `${story.title} ${story.group}`.toLowerCase().includes(query)));
});
const collectionOffset = ref(0);
const reelOffset = ref(0);
const rackEntries = computed(() => screen.value === 'collections'
  ? viewMode.value === 'sequence' ? readingRoute.value.map(node => ({ ...node, subtitle: node.role })) : filteredCollections.value.map(collection => ({ ...collection, subtitle: `${collection.orderLabel} · ${categoryLabel(collection.category)}` }))
  : (viewMode.value === 'sequence' ? groupStories.value : filteredStories.value).map(story => ({ ...story, key: story.id, label: story.title, orderLabel: episodeNumber(story), subtitle: `${story.storyCode || episodeNumber(story)} · ${labels.value.phases[story.phase]}` })));
const rackIndex = computed({
  get: () => screen.value === 'collections' ? viewMode.value === 'sequence' ? readingOffset.value : collectionOffset.value : reelOffset.value,
  set: value => {
    const index = Math.max(0, Math.min(rackEntries.value.length - 1, Math.round(Number(value) || 0)));
    if (screen.value === 'collections' && viewMode.value === 'sequence') readingOffset.value = index;
    else if (screen.value === 'collections') collectionOffset.value = index;
    else reelOffset.value = index;
  },
});
const rackActive = computed(() => rackEntries.value[rackIndex.value]);
const visibleRackEntries = computed(() => rackEntries.value.slice(Math.max(0, rackIndex.value - 3), rackIndex.value + 4).map((entry, index) => ({ ...entry, index: Math.max(0, rackIndex.value - 3) + index })));
const rackElement = ref(null);
const rackWidth = ref(1000);
const rackStep = computed(() => Math.max(160, Math.min(390, rackWidth.value * .68)));
const rackDragging = ref(false);
const rackDragOffset = ref(0);
const rackAnimating = ref(false);
let rackMotionFrame = 0;
let rackDragFrame = 0;
let rackPendingDelta = 0;
let rackMotionTarget = 0;
let rackObserver = null;
let rackPointer = null;
let suppressRackClick = false;
let rackClickTimer = null;
let rackWheelAt = 0;
let rackWheelDelta = 0;
function rackCardStyle(index) {
  const offset = index - rackIndex.value;
  const distance = Math.abs(offset + rackDragOffset.value / rackStep.value);
  return { '--rack-x': `${offset * rackStep.value + rackDragOffset.value}px`, '--rack-scale': 1 - Math.min(1, distance) * .05, '--rack-turn': '0deg', '--rack-depth': '0px', '--rack-brightness': Math.max(.6, 1 - distance * .12), zIndex: 10 - distance };
}
function rackPosition() { return rackIndex.value - rackDragOffset.value / rackStep.value; }
function clampRack(position) { return Math.max(0, Math.min(rackEntries.value.length - 1, position)); }
function setRackPosition(position) {
  rackIndex.value = clampRack(Math.round(position));
  rackDragOffset.value = (rackIndex.value - position) * rackStep.value;
}
function stopRackMotion() {
  cancelAnimationFrame(rackMotionFrame);
  rackMotionFrame = 0;
  rackAnimating.value = false;
}
function seekRack(index) {
  const start = rackPosition();
  const target = clampRack(Math.round(index));
  stopRackMotion();
  rackMotionTarget = target;
  if (Math.abs(target - start) < .001 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setRackPosition(target);
    return;
  }
  rackAnimating.value = true;
  const began = performance.now();
  const duration = Math.min(420, 230 + Math.abs(target - start) * 55);
  function animate(now) {
    const progress = Math.min(1, (now - began) / duration);
    setRackPosition(start + (target - start) * (1 - Math.pow(1 - progress, 3)));
    if (progress < 1) rackMotionFrame = requestAnimationFrame(animate);
    else { setRackPosition(target); stopRackMotion(); }
  }
  rackMotionFrame = requestAnimationFrame(animate);
}
function moveRack(direction, focus = false) {
  unlockMemorySound();
  seekRack((rackAnimating.value ? rackMotionTarget : rackIndex.value) + direction);
  if (focus) rackElement.value?.focus({ preventScroll: true });
}
function scrubRack(event) { unlockMemorySound(); cancelRackDrag(); setRackPosition(clampRack(Number(event.target.value))); }
function activateRackCard(index) {
  unlockMemorySound();
  if (suppressRackClick) return;
  if (index !== rackIndex.value) { seekRack(index); return; }
  const entry = rackActive.value;
  if (!entry || entry.missing) return;
  if (screen.value === 'collections') openCollection(entry.collectionKey ? allCollections.value.find(collection => collection.key === entry.collectionKey) : entry);
  else selectStoryId(entry.id);
}
function beginRackDrag(event) {
  unlockMemorySound();
  if (!event.isPrimary || event.button !== 0) return;
  stopRackMotion();
  clearTimeout(rackClickTimer);
  suppressRackClick = false;
  rackPointer = { id: event.pointerId, origin: event.clientX, start: rackPosition(), lastX: event.clientX, lastTime: performance.now(), velocity: 0, gain: event.pointerType === 'mouse' ? 3.2 : 1.6, element: event.currentTarget };
}
function flushRackDrag() {
  cancelAnimationFrame(rackDragFrame);
  rackDragFrame = 0;
  if (!rackPendingDelta) return;
  const position = rackPosition() - rackPendingDelta / rackStep.value;
  const bounded = clampRack(position);
  setRackPosition(bounded + Math.max(-.16, Math.min(.16, (position - bounded) * .25)));
  rackPendingDelta = 0;
}
function dragRack(event) {
  if (!rackPointer || rackPointer.id !== event.pointerId) return;
  if (event.pointerType === 'mouse' && event.buttons === 0) { cancelRackDrag(); return; }
  const pointer = rackPointer;
  if (!rackDragging.value && Math.abs(event.clientX - pointer.origin) < 6) return;
  if (!rackDragging.value) { rackDragging.value = true; pointer.element.setPointerCapture(event.pointerId); }
  suppressRackClick = true;
  const now = performance.now();
  const delta = (event.clientX - pointer.lastX) * pointer.gain;
  pointer.velocity = pointer.velocity * .6 + delta / Math.max(8, now - pointer.lastTime) * .4;
  pointer.lastX = event.clientX; pointer.lastTime = now;
  rackPendingDelta += delta;
  if (!rackDragFrame) rackDragFrame = requestAnimationFrame(flushRackDrag);
}
function finishRackDrag(cancelled) {
  const pointer = rackPointer;
  if (!pointer) return;
  flushRackDrag();
  rackPointer = null;
  const dragged = rackDragging.value;
  rackDragging.value = false;
  if (pointer.element.hasPointerCapture(pointer.id)) pointer.element.releasePointerCapture(pointer.id);
  if (!cancelled) {
    const velocity = performance.now() - pointer.lastTime < 100 ? pointer.velocity : 0;
    let target = Math.round(rackPosition() - Math.max(-1.5, Math.min(1.5, velocity * 140 / rackStep.value)));
    // A deliberate short swipe advances one cover even without a fast release.
    const travel = pointer.lastX - pointer.origin;
    if (dragged && Math.abs(travel) >= 22 && target === Math.round(pointer.start)) target -= Math.sign(travel);
    seekRack(target);
  }
  if (suppressRackClick) rackClickTimer = window.setTimeout(() => { suppressRackClick = false; }, 250);
}
function endRackDrag() { finishRackDrag(false); }
function cancelRackDrag() {
  finishRackDrag(true);
  stopRackMotion();
  cancelAnimationFrame(rackDragFrame);
  rackDragFrame = 0;
  rackPendingDelta = 0;
  rackDragOffset.value = 0;
}
function lostRackCapture() { if (rackPointer) cancelRackDrag(); }
function leaveRack(event) { if (rackPointer && event.pointerType === 'mouse' && !rackDragging.value) cancelRackDrag(); }
function guardRackClick(event) { if (suppressRackClick) { event.preventDefault(); event.stopPropagation(); suppressRackClick = false; } }
function wheelRack(event) {
  if (event.ctrlKey || rackPointer || !rackEntries.value.length) return;
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
  if (!delta) return;
  event.preventDefault(); event.stopPropagation();
  const now = performance.now();
  if (now - rackWheelAt < 110) return;
  if (now - rackWheelAt > 500 || Math.sign(delta) !== Math.sign(rackWheelDelta)) rackWheelDelta = 0;
  rackWheelDelta += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rackWidth.value : 1);
  if (Math.abs(rackWheelDelta) < 30) return;
  moveRack(Math.sign(rackWheelDelta)); rackWheelDelta = 0; rackWheelAt = now;
}
watch(rackElement, element => {
  rackObserver?.disconnect();
  if (!element) return;
  rackWidth.value = element.clientWidth;
  rackObserver = new ResizeObserver(entries => { rackWidth.value = entries[0].contentRect.width; });
  rackObserver.observe(element);
}, { flush: 'post' });
watch([screen, search, episodeSearch, selectedCategory, selectedSection, selectedLine, selectedCollectionFilter, collectionSort, selectedPhase, readingLineId, viewMode], cancelRackDrag);
watch(readingLineId, () => { readingOffset.value = 0; });
watch(viewMode, () => {
  reelOffset.value = 0;
  if (viewMode.value === 'sequence') {
    if (screen.value !== 'collections' && activeCollection.value?.storyLine) readingLineId.value = activeCollection.value.storyLine;
    else if (selectedLine.value.startsWith('line:')) readingLineId.value = selectedLine.value.slice(5);
  }
});
let prtsVariables = {};
const thumbnailIndex = ref({});
const originalImages = new Set();
watch(selectedCategory, () => { selectedSection.value = ''; selectedLine.value = ''; selectedCollectionFilter.value = ''; selectedGroup.value = ''; selectedPhase.value = ''; });
watch(selectedLine, () => { selectedSection.value = ''; selectedCollectionFilter.value = ''; });
watch(selectedSection, () => { selectedCollectionFilter.value = ''; selectedGroup.value = ''; selectedPhase.value = ''; });
watch(selectedGroup, () => { selectedPhase.value = ''; });
watch([search, selectedCategory, selectedSection, selectedLine, selectedCollectionFilter, collectionSort], () => { collectionOffset.value = 0; });
watch([episodeSearch, selectedGroup, selectedPhase], () => { reelOffset.value = 0; });
function coverPath(url) {
  if (!url || url === storyCoverPlaceholder) return `${root}${storyCoverPlaceholder}`;
  return thumbnailIndex.value[url] ? `${root}${thumbnailIndex.value[url]}` : prtsThumbnailUrl(url);
}
function handleCoverError(event) {
  const image = event.target;
  const original = image.dataset.originalSrc;
  const fallback = new URL(`${root}${storyCoverPlaceholder}`, window.location.href).href;
  if (image.src === fallback) return;
  if (image.dataset.storyCover && !image.dataset.coverFallbackUsed) {
    image.dataset.coverFallbackUsed = 'true';
    const storyCover = new URL(image.dataset.storyCover, window.location.href).href;
    if (image.src !== storyCover) { image.src = storyCover; image.parentElement.classList.remove('operator-portrait'); return; }
  }
  if (original?.startsWith('https://') && image.src !== new URL(original).href) image.src = original;
  else image.src = fallback;
}
function handleSceneImageError(event) {
  const image = event.target;
  const original = image.dataset.originalSrc;
  if (original && image.src !== new URL(original, window.location.href).href) {
    originalImages.add(original);
    image.src = original;
  } else image.style.display = 'none';
}
const base = computed(() => `${root}${selectedStoryId.value}/`);
const frame = ref(null);
const manifest = ref(null);
const error = ref('');
const visibleText = ref('');
const isTyping = ref(false);
const canGoBack = ref(false);
const audioEnabled = ref(storedPreference('story-audio-enabled', true) === true);
const savedAudioVolume = Number(storedPreference('story-audio-volume', .5));
const audioVolume = ref(Number.isFinite(savedAudioVolume) ? Math.min(1, Math.max(0, savedAudioVolume)) : .5);
const sceneVideo = ref(null);
const sceneCamera = ref(null);
const characterIndex = ref({});
const endingDialog = ref(null);
const endingOpen = ref(false);
const endingArmed = ref(false);
let endingGuardTimer;
let endingReturnFocus;
let cameraAnimation;
let cameraRequest = 0;
const portraitVisual = name => resolveStoryPortrait(name, characterIndex.value, prtsVariables);
function stopCameraMotion() { cameraRequest++; cameraAnimation?.cancel(); cameraAnimation = null; }
async function playCameraMotion(currentFrame) {
  stopCameraMotion();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || currentFrame?.type === 'video') return;
  const token = cameraRequest;
  await nextTick();
  for (const event of currentFrame?.events || []) {
    if (event.type !== 'cameraShake' || !sceneCamera.value || token !== cameraRequest) continue;
    if (event.stop) { cameraAnimation?.cancel(); continue; }
    const duration = Math.max(0, Math.min(10, event.duration));
    if (!duration) continue;
    const steps = Math.max(2, Math.min(300, Math.round(duration * Math.max(1, event.vibrato))));
    const keyframes = Array.from({ length: steps + 1 }, (_, index) => {
      const strength = index === 0 || index === steps ? 0 : event.fadeout ? 1 - index / steps : 1;
      const x = Math.sin(index * 2.4) * Math.min(40, Math.abs(event.x)) * strength;
      const y = Math.cos(index * 1.7) * Math.min(40, Math.abs(event.y)) * strength;
      return { transform: `translate(${x}px, ${y}px)` };
    });
    cameraAnimation = sceneCamera.value.animate(keyframes, { duration: duration * 1000 });
    try { await cameraAnimation.finished; } catch { return; }
  }
}
async function openEnding() {
  if (endingOpen.value) return;
  closeLog();
  endingReturnFocus = document.activeElement;
  endingOpen.value = true;
  await nextTick();
  if (endingOpen.value && frame.value?.type === 'end' && !endingDialog.value?.open) {
    endingDialog.value?.showModal();
    endingDialog.value?.querySelector('#story-ending-title')?.focus({ preventScroll: true });
    endingGuardTimer = setTimeout(() => { if (endingOpen.value) endingArmed.value = true; }, 700);
  }
}
function resetEndingGuard() { clearTimeout(endingGuardTimer); endingArmed.value = false; endingOpen.value = false; }
function guardEndingClick(event) {
  if (!endingArmed.value || event.detail > 1) { event.preventDefault(); event.stopPropagation(); }
}
function guardEndingKey(event) {
  if (['Enter', 'Space'].includes(event.code) && (!endingArmed.value || event.repeat)) { event.preventDefault(); event.stopPropagation(); }
}
function closeEnding() { endingDialog.value?.close(); resetEndingGuard(); endingReturnFocus?.focus?.({ preventScroll: true }); }
const logDialog = ref(null);
const logOpen = ref(false);
const storyLog = ref([]);
let loggedFrames = new WeakSet();
let logReturnFocus;
const memorySound = createMemorySound();
let memoryInteractionAt = -Infinity;
function unlockMemorySound() { memoryInteractionAt = performance.now(); if (audioEnabled.value) memorySound.unlock(); }
watch(rackIndex, (index, previous) => {
  if (index !== previous && audioEnabled.value && performance.now() - memoryInteractionAt < 1500) memorySound.play(audioVolume.value);
});
function applyVideoVolume() { if (sceneVideo.value) { sceneVideo.value.volume = audioVolume.value; sceneVideo.value.muted = !audioEnabled.value; } }
function applyAudioSettings(audio) { audio.volume = volumeOf(audio.storyVolume ?? 1) * audioVolume.value; audio.muted = !audioEnabled.value; }
watch([audioVolume, audioEnabled], () => {
  savePreference('story-audio-volume', audioVolume.value);
  for (const audio of [introAudio, musicAudio, ...soundEffects]) if (audio) applyAudioSettings(audio);
  applyVideoVolume();
});
async function openLog() {
  logReturnFocus = document.activeElement;
  logOpen.value = true;
  await nextTick();
  if (!logOpen.value) return;
  if (!logDialog.value?.open) logDialog.value?.showModal();
  logDialog.value?.querySelector('.story-log-entries')?.lastElementChild?.scrollIntoView({ block: 'nearest' });
}
function closeLog() { logDialog.value?.close(); logOpen.value = false; logReturnFocus?.focus?.({ preventScroll: true }); }
function dismissLogBackdrop(event) {
  if (event.target !== logDialog.value) return;
  const box = logDialog.value.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeLog();
}

const audioProblem = ref('');
const videoFailed = ref(false);
const videoAttempt = ref(0);
const commandCount = ref(0);
let runner = null;
let timer = null;
let sourceText = '';
const translationStatus = ref('original');
const localizedTitles = ref({});
const translationNotice = computed(() => {
  const messages = {
    en: { game: 'English game text · Switch language to restart this segment.', missing: 'English text is not available for this segment. Showing the Chinese original.', failed: 'English text could not be loaded. Showing the Chinese original.' },
    ja: { game: '日本語版ゲームテキスト · 言語を切り替えると、このエピソードを最初から再生します。', missing: 'このエピソードの日本語訳は未収録です。中国語の原文を表示しています。', failed: '日本語訳を読み込めませんでした。中国語の原文を表示しています。' },
    ko: { game: '한국어판 게임 텍스트 · 언어를 변경하면 현재 에피소드를 처음부터 재생합니다.', missing: '이 에피소드의 한국어 번역이 아직 없습니다. 중국어 원문을 표시합니다.', failed: '한국어 번역을 불러오지 못했습니다. 중국어 원문을 표시합니다.' },
  };
  return messages[locale.value]?.[translationStatus.value] || '';
});
watch(locale, () => { if (screen.value === 'player') loadStory(); });
let commands = [];
let loadingToken = 0;
let disposed = false;
let musicAudio = null;
let introAudio = null;
let currentMusicKey = '';
const soundEffects = new Set();
const preloaded = new Set();
const preloadingImages = new Map();
const preloadQueue = [];
let preconnectLink = null;

function localize(text) {
  text = localizedTitles.value[locale.value]?.[String(text || '')] || text;
  return normalizeChineseMusicText(String(text || '').replaceAll('{@nickname}', ({ en: 'Doctor', ja: 'ドクター', ko: '박사' }[locale.value] || '博士')), locale.value);
}

function originalAssetPath(id) {
  const portrait = portraitVisual(id);
  if (portrait?.baseUrl) return portrait.baseUrl;
  const raw = String(id || '').split('#')[0];
  const key = raw.startsWith('$') ? prtsVariables[raw.slice(1)] || raw : raw;
  const entry = manifest.value?.assets?.[key];
  return entry?.url || (entry?.path ? `${base.value}${entry.path}` : '');
}

function assetPath(id) {
  const original = originalAssetPath(id);
  const width = /\/Avg_bg_/i.test(original) ? 1280 : 960;
  return originalImages.has(original) ? original : prtsThumbnailUrl(original, width);
}

function backgroundPreview(id) {
  const thumbnail = thumbnailIndex.value[originalAssetPath(id)];
  return thumbnail ? `${root}${thumbnail}` : '';
}

function audioPath(entry) { return entry?.path ? `${base.value}${entry.path}` : entry?.url || ''; }

function videoPath(id) {
  const key = String(id || '').replace(/^\$/, '');
  const entry = manifest.value?.videos?.[key] || manifest.value?.videos?.[prtsVariables[key]];
  return audioPath(entry);
}
const shadeStyle = computed(() => {
  const shade = frame.value?.state?.shade;
  return shade ? { backgroundColor: `rgba(${shade.red}, ${shade.green}, ${shade.blue}, ${shade.alpha})` } : {};
});

function clearTyping() {
  if (timer) window.clearInterval(timer);
  timer = null;
}

function preloadVisual(id, priority = 'low') {
  const url = assetPath(String(id || '').split('#')[0]);
  if (!url || preloaded.has(url)) return false;
  if (priority === 'low' && preloadQueue.length >= 6) return false;
  preloaded.add(url);
  const job = { url, original: originalAssetPath(id), priority };
  if (priority === 'high') preloadQueue.unshift(job);
  else preloadQueue.push(job);
  drainPreloadQueue();
  return true;
}

function clearImagePreloads() {
  for (const job of preloadQueue) preloaded.delete(job.url);
  preloadQueue.length = 0;
  for (const [url, image] of preloadingImages) {
    image.onload = null;
    image.onerror = null;
    image.removeAttribute('src');
    preloaded.delete(url);
  }
  preloadingImages.clear();
}

function drainPreloadQueue() {
  if (disposed || screen.value !== 'player') return;
  while (preloadingImages.size < 3 && preloadQueue.length) {
    const { url, original, priority } = preloadQueue.shift();
    const image = new window.Image();
    image.decoding = 'async';
    image.fetchPriority = priority;
    preloadingImages.set(url, image);
    const finish = () => { preloadingImages.delete(url); drainPreloadQueue(); };
    image.onload = finish;
    image.onerror = () => {
      preloaded.delete(url);
      if (url !== original) {
        originalImages.add(original);
        if (!preloaded.has(original)) { preloaded.add(original); preloadQueue.unshift({ url: original, original, priority }); }
      }
      finish();
    };
    image.src = url;
  }
}

function preloadUpcoming() {
  if (!frame.value || screen.value !== 'player') return;
  for (const id of [frame.value.state.background, frame.value.state.image, ...frame.value.state.portraits.map(p => p.name)].filter(Boolean)) preloadVisual(id, 'high');
  const line = frame.value?.command?.line || 0;
  let count = 0;
  let scanned = 0;
  for (const command of commands) {
    if (command.line <= line) continue;
    if (++scanned > 120) return;
    const a = command.attributes;
    const ids = ['background', 'image', 'imagetween'].includes(command.kind)
      ? [a.image] : ['character', 'charslot'].includes(command.kind) ? [a.name, a.name2, a.name3] : [];
    for (const id of ids.filter(Boolean)) {
      if (preloadVisual(id)) count += 1;
      if (count >= 3) return;
    }
  }
}

function audioEntry(key) {
  const entries = manifest.value?.audio || {};
  return entries[key] || entries[Object.keys(entries).find(name => name.toLowerCase() === String(key).toLowerCase())];
}
const volumeOf = value => Number.isFinite(Number(value)) ? Math.min(1, Math.max(0, Number(value))) : 1;
function reportAudio(error) { audioProblem.value = error?.name === 'NotAllowedError' ? 'blocked' : 'failed'; }
function stopMusic() {
  for (const audio of [introAudio, musicAudio]) if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
  introAudio = musicAudio = null;
  currentMusicKey = '';
}
function stopEffects(channel) {
  for (const effect of soundEffects) {
    if (channel && effect.storyChannel !== channel) continue;
    clearTimeout(effect.storyTimer);
    effect.onended = effect.onerror = null;
    effect.pause(); effect.removeAttribute('src'); effect.load();
    soundEffects.delete(effect);
  }
}
function syncMusic() {
  const music = frame.value?.state?.music;
  const playable = !['video', 'end'].includes(frame.value?.type);
  const key = playable && music?.key ? music.key + ':' + music.instance : '';
  const volume = volumeOf(music?.volume);
  if (key === currentMusicKey) {
    for (const audio of [introAudio, musicAudio]) if (audio) { audio.storyVolume = volume; applyAudioSettings(audio); }
    return;
  }
  stopMusic();
  if (!key) return;
  const loopEntry = audioEntry(music.key);
  if (!loopEntry) { audioProblem.value = 'missing'; return; }
  currentMusicKey = key;
  const playLoop = () => {
    if (currentMusicKey !== key || musicAudio) return;
    if (introAudio) { introAudio.onended = introAudio.onerror = null; introAudio.pause(); introAudio.removeAttribute('src'); introAudio.load(); introAudio = null; }
    const audio = musicAudio = new Audio(audioPath(loopEntry));
    audio.loop = true; audio.storyVolume = volumeOf(frame.value?.state?.music?.volume); applyAudioSettings(audio);
    audio.onerror = () => { if (musicAudio === audio) reportAudio(); };
    audio.play().catch(error => { if (musicAudio === audio) reportAudio(error); });
  };
  const introEntry = audioEntry(music.intro);
  if (introEntry && music.intro !== music.key) {
    const audio = introAudio = new Audio(audioPath(introEntry));
    audio.storyVolume = volume; applyAudioSettings(audio); audio.onended = playLoop; audio.onerror = playLoop;
    audio.play().catch(error => { if (introAudio !== audio || currentMusicKey !== key) return; if (error.name === 'NotAllowedError') reportAudio(error); else playLoop(); });
  } else playLoop();
}
function startEffect(event) {
  const entry = audioEntry(event.key);
  if (!entry) { audioProblem.value = 'missing'; return; }
  stopEffects(event.channel);
  const effect = new Audio(audioPath(entry));
  effect.storyChannel = event.channel; effect.storyInstance = event.instance;
  effect.loop = event.loop; effect.storyVolume = volumeOf(event.volume); applyAudioSettings(effect);
  soundEffects.add(effect);
  effect.onended = () => soundEffects.delete(effect);
  effect.onerror = () => { if (soundEffects.has(effect)) { soundEffects.delete(effect); reportAudio(); } };
  const play = () => effect.play().catch(error => { if (soundEffects.has(effect)) { soundEffects.delete(effect); reportAudio(error); } });
  if (event.delay) effect.storyTimer = setTimeout(() => { effect.storyTimer = null; play(); }, event.delay * 1000); else play();
}
function playFrameSounds(replayEvents = true) {
  if (!frame.value || ['video', 'end'].includes(frame.value.type)) { stopEffects(); return; }
  if (replayEvents) for (const event of frame.value.events || []) {
    if (event.type === 'stopSound') stopEffects(event.channel);
    else if (event.type === 'soundVolume') {
      for (const effect of soundEffects) if (!event.channel || effect.storyChannel === event.channel) { effect.storyVolume = volumeOf(event.volume); applyAudioSettings(effect); }
    } else if (event.type === 'sound') startEffect(event);
  }
  const loops = frame.value.state.sounds || {};
  for (const effect of [...soundEffects]) if (effect.loop && loops[effect.storyChannel]?.instance !== effect.storyInstance) stopEffects(effect.storyChannel);
  for (const event of Object.values(loops)) {
    const existing = [...soundEffects].find(effect => effect.loop && effect.storyChannel === event.channel && effect.storyInstance === event.instance);
    if (existing) { existing.storyVolume = volumeOf(event.volume); applyAudioSettings(existing); } else startEffect(event);
  }
}
function retryAudio() {
  audioProblem.value = '';
  stopMusic(); stopEffects();
  syncMusic(); playFrameSounds(false);
}
function toggleAudio() {
  audioEnabled.value = !audioEnabled.value;
  savePreference('story-audio-enabled', audioEnabled.value);
  audioProblem.value = '';
  if (audioEnabled.value) {
    memorySound.unlock();
    for (const audio of [introAudio, musicAudio, ...soundEffects]) if (audio && audio.paused && !audio.ended && !audio.storyTimer) audio.play().catch(reportAudio);
  }
}

let suppressSound = false;
watch([frame, locale], ([nextFrame], [previousFrame]) => {
  if (nextFrame !== previousFrame) {
    if (suppressSound) stopCameraMotion(); else playCameraMotion(nextFrame);
    if (screen.value === 'player' && nextFrame?.type === 'end') openEnding(); else closeEnding();
  }
  if (nextFrame?.type === 'dialogue' && !loggedFrames.has(nextFrame)) {
    loggedFrames.add(nextFrame);
    storyLog.value.push({ kind: 'dialogue', speaker: nextFrame.speaker, text: nextFrame.text, line: nextFrame.command?.line });
  }
  if (screen.value === 'player' && nextFrame?.type === 'end' && selectedStoryId.value) {
    markCompleted(selectedStoryId.value);
  }
  clearTyping();
  preloadUpcoming();
  syncMusic();
  if (nextFrame !== previousFrame) {
    videoFailed.value = false;
    if (suppressSound) stopEffects();
    playFrameSounds(!suppressSound);
  }
  suppressSound = false;
  if (frame.value?.type !== 'dialogue') {
    visibleText.value = '';
    isTyping.value = false;
    return;
  }
  const chars = Array.from(localize(frame.value.text));
  let count = 0;
  visibleText.value = '';
  isTyping.value = true;
  timer = window.setInterval(() => {
    count = Math.min(chars.length, count + 2);
    visibleText.value = chars.slice(0, count).join('');
    if (count === chars.length) {
      isTyping.value = false;
      clearTyping();
    }
  }, 25);
}, { flush: 'sync' });

function advance() {
  if (!runner || frame.value?.type !== 'dialogue') return;
  if (isTyping.value) {
    clearTyping();
    visibleText.value = localize(frame.value.text);
    isTyping.value = false;
    return;
  }
  frame.value = runner.next();
  canGoBack.value = runner.canPrevious();
}

function choose(value) {
  if (!runner) return;
  const choice = frame.value?.options?.find(option => option.value === value);
  if (choice) storyLog.value.push({ kind: 'choice', text: choice.label, line: frame.value.command?.line });
  frame.value = runner.choose(value);
  canGoBack.value = runner.canPrevious();
}

function goBack() {
  if (!runner) return;
  suppressSound = true;
  frame.value = runner.previous();
  canGoBack.value = runner.canPrevious();
}

function advanceVideo() {
  if (!runner || frame.value?.type !== 'video') return;
  frame.value = runner.next();
  canGoBack.value = runner.canPrevious();
}

function restart() {
  if (!manifest.value || !sourceText) return;
  stopMusic(); stopEffects(); audioProblem.value = '';
  closeLog(); storyLog.value = []; loggedFrames = new WeakSet();
  runner = createStoryRunner(commands);
  frame.value = runner.next();
  canGoBack.value = false;
}

function handleKeydown(event) {
  if (screen.value !== 'player' || logOpen.value || endingOpen.value) return;
  if (event.target instanceof HTMLElement && ['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'VIDEO'].includes(event.target.tagName)) return;
  if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); advance(); }
  if (event.code === 'ArrowLeft') goBack();
}

async function loadStory() {
  const token = ++loadingToken;
  closeEnding(); stopCameraMotion();
  closeLog();
  storyLog.value = [];
  loggedFrames = new WeakSet();
  clearImagePreloads();
  stopMusic();
  clearTyping();
  stopEffects();
  audioProblem.value = '';
  manifest.value = null;
  frame.value = null;
  error.value = '';
  translationStatus.value = 'original';
  sourceText = '';
  commands = [];
  runner = null;
  try {
    if (selectedStory.value?.available === false) throw new Error(labels.value.unavailable);
    const [manifestResponse, scriptResponse] = await Promise.all([fetch(`${base.value}manifest.json`), fetch(`${base.value}script.txt`)]);
    if (!manifestResponse.ok || !scriptResponse.ok) throw new Error(labels.value.unavailable);
    const [nextManifest, nextSource] = await Promise.all([manifestResponse.json(), scriptResponse.text()]);
    if (token !== loadingToken) return;
    manifest.value = nextManifest;
    preloadVisual(nextManifest.firstVisual, 'high');
    const localized = await loadLocalizedStory({ root, storyId: selectedStoryId.value, locale: locale.value, source: nextSource });
    if (token !== loadingToken) return;
    translationStatus.value = localized.status;
    sourceText = localized.source;
    if (token !== loadingToken) return;
    commands = parseStoryScript(sourceText);
    commandCount.value = commands.length;
    restart();
  } catch (cause) {
    if (token === loadingToken) error.value = cause.message || String(cause);
  }
}

function selectStoryId(id) {
  if (screen.value === 'player' && selectedStoryId.value === id) return;
  selectedStoryId.value = id;
  screen.value = 'player';
  loadStory();
  focusScreenHeading();
}

function openCollection(collection) {
  if (!collection) return;
  activeCollection.value = collection;
  if (viewMode.value === 'sequence') {
    const index = readingRoute.value.findIndex(node => node.group === collection.group);
    if (index >= 0) readingOffset.value = index;
  }
  selectedGroup.value = collection.key;
  episodeSearch.value = '';
  selectedPhase.value = '';
  reelOffset.value = 0;
  screen.value = 'episodes';
  focusScreenHeading();
}

function clearPlayback() {
  loadingToken += 1;
  clearImagePreloads();
  clearTyping();
  stopMusic();
  stopEffects();
  audioProblem.value = '';
  runner = null;
  frame.value = null;
  manifest.value = null;
  sourceText = '';
  translationStatus.value = 'original';
  commands = [];
  error.value = '';
  canGoBack.value = false;
}

function returnToEpisodes() {
  clearPlayback();
  screen.value = activeCollection.value ? 'episodes' : 'collections';
  focusScreenHeading();
}

function returnToCollections() {
  screen.value = 'collections';
  focusScreenHeading();
}

const screenHeading = ref(null);
async function focusScreenHeading() {
  await nextTick();
  screenHeading.value?.focus({ preventScroll: true });
  screenHeading.value?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

onMounted(async () => {
  window.addEventListener('keydown', handleKeydown);
  window.addEventListener('blur', cancelRackDrag);
  if (!document.head.querySelector('link[rel="preconnect"][href="https://media.prts.wiki"]')) {
    preconnectLink = document.createElement('link');
    preconnectLink.rel = 'preconnect';
    preconnectLink.href = 'https://media.prts.wiki';
    document.head.append(preconnectLink);
  }
  try {
    const [response, variables, thumbnails, metadata, titles, characters] = await Promise.all([
      fetch(`${root}catalog.json`),
      fetch(`${root}prts-variables.json`).then(response => response.ok ? response.json() : {}).catch(() => ({})),
      fetch(`${root}thumbnail-index.json`).then(response => response.ok ? response.json() : {}).catch(() => ({})),
      fetch(`${root}archive-metadata.json`).then(response => response.ok ? response.json() : {}).catch(() => ({})),
      fetch(`${root}localizations/titles.json`).then(response => response.ok ? response.json() : {}).catch(() => ({})),
      fetch(`${root}character-index.json`).then(response => response.ok ? response.json() : {}).catch(() => ({})),
    ]);
    if (!response.ok) throw new Error('Story catalog unavailable');
    const nextCatalog = await response.json();
    if (disposed) return;
    prtsVariables = variables;
    thumbnailIndex.value = thumbnails;
    archiveMetadata.value = metadata;
    localizedTitles.value = titles;
    characterIndex.value = characters;
    catalog.value = fillStoryCoverFallbacks(nextCatalog.map(story => archiveStory(classifyStory(story), metadata)));
    if (!catalog.value.length) throw new Error('Story catalog is empty');
  } catch (cause) { if (!disposed) catalogError.value = cause.message || String(cause); }
});
onUnmounted(() => {
  cancelRackDrag();
  rackObserver?.disconnect();
  clearTimeout(rackClickTimer);
  memorySound.close();
  stopCameraMotion(); closeEnding();
  closeLog();
  disposed = true;
  loadingToken += 1;
  clearTyping();
  stopMusic();
  stopEffects();
  audioProblem.value = '';
  clearImagePreloads();
  preconnectLink?.remove();
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('blur', cancelRackDrag);
});
</script>

<style scoped>
.story-page{width:min(1180px,calc(100% - 32px));margin:18px auto 60px;color:#f4f7fa}
.story-heading{position:relative;top:auto;z-index:auto;box-sizing:border-box;width:auto;padding:0;margin-bottom:16px;text-align:left;background:transparent;backdrop-filter:none;box-shadow:none;display:flex;flex-direction:row;justify-content:space-between;align-items:end;gap:16px}
.story-heading h1{font-size:clamp(1.6rem,4vw,2.5rem);margin:2px 0 4px;scroll-margin-top:100px}
.story-heading p{margin:0;color:#abb8c6}.story-heading .eyebrow{color:#62b9d3;letter-spacing:.25em;font-size:.72rem}
.story-heading a{color:#9bd9ee;text-decoration:none;white-space:nowrap}
.heading-actions{display:flex;align-items:center;justify-content:end;gap:14px;flex-wrap:wrap}.heading-actions button{border:1px solid #645b4d;background:#211e19;color:#dcc5a0;padding:9px 12px;border-radius:4px;cursor:pointer;font:inherit;font-size:.78rem}.heading-actions button:hover{background:#373022}.heading-actions button:focus-visible{outline:2px solid #e6c896;outline-offset:3px}.story-heading h1:focus{outline:none}
.story-library{margin-bottom:24px;background:radial-gradient(ellipse at 100% 0,#363a3e44,transparent 60%),linear-gradient(135deg,#161819,#070809);border:1px solid #44484a;border-radius:2px;padding:24px 0 12px;box-shadow:0 16px 48px #0004}
.library-heading,.library-filters{display:flex;align-items:center;gap:12px;padding:0 20px}
.library-heading{justify-content:space-between;margin-bottom:16px}.library-heading .eyebrow{color:#c2a677;font:10px monospace;letter-spacing:.2em}.library-heading p{margin:5px 0 0;font-weight:600;font-size:1.1rem}.library-heading p span{color:#c2a677;margin-left:8px;font:12px monospace}
.archive-hint{color:#9eaaaF;font-size:.75rem}.archive-breadcrumb{padding:0 20px;margin:0 0 12px;color:#c2a677;font-size:.76rem;line-height:1.6}
.library-filters{margin-bottom:16px;flex-wrap:wrap}.library-filters input{flex:1;min-width:180px}.library-filters select{max-width:240px}
.library-filters input,.library-filters select{box-sizing:border-box;border:1px solid #435058;border-radius:3px;background:#0b141b;color:#e6e7e9;padding:9px 12px;font:inherit;font-size:.8rem;min-width:0}
.library-filters input::placeholder{color:#8c969d}.library-filters input:focus-visible,.library-filters select:focus-visible{outline:2px solid #c2a677;outline-offset:2px}
.stage-wrap::before,.stage-wrap::after{content:'';position:absolute;left:0;right:0;height:12px;background:repeating-linear-gradient(90deg,transparent 0 10px,#a7a69e 10px 25px,transparent 25px 38px);opacity:.6;pointer-events:none}.collection-open{display:block;margin-top:10px;color:#c2a677;font-size:.72rem}.library-empty{padding:24px 20px;color:#aeb5bc}
.story-message{padding:40px;background:#101922;border:1px solid #344753;border-radius:8px}
.story-shell{background:#0a1017;border:1px solid #45606b;box-shadow:0 24px 60px #0008;border-radius:10px;overflow:hidden}
.stage-wrap{position:relative;padding-block:26px;background:#07090c;border-block:1px solid #655846}
.stage-wrap::before{top:7px;z-index:4}.stage-wrap::after{bottom:7px;z-index:4}
.story-stage{position:relative;aspect-ratio:16/9;overflow:hidden;cursor:pointer;background:#06090e}
.story-stage.grayscale .scene-backdrop,.story-stage.grayscale .scene-image,.story-stage.grayscale .portrait-row{filter:grayscale(1)}
.scene-backdrop,.scene-image,.scene-vignette,.scene-shade{position:absolute;inset:0;width:100%;height:100%}
.scene-backdrop,.scene-image{object-fit:contain}
.scene-preview{filter:blur(2px)}
.scene-vignette{background:linear-gradient(180deg,#02070b88 0%,transparent 28%,transparent 52%,#010407bb 100%)}
.scene-video{position:absolute;z-index:3;inset:0;width:100%;height:100%;object-fit:contain;background:#000}
.portrait-row{position:absolute;inset:4% 2% 12%;display:flex;align-items:end;justify-content:center;pointer-events:none}
.portrait{width:min(40%,440px);height:100%;object-fit:contain;object-position:bottom;filter:drop-shadow(0 14px 18px #0008);transition:filter .25s,opacity .25s}
.portrait:not(:first-child){margin-left:-6%}.portrait.subdued{filter:brightness(.38) saturate(.45);opacity:.78}
.scene-shade{pointer-events:none;transition:background-color .25s}
.story-dialogue-panel{position:absolute;inset:26px 0;pointer-events:none}
.video-mode .story-dialogue-panel{position:relative;inset:auto;min-height:0}
.video-mode .end-box{position:relative;inset:auto;margin:12px 5% 0}
.dialogue-box,.decision-box,.end-box{position:absolute;z-index:2;left:5%;right:5%;bottom:4%;background:#08121bdc;border-top:2px solid #7ccde5;box-shadow:0 10px 30px #000a;backdrop-filter:blur(7px)}
.dialogue-box,.decision-box,.end-box{pointer-events:auto}
.dialogue-box{min-height:132px;padding:22px 30px 24px;cursor:pointer}.speaker{display:inline-block;color:#9eddf0;font-weight:700;letter-spacing:.08em}
.dialogue-box p{font-size:clamp(1rem,1.6vw,1.35rem);line-height:1.55;margin:12px 0 0;white-space:pre-wrap}.cursor{color:#69d4f3}
.continue-hint{position:absolute;right:22px;bottom:10px;color:#91b9c5;font-size:.74rem}
.decision-box,.end-box{padding:18px 22px;display:grid;gap:9px;cursor:default}.decision-box p,.end-box p{margin:0;color:#bcd0d9}
.end-box a{color:#dcc5a0}
.decision-box button,.end-box button{border:1px solid #6ea5b6;background:#173746aa;color:#fff;text-align:left;padding:11px 14px;cursor:pointer}
.decision-box button:hover,.decision-box button:focus-visible,.end-box button:hover{background:#2c6071}
.end-box h2{margin:0}.story-controls{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:12px 18px;background:#101d27;color:#adc7d2;font:13px monospace}
.story-controls button{border:1px solid #537784;background:#152b37;color:#e2f5fa;padding:8px 14px;cursor:pointer}.story-controls button:disabled{opacity:.4;cursor:default}
.story-note{margin:12px 16px 16px;color:#829ca8;font-size:.78rem}
@media(max-width:700px){
  .story-page{width:calc(100% - 16px);margin:10px auto 32px}
  .story-heading{align-items:start}.story-heading h1{font-size:1.4rem}
  .story-library{padding-top:14px}.library-heading,.library-filters,.archive-breadcrumb{padding-inline:12px}.library-heading{gap:8px}.library-heading p{font-size:1rem}.archive-hint{display:none}.library-filters{gap:8px}.library-filters input{flex-basis:100%}.library-filters select{flex:1;max-width:none;width:calc(50% - 4px)}
  .story-stage{aspect-ratio:16/9;min-height:0}
  .portrait-row{inset:0 1% 0}.portrait{width:35%}.portrait:not(:first-child){margin-left:-2%}
  .story-dialogue-panel{position:relative;inset:auto;min-height:160px;pointer-events:auto}
  .dialogue-box,.decision-box,.end-box{position:relative;left:auto;right:auto;bottom:auto;min-height:160px;box-shadow:none;backdrop-filter:none;background:#0b1a25}
  .dialogue-box{padding:15px 16px 28px}.dialogue-box p{font-size:1rem;margin-top:8px}.continue-hint{right:12px}
  .story-controls{display:grid;grid-template-columns:1fr 1fr;grid-template-areas:'previous next' 'progress audio';gap:8px;padding:10px}
  .story-controls button{padding:8px}.story-controls button:first-child{grid-area:previous}
  .story-controls span{grid-area:progress;align-self:center}.story-controls button:nth-of-type(2){grid-area:audio}
  .story-controls button:last-child{grid-area:next}
}
@media(prefers-reduced-motion:reduce){.portrait,.scene-shade,.scene-backdrop{transition:none}}
.archive-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:0 20px 18px;color:#aeb7bc;font-size:.75rem}
.view-switch{display:flex;padding:3px;background:#26292c;border:1px solid #53585c;border-radius:20px;gap:3px}
.view-switch button{border:0;border-radius:16px;padding:8px 15px;background:transparent;color:#aeb7bc;font:inherit;cursor:pointer}
.view-switch button.active{background:#e1e3e3;color:#131719}
.archive-toolbar select{border:1px solid #4e565c;padding:8px 12px;background:#131719;color:#dce2e5;font:inherit}
.archive-toolbar button:focus-visible,.reading-route button:focus-visible,.episode-navigation button:focus-visible{outline:2px solid #74d4ee;outline-offset:3px}.reading-status{display:block;color:#87959d;font-size:.7rem;margin-top:9px}.reading-status.read{color:#80d5eb}
.reading-route{padding:0 20px 18px}.reading-route p{margin:0 0 12px;color:#c6d0d4;font-size:.75rem;line-height:1.8}.reading-route p span{color:#798c97}.reading-route nav{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.reading-route button{border:1px solid #48545b;background:#1a2024;color:#c6d0d4;padding:7px 10px;font:inherit;font-size:.7rem;cursor:pointer}.reading-route button:disabled{opacity:.4;cursor:default}.reading-route button small{display:block;font-size:.6rem;margin-top:3px;color:#b9a887}.route-arrow{color:#65747d}
.progress-note{margin:16px 20px 4px;color:#7f919b;font-size:.7rem;line-height:1.6}
.episode-navigation{display:flex;justify-content:space-between;align-items:center;padding:12px 18px;gap:12px;border-top:1px solid #354852;font-size:.75rem;color:#a9c5cf}.episode-navigation span{text-align:center}.episode-navigation button{background:#16262e;color:#cce5ee;border:1px solid #537784;padding:8px 12px;font:inherit;cursor:pointer}.episode-navigation button:disabled{opacity:.35;cursor:default}
@media(max-width:700px){.archive-toolbar{padding-inline:12px}.view-switch button{padding:8px 10px}.reading-route{padding-inline:12px}.progress-note{margin-inline:12px}.episode-navigation{gap:6px;padding:10px 8px}.episode-navigation button{padding:7px;font-size:.65rem}.episode-navigation span{font-size:.65rem}}
/* Banner archive: fewer controls, generous artwork and one clear action. */
.story-library{padding-top:26px;border-color:#34434b;background:radial-gradient(ellipse at 90% 0,#173a4640,transparent 45%),#0b1014;border-radius:8px;overflow:hidden}
.library-heading{margin-bottom:24px}.library-heading .eyebrow{color:#738b98}.library-heading p{font-size:1.05rem;font-weight:500}.archive-hint{display:none}
.library-filters{gap:10px;margin-bottom:12px}.library-filters select{max-width:210px;flex:0 1 210px}.library-filters input{background:#131d23;border-color:#34444d}.library-filters input,.library-filters select{border-radius:6px;padding-block:12px}
.archive-toolbar{padding-bottom:20px}.view-switch{border:0;border-radius:6px;background:#18232b;padding:4px;gap:4px}.view-switch button{border-radius:4px;padding:8px 16px;transition:background .25s,color .25s}.view-switch button.active{background:#365664;color:#e4f8ff}.view-switch button:hover{color:#e4f8ff}
.filter-toggle{display:flex;gap:22px;align-items:center;background:transparent;border:0;color:#92a9b5;font:inherit;padding:8px;cursor:pointer}.filter-toggle:hover{color:#bdefff}.advanced-filters{padding-bottom:10px}.archive-breadcrumb{color:#778e9b;font-size:.7rem;margin-bottom:18px}.view-banner .collection-open,.view-banner .reading-status{color:#a6b9c4;margin-top:12px;font-size:.75rem}
.reading-route p{font-size:.68rem;color:#7f99a8}.reading-route details{border-block:1px solid #2d404c;padding:12px 0}.reading-route summary{color:#abc5d3;font-size:.75rem;cursor:pointer}.reading-route details[open] nav{margin-top:14px;animation:archive-rise .3s ease}.progress-note{font-size:.65rem;color:#6e8593}
.archive-screen-enter-active{transition:opacity .3s ease,transform .4s cubic-bezier(.2,.7,.3,1)}.archive-screen-leave-active{transition:opacity .15s ease,transform .15s ease}.archive-screen-enter-from{opacity:0;transform:translateY(14px)}.archive-screen-leave-to{opacity:0;transform:translateY(-6px)}
.filter-reveal-enter-active,.filter-reveal-leave-active{transition:opacity .2s,transform .25s}.filter-reveal-enter-from,.filter-reveal-leave-to{opacity:0;transform:translateY(-8px)}
@keyframes archive-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:700px){.library-filters select{flex:1 1 40%;max-width:none;width:auto}.library-filters input{flex:1 1 100%}.archive-toolbar{gap:8px}.view-switch button{padding:7px 12px}.filter-toggle{gap:10px;font-size:.7rem}.view-banner .collection-open,.view-banner .reading-status{font-size:.66rem}}
@media(prefers-reduced-motion:reduce){.story-library *,.archive-screen{animation:none!important;transition:none!important;scroll-behavior:auto!important}.archive-screen-enter-from,.archive-screen-leave-to{transform:none}.archive-screen-enter-active,.archive-screen-leave-active{transition:none}}
.story-rack-shell{border-block:1px solid #344b58;background:#071017;position:relative;overflow:hidden}
.story-library .library-heading{display:none}.reading-route nav{flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px}.reading-route nav button{flex:none}.reading-route nav .route-arrow{flex:none}
.story-rack{position:relative;height:440px;max-height:56vh;min-height:355px;overflow:hidden;perspective:1200px;touch-action:pan-y;cursor:grab;user-select:none;isolation:isolate;outline:none}
.story-rack:focus-visible{box-shadow:inset 0 0 0 2px #85d6ee}.story-rack.dragging{cursor:grabbing}
.rack-ambient{position:absolute;inset:-10%;width:120%;height:120%;object-fit:cover;opacity:.25;filter:blur(28px) saturate(.65);pointer-events:none;z-index:-2}.story-rack::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,#071017a8,transparent 20% 80%,#071017a8),linear-gradient(0deg,#071017,transparent 30%);pointer-events:none;z-index:15}
.rack-horizon{position:absolute;inset:auto -20% 14%;height:80px;background:radial-gradient(ellipse,#71b4cc26,transparent 65%);border-top:1px solid #96d6e825;transform:rotateX(60deg);pointer-events:none}
.rack-line-label{position:absolute;top:16px;left:24px;color:#9dbcc9;font-size:.75rem;letter-spacing:.12em;z-index:16;pointer-events:none}
.rack-card{position:absolute;left:50%;top:54%;width:min(420px,calc(100% - 64px));padding:0;border:1px solid #425e70;border-radius:6px;background:#10222d;color:#e6f5fb;text-align:left;overflow:hidden;transform:translateX(calc(-50% + var(--rack-x))) translateY(-50%) translateZ(var(--rack-depth)) rotateY(var(--rack-turn)) scale(var(--rack-scale));filter:brightness(var(--rack-brightness));box-shadow:0 22px 30px #0008;transition:transform .48s cubic-bezier(.2,.75,.25,1),filter .35s,border-color .3s,box-shadow .3s;cursor:pointer;transform-style:preserve-3d}
.rack-card.active{border-color:#94dff4;box-shadow:0 24px 38px #0009,0 0 24px #8bdcf21c}.rack-card:focus-visible{outline:2px solid #b5f1ff;outline-offset:-4px}.story-rack.dragging .rack-card{transition:filter .2s,border-color .2s;cursor:grabbing}
.rack-art{position:relative;display:block;height:clamp(130px,calc(56vh - 220px),215px);background:radial-gradient(ellipse at 50% 70%,#425c68,#0c1c27);overflow:hidden}.rack-art img{width:100%;height:100%;object-fit:cover;pointer-events:none;-webkit-user-drag:none;transition:transform .5s}.rack-card.active:hover .rack-art img{transform:scale(1.035)}.rack-art.operator-portrait img{object-fit:contain;padding:10px;box-sizing:border-box}.rack-art::after{content:'';position:absolute;inset:0;background:linear-gradient(transparent 60%,#10222d)}
.rack-number{position:absolute;top:14px;left:18px;font:11px monospace;letter-spacing:.12em;color:#e6f5fb;text-shadow:0 2px 5px #000}
.rack-caption{display:block;padding:14px 22px 18px}.rack-caption>small{display:block;color:#87b9cb;font-size:.65rem;letter-spacing:.07em;margin-bottom:7px}.rack-caption>strong{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:1.35rem;font-weight:500;line-height:1.4;min-height:1.4em}.rack-caption .collection-open,.rack-caption .reading-status{margin-top:8px;font-size:.7rem;color:#a0b8c5}.rack-caption .reading-status.read{color:#82d9ef}.rack-open{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #45647355;padding-top:11px;margin-top:12px;color:#c2e8f5;font-size:.75rem;opacity:0;transform:translateY(4px);transition:opacity .3s,transform .3s}.rack-card.active .rack-open{opacity:1;transform:translateY(0)}.rack-open>span{transition:transform .25s}.rack-card.active:hover .rack-open>span{transform:translateX(5px)}
.rack-navigation{position:relative;z-index:20;display:flex;gap:24px;align-items:center;justify-content:center;padding:12px 18px 8px;background:#071017}.rack-navigation button{border:1px solid #3c6378;background:#152d3a;color:#c9effc;border-radius:50%;width:40px;height:40px;font-size:18px;cursor:pointer;transition:background .2s,transform .2s}.rack-navigation button:hover:not(:disabled){background:#2c5264;transform:scale(1.07)}.rack-navigation button:disabled{opacity:.3;cursor:default}.rack-navigation button:focus-visible{outline:2px solid #a8e7f8;outline-offset:3px}.rack-navigation>span{font:14px monospace;min-width:90px;text-align:center;color:#d2eff8}.rack-navigation small{color:#6f94a8;font:11px monospace}
.rack-scrubber{display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 20px 18px;color:#799aa9;font-size:.66rem}.rack-scrubber input{width:min(420px,80%);height:4px;accent-color:#8bd6ec;cursor:pointer}
.ambient-fade-enter-active,.ambient-fade-leave-active{transition:opacity .3s}.ambient-fade-enter-from,.ambient-fade-leave-to{opacity:0}

.view-sequence .rack-horizon{border-color:#87d3e9aa}.view-sequence .rack-number{background:#0a202c;border:1px solid #88d5ed;border-radius:50%;width:32px;height:32px;display:grid;place-items:center;letter-spacing:0;top:12px;left:14px}.view-sequence .rack-card.active .rack-number{background:#85daef;color:#071723}
.reading-route{padding-bottom:10px}.reading-route p{margin-bottom:8px}.archive-breadcrumb{margin-bottom:10px}.library-heading{margin-bottom:16px}.archive-toolbar{padding-bottom:12px}
@media(max-width:700px){.story-rack{height:380px;min-height:335px;max-height:none}.rack-card{width:min(340px,calc(100% - 56px));top:54%}.rack-art{height:170px}.rack-caption{padding:12px 16px 15px}.rack-caption>strong{font-size:1.1rem}.rack-line-label{left:16px;top:12px;font-size:.66rem}.rack-open{padding-top:10px;margin-top:9px;font-size:.7rem}.rack-navigation{gap:18px;padding-top:4px}.rack-scrubber{font-size:.6rem}}
@media(prefers-reduced-motion:reduce){.rack-card,.rack-art img,.rack-navigation button,.rack-open,.rack-open>span,.ambient-fade-enter-active,.ambient-fade-leave-active{transition:none}.rack-card.active:hover .rack-art img{transform:none}}
.film-perforations{position:absolute;left:0;right:0;height:17px;z-index:18;pointer-events:none;background:repeating-linear-gradient(90deg,transparent 0 10px,#bcb8a6 10px 28px,transparent 28px 42px);background-position-x:var(--film-position,0px);opacity:.8;transition:background-position-x .48s cubic-bezier(.2,.75,.25,1)}
.film-perforations-top{top:7px}.film-perforations-bottom{bottom:7px}.story-rack.dragging .film-perforations{transition:none}.story-rack-shell{border-block:3px solid #716951;background:#090c0f}.story-rack{background:#090c0f}.rack-line-label{top:34px;left:24px;font-size:.7rem}.rack-horizon{display:none}.rack-card{border-radius:1px;border:2px solid #827a65;box-shadow:0 10px 24px #0009;background:#14191e}.rack-card.active{border-color:#dfcb9d;box-shadow:0 0 20px #c5a26922}.rack-navigation{background:#090c0f}.rack-number{color:#e8d4aa}
.reading-plan-heading{display:flex;align-items:center;gap:20px;padding:0 20px 14px}.reading-plan-heading label{display:grid;gap:6px;flex:none;color:#c2d4df;font-size:.75rem}.reading-plan-heading select{background:#142631;color:#eef5fa;border:1px solid #47616f;padding:9px 12px;min-width:190px;font:inherit;border-radius:4px}.reading-plan-heading p{margin:0;max-width:650px;font-size:.75rem;line-height:1.7;color:#8da6b6}
.reading-detail{position:relative;z-index:20;margin:0;padding:18px 24px;border-block:1px solid #4d514b;background:#111b20;color:#d9e4e9}.reading-detail-title{display:flex;align-items:center;gap:12px}.reading-detail-title>span{font-size:.68rem;color:#ead4a5;padding:4px 8px;border:1px solid #7f745c}.reading-detail-title>strong{font-size:.85rem;font-weight:500}.reading-detail p{margin:12px 0;color:#c6d6df;font-size:.82rem;line-height:1.7}.reading-neighbors{display:flex;gap:20px;justify-content:space-between;color:#859eae;font-size:.72rem;line-height:1.6}.reading-detail button{margin-top:12px;padding:6px 0;color:#9edcef;background:transparent;border:0;font:inherit;font-size:.72rem;cursor:pointer}.reading-detail button:hover{color:#e4faff}.reading-detail button:focus-visible,.reading-plan-heading select:focus-visible{outline:2px solid #a5e5f6;outline-offset:3px}
.view-sequence .story-rack{height:360px;min-height:330px;max-height:none}.view-sequence .rack-art{height:135px}.view-sequence .rack-card{top:55%}.view-sequence .rack-caption>strong{font-size:1.12rem}.view-sequence .rack-number{border-radius:2px;background:#201e18;border-color:#c6b381;color:#f8e8bc}.view-sequence .rack-card.active .rack-number{background:#e0cc9f;color:#151713}
@media(max-width:700px){.reading-plan-heading{padding-inline:12px;gap:12px;align-items:stretch;flex-direction:column}.reading-plan-heading label{display:flex;align-items:center;justify-content:space-between}.reading-plan-heading p{font-size:.66rem}.reading-detail{padding:14px 16px}.reading-detail p{font-size:.76rem}.reading-neighbors{gap:10px;font-size:.65rem}.reading-neighbors>span{flex:1}.view-sequence .story-rack{height:335px;min-height:335px}.view-sequence .rack-art{height:120px}.film-perforations{height:12px}.rack-line-label{top:29px;left:16px}}
@media(prefers-reduced-motion:reduce){.film-perforations{transition:none}}
.story-rack.moving .rack-card,.story-rack.dragging .rack-card{transition:none;will-change:transform}
.story-rack.moving .film-perforations{transition:none}
.translation-notice{padding:10px 16px;border-left:2px solid #c1a773;background:#131d23;color:#c7d4da;font-size:.8rem;line-height:1.6}
.guide-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:0 20px 12px;color:#94aab6;font-size:.72rem}.guide-tools button,.guide-context{border:1px solid #596963;background:#16242b;color:#dfcfaa;padding:7px 10px;font:inherit;cursor:pointer}.guide-tools>span{flex-basis:100%;line-height:1.6}.reading-detail-title>small{margin-left:auto;color:#9fb1bb;font-size:.65rem}.guide-connections{border-left:2px solid #c0a56f;padding-left:12px;margin:14px 0}.guide-connections h3{font-size:.78rem;color:#e8d2a4;font-weight:500;margin:0}.guide-connection p{font-size:.72rem;margin:4px 0 12px}.guide-connection button small{margin-left:8px;color:#b9c8ce}.reading-detail button:disabled{opacity:.5;cursor:default}.guide-branches{margin-top:12px;border-top:1px solid #35484d;padding-top:12px;font-size:.72rem}.guide-branches summary{cursor:pointer;color:#a9c4cd}.guide-branches button{display:block}.guide-source{display:inline-block;margin-top:14px;color:#849ba8;font-size:.65rem;text-decoration:underline}.reading-neighbors button{max-width:48%;text-align:left}.guide-tools button:focus-visible,.guide-context:focus-visible,.guide-branches summary:focus-visible{outline:2px solid #a5e5f6;outline-offset:3px}
.story-progress-sync{display:flex;align-items:center;flex-wrap:wrap;gap:10px 18px;margin:0 0 18px;padding:12px 16px;border:1px solid #344952;background:#101d24;color:#abc4cf;font-size:.75rem;line-height:1.6}.story-progress-sync>div{display:grid;gap:3px;flex:1;min-width:220px}.story-progress-sync strong{color:#e1d0ad;font-weight:500}.story-progress-sync button{border:1px solid #68765f;padding:7px 10px;background:#1c2d32;color:#ead9b6;font:inherit;cursor:pointer}.story-progress-sync button:disabled{opacity:.5;cursor:default}.story-progress-sync button:focus-visible{outline:2px solid #a5e5f6;outline-offset:3px}.progress-storage-warning{color:#ebc388}

/* Keep explanatory text secondary to the memories and scene. */
.story-heading{gap:12px;margin-bottom:14px}.story-heading h1{font-size:clamp(1.3rem,2.5vw,2rem)}.story-heading>div>p:last-child{font-size:.75rem;margin-top:5px}
.story-progress-sync{padding:7px 12px;margin-bottom:12px;font-size:.68rem;gap:6px 12px}.story-progress-sync>div{display:flex;flex-wrap:wrap;gap:4px 10px}.story-progress-sync button{padding:4px 8px}
.compact-note{font-size:.7rem;color:#92aab6;line-height:1.6}.compact-note summary{cursor:pointer;width:fit-content;color:#a9c4cd}.compact-note p{margin:6px 0;max-width:75ch}.reading-plan-heading{padding-block:8px;gap:18px}.guide-tools .compact-note{margin-left:auto}
.reading-detail{padding:10px 18px}.reading-detail-title{gap:8px;flex-wrap:wrap}.reading-detail p{font-size:.73rem;margin:6px 0}.guide-description{margin-top:8px}.guide-connections{margin:8px 0;padding-left:10px}.guide-connection p{font-size:.68rem;margin:2px 0 5px}.reading-detail button{margin-top:5px}.guide-source{margin-top:6px}.guide-branches{padding-top:7px;margin-top:7px}.reading-neighbors{gap:12px}
.archive-audio,.archive-audio label,.story-volume{display:flex;align-items:center;gap:7px;font-size:.7rem;color:#aac4cf}.archive-audio{flex-wrap:wrap}.archive-audio input,.story-volume input{width:90px;accent-color:#9bd9e8;cursor:pointer}.archive-audio output,.story-volume output{width:3ch;font-variant-numeric:tabular-nums}.heading-actions{flex-wrap:wrap;justify-content:flex-end}.story-controls{flex-wrap:wrap;gap:8px;font-family:inherit}.story-controls .story-volume{margin-left:auto}.story-note>p{font-size:.7rem}.story-note summary:focus-visible,.compact-note summary:focus-visible{outline:2px solid #a5e5f6;outline-offset:3px}
.story-log-dialog{width:min(760px,calc(100vw - 32px));max-height:80dvh;padding:20px;box-sizing:border-box;border:1px solid #627d89;background:#0b171fee;color:#e3edf2;box-shadow:0 20px 80px #000a}.story-log-dialog::backdrop{background:#02070cc9;backdrop-filter:blur(5px)}.story-log-dialog>header{display:flex;align-items:center;justify-content:space-between;gap:12px}.story-log-dialog h2{font-size:1rem;margin:0}.story-log-dialog button{background:#17323f;color:#d5eaf3;border:1px solid #668793;padding:7px 12px;cursor:pointer}.story-log-title{font-size:.75rem;color:#8faebd;margin:8px 0 16px}.story-log-entries{max-height:55dvh;overflow-y:auto;overscroll-behavior:contain;scrollbar-color:#638596 #13242e;padding-right:8px}.story-log-entries article{padding:12px 14px;margin:0 0 8px;border-left:2px solid #284451;background:#10212b}.story-log-entries article.current{border-color:#a0dced;background:#18313f}.story-log-entries article.choice{border-color:#cbb079}.story-log-entries strong{font-size:.75rem;color:#abdbec}.story-log-entries article.choice strong{color:#dcc49a}.story-log-entries p{margin:6px 0 0;font-size:.9rem;line-height:1.7;white-space:pre-wrap}.story-log-dialog button:focus-visible,.story-log-entries:focus-visible{outline:2px solid #a5e5f6;outline-offset:3px}
@media(max-width:700px){.story-controls{display:flex}.story-controls button,.story-controls span{grid-area:auto}.story-controls .story-volume{margin-left:0;flex:1;justify-content:center}.story-controls button:last-child{margin-left:auto}.heading-actions{justify-content:flex-start}.archive-audio label{font-size:.65rem}.story-log-dialog{padding:14px}.reading-plan-heading{gap:8px}.guide-tools .compact-note{margin-left:0}}


.scene-camera{position:absolute;inset:0;transform-origin:center;pointer-events:none;user-select:none;-webkit-user-select:none}
.portrait-row .portrait{position:absolute;bottom:0;left:50%;width:46%;height:100%;margin-left:0;transform:translateX(-50%)}
.portrait-row .portrait-l{left:27%}.portrait-row .portrait-r{left:73%}.portrait-row .portrait-m{left:50%}
.story-log-dialog{position:fixed;inset:auto;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;max-height:calc(100dvh - 40px);overflow:auto}
.story-ending-dialog{width:min(580px,calc(100vw - 32px));padding:28px;border-top:3px solid #9cdde9}
.story-ending-dialog h2{font-size:1.35rem}.ending-actions{display:grid;gap:12px;margin-top:20px}
.ending-actions button{padding:13px 16px;text-align:left}.ending-actions .ending-primary{background:#234c5a;border-color:#a5dce8;color:#fff;font-size:.95rem}
.ending-primary strong{display:block;margin-top:7px;font-size:1.1rem}.ending-actions button:focus-visible{outline:2px solid #c2edf5;outline-offset:3px}
.story-ending-dialog button:disabled{opacity:.45;cursor:default}.story-ending-dialog h2:focus{outline:none}
@media(max-width:700px){.portrait-row .portrait{width:53%}.story-ending-dialog{padding:20px}}

</style>

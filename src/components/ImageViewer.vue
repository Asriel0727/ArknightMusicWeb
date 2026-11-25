<template>
  <button v-if="src" class="image-viewer-trigger" type="button" @click="open" :aria-label="t('imageViewer.open')">
    <i class="fas fa-expand" aria-hidden="true"></i> {{ t('imageViewer.open') }}
  </button>
  <Teleport to="body">
    <dialog ref="dialog" class="image-viewer operator-modal-frame" :aria-label="alt || t('imageViewer.open')"
      @cancel.prevent="close" @close="onClose" @keydown.stop @click.stop>
      <header class="viewer-toolbar">
        <span class="viewer-title" :title="alt">{{ alt }}</span>
        <div class="viewer-controls">
          <button type="button" :disabled="failed || scale <= MIN_SCALE" @click="zoom(scale / 1.25)" :aria-label="t('imageViewer.zoomOut')">−</button>
          <output aria-live="polite">{{ Math.round(scale * 100) }}%</output>
          <button type="button" :disabled="failed || scale >= MAX_SCALE" @click="zoom(scale * 1.25)" :aria-label="t('imageViewer.zoomIn')">+</button>
          <button type="button" @click="reset">{{ t('imageViewer.reset') }}</button>
          <button type="button" autofocus @click="close" :aria-label="t('imageViewer.close')">✕</button>
        </div>
      </header>
      <div class="viewer-workspace">
        <aside v-if="isOpen && portraits.length > 1" class="viewer-portraits" :aria-label="t('imageViewer.portraits')">
          <h2>{{ t('imageViewer.portraits') }}</h2>
          <div class="viewer-portrait-list">
            <button v-for="(portrait, index) in portraits" :key="portrait.id || index" type="button"
              class="viewer-portrait-option" :class="{ active: index === selectedIndex }"
              :aria-pressed="index === selectedIndex" @click="emit('select', index)">
              <img :src="portrait.src" alt="" loading="lazy" draggable="false">
              <span>{{ portrait.name }}</span>
            </button>
          </div>
        </aside>
        <div ref="viewport" class="viewer-viewport"
          @wheel.prevent="onWheel" @pointerdown="pointerDown" @pointermove="pointerMove"
          @pointerup="pointerEnd" @pointercancel="pointerEnd" @lostpointercapture="pointerEnd">
          <p v-if="failed" role="status">{{ t('character.portraitLoadFailed') }}</p>
          <img v-else-if="isOpen" :key="src" :src="src" :alt="alt" draggable="false" @error="onError"
            :style="{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }">
        </div>
      </div>
      <p class="viewer-hint">{{ t('imageViewer.hint') }}</p>
    </dialog>
  </Teleport>
</template>

<script setup>
import { onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  portraits: { type: Array, default: () => [] },
  selectedIndex: { type: Number, default: 0 },
});
const emit = defineEmits(['error', 'select']);
const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const { t } = useI18n();
const dialog = ref(null);
const viewport = ref(null);
const scale = ref(1);
const offset = ref({ x: 0, y: 0 });
const failed = ref(false);
const isOpen = ref(false);
const pointers = new Map();
let previousOverflow;

function reset() {
  scale.value = 1;
  offset.value = { x: 0, y: 0 };
  pointers.clear();
}

function onClose() {
  isOpen.value = false;
  reset();
  restoreScroll();
}

function restoreScroll() {
  if (previousOverflow !== undefined) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = undefined;
  }
}

function open() {
  if (!props.src || dialog.value?.open) return;
  reset();
  failed.value = false;
  isOpen.value = true;
  dialog.value.showModal();
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
}

function close() {
  dialog.value?.close();
  restoreScroll();
}

// Keep the zoom anchored under the cursor or the midpoint of a pinch.
function zoom(value, point = { x: 0, y: 0 }) {
  if (failed.value) return;
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
  const ratio = next / scale.value;
  offset.value = {
    x: point.x - (point.x - offset.value.x) * ratio,
    y: point.y - (point.y - offset.value.y) * ratio,
  };
  scale.value = next;
}

function localPoint(point) {
  const rect = viewport.value.getBoundingClientRect();
  return { x: point.x - rect.left - rect.width / 2, y: point.y - rect.top - rect.height / 2 };
}

function onWheel(event) {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.value.clientHeight : 1;
  const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
  zoom(scale.value * Math.exp(-delta * 0.002),
    localPoint({ x: event.clientX, y: event.clientY }));
}

function pointerDown(event) {
  if (event.button !== 0) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  viewport.value.setPointerCapture(event.pointerId);
}

function pointerMove(event) {
  const previous = pointers.get(event.pointerId);
  if (!previous) return;
  const before = [...pointers.values()];
  const point = { x: event.clientX, y: event.clientY };
  pointers.set(event.pointerId, point);
  if (pointers.size === 2) {
    const after = [...pointers.values()];
    const midpoint = points => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
    const distance = points => Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    const oldCenter = midpoint(before);
    const newCenter = midpoint(after);
    if (distance(before) > 0) zoom(scale.value * distance(after) / distance(before), localPoint(oldCenter));
    offset.value = { x: offset.value.x + newCenter.x - oldCenter.x, y: offset.value.y + newCenter.y - oldCenter.y };
  } else if (pointers.size === 1) {
    offset.value = { x: offset.value.x + point.x - previous.x, y: offset.value.y + point.y - previous.y };
  }
}

function pointerEnd(event) {
  pointers.delete(event.pointerId);
}

function onError(event) {
  // Ignore an error from an image that was replaced by a newer selection.
  if (event.target.getAttribute('src') !== props.src) return;
  failed.value = true;
  emit('error', event);
}

watch(() => props.src, (src) => {
  // Keep the camera position when changing outfits or trying a fallback URL.
  pointers.clear();
  failed.value = false;
  if (!src) close();
});
onBeforeUnmount(() => { close(); pointers.clear(); });
defineExpose({ open });
</script>

<style scoped>
.image-viewer-trigger { position: absolute; top: 14px; right: 14px; z-index: 4; display: flex; align-items: center; gap: 8px; padding: 10px 14px; border: 1px solid var(--operator-panel-border); border-radius: 6px; background: rgba(9, 22, 28, 0.5); color: var(--text-color); cursor: pointer; }
.image-viewer {
  position: fixed;
  inset: 0;
  margin: auto;
  padding: 0;
  border-radius: 10px;
  color: var(--text-color);
  overflow: hidden;
  box-sizing: border-box;
}
.image-viewer[open] { display: flex; flex-direction: column; }
.image-viewer::backdrop { background: rgba(3, 12, 16, 0.32); backdrop-filter: blur(6px); }
.viewer-toolbar {
  position: relative;
  top: auto;
  z-index: auto;
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: 16px;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: max(12px, env(safe-area-inset-top)) 16px 12px;
  text-align: left;
  background: var(--operator-panel-surface);
  border-bottom: 1px solid var(--operator-panel-border);
  backdrop-filter: none;
  box-shadow: none;
}
.viewer-title { flex: 1; min-width: 0; padding-left: 10px; border-left: 2px solid var(--primary-color); font: .9rem var(--font-sans); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.viewer-controls { display: flex; flex: 0 0 auto; flex-direction: row; align-items: center; gap: 8px; }
.viewer-toolbar button { flex: 0 0 auto; min-width: 44px; min-height: 44px; padding: 6px 10px; border: 1px solid var(--operator-panel-border); border-radius: 6px; color: var(--text-color); background: rgba(9, 22, 28, 0.38); cursor: pointer; }
.viewer-toolbar button:not(:disabled):hover,
.image-viewer-trigger:hover { border-color: var(--primary-color); color: var(--primary-color); background: rgba(88, 166, 255, 0.1); }
.viewer-toolbar button:disabled { opacity: .35; cursor: default; }
.viewer-toolbar output { min-width: 48px; text-align: center; color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: .8rem; }
.viewer-workspace { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.viewer-portraits { flex: 0 0 220px; min-height: 0; overflow-y: auto; overscroll-behavior: contain; background: var(--operator-panel-surface); border-right: 1px solid var(--operator-panel-border); }
.viewer-portraits h2 { margin: 0; padding: 16px; font-size: .875rem; font-weight: 600; color: var(--text-secondary); }
.viewer-portrait-list { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 12px; }
.viewer-portrait-option { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px; border: 1px solid transparent; border-radius: 6px; background: rgba(9, 22, 28, 0.24); color: var(--text-secondary); text-align: left; font: inherit; font-size: .875rem; cursor: pointer; }
.viewer-portrait-option:hover { border-color: rgba(88, 166, 255, 0.2); background: rgba(88, 166, 255, 0.07); color: var(--text-color); }
.viewer-portrait-option.active { border-color: rgba(88, 166, 255, 0.4); background: rgba(88, 166, 255, 0.14); color: var(--primary-color); box-shadow: inset 0 -2px var(--primary-color); }
.viewer-portrait-option img { width: 56px; height: 72px; flex: 0 0 56px; object-fit: contain; background: rgba(7, 18, 24, 0.2); }
.viewer-portrait-option span { overflow-wrap: anywhere; }
.viewer-viewport {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: grid;
  place-items: center;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  cursor: grab;
  background-color: rgba(7, 18, 24, 0.1);
  background-image:
    linear-gradient(90deg, rgba(88, 166, 255, 0.035) 1px, transparent 1px),
    linear-gradient(rgba(88, 166, 255, 0.035) 1px, transparent 1px);
  background-size: 44px 44px;
}
.viewer-viewport:active { cursor: grabbing; }
.viewer-viewport img { position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0; object-fit: contain; pointer-events: auto; -webkit-user-drag: none; }
.viewer-hint { flex: 0 0 auto; margin: 0; padding: 10px 16px max(10px, env(safe-area-inset-bottom)); border-top: 1px solid var(--operator-panel-border); background: var(--operator-panel-surface); text-align: center; font-size: 12px; color: var(--text-secondary); }
button:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
@media (max-width: 640px) {
  .viewer-toolbar { flex-wrap: wrap; gap: 8px; padding-inline: 12px; }
  .viewer-title { flex: 1 0 100%; font-size: .875rem; }
  .viewer-controls { width: 100%; justify-content: flex-end; }
  .viewer-workspace { flex-direction: column-reverse; }
  .viewer-portraits { flex: 0 0 auto; max-height: 132px; overflow-y: hidden; border-right: 0; border-top: 1px solid var(--operator-panel-border); }
  .viewer-portraits h2 { display: none; }
  .viewer-portrait-list { flex-direction: row; overflow-x: auto; overscroll-behavior: contain; padding: 8px; }
  .viewer-portrait-option { flex: 0 0 150px; width: 150px; padding: 6px; }
  .viewer-portrait-option img { width: 40px; height: 56px; flex-basis: 40px; }
}
</style>

<template>
  <div class="story-portrait-art" :aria-busy="loading"><canvas v-show="ready" ref="canvas"/></div>
</template>
<script setup>
import { nextTick, ref, watch, onUnmounted } from 'vue';
const props = defineProps({ visual: { type: Object, required: true } });
const canvas = ref(null);
const ready = ref(false);
const loading = ref(false);
let request = 0;
let displayedBase = '';
const load = url => new Promise((resolve, reject) => {
  const image = new Image();
  image.decoding = 'async';
  image.onload = async () => {
    try { await image.decode(); resolve(image); } catch (error) { reject(error); }
  };
  image.onerror = reject;
  image.src = url;
});
// Compare resource fields, since the parent creates a descriptor on each text update.
watch([
  () => props.visual.baseUrl, () => props.visual.faceUrl,
  () => props.visual.faceRect?.x, () => props.visual.faceRect?.y,
  () => props.visual.faceRect?.w, () => props.visual.faceRect?.h,
], async () => {
  const visual = props.visual;
  const token = ++request;
  loading.value = true;
  // Preserve the previous complete expression while loading the same character.
  if (displayedBase !== visual.baseUrl) ready.value = false;
  try {
    const [base, face] = await Promise.all([load(visual.baseUrl), visual.faceUrl ? load(visual.faceUrl).catch(() => null) : null]);
    await nextTick();
    if (token !== request || !canvas.value) return;
    if (visual.faceUrl && !face && ready.value) return;
    // Build off-screen before replacing the displayed canvas, including its alpha.
    const buffer = document.createElement('canvas');
    buffer.width = base.naturalWidth; buffer.height = base.naturalHeight;
    const context = buffer.getContext('2d', { alpha: true });
    if (!context) return;
    context.clearRect(0, 0, buffer.width, buffer.height);
    context.drawImage(base, 0, 0);
    if (face && visual.faceRect) {
      const { x, y, w, h } = visual.faceRect;
      context.drawImage(face, x, y, w, h);
    }
    const element = canvas.value;
    const visibleContext = element.getContext('2d', { alpha: true });
    if (!visibleContext) return;
    element.width = buffer.width; element.height = buffer.height;
    visibleContext.clearRect(0, 0, element.width, element.height);
    visibleContext.drawImage(buffer, 0, 0);
    displayedBase = visual.baseUrl;
    ready.value = true;
  } catch { /* Keep a previous complete portrait, or leave the new one transparent. */ }
  finally { if (token === request) loading.value = false; }
}, { immediate: true, flush: 'post' });
onUnmounted(() => { request++; });
</script>
<style scoped>
.story-portrait-art{position:relative;background:transparent;user-select:none;-webkit-user-select:none}
canvas{display:block;width:100%;height:100%;object-fit:contain;object-position:bottom;background:transparent;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
</style>

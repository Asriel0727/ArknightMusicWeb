<template>
  <div class="story-portrait-art" :aria-busy="loading"><canvas v-show="ready" ref="canvas"/></div>
</template>
<script>
// Expressions share the base artwork's bounds so changing faces never shifts it.
const portraitBounds = new Map();
function visibleBounds(context, width, height, key) {
  if (portraitBounds.has(key)) return portraitBounds.get(key);
  const bounds = { x: 0, y: 0, w: width, h: height };
  try {
    const { data } = context.getImageData(0, 0, width, height);
    let left = width, top = height, right = -1, bottom = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] <= 8) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    if (right >= left) Object.assign(bounds, { x: left, y: top, w: right - left + 1, h: bottom - top + 1 });
    portraitBounds.set(key, bounds);
  } catch { /* Cross-origin images without CORS still render at their full bounds. */ }
  return bounds;
}
</script>
<script setup>
import { nextTick, ref, watch, onUnmounted } from 'vue';
const props = defineProps({ visual: { type: Object, required: true } });
const canvas = ref(null);
const ready = ref(false);
const loading = ref(false);
let request = 0;
let displayedBase = '';
const load = (url, useCors = true) => new Promise((resolve, reject) => {
  const image = new Image();
  if (useCors) image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.onload = async () => {
    try { await image.decode(); resolve(image); } catch (error) { reject(error); }
  };
  image.onerror = error => {
    if (useCors) load(url, false).then(resolve, reject);
    else reject(error);
  };
  image.src = url;
});
// Compare resource fields, since the parent creates a descriptor on each text update.
watch([
  () => props.visual.baseUrl, () => props.visual.faceUrl, () => props.visual.fallbackUrl,
  () => props.visual.faceRect?.x, () => props.visual.faceRect?.y,
  () => props.visual.faceRect?.w, () => props.visual.faceRect?.h,
], async () => {
  const visual = props.visual;
  const token = ++request;
  loading.value = true;
  // Preserve the previous complete expression while loading the same character.
  if (displayedBase !== visual.baseUrl) ready.value = false;
  try {
    const [base, face] = await Promise.all([
      load(visual.baseUrl).catch(error => {
        if (visual.fallbackUrl && visual.fallbackUrl !== visual.baseUrl) return load(visual.fallbackUrl);
        throw error;
      }),
      visual.faceUrl ? load(visual.faceUrl).catch(() => null) : null,
    ]);
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
    const bounds = visibleBounds(context, buffer.width, buffer.height, visual.baseUrl);
    if (face && visual.faceRect) {
      const { x, y, w, h } = visual.faceRect;
      context.drawImage(face, x, y, w, h);
    }
    const element = canvas.value;
    const visibleContext = element.getContext('2d', { alpha: true });
    if (!visibleContext) return;
    element.width = bounds.w; element.height = bounds.h;
    visibleContext.clearRect(0, 0, element.width, element.height);
    visibleContext.drawImage(buffer, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    displayedBase = visual.baseUrl;
    ready.value = true;
  } catch { /* Keep a previous complete portrait, or leave the new one transparent. */ }
  finally { if (token === request) loading.value = false; }
}, { immediate: true, flush: 'post' });
onUnmounted(() => { request++; });
</script>
<style scoped>
.story-portrait-art{position:relative;background:transparent;user-select:none;-webkit-user-select:none}
canvas{position:absolute;bottom:0;left:50%;display:block;width:auto;height:100%;max-width:none;transform:translateX(-50%);background:transparent;user-select:none;-webkit-user-select:none;-webkit-user-drag:none}
</style>

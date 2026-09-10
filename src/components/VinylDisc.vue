<template>
  <div class="vinyl-face" aria-hidden="true">
    <div class="vinyl-label">
      <img v-if="cover" :src="cover" alt="" draggable="false" @error="failed = true" v-show="!failed">
      <span v-else>唱片</span>
    </div>
    <span class="vinyl-hole"></span>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
const props = defineProps({ cover: { type: String, default: '' } });
const failed = ref(false);
watch(() => props.cover, () => { failed.value = false; });
</script>

<style scoped>
.vinyl-face {
  position: relative;
  width: 100%;
  height: 100%;
  aspect-ratio: 1;
  border: 2px solid #56616d;
  border-radius: 50%;
  background:
    repeating-radial-gradient(circle, transparent 0 3px, #ffffff12 3.5px 4px, transparent 4.5px 6px),
    conic-gradient(from 25deg, #08090c, #252b32 14%, #08090c 25%, #030405 45%, #282e35 62%, #08090c 78%, #08090c);
  box-shadow: inset 0 0 0 5px #07090c, inset 0 0 0 7px #ffffff12, 0 5px 0 #030405, 0 12px 22px #0009;
}
.vinyl-label {
  position: absolute;
  inset: 35%;
  overflow: hidden;
  display: grid;
  place-items: center;
  border: 3px solid #151b21;
  border-radius: 50%;
  background: #729fae;
  color: #10222c;
  font-size: 12px;
  letter-spacing: .12em;
}
.vinyl-label img { width: 100%; height: 100%; object-fit: cover; }
.vinyl-hole {
  position: absolute;
  inset: 48%;
  border: 1px solid #bacbd2;
  border-radius: 50%;
  background: #020507;
}
</style>

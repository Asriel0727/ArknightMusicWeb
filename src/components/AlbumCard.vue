<template>
  <div class="album" @pointerenter="handlePreload" @focusin="handlePreload">
    <img 
      :src="proxyImageUrl(album.coverUrl)" 
      :alt="album.name"
      draggable="false"
      @load="handleImageLoad"
      @error="handleImageError"
      loading="lazy"
      decoding="async"
      fetchpriority="low"
    >
    <div
      v-if="trackCountLoading || trackCount !== null"
      class="album-hover-info"
      :class="{ 'is-loading': trackCountLoading }"
      aria-live="polite"
    >
      <span v-if="trackCountLoading" class="track-count-loader" aria-hidden="true"></span>
      <span v-else>{{ t('album.trackCount', { count: trackCount }) }}</span>
    </div>
    <div class="marquee-container" ref="marqueeContainer">
      <div class="marquee-content" ref="marqueeContent">
        {{ album.name }}
      </div>
    </div>
    <p>{{ album.artistes.join(', ') }}</p>
    <button @click="$emit('view-album', album.cid, $event)">{{ t(active ? 'album.viewAlbum' : 'album.selectAlbum') }}</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { getProxyImageUrl } from '../services/api.js';

const { t } = useI18n();

const props = defineProps({
  active: { type: Boolean, default: true },
  album: {
    type: Object,
    required: true
  },
  trackCount: {
    type: Number,
    default: null
  },
  trackCountLoading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['view-album', 'preload-album']);

const marqueeContainer = ref(null);
const marqueeContent = ref(null);

const proxyImageUrl = (url) => {
  if (!url) return '';
  // 使用和原本一樣的方法構建URL
  return getProxyImageUrl(url);
};

const handlePreload = () => {
  emit('preload-album', props.album);
};

const handleImageLoad = (event) => {
  event.target.classList.add('loaded');
};

const handleImageError = (event) => {
  event.target.classList.add('load-error');
};

const checkMarquee = () => {
  if (!marqueeContent.value || !marqueeContainer.value) return;
  
  setTimeout(() => {
    if (marqueeContent.value.scrollWidth > marqueeContainer.value.clientWidth) {
      marqueeContainer.value.style.overflow = 'hidden';
      marqueeContent.value.style.animation = 'marquee 10s linear infinite';
    } else {
      marqueeContainer.value.style.overflow = 'hidden';
      marqueeContent.value.style.animation = 'none';
      marqueeContent.value.style.paddingLeft = '0';
    }
  }, 0);
};

onMounted(() => {
  checkMarquee();
});
</script>

<style scoped>
.album {
  background-color: var(--card-bg);
  border-radius: 10px;
  padding: 15px;
  text-align: center;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.album:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
}

.album img {
  width: 100%;
  height: 200px;
  object-fit: cover;
  border-radius: 8px;
  margin-bottom: 15px;
  transition: opacity 0.3s;
  opacity: 0.38;
  background: linear-gradient(90deg, #30363d 20%, #596575 45%, #30363d 70%);
  background-size: 220% 100%;
  animation: cover-shimmer 1.35s linear infinite;
}

.album img.loaded {
  opacity: 1;
  animation: none;
  background: transparent;
}

.album img.load-error {
  opacity: 0.72;
  animation: none;
}

@keyframes cover-shimmer {
  to {
    background-position: -220% 0;
  }
}

.album-hover-info {
  position: absolute;
  z-index: 5;
  top: 16px;
  right: 16px;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 4px 8px;
  border: 1px solid rgba(126, 198, 255, 0.45);
  border-radius: 999px;
  background: rgba(10, 17, 26, 0.78);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.28);
  color: #dceeff;
  font-size: 0.72rem;
  line-height: 1;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-4px);
  transition: opacity 180ms ease, transform 180ms ease;
}

.album:hover .album-hover-info,
.album:focus-within .album-hover-info {
  opacity: 1;
  transform: translateY(0);
}

.track-count-loader {
  width: 28px;
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(126, 198, 255, 0.35), #7ec6ff, rgba(126, 198, 255, 0.35));
  background-size: 200% 100%;
  animation: track-count-shimmer 900ms linear infinite;
}

@keyframes track-count-shimmer {
  to {
    background-position: -200% 0;
  }
}

.album p {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin-bottom: 15px;
  flex: 1;
}

.album button {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.3s;
  font-weight: 500;
  font-size: 1rem;
  line-height: 1.5;
  min-height: 40px;
  max-height: 40px;
  height: 40px;
  box-sizing: border-box;
  white-space: nowrap;
  margin-top: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
  flex-grow: 0;
}

.album button:hover {
  background: #3d8eff;
}

.marquee-container {
  width: 100%;
  position: relative;
  margin-bottom: 8px;
  overflow: hidden;
}

.marquee-content {
  display: inline-block;
  white-space: nowrap;
  padding-left: 0;
  transition: padding-left 0.3s ease;
  font-size: 1.1rem;
  margin-bottom: 8px;
  color: var(--primary-color);
}

.marquee-content[style*="animation"] {
  padding-left: 100%;
}

@keyframes marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-100%);
  }
}
</style>


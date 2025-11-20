<template>
  <div class="album">
    <img 
      :src="proxyImageUrl(album.coverUrl)" 
      :alt="album.name"
      @load="handleImageLoad"
      loading="lazy"
    >
    <div class="marquee-container" ref="marqueeContainer">
      <div class="marquee-content" ref="marqueeContent">
        {{ album.name }}
      </div>
    </div>
    <p>{{ album.artistes.join(', ') }}</p>
    <button @click="$emit('view-album', album.cid)">查看專輯</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

defineEmits(['view-album']);

const marqueeContainer = ref(null);
const marqueeContent = ref(null);

const proxyImageUrl = (url) => {
  if (!url) return '';
  // 使用和原本一樣的方法構建URL
  return `https://monstersiren-web-api.vercel.app/proxy-image?url=${encodeURIComponent(url)}`;
};

const handleImageLoad = (event) => {
  event.target.classList.add('loaded');
};

const checkMarquee = () => {
  if (!marqueeContent.value || !marqueeContainer.value) return;
  
  setTimeout(() => {
    if (marqueeContent.value.scrollWidth > marqueeContainer.value.clientWidth) {
      marqueeContainer.value.style.overflow = 'hidden';
      marqueeContent.value.style.animation = 'marquee 10s linear infinite';
    } else {
      marqueeContainer.value.style.overflow = 'visible';
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
  background: linear-gradient(45deg, #30363d, #484f58);
}

.album img.loaded {
  opacity: 1;
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


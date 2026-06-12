<template>
  <div class="album">
    <div class="album-index">{{ archiveId }}</div>
    <div class="album-cover-frame">
      <img
        :src="proxyImageUrl(album.coverUrl)"
        :alt="album.name"
        @load="handleImageLoad"
        loading="lazy"
        decoding="async"
        fetchpriority="low"
      >
    </div>
    <div class="album-record-main">
      <div class="album-record-head">
        <span class="record-status">READY</span>
        <span class="record-source">MSR_ARCHIVE</span>
      </div>
      <div class="marquee-container" ref="marqueeContainer">
        <div class="marquee-content" ref="marqueeContent">
          {{ album.name }}
        </div>
      </div>
      <p>{{ album.artistes.join(', ') }}</p>
    </div>
    <button @click="$emit('view-album', album.cid)">
      <span>{{ t('album.viewAlbum') }}</span>
      <i class="fas fa-arrow-right"></i>
    </button>
  </div>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const props = defineProps({
  album: {
    type: Object,
    required: true
  }
});

defineEmits(['view-album']);

const marqueeContainer = ref(null);
const marqueeContent = ref(null);

const archiveId = computed(() => {
  const id = String(props.album.cid || '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `A-${id}`;
});

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
  position: relative;
  display: grid;
  grid-template-columns: 56px 64px minmax(0, 1fr) 118px;
  align-items: center;
  gap: 10px;
  min-height: 76px;
  background: rgba(13, 16, 19, 0.86);
  border: 1px solid rgba(111, 122, 132, 0.28);
  border-left: 3px solid var(--text-dim);
  border-radius: 2px;
  padding: 8px 10px;
  text-align: left;
  box-shadow: none;
  transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
  overflow: hidden;
}

.album:hover {
  transform: translateX(2px);
  border-color: rgba(45, 212, 191, 0.55);
  border-left-color: var(--accent-orange);
  background: rgba(20, 24, 29, 0.95);
}

.album::after {
  content: "";
  position: absolute;
  left: -40%;
  top: 0;
  width: 40%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(79, 182, 255, 0.08), transparent);
  transition: left 0.22s ease;
}

.album:hover::after {
  left: 100%;
}

.album-index {
  color: var(--accent-yellow);
  font-family: "Courier New", monospace;
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.album-cover-frame {
  width: 56px;
  height: 56px;
  border: 1px solid rgba(111, 122, 132, 0.35);
  background: #080a0c;
  overflow: hidden;
}

.album img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 0;
  margin-bottom: 0;
  transition: opacity 0.3s;
  background: #11161b;
}

.album img.loaded {
  opacity: 1;
}

.album-record-main {
  min-width: 0;
}

.album-record-head {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.record-status,
.record-source {
  color: var(--text-secondary);
  border: 1px solid rgba(111, 122, 132, 0.3);
  padding: 1px 5px;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.record-status {
  color: var(--accent-cyan);
}

.album p {
  color: var(--text-secondary);
  font-size: 0.76rem;
  margin-bottom: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.album button {
  background: rgba(79, 182, 255, 0.1);
  color: var(--primary-color);
  border: 1px solid rgba(79, 182, 255, 0.35);
  padding: 0 10px;
  border-radius: 2px;
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  font-weight: 800;
  font-size: 0.74rem;
  line-height: 1.5;
  height: 32px;
  box-sizing: border-box;
  white-space: nowrap;
  margin-top: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  flex-shrink: 0;
  flex-grow: 0;
  gap: 8px;
  text-transform: uppercase;
}

.album button:hover {
  background: rgba(255, 138, 42, 0.14);
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

.marquee-container {
  width: 100%;
  position: relative;
  margin-bottom: 4px;
  overflow: hidden;
}

.marquee-content {
  display: inline-block;
  white-space: nowrap;
  padding-left: 0;
  transition: padding-left 0.3s ease;
  font-size: 0.9rem;
  margin-bottom: 0;
  color: var(--text-color);
  font-weight: 800;
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
@media (max-width: 720px) {
  .album {
    grid-template-columns: 44px 56px minmax(0, 1fr) 42px;
    gap: 8px;
    min-height: 68px;
    padding: 7px 8px;
  }

  .album-cover-frame {
    width: 50px;
    height: 50px;
  }

  .album button {
    width: 32px;
    height: 32px;
    padding: 0;
  }

  .album button span {
    display: none;
  }

  .record-source {
    display: none;
  }
}
</style>

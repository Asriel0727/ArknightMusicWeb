<template>
  <nav class="main-navbar">
    <div class="navbar-left">
      <div class="nav-tabs">
        <button 
          class="nav-tab" 
          :class="{ active: currentPage === 'albums' }"
          @click="changePage('albums')"
        >
          <i class="fas fa-compact-disc"></i>
          <span>{{ $t('nav.albums') }}</span>
        </button>
        <button 
          class="nav-tab" 
          :class="{ active: currentPage === 'characters' }"
          @click="changePage('characters')"
        >
          <i class="fas fa-users"></i>
          <span>{{ $t('nav.characters') }}</span>
        </button>
        <button
          class="nav-tab"
          :class="{ active: currentPage === 'recruit' }"
          @click="changePage('recruit')"
        >
          <i class="fas fa-id-card"></i>
          <span>{{ $t('nav.recruit') }}</span>
        </button>
      </div>
    </div>
    <div class="navbar-right">
      <img :src="`${baseUrl}logo.png`" :alt="$t('nav.logoAlt')" class="logo-img" />
      <label class="nav-locale-wrap">
        <span class="nav-locale-label">{{ $t('language.label') }}</span>
        <select v-model="localeModel" class="nav-locale">
          <option value="zh-TW">{{ $t('language.zhTW') }}</option>
          <option value="zh-CN">{{ $t('language.zhCN') }}</option>
          <option value="en">{{ $t('language.en') }}</option>
          <option value="ja">{{ $t('language.ja') }}</option>
          <option value="ko">{{ $t('language.ko') }}</option>
        </select>
      </label>
    </div>
  </nav>
</template>

<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppLocale } from '../composables/useAppLocale.js';

const { locale } = useI18n();
const { setLocale } = useAppLocale();

const localeModel = computed({
  get: () => locale.value,
  set: (v) => setLocale(v),
});

// 使用 Vite 的 BASE_URL 来支持 GitHub Pages 的 base 路径
const baseUrl = import.meta.env.BASE_URL;

const props = defineProps({
  currentPage: {
    type: String,
    default: 'albums'
  }
});

const emit = defineEmits(['change-page']);

const changePage = (page) => {
  emit('change-page', page);
};
</script>

<style scoped>
.main-navbar {
  width: 100%;
  background: rgba(5, 6, 7, 0.92);
  border-bottom: 1px solid var(--border-color);
  box-shadow: inset 0 -1px 0 rgba(231, 236, 239, 0.04);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 40px;
  margin-bottom: 14px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
  backdrop-filter: blur(10px);
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.navbar-right {
  display: flex;
  flex-direction: row-reverse;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.nav-locale-wrap {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  cursor: pointer;
}

.nav-locale-label {
  font-size: 0.65rem;
  color: var(--text-secondary);
  white-space: nowrap;
  line-height: 1.2;
}

.nav-locale {
  appearance: auto;
  background: #090c10;
  border: 1px solid var(--border-color);
  border-radius: 2px;
  color: var(--text-color);
  font-size: 0.72rem;
  padding: 5px 8px;
  cursor: pointer;
  max-width: 118px;
  line-height: 1.3;
}

.nav-locale:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}

.nav-tabs {
  display: flex;
  gap: 6px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 16px;
  background: rgba(13, 16, 19, 0.78);
  border: 1px solid rgba(111, 122, 132, 0.28);
  border-radius: 2px;
  color: var(--text-secondary);
  font-size: 0.86rem;
  font-weight: 700;
  cursor: pointer;
<<<<<<< Updated upstream
=======
  letter-spacing: 0;
  text-transform: uppercase;
>>>>>>> Stashed changes
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
  position: relative;
}

.nav-tab:hover {
  color: var(--text-color);
  background: rgba(45, 212, 191, 0.08);
  border-color: rgba(45, 212, 191, 0.45);
}

.nav-tab.active {
  color: var(--text-color);
  background: rgba(79, 182, 255, 0.12);
  border-color: var(--primary-color);
}

.nav-tab.active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 3px;
  background: var(--accent-orange);
}

.nav-tab i {
  font-size: 1.1rem;
}

.logo-img {
  height: 34px;
  width: auto;
  object-fit: contain;
  display: block;
  filter: grayscale(0.2) contrast(1.1);
}

@media (max-width: 900px) {
  .main-navbar {
    padding: 12px 15px;
    gap: 8px;
  }
  
  .nav-tab {
    padding: 8px 14px;
    font-size: 0.9rem;
  }
  
  .nav-tab i {
    font-size: 1rem;
  }
  
  .logo-img {
    height: 35px;
  }
}

@media (max-width: 600px) {
  .main-navbar {
    padding: 10px 10px;
  }
  
  .nav-tab {
    padding: 8px 12px;
    font-size: 0.8rem;
    gap: 6px;
  }
  
  .nav-tab span {
    display: none;
  }

  .nav-locale-label {
    display: none;
  }

  .nav-locale {
    max-width: 108px;
    font-size: 0.7rem;
    padding: 4px 6px;
  }
  
  .nav-tab i {
    font-size: 1.2rem;
  }
  
  .logo-img {
    height: 30px;
  }
}
</style>

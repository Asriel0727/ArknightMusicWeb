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
  background: var(--card-bg);
  border-radius: 0 0 32px 32px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 40px;
  margin-bottom: 18px;
  flex-wrap: nowrap;
  min-width: 0;
  overflow-x: auto;
}

.navbar-left {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.navbar-right {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
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
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  font-size: 0.72rem;
  padding: 3px 6px;
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
  gap: 8px;
}

.nav-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 2px solid transparent;
  border-radius: 12px;
  color: var(--text-secondary);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.nav-tab:hover {
  color: var(--text-color);
  background: rgba(88, 166, 255, 0.1);
}

.nav-tab.active {
  color: var(--primary-color);
  background: rgba(88, 166, 255, 0.15);
  border-color: var(--primary-color);
}

.nav-tab i {
  font-size: 1.1rem;
}

.logo-img {
  height: 40px;
  width: auto;
  object-fit: contain;
  display: block;
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
    border-radius: 0 0 20px 20px;
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

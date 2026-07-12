<template>
  <nav class="main-navbar">
    <div class="navbar-left">
      <div class="nav-tabs">
        <button
          v-if="!authState.user"
          class="nav-tab"
          :class="{ active: currentPage === 'auth' }"
          @click="changePage('auth')"
        >
          <i class="fas fa-user-circle"></i>
          <span>{{ $t('auth.nav') }}</span>
        </button>
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
        <button
          v-if="authState.user"
          class="nav-tab"
          :class="{ active: currentPage === 'library' }"
          @click="changePage('library')"
        >
          <i class="fas fa-bookmark"></i>
          <span>{{ $t('userLibrary.nav') }}</span>
        </button>
      </div>
    </div>
    <div class="navbar-right">
      <div class="nav-utility-panel">
        <div class="utility-stack">
          <div class="auth-box" :class="{ signed: authState.user }">
            <span class="session-indicator" aria-hidden="true"></span>
            <i class="fas fa-user-circle auth-icon" aria-hidden="true"></i>
            <template v-if="authState.user">
              <span class="auth-email">{{ authState.user.loginKey }}</span>
              <button class="auth-btn ghost" type="button" @click="handleSignOut">{{ $t('auth.signOut') }}</button>
            </template>
            <template v-else>
              <span class="auth-email">{{ $t('auth.guest') }}</span>
            </template>
          </div>
          <label class="nav-locale-wrap">
            <span class="nav-locale-label" :title="$t('language.label')" aria-hidden="true">
              <i class="fas fa-globe"></i>
            </span>
            <select v-model="localeModel" class="nav-locale" :aria-label="$t('language.label')">
              <option v-for="option in localeOptions" :key="option.value" :value="option.value">
                {{ $t(option.labelKey) }}
              </option>
            </select>
          </label>
        </div>
        <div class="brand-mark">
          <img :src="`${baseUrl}logo.png`" :alt="$t('nav.logoAlt')" class="logo-img" />
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup>
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppLocale } from '../composables/useAppLocale.js';
import { authState, initAuth, signOut } from '../services/auth.js';

const { locale } = useI18n();
const { setLocale } = useAppLocale();

const localeModel = computed({
  get: () => locale.value,
  set: (v) => setLocale(v),
});

const localeOptions = [
  { value: 'zh-TW', labelKey: 'language.zhTW' },
  { value: 'zh-CN', labelKey: 'language.zhCN' },
  { value: 'en', labelKey: 'language.en' },
  { value: 'ja', labelKey: 'language.ja' },
  { value: 'ko', labelKey: 'language.ko' },
];

// Use Vite BASE_URL so assets still resolve under GitHub Pages base paths.
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

const handleSignOut = () => {
  signOut();
  if (props.currentPage === 'library') {
    changePage('albums');
  }
};

onMounted(() => {
  initAuth().catch(() => {});
});
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
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.nav-utility-panel {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(168px, auto) auto;
  align-items: center;
  gap: 14px;
  padding: 8px 10px 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  background:
    linear-gradient(135deg, rgba(88, 166, 255, 0.08), rgba(255, 255, 255, 0.02)),
    rgba(13, 17, 23, 0.42);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.utility-stack {
  min-width: 0;
  display: grid;
  gap: 8px;
}

.auth-box {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  justify-content: flex-start;
  color: var(--text-secondary);
}

.auth-box.signed {
  color: var(--text-color);
}

.session-indicator {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(139, 148, 158, 0.85);
  box-shadow: 0 0 0 3px rgba(139, 148, 158, 0.1);
  flex: 0 0 auto;
}

.auth-box.signed .session-indicator {
  background: #3fb950;
  box-shadow: 0 0 0 3px rgba(63, 185, 80, 0.14);
}

.auth-icon {
  color: var(--text-secondary);
  font-size: 0.9rem;
  flex: 0 0 auto;
}

.auth-input {
  width: 118px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-color);
  padding: 5px 7px;
  font-size: 0.75rem;
}

.auth-actions {
  display: flex;
  gap: 5px;
}

.auth-btn {
  border: 1px solid var(--primary-color);
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.1);
  color: var(--primary-color);
  padding: 4px 9px;
  font-size: 0.75rem;
  line-height: 1.2;
  cursor: pointer;
  flex: 0 0 auto;
}

.auth-btn.ghost {
  background: rgba(88, 166, 255, 0.1);
}

.auth-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.auth-email {
  color: var(--text-secondary);
  font-size: 0.75rem;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.auth-error {
  color: #ff7b72;
  font-size: 0.7rem;
  width: 100%;
  text-align: center;
}

.nav-locale-wrap {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex-shrink: 0;
  cursor: pointer;
}

.nav-locale-label {
  width: 28px;
  height: 28px;
  color: var(--text-secondary);
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 8px;
  background: rgba(88, 166, 255, 0.08);
  border: 1px solid rgba(88, 166, 255, 0.14);
}

.nav-locale-label i {
  font-size: 1rem;
}

.nav-locale {
  appearance: auto;
  background: #161b22;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #f0f6fc;
  font-size: 0.72rem;
  padding: 5px 8px;
  cursor: pointer;
  width: 100%;
  max-width: 136px;
  line-height: 1.3;
}

.nav-locale option {
  background: #161b22;
  color: #f0f6fc;
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
  height: 38px;
  width: auto;
  max-width: 116px;
  object-fit: contain;
  display: block;
}

.brand-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 94px;
  padding-left: 12px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
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

  .nav-utility-panel {
    grid-template-columns: minmax(150px, auto) auto;
    gap: 10px;
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

  .navbar-right {
    flex-shrink: 0;
  }

  .nav-utility-panel {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
    padding: 8px;
    border-radius: 12px;
  }

  .utility-stack {
    gap: 6px;
  }

  .auth-box {
    gap: 5px;
  }

  .auth-email {
    max-width: 82px;
  }

  .nav-locale {
    max-width: 104px;
    font-size: 0.7rem;
    padding: 4px 6px;
  }
  
  .nav-tab i {
    font-size: 1.2rem;
  }
  
  .logo-img {
    height: 28px;
    max-width: 92px;
  }

  .brand-mark {
    width: 100%;
    justify-content: center;
    min-width: 0;
    padding-left: 0;
    padding-top: 7px;
    border-left: 0;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }
}
</style>


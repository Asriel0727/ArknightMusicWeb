import { createI18n } from 'vue-i18n';
import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import { setGameDataFolderFromUiLocale } from '../services/gameDataSource.js';
import { APP_LOCALE_STORAGE_KEY } from './constants.js';

const SUPPORTED = new Set(['zh-TW', 'zh-CN', 'en', 'ja', 'ko']);

function readInitialLocale() {
  if (typeof localStorage === 'undefined') return 'zh-TW';
  try {
    const saved = localStorage.getItem(APP_LOCALE_STORAGE_KEY);
    if (saved && SUPPORTED.has(saved)) return saved;
  } catch {
    /* ignore */
  }
  return 'zh-TW';
}

const initialLocale = readInitialLocale();
setGameDataFolderFromUiLocale(initialLocale);

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    'zh-TW': zhTW,
    'zh-CN': zhCN,
    en,
    ja,
    ko,
  },
});

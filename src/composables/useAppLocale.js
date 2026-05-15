import { useI18n } from 'vue-i18n';
import { setGameDataFolderFromUiLocale } from '../services/gameDataSource.js';
import { invalidateArknightsCaches } from '../services/api.js';
import { APP_LOCALE_STORAGE_KEY } from '../i18n/constants.js';

export function useAppLocale() {
  const { locale } = useI18n();

  function setLocale(code) {
    if (locale.value === code) return;
    locale.value = code;
    try {
      localStorage.setItem(APP_LOCALE_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setGameDataFolderFromUiLocale(code);
    invalidateArknightsCaches();
    window.dispatchEvent(new CustomEvent('app-locale-changed', { detail: code }));
  }

  return { locale, setLocale };
}

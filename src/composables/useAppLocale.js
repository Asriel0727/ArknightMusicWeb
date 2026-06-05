import { useI18n } from 'vue-i18n';
import { setGameDataFolderFromUiLocale } from '../services/gameDataSource.js';
import { invalidateArknightsCaches, syncFactionI18nMessages } from '../services/api.js';
import { i18n } from '../i18n/index.js';
import { APP_LOCALE_STORAGE_KEY } from '../i18n/constants.js';
import { playerState, refreshLyricTranslations } from '../stores/player.js';

export function useAppLocale() {
  const { locale } = useI18n();

  async function setLocale(code) {
    if (locale.value === code) return;
    locale.value = code;
    try {
      localStorage.setItem(APP_LOCALE_STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
    setGameDataFolderFromUiLocale(code);
    invalidateArknightsCaches();
    await syncFactionI18nMessages(i18n);
    if (playerState.showLyricTranslation && playerState.lyrics.length > 0) {
      refreshLyricTranslations();
    }
    window.dispatchEvent(new CustomEvent('app-locale-changed', { detail: code }));
  }

  return { locale, setLocale };
}

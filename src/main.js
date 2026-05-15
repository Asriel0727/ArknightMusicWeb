import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import { syncFactionI18nMessages } from './services/api.js';
import '/public/styles.css';
import textGlitchDirective from './directives/textGlitch.js';

const app = createApp(App);
app.use(i18n);
app.directive('text-glitch', textGlitchDirective);

syncFactionI18nMessages(i18n).finally(() => {
  app.mount('#app');
});


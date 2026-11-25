import { createApp } from 'vue';
import App from './App.vue';
import { i18n } from './i18n/index.js';
import './styles/operatorModal.css';
import './styles/cursors.css';
import textGlitchDirective from './directives/textGlitch.js';

const app = createApp(App);
app.use(i18n);
app.directive('text-glitch', textGlitchDirective);
app.mount('#app');

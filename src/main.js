import { createApp } from 'vue';
import App from './App.vue';
import '/public/styles.css';
import textGlitchDirective from './directives/textGlitch.js';

const app = createApp(App);
app.directive('text-glitch', textGlitchDirective);
app.mount('#app');


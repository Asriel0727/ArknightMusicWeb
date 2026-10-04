import { loadCustomizations, finishCustomizations } from './story-customizations.mjs';
await finishCustomizations(await loadCustomizations(), { checkpoint: true });

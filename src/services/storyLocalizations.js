let indexPromise;
const localizedScripts = new Map();
async function digest(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, '0')).join('');
}

export async function loadLocalizedStory({ root, storyId, locale, source }) {
  if (!['en', 'ja', 'ko'].includes(locale)) return { source, status: 'original' };
  try {
    if (!indexPromise) {
      indexPromise = fetch(`${root}localizations/index.json`).then(response => {
        if (!response.ok) throw new Error('Translation index unavailable');
        return response.json();
      }).catch(error => { indexPromise = null; throw error; });
    }
    const index = await indexPromise;
    const entry = index.locales?.[locale]?.[storyId];
    if (!entry || entry.sourceHash !== await digest(source)) return { source, status: 'missing' };
    if (entry.path !== `localizations/${locale}/${storyId}.txt`) throw new Error('Invalid translation path');
    const key = entry.translationHash;
    if (!localizedScripts.has(key)) {
      const response = await fetch(`${root}${entry.path}`);
      if (!response.ok) throw new Error('Translation unavailable');
      const translated = await response.text();
      if (await digest(translated) !== entry.translationHash) throw new Error('Translation checksum mismatch');
      // Bound memory while keeping recently read segments available.
      if (localizedScripts.size >= 8) localizedScripts.delete(localizedScripts.keys().next().value);
      localizedScripts.set(key, translated);
    }
    return { source: localizedScripts.get(key), status: 'game' };
  } catch {
    return { source, status: 'failed' };
  }
}

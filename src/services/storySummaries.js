const files = new Map();
async function loadFile(root, locale) {
  const key = `${root}/${locale}`;
  if (!files.has(key)) {
    files.set(key, fetch(`${root}summaries/${locale}.json`).then(async response => {
      if (!response.ok) throw new Error('Story summaries unavailable');
      const data = await response.json();
      if (data.schemaVersion !== 1 || data.locale !== locale || !data.stories) throw new Error('Invalid story summaries');
      return data.stories;
    }).catch(error => { files.delete(key); throw error; }));
  }
  return files.get(key);
}
export async function loadStorySummary({ root, storyId, locale }) {
  const language = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko'].includes(locale) ? locale : 'en';
  try {
    const stories = await loadFile(root, language);
    const text = stories[storyId]?.text;
    return typeof text === 'string' && text.trim() ? { text: text.trim(), status: 'ready' } : { text: '', status: 'missing' };
  } catch { return { text: '', status: 'failed' }; }
}

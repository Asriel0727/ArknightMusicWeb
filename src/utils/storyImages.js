export function prtsThumbnailUrl(source, width = 480) {
  try {
    const url = new URL(source);
    if (url.origin !== 'https://media.prts.wiki' || !/^\/[a-f0-9]\/[a-f0-9]{2}\/[^/]+\.(png|jpe?g)$/i.test(url.pathname)) return source;
    const filename = url.pathname.split('/').pop();
    url.pathname = `/thumb${url.pathname}/${width}px-${filename}`;
    return url.href;
  } catch { return source; }
}

export const storyCoverPlaceholder = 'archive-cover.svg';

export function isEmptyStoryCover(source) {
  return !source || source === storyCoverPlaceholder || /\/Avg_(?:bg_)*(?:black|white|empty|transparent)\.(?:png|jpe?g)(?:\?|$)/i.test(source);
}

export function selectStoryCover(assets = {}, firstVisual) {
  const source = (id) => assets[id]?.url || assets[id]?.sourceUrl || '';
  const valid = (id) => !isEmptyStoryCover(source(id));
  const ids = Object.keys(assets);
  const id = firstVisual && valid(firstVisual) ? firstVisual : ids.find(id => id.startsWith('bg_') && valid(id)) || ids.find(valid);
  return id ? source(id) : '';
}

export function fillStoryCoverFallbacks(catalog) {
  const key = (story) => `${story.archiveCategory || story.category}/${story.archiveCategory === 'beta' ? `${story.section}/` : ''}${story.group}`;
  const covers = new Map();
  for (const story of catalog) if (!isEmptyStoryCover(story.cover) && !covers.has(key(story))) covers.set(key(story), story.cover);
  return catalog.map(story => {
    if (!isEmptyStoryCover(story.cover)) return story;
    const cover = covers.get(key(story));
    return { ...story, cover: cover || storyCoverPlaceholder, coverOrigin: cover ? 'collection' : 'placeholder' };
  });
}

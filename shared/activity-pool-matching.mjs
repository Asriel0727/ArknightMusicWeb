// Matching requires event/operator evidence; a coincident date is never enough.
export function identity(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function eventIdentity(value) {
  return identity(String(value || '').replace(/^wiki-/u, '').replace(/(?:[·・\s/-]*(?:rerun|復刻|复刻)|20\d{2})$/iu, ''));
}

export function decodeHtml(value) {
  return String(value || '').replace(/&#x([\da-f]+);/giu, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/gu, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, '').trim();
}

export function localDate(timestamp, server) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time)) return '';
  return new Date(time + (server === 'global' ? -7 : 8) * 3_600_000).toISOString().slice(0, 10);
}

export function dateDistance(left, right) {
  return Math.abs(Date.parse(left) - Date.parse(right)) / 86_400_000;
}

export function parseBannerRows(html) {
  return [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((match) => match[1]).filter((row) => row.includes('class="banner"') && row.includes('character-tooltip'))
    .map((row) => {
      const title = decodeHtml(row.match(/<div[^>]*text-align:center[^>]*><b>([\s\S]*?)<\/b>/)?.[1]);
      const imageFile = decodeHtml(row.match(/<img alt="([^"]+\.png)"/)?.[1]);
      const dates = {};
      for (const match of row.matchAll(/<b>(CN|Global|TW) date:<\/b>\s*(\d{4})\/(\d{2})\/(\d{2})(?:\s*(?:&#8211;|–|&ndash;|-)\s*(\d{4})\/(\d{2})\/(\d{2}))?/g)) {
        dates[match[1].toLowerCase()] = {
          start: `${match[2]}-${match[3]}-${match[4]}`,
          end: match[5] ? `${match[5]}-${match[6]}-${match[7]}` : null,
        };
      }
      const operators = [...row.matchAll(/class="character-tooltip"([^>]*)>/g)].map((match) => {
        const name = decodeHtml(match[1].match(/data-name="([^"]+)"/)?.[1]);
        const rarity = Number(match[1].match(/data-star="(\d)"/)?.[1]);
        const prefix = row.slice(Math.max(0, match.index - 230), match.index);
        return { name, rarity, featured: /border:1px solid #FF8000/iu.test(prefix) ? 'secondary' : 'primary',
          limited: /border:1px solid #FF(?:0000|8000)/iu.test(prefix) };
      });
      return { title, imageFile, dates, operators };
    }).filter((banner) => banner.title && banner.imageFile && banner.operators.length);
}

export function activityEventKeys(activity, siblings = []) {
  const names = [activity.code, ...Object.values(activity.name_i18n || {})].map(eventIdentity).filter(Boolean);
  const keys = new Set(names);
  for (const sibling of siblings) {
    const other = [sibling.code, ...Object.values(sibling.name_i18n || {})].map(eventIdentity).filter(Boolean);
    if (other.some((key) => names.includes(key))) other.forEach((key) => keys.add(key));
  }
  return keys;
}

export function matchActivityBanner(activity, server, banners, releases, siblings = [], reference = null) {
  const keys = activityEventKeys(activity, siblings);
  const eventReleases = releases.filter((row) => keys.has(eventIdentity(row.event_name)));
  const debutNames = new Set(eventReleases.map((row) => identity(row.operator_name)));
  const rerun = /rerun|復刻|复刻|20\d{2}/iu.test(`${activity.code} ${Object.values(activity.name_i18n || {}).join(' ')}`);
  const candidates = banners.flatMap((banner) => {
    const explicit = banner.confirmed_activity_code === activity.code;
    if (banner.confirmed_activity_code && !explicit) return [];
    if (/kernel|standard (?:pool|headhunting)|joint operation|celebrate.*recollect|locating|orienteering/iu.test(banner.title)) return [];
    const bannerRerun = /rerun|復刻|复刻/iu.test(banner.title);
    if (rerun !== bannerRerun && !explicit) return [];
    const newOperators = banner.operators.filter((operator) => operator.featured !== 'secondary' && debutNames.has(identity(operator.name)));
    const sameReference = reference && identity(banner.title.replace(/rerun/giu, '')) === identity(reference.title.replace(/rerun/giu, ''));
    if (!newOperators.length && !sameReference && !explicit) return [];
    const date = banner.dates[server];
    const distance = date ? dateDistance(localDate(activity.window?.start_at, server), date.start) : Infinity;
    if (date && distance > 1) return [];
    // Without a regional banner date, only an original event's independently
    // recorded debut date can establish availability. Never borrow Global dates.
    if (!date && !explicit && (rerun || !newOperators.some((operator) => eventReleases.some((release) =>
      identity(release.operator_name) === identity(operator.name)
      && dateDistance(localDate(release.release_at, server), localDate(activity.window?.start_at, server)) <= 1)))) return [];
    if (!date && server !== 'tw' && !explicit) return [];
    return [{ banner, eventReleases, newOperators, distance, score: (explicit ? 1000 : 0) + (date ? 100 : 0) + newOperators.length }];
  }).sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  // Multiple distinct banners with equal evidence need a source review.
  if (candidates[1]?.score === candidates[0].score && identity(candidates[1].banner.title) !== identity(candidates[0].banner.title)) return null;
  return candidates[0];
}


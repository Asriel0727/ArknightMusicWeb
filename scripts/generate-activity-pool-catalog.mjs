import fs from 'node:fs/promises';

const API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const WIKI_API = 'https://arknights.wiki.gg/api.php';
const CN_EXCEL_BASE = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';
const OUTPUT = new URL('../src/data/generatedActivityPools.js', import.meta.url);
const SERVERS = ['tw', 'global', 'cn'];
const OPERATOR_ID_ALIASES = new Map([
  ['leto', 'char_194_leto'],
  ['rosa', 'char_197_poca'],
  ['pozëmka', 'char_4055_bgsnow'],
  ['snegurochka', 'char_4208_wintim'],
  ['vetochki', 'char_4207_branch'],
].map(([name, id]) => [identity(name), id]));

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#91;/g, '[')
    .replace(/&#93;/g, ']')
    .replace(/&#32;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/<[^>]+>/g, '')
    .trim();
}

function identity(value) {
  return String(value || '').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function localDate(timestamp, server) {
  const date = new Date(timestamp);
  const offsetHours = server === 'global' ? -7 : 8;
  return new Date(date.getTime() + offsetHours * 3_600_000).toISOString().slice(0, 10);
}

function dateDistance(left, right) {
  return Math.abs(Date.parse(`${left}T00:00:00Z`) - Date.parse(`${right}T00:00:00Z`)) / 86_400_000;
}

function parseBannerRows(html) {
  return [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((match) => match[1])
    .filter((row) => row.includes('class="banner"') && row.includes('character-tooltip'))
    .map((row) => {
      const title = decodeHtml(row.match(/<div[^>]*text-align:center[^>]*><b>([\s\S]*?)<\/b>/)?.[1]);
      const imageFile = decodeHtml(row.match(/<img alt="([^"]+(?:banner|Banner)[^"]*\.png)"/)?.[1]);
      const dates = {};
      for (const match of row.matchAll(/<b>(CN|Global|TW) date:<\/b>\s*(\d{4})\/(\d{2})\/(\d{2})/g)) {
        dates[match[1] === 'CN' ? 'cn' : match[1].toLowerCase()] = `${match[2]}-${match[3]}-${match[4]}`;
      }
      const operators = [...row.matchAll(/class="character-tooltip"[^>]*data-star="(\d)"[^>]*data-name="([^"]+)"/g)]
        .map((operatorMatch) => ({ rarity: Number(operatorMatch[1]), name: decodeHtml(operatorMatch[2]) }));
      return { title, imageFile, dates, operators };
    })
    .filter((banner) => banner.title && banner.imageFile && banner.operators.length);
}

function bannerScore(activity, banner, server) {
  const bannerDate = banner.dates[server] || (server === 'tw' ? banner.dates.global : null);
  if (!bannerDate) return -Infinity;
  const distance = dateDistance(localDate(activity.window.start_at, server), bannerDate);
  if (distance > 1) return -Infinity;
  const activityText = `${activity.code} ${Object.values(activity.name_i18n || {}).join(' ')}`.toLowerCase();
  const bannerText = banner.title.toLowerCase();
  let score = 100 - distance * 20;
  if (activityText.includes('rerun') || /復刻|复刻/u.test(activityText)) {
    if (!/rerun|復刻|复刻/u.test(bannerText)
      && activity.code !== 'wiki-heart-of-surging-flame-rerun') return -Infinity;
    score += /rerun|復刻|复刻/u.test(bannerText) ? 30 : -30;
  }
  if (/standard pool|kernel|joint operation|celebrate & recollect|orienteering/i.test(bannerText)) score -= 100;
  if (/limited-time|limited|crossover/i.test(bannerText)) score += 10;
  return score;
}

function bannerKind(title) {
  if (/crossover|limited headhunting/i.test(title)) return 'limited';
  if (/limited-time/i.test(title)) return 'event';
  if (/kernel/i.test(title)) return 'kernel';
  return 'standard';
}

function gachaDate(entry) {
  return new Date(Number(entry.openTime) * 1000).toISOString().slice(0, 10);
}

function operatorIdsInGacha(entry, characterEntries) {
  const rateUpSection = String(entry.gachaPoolDetail || '').split('※全部可能')[0];
  return new Set(characterEntries
    .filter(([, character]) => character.name && rateUpSection.includes(character.name))
    .map(([id]) => id));
}

function localizedImageIdentity(fileName) {
  return identity(decodeURIComponent(fileName).replace(/^(?:EN|CN|TW)[ _]/iu, ''));
}

async function localizedWikiFiles() {
  const result = new Map();
  let continuation = '';
  do {
    const url = `${WIKI_API}?action=query&list=categorymembers&cmtitle=${encodeURIComponent('Category:Headhunting banner images')}&cmtype=file&cmlimit=max&format=json&origin=*${continuation ? `&cmcontinue=${encodeURIComponent(continuation)}` : ''}`;
    const data = await fetch(url).then((response) => response.json());
    for (const member of data.query?.categorymembers || []) {
      const file = String(member.title || '').replace(/^File:/u, '');
      const language = file.match(/^(EN|CN|TW)[ _]/iu)?.[1]?.toUpperCase();
      if (!language) continue;
      const key = localizedImageIdentity(file);
      const variants = result.get(key) || {};
      variants[language] = file;
      result.set(key, variants);
    }
    continuation = data.continue?.cmcontinue || '';
  } while (continuation);
  return result;
}

const [operatorResponse, cnCharacterTable, cnGachaTable, ...activityResponses] = await Promise.all([
  fetch(`${API_BASE}/api/recruit/operators`).then((response) => response.json()),
  fetch(`${CN_EXCEL_BASE}/character_table.json`).then((response) => response.json()),
  fetch(`${CN_EXCEL_BASE}/gacha_table.json`).then((response) => response.json()),
  ...SERVERS.map((server) => fetch(`${API_BASE}/api/activities?server=${server}`).then((response) => response.json())),
]);
const operatorByName = new Map();
for (const operator of operatorResponse.operators || []) {
  for (const name of [operator.name, operator.appellation]) {
    if (name) operatorByName.set(identity(name), operator);
  }
}

const yearlyPages = await Promise.all(
  Array.from({ length: 8 }, (_, index) => 2019 + index).map(async (year) => {
    const url = `${WIKI_API}?action=parse&page=${encodeURIComponent(`Headhunting/Banners/${year}`)}&prop=text&format=json&origin=*`;
    const data = await fetch(url).then((response) => response.json());
    return parseBannerRows(data.parse?.text?.['*'] || '');
  }),
);
const banners = yearlyPages.flat();
const generated = {};
const cnCharacterEntries = Object.entries(cnCharacterTable || {});
const cnOperatorNameById = new Map(cnCharacterEntries.map(([id, character]) => [id, character.name]));
const cnGachaEntries = (cnGachaTable.gachaPoolClient || []).map((entry) => ({
  entry,
  date: gachaDate(entry),
  operatorIds: operatorIdsInGacha(entry, cnCharacterEntries),
}));

for (const [serverIndex, server] of SERVERS.entries()) {
  const activities = activityResponses[serverIndex]?.activities || [];
  for (const activity of activities) {
    if (!['side_story', 'intermezzi', 'collaboration'].includes(activity.type)) continue;
    const match = banners
      .map((banner) => ({ banner, score: bannerScore(activity, banner, server) }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort((left, right) => right.score - left.score)[0];
    if (!match || match.score < 20) continue;
    const operators = match.banner.operators.map((entry) => {
      const operator = operatorByName.get(identity(entry.name));
      const operatorId = operator?.id || OPERATOR_ID_ALIASES.get(identity(entry.name)) || '';
      return {
        id: operatorId,
        rarity: entry.rarity,
        featured: 'primary',
        name_i18n: {
          en: entry.name,
          ...(cnOperatorNameById.get(operatorId) ? { 'zh-CN': cnOperatorNameById.get(operatorId) } : {}),
        },
      };
    });
    generated[activity.code] ||= {};
    generated[activity.code][server] = [{
      slug: identity(match.banner.title),
      kind: bannerKind(match.banner.title),
      name_i18n: { en: match.banner.title.replace(/^\[[^\]]+\]\s*/u, '') },
      image_url: `https://arknights.wiki.gg/wiki/Special:Redirect/file/${match.banner.imageFile.replace(/ /g, '_')}`,
      operators,
      source_url: `https://arknights.wiki.gg/wiki/Headhunting/Banners`,
    }];
  }
}

const cnActivitiesByCode = new Map(
  (activityResponses[SERVERS.indexOf('cn')]?.activities || []).map((activity) => [activity.code, activity]),
);
for (const [code, serverPools] of Object.entries(generated)) {
  const cnActivity = cnActivitiesByCode.get(code);
  const referencePool = serverPools.cn?.[0] || serverPools.global?.[0] || serverPools.tw?.[0];
  if (!cnActivity || !referencePool) continue;
  const activityDate = localDate(cnActivity.window.start_at, 'cn');
  const referenceIds = new Set((referencePool.operators || []).map((operator) => operator.id).filter(Boolean));
  const match = cnGachaEntries
    .map((candidate) => {
      const overlap = [...referenceIds].filter((id) => candidate.operatorIds.has(id)).length;
      return { ...candidate, overlap, distance: dateDistance(activityDate, candidate.date) };
    })
    .filter((candidate) => candidate.distance <= 1 && candidate.overlap > 0)
    .sort((left, right) => right.overlap - left.overlap || left.distance - right.distance)[0];
  if (!match) continue;
  for (const pools of Object.values(serverPools)) {
    for (const pool of pools) pool.name_i18n['zh-CN'] = match.entry.gachaPoolName;
  }
}

const generatedPools = Object.values(generated).flatMap((servers) => Object.values(servers).flat());
const availableLocalizedFiles = await localizedWikiFiles();
for (const pool of generatedPools) {
  const englishFile = decodeURIComponent(pool.image_url.split('/').at(-1));
  const variants = availableLocalizedFiles.get(localizedImageIdentity(englishFile)) || {};
  const cnUrl = variants.CN
    ? `https://arknights.wiki.gg/wiki/Special:Redirect/file/${variants.CN.replace(/ /g, '_')}`
    : '';
  const twUrl = variants.TW
    ? `https://arknights.wiki.gg/wiki/Special:Redirect/file/${variants.TW.replace(/ /g, '_')}`
    : '';
  pool.image_urls = {
    en: pool.image_url,
    ...(cnUrl ? { 'zh-CN': cnUrl } : {}),
    ...(twUrl || cnUrl ? { 'zh-TW': twUrl || cnUrl } : {}),
  };
}

await fs.writeFile(OUTPUT, `// Generated by scripts/generate-activity-pool-catalog.mjs.\nexport default ${JSON.stringify(generated, null, 2)};\n`, 'utf8');
console.log(`Generated ${Object.keys(generated).length} activity mappings at ${OUTPUT.pathname}`);

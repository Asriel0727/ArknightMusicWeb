import fs from 'node:fs/promises';
import OpenCC from 'opencc-js';
import { activityExpectsRecruitmentPool, attachCuratedActivityRecruitmentPools, getActivityClassification } from '../src/data/activityCatalog.js';
import { identity, eventIdentity, parseBannerRows, matchActivityBanner, localDate, dateDistance } from '../shared/activity-pool-matching.mjs';

const ROOT = new URL('../', import.meta.url);
const API = 'https://arknights-recruit-api.molly27molly.workers.dev';
const WIKI = 'https://arknights.wiki.gg/api.php';
const CN = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';
const EN = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/en_US/gamedata/excel';
const TW = 'https://raw.githubusercontent.com/arkntools/arknights-data-tw-for-maa/main';
const toCN = OpenCC.Converter({ from: 'tw', to: 'cn' });
const SERVERS = ['cn', 'global', 'tw'];
const refresh = process.argv.includes('--refresh');
await fs.mkdir(new URL('tmp/activity-pools/', ROOT), { recursive: true });

async function source(name, url) {
  const file = new URL(`tmp/activity-pools/${name}.json`, ROOT);
  if (!refresh) {
    try {
      const cached = JSON.parse(await fs.readFile(file, 'utf8'));
      if (!cached.error && cached.ok !== false) return cached;
    } catch { /* first download */ }
  }
  if (url.startsWith(WIKI)) await new Promise((resolve) => setTimeout(resolve, 1300));
  const response = await fetch(url, { headers: { 'user-agent': 'ArknightMusicWeb/2.0 (activity pool source comparison)' } });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = await response.json();
  if (data.error || data.ok === false) throw new Error(`${name}: ${JSON.stringify(data.error || data)}`);
  await fs.writeFile(file, JSON.stringify(data));
  return data;
}

const activities = {}, releases = {}, gacha = {};
await Promise.all(SERVERS.map(async (server) => {
  const [a, r] = await Promise.all([
    source(`activities-${server}`, `${API}/api/activities?server=${server}`),
    source(`releases-${server}`, `${API}/api/recruit/releases?server=${server}`),
  ]);
  activities[server] = a.activities;
  releases[server] = r.releases;
  if (!Array.isArray(a.activities) || !Array.isArray(r.releases)) throw new Error(`Incomplete ${server} source`);
}));
const [characters, cnGacha, enGacha, twGacha] = await Promise.all([
  source('characters-cn', `${CN}/character_table.json`),
  source('gacha-cn', `${CN}/gacha_table.json`),
  source('gacha-global', `${EN}/gacha_table.json`),
  source('gacha-tw', `${TW}/gacha_table.json`),
]);
gacha.cn = cnGacha.gachaPoolClient;
gacha.global = enGacha.gachaPoolClient;
gacha.tw = twGacha.gachaPoolClient;
const operatorByName = new Map();
for (const [id, character] of Object.entries(characters)) {
  if (character.isNotObtainable) continue;
  for (const name of [character.name, character.appellation]) {
    if (name) operatorByName.set(identity(name), { id, character });
  }
}
for (const rows of Object.values(releases)) {
  for (const release of rows) {
    const id = release.character_id;
    if (characters[id]) operatorByName.set(identity(release.operator_name), { id, character: characters[id] });
  }
}
const banners = [];
// Wiki archives are organized by Global release year (the first is 2020).
for (let year = 2020; year <= new Date().getUTCFullYear(); year += 1) {
  const payload = await source(`banners-${year}`, `${WIKI}?action=parse&page=Headhunting%2FBanners%2F${year}&prop=text&format=json`);
  const parsed = parseBannerRows(payload.parse?.text?.['*']);
  if (!parsed.length) throw new Error(`No banner rows parsed for ${year}; refusing to erase the catalog`);
  banners.push(...parsed.map((banner) => ({ ...banner, source_url: `https://arknights.wiki.gg/wiki/Headhunting/Banners/${year}` })));
}
// Recent banners may not yet have an archive row. Parse the official notice,
// including the explicit rate-up list; event reward operators are excluded.
for (const notice of [
  { key: 'month', url: 'https://ak.hypergryph.com/news/9681', pool: '石白深蓝之夜', title: 'Some Evening of White and Mystic Blue', file: 'CN Some Evening of White and Mystic Blue banner.png', limited: true },
  { key: 'wave', url: 'https://ak.hypergryph.com/news/5101.html', pool: '海渊巡游', title: 'Drifter of the Depth', file: 'CN Drifter of the Depth banner.png', limited: false },
  { key: 'time', url: 'https://ak.hypergryph.com/news/0787', pool: '将雪投火', title: '将雪投火', file: '', limited: true, announced: true,
    marker: '二、【限定寻访·庆典】', code: 'wiki-vremya-v-put' },
]) {
  const file = new URL(`tmp/activity-pools/notice-${notice.key}.html`, ROOT);
  let html;
  if (!refresh) { try { html = await fs.readFile(file, 'utf8'); } catch { /* download */ } }
  if (!html) {
    const response = await fetch(notice.url);
    if (!response.ok) throw new Error(`Official notice: ${response.status}`);
    html = await response.text();
    await fs.writeFile(file, html);
  }
  const text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  const section = text.slice(text.indexOf(notice.marker || `二、【${notice.pool}】`)).split('三、')[0];
  const times = section.match(/(\d{2})月(\d{2})日\s+(\d{2}:\d{2})\s*-\s*(\d{2})月(\d{2})日\s+(\d{2}:\d{2})/u);
  const up = [...section.matchAll(/(★{4,6})[：:]\s*([^（]+)（([^）]+)）/gu)];
  if (!times || !up.length) throw new Error(`Cannot parse official banner ${notice.pool}`);
  const operators = up.flatMap((line) => line[2].split(/[/\\]/u).map((rawName) => {
    const name = rawName.replace(/\[限定\]/gu, '').trim();
    let character = operatorByName.get(identity(name));
    if (!character && notice.announced) {
      character = { id: null, character: { name, appellation: name } };
      operatorByName.set(identity(name), character);
    }
    if (!character) throw new Error(`Unknown official rate-up operator: ${name}`);
    const release = releases.cn.find((row) => row.character_id === character.id);
    return { name: release?.operator_name || character.character.appellation, rarity: line[1].length,
      featured: /剩余|倍权值/gu.test(line[3]) ? 'secondary' : 'primary',
      limited: notice.announced ? rawName.includes('[限定]') : notice.limited };
  }));
  banners.push({ title: `${notice.limited ? '[Crossover] ' : ''}${notice.title}`, imageFile: notice.file, operators,
    dates: { cn: { start: `2026-${times[1]}-${times[2]}`, end: `2026-${times[4]}-${times[5]}` } },
    start_at: `2026-${times[1]}-${times[2]}T${times[3]}:00+08:00`,
    end_at: `2026-${times[4]}-${times[5]}T${times[6]}:00+08:00`,
    source_url: notice.url, pool_name_cn: notice.pool, announced: notice.announced || false,
    confirmed_activity_code: notice.code,
  });
}
const siblings = Object.values(activities).flat();
// Event pages explicitly confirm reruns (including changed 5-star rate-ups).
// Their event window establishes availability, not an exact banner timestamp.
const rerunSources = new Map();
for (const activity of siblings.filter((item) => item.code.startsWith('wiki-') && /rerun/iu.test(item.code)
  && supportedActivity(item) && activityExpectsRecruitmentPool(item))) {
  if (rerunSources.has(activity.code)) continue;
  const title = activity.source_url?.includes('wiki.gg/wiki/')
    ? decodeURIComponent(activity.source_url.split('/wiki/')[1])
    : activity.name_i18n?.en?.replace(/ Rerun$/u, '/Rerun');
  if (!title) continue;
  const payload = await source(`event-${activity.code}`, `${WIKI}?action=parse&prop=wikitext&format=json&page=${encodeURIComponent(title)}`);
  const wikitext = payload.parse?.wikitext?.['*'] || '';
  const section = wikitext.match(/={2,3}Headhunting={2,3}([\s\S]*?)(?=\n={2,3}[^=]|$)/u)?.[1] || '';
  const name = section.match(/'''(.*?)'''/u)?.[1];
  if (!name) { rerunSources.set(activity.code, null); continue; }
  const normalized = (value) => identity(value.replace(/^\[[^\]]+\]\s*/u, '').replace(/\s+rerun$/iu, ''));
  const names = section.match(/with \[\[([^\]]+)\]\][\s\S]*?instead of (?:\[\[([^\]]+)\]\]|([\w ]+))/u);
  const replacement = names ? { next: names[1], previous: names[2] || names[3].trim() } : null;
  const eventDates = {};
  for (const server of SERVERS) {
    const start = wikitext.match(new RegExp(`\\|${server}start\\s*=\\s*(\\d{4})/(\\d{2})/(\\d{2})`));
    if (start) eventDates[server] = `${start[1]}-${start[2]}-${start[3]}`;
  }
  const candidates = banners.filter((banner) => normalized(banner.title) === normalized(name));
  const candidate = candidates.find((banner) => eventDates.cn && banner.dates.cn?.start === eventDates.cn)
    || candidates.find((banner) => !/rerun/iu.test(banner.title)) || candidates[0];
  if (!candidate) { rerunSources.set(activity.code, null); continue; }
  const operators = candidate.operators.map((operator) => replacement && identity(operator.name) === identity(replacement.previous)
    ? { ...operator, name: replacement.next, limited: false, featured: 'primary' } : operator);
  const dates = Object.fromEntries(Object.entries(candidate.dates).filter(([server, date]) => eventDates[server]
    && dateDistance(date.start, eventDates[server]) <= 1));
  const banner = { ...candidate, title: /rerun/iu.test(candidate.title) ? candidate.title : `${name} Rerun`,
    operators, dates, eventDates, confirmed_activity_code: activity.code,
    source_url: `https://arknights.wiki.gg/wiki/${title.replace(/ /g, '_')}` };
  rerunSources.set(activity.code, banner);
  banners.push(banner);
}
const output = {};
const report = { generated_at: new Date().toISOString(), servers: {} };
const references = new Map();
function supportedActivity(activity) {
  const classification = getActivityClassification(activity);
  return classification ? ['story', 'main_story'].includes(classification) : ['side_story', 'intermezzi'].includes(activity.type);
}
// CN originals establish the event's banner identity before regional reruns.
for (const activity of activities.cn) {
  const match = matchActivityBanner(activity, 'cn', banners, releases.cn, siblings);
  if (match) references.set(eventIdentity(activity.code), match.banner);
}

for (const server of SERVERS) {
  const status = { matched: 0, no_pool_expected: [], unresolved: [], operator_time_conflicts: [],
    activity_time_discrepancies: [], debut_time_discrepancies: [], time_precision: {} };
  report.servers[server] = status;
  for (const activity of activities[server].filter(supportedActivity)) {
    if (!activityExpectsRecruitmentPool(activity)) {
      status.no_pool_expected.push(activity.code);
      continue;
    }
    const match = matchActivityBanner(activity, server, banners, releases[server], siblings, references.get(eventIdentity(activity.code)));
    if (!match) {
      status.unresolved.push({ code: activity.code, names: activity.name_i18n, reason: 'No unique banner with event/operator and regional time evidence' });
      continue;
    }
    const { banner } = match;
    const unknownNames = banner.operators.filter((operator) => !operatorByName.has(identity(operator.name))).map((operator) => operator.name);
    if (unknownNames.length) {
      status.unresolved.push({ code: activity.code, names: activity.name_i18n, reason: 'Unresolved operator IDs', operators: unknownNames });
      continue;
    }
    const rarityConflicts = banner.operators.filter((operator) => {
      const character = operatorByName.get(identity(operator.name))?.character;
      const rarity = typeof character?.rarity === 'number' ? character.rarity + 1
        : Number(String(character?.rarity || '').replace('TIER_', ''));
      return rarity && rarity !== operator.rarity;
    });
    if (rarityConflicts.length) {
      status.unresolved.push({ code: activity.code, names: activity.name_i18n,
        reason: 'Operator ID and banner rarity disagree', operators: rarityConflicts });
      continue;
    }
    const operators = banner.operators.map((operator) => {
      const { id, character } = operatorByName.get(identity(operator.name));
      const release = releases[server].find((row) => row.character_id === id || identity(row.operator_name) === identity(operator.name));
      return {
        id, rarity: operator.rarity, featured: operator.featured, limited: operator.limited,
        ...(operator.limited ? { limitedRole: operator.featured === 'secondary' ? 'legacy' : 'current' } : {}),
        name_i18n: { en: operator.name, 'zh-CN': character.name },
        release_at: release?.release_at || (banner.announced && !id ? banner.start_at : null),
        release_status: banner.announced && !id ? 'announced' : 'released',
        release_source_url: release ? `${API}/api/recruit/releases?server=${server}` : banner.announced ? banner.source_url : null,
      };
    });
    const date = banner.dates[server];
    const regionalReferenceDate = date?.start || banner.eventDates?.[server];
    const cnGameCandidates = gacha.cn.filter((pool) => banner.dates.cn
      && dateDistance(localDate(new Date(pool.openTime * 1000).toISOString(), 'cn'), banner.dates.cn.start) <= 1
      && /^(?:SINGLE|LIMITED|LINKAGE)_/u.test(pool.gachaPoolId));
    const cnPoolName = banner.pool_name_cn || (cnGameCandidates.length === 1 ? cnGameCandidates[0].gachaPoolName : null);
    const gameCandidates = (gacha[server] || []).filter((pool) => {
      const titleCNMatch = cnPoolName && identity(toCN(pool.gachaPoolName)) === identity(toCN(cnPoolName));
      if (server !== 'tw' && (!regionalReferenceDate || dateDistance(localDate(new Date(pool.openTime * 1000).toISOString(), server), regionalReferenceDate) > 1)) return false;
      if (server === 'tw' && !titleCNMatch) return false;
      const titleMatch = identity(pool.gachaPoolName) === identity(banner.title.replace(/^\[[^\]]+\]\s*/u, '').replace(/\s+rerun$/iu, ''));
      const targetMatch = operators.some((operator) => operator.id === pool.linkageParam?.guaranteeTarget6Char);
      const eventPool = /^(?:SINGLE|LIMITED|LINKAGE)_/u.test(pool.gachaPoolId);
      const detail = String(pool.gachaPoolDetail || '').split('※全部可能')[0];
      const operatorMatch = operators.some((operator) => operator.rarity === 6 && detail.includes(operator.name_i18n['zh-CN']));
      return titleMatch || titleCNMatch || targetMatch || (server === 'cn' && (eventPool || operatorMatch));
    });
    const original = !/rerun|復刻|复刻|20\d{2}/iu.test(`${activity.code} ${Object.values(activity.name_i18n || {}).join(' ')}`);
    const game = gameCandidates.length === 1 ? gameCandidates[0]
      : server === 'tw' && original && gameCandidates.length > 1
        ? [...gameCandidates].sort((a, b) => a.openTime - b.openTime)[0] : null;
    const gameSource = server === 'cn' ? `${CN}/gacha_table.json` : server === 'tw' ? `${TW}/gacha_table.json` : `${EN}/gacha_table.json`;
    const noticeTime = server === 'cn' && banner.start_at;
    const startDate = game ? localDate(new Date(game.openTime * 1000).toISOString(), server) : date?.start || localDate(activity.window.start_at, server);
    const conflicts = operators.filter((operator) => operator.release_at && localDate(operator.release_at, server) > startDate);
    if (conflicts.length) {
      status.operator_time_conflicts.push({ code: activity.code, banner: banner.title, operators: conflicts });
      status.unresolved.push({ code: activity.code, names: activity.name_i18n, reason: 'Operator debut occurs after banner start' });
      continue;
    }
    const pool = {
      slug: identity(banner.title), kind: /celebration|carnival|festival|limited headhunting|crossover/iu.test(banner.title)
        || operators.some((operator) => operator.featured === 'primary' && operator.limited) ? 'limited' : 'event',
      name_i18n: { en: banner.title.replace(/^\[[^\]]+\]\s*/u, ''), ...(cnPoolName ? { 'zh-CN': cnPoolName } : {}), ...(game && server === 'tw' ? { 'zh-TW': game.gachaPoolName } : {}) },
      image_url: banner.imageFile ? `https://arknights.wiki.gg/wiki/Special:Redirect/file/${banner.imageFile.replace(/ /g, '_')}` : activity.image_url,
      // A day-only source is kept as a date; it is never turned into midnight UTC.
      start_at: noticeTime ? banner.start_at : game ? new Date(game.openTime * 1000).toISOString() : null,
      end_at: noticeTime ? banner.end_at : game ? new Date(game.endTime * 1000).toISOString() : null,
      start_date: date?.start || null, end_date: date?.end || null,
      time_precision: noticeTime || game ? 'second' : date ? 'day' : 'unknown',
      operators, source_url: banner.source_url,
      verification: {
        status: 'verified', method: 'event-operator-release-and-banner',
        event_name: match.eventReleases[0]?.event_name || null,
        debut_operator_ids: original ? match.newOperators.map((operator) => operatorByName.get(identity(operator.name))?.id).filter(Boolean) : [],
        time_source_url: noticeTime ? banner.source_url : game ? gameSource : date ? banner.source_url : null,
        game_pool_id: game?.gachaPoolId || null,
        regional_banner_date_confirmed: Boolean(date || game),
        pending_operator_ids: operators.filter((operator) => !operator.id).map((operator) => operator.name_i18n['zh-CN']),
      },
    };
    output[activity.code] ||= {};
    output[activity.code][server] = [pool];
    status.time_precision[pool.time_precision] = (status.time_precision[pool.time_precision] || 0) + 1;
    if (pool.start_at && dateDistance(localDate(pool.start_at, server), localDate(activity.window.start_at, server)) > 1) {
      status.activity_time_discrepancies.push({ code: activity.code, activity_start_at: activity.window.start_at,
        banner_start_at: pool.start_at, source_url: pool.verification.time_source_url });
    }
    for (const operator of operators.filter((operator) => pool.start_at && operator.release_at
      && pool.verification.debut_operator_ids.includes(operator.id))) {
      if (dateDistance(localDate(operator.release_at, server), localDate(pool.start_at, server)) > 1) {
        status.debut_time_discrepancies.push({ code: activity.code, operator_id: operator.id,
          recorded_release_at: operator.release_at, banner_start_at: pool.start_at,
          release_source_url: operator.release_source_url, banner_source_url: pool.verification.time_source_url });
      }
    }
    status.matched += 1;
  }
}
for (const server of SERVERS) {
  const displayed = attachCuratedActivityRecruitmentPools(activities[server], server, output).filter(supportedActivity);
  report.servers[server].display_coverage = {
    records: displayed.length,
    missing_pools: displayed.filter((activity) => activity.expects_recruitment_pool && !activity.recruitment_pools.length).map((activity) => activity.code),
    pools_without_exact_time: displayed.flatMap((activity) => activity.recruitment_pools
      .filter((pool) => pool.time_precision !== 'second')
      .map((pool) => ({ activity_code: activity.code, pool: pool.name_i18n, start_date: pool.start_date || null,
        time_precision: pool.time_precision || 'unverified' }))),
  };
}
const operatorReleaseDates = Object.fromEntries(SERVERS.map((server) => [server,
  Object.fromEntries(releases[server].filter((release) => release.character_id).map((release) => [release.character_id, {
    release_at: release.release_at, event_name: release.event_name,
    release_source_url: `${API}/api/recruit/releases?server=${server}`,
  }])),
]));
await fs.writeFile(new URL('src/data/verifiedActivityPools.js', ROOT), `// Generated by scripts/sync-verified-activity-pools.mjs. Do not edit.\nexport const operatorReleaseDates = ${JSON.stringify(operatorReleaseDates, null, 2)};\nexport default ${JSON.stringify(output, null, 2)};\n`);
await fs.mkdir(new URL('docs/data/', ROOT), { recursive: true });
await fs.writeFile(new URL('docs/data/activity-pool-audit.json', ROOT), `${JSON.stringify(report, null, 2)}\n`);
for (const [server, status] of Object.entries(report.servers)) console.log(`${server}: verified=${status.matched}, unresolved=${status.unresolved.length}, timeConflicts=${status.operator_time_conflicts.length}`);

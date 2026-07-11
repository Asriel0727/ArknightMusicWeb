#!/usr/bin/env node

import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const DEFAULT_RECRUIT_API_BASE = 'https://arknights-recruit-api.molly27molly.workers.dev';
const DEFAULT_OUTPUT_PATH = 'public/images/manifest/operator-assets-audit.json';
const DEFAULT_GAME_DATA_EXCEL_BASE =
  'https://cdn.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@master/zh_CN/gamedata/excel';
const IMAGE_BASE = 'https://raw.githubusercontent.com/PuppiizSunniiz/Arknight-Images/main';
const IMAGE_MIRROR_ACESHIP = 'https://raw.githubusercontent.com/Aceship/Arknight-Images/main';
const IMAGE_MIRROR_RESOURCE = 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main';
const IMAGE_MIRROR_DYNAMIC = 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts';
const IMAGE_CDN_BASE = 'https://cdn.jsdelivr.net/gh/PuppiizSunniiz/Arknight-Images@main';
const IMAGE_CDN_MIRROR_ACESHIP = 'https://cdn.jsdelivr.net/gh/Aceship/Arknight-Images@main';
const IMAGE_CDN_RESOURCE = 'https://cdn.jsdelivr.net/gh/yuanyan3060/ArknightsGameResource@main';
const IMAGE_CDN_DYNAMIC = 'https://cdn.jsdelivr.net/gh/ArknightsAssets/ArknightsAssets@cn/assets/torappu/dynamicassets/arts';
const IMAGE_CDN_OPERATOR_ARCHIVE = 'https://cdn.jsdelivr.net/gh/ak-cn-archive/arknights-operator-image@main';
const IMAGE_OPERATOR_ARCHIVE = 'https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main';

const PROFESSION_TO_CLASS_SLUG = {
  PIONEER: 'vanguard',
  WARRIOR: 'guard',
  TANK: 'defender',
  SNIPER: 'sniper',
  CASTER: 'caster',
  MEDIC: 'medic',
  SUPPORT: 'supporter',
  SPECIAL: 'specialist',
};

const FACTION_ID_TO_LOGO = {
  rhodes: 'logo_rhodes',
  yan: 'logo_yan',
  lungmen: 'logo_lungmen',
  egir: 'logo_egir',
  bolivar: 'logo_bolivar',
  columbia: 'logo_columbia',
  higashi: 'logo_higashi',
  iberia: 'logo_iberia',
  kazimierz: 'logo_kazimierz',
  kjerag: 'logo_kjerag',
  karlan: 'logo_kjerag',
  karlan_trade: 'logo_kjerag',
  laterano: 'logo_laterano',
  leithanien: 'logo_leithanien',
  minos: 'logo_minos',
  rim: 'logo_rim',
  sami: 'logo_sami',
  sargon: 'logo_sargon',
  siracusa: 'logo_siracusa',
  ursus: 'logo_ursus',
  victoria: 'logo_victoria',
  babel: 'logo_babel',
  blacksteel: 'logo_blacksteel',
  dublinn: 'logo_dublinn',
  deep_pool: 'logo_dublinn',
  deeppool: 'logo_dublinn',
  rhine: 'logo_rhine',
  penguin: 'logo_penguin',
  lee: 'logo_lee',
  rainbow: 'logo_rainbow',
  rhodes_island: 'logo_rhodes',
  rhodesisland: 'logo_rhodes',
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const options = {
    apiBase: process.env.RECRUIT_API_BASE || DEFAULT_RECRUIT_API_BASE,
    gameDataBase: process.env.GAME_DATA_EXCEL_BASE || DEFAULT_GAME_DATA_EXCEL_BASE,
    output: DEFAULT_OUTPUT_PATH,
    includePortraits: false,
    detailLimit: 0,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === '--api-base' && next) {
      options.apiBase = next;
      index += 1;
    } else if (arg === '--game-data-base' && next) {
      options.gameDataBase = next;
      index += 1;
    } else if (arg === '--output' && next) {
      options.output = next;
      index += 1;
    } else if (arg === '--include-portraits') {
      options.includePortraits = true;
    } else if (arg === '--detail-limit' && next) {
      options.detailLimit = Number.parseInt(next, 10) || 0;
      index += 1;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  options.apiBase = options.apiBase.replace(/\/$/, '');
  options.gameDataBase = options.gameDataBase.replace(/\/$/, '');
  return options;
}

function printHelp() {
  console.log(`
Audit Arknights operator image assets.

Usage:
  npm.cmd run assets:audit
  npm.cmd run assets:audit -- --include-portraits
  npm.cmd run assets:audit -- --include-portraits --detail-limit 20

Options:
  --api-base <url>       Recruit Worker API base. Default: ${DEFAULT_RECRUIT_API_BASE}
  --game-data-base <url> GameData excel JSON base. Default: ${DEFAULT_GAME_DATA_EXCEL_BASE}
  --output <path>        Audit report path. Default: ${DEFAULT_OUTPUT_PATH}
  --include-portraits    Also fetch operator details and audit portrait assets.
  --detail-limit <n>     Limit detail requests when auditing portraits. 0 means no limit.
`);
}

async function pathExists(absolutePath) {
  try {
    await access(absolutePath);
    return true;
  } catch {
    return false;
  }
}

function toPublicPath(relativePath) {
  return `/${relativePath.replaceAll(path.sep, '/').replace(/^public\//, '')}`;
}

function toAbsolutePath(relativePath) {
  return path.join(projectRoot, relativePath);
}

function uniqueBy(items, getKey) {
  const byKey = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, item);
  }
  return [...byKey.values()];
}

function factionIdToLogoKey(factionId) {
  if (!factionId) return 'logo_rhodes';
  if (typeof factionId === 'object') {
    return factionIdToLogoKey(factionId.teamId || factionId.groupId || factionId.nationId);
  }
  const raw = String(factionId);
  if (FACTION_ID_TO_LOGO[raw]) return FACTION_ID_TO_LOGO[raw];
  const lower = raw.toLowerCase();
  if (FACTION_ID_TO_LOGO[lower]) return FACTION_ID_TO_LOGO[lower];
  const stripped = lower.replace(/^(team_|group_|nation_|power_)/, '');
  if (FACTION_ID_TO_LOGO[stripped]) return FACTION_ID_TO_LOGO[stripped];
  return `logo_${stripped}`;
}

function professionToClassSlug(profession) {
  return PROFESSION_TO_CLASS_SLUG[profession] || 'vanguard';
}

function getFactionLogoSourceUrls(logoKey) {
  return [
    `${IMAGE_CDN_BASE}/factions/${logoKey}.png`,
    `${IMAGE_CDN_MIRROR_ACESHIP}/factions/${logoKey}.png`,
    `${IMAGE_BASE}/factions/${logoKey}.png`,
    `${IMAGE_MIRROR_ACESHIP}/factions/${logoKey}.png`,
  ];
}

function getAvatarSourceUrls(operator) {
  const id = encodeURIComponent(operator.id);
  return [
    operator.avatarUrl,
    `${IMAGE_CDN_RESOURCE}/avatar/${id}.png`,
    `${IMAGE_CDN_DYNAMIC}/charavatars/${id}.png`,
    `${IMAGE_CDN_BASE}/avatars/${id}.png`,
    `${IMAGE_CDN_MIRROR_ACESHIP}/avatars/${id}.png`,
    `${IMAGE_MIRROR_RESOURCE}/avatar/${id}.png`,
    `${IMAGE_MIRROR_DYNAMIC}/charavatars/${id}.png`,
    `${IMAGE_BASE}/avatars/${id}.png`,
    `${IMAGE_MIRROR_ACESHIP}/avatars/${id}.png`,
  ];
}

function getClassIconSourceUrls(slug) {
  return [
    `${IMAGE_CDN_BASE}/classes/class_${slug}.png`,
    `${IMAGE_CDN_MIRROR_ACESHIP}/classes/class_${slug}.png`,
    `${IMAGE_BASE}/classes/class_${slug}.png`,
    `${IMAGE_MIRROR_ACESHIP}/classes/class_${slug}.png`,
  ];
}

function getPortraitSourceUrls(portraitId, alternativeIds = []) {
  const ids = uniqueBy([portraitId, ...alternativeIds].filter(Boolean), (id) => id);
  const urls = [];

  for (const id of ids) {
    const enc = encodeURIComponent(id);
    urls.push(
      `${IMAGE_CDN_BASE}/characters/${enc}.png`,
      `${IMAGE_CDN_RESOURCE}/charportraits/${enc}.png`,
      `${IMAGE_CDN_MIRROR_ACESHIP}/characters/${enc}.png`,
      `${IMAGE_CDN_DYNAMIC}/charportraits/${enc}.png`,
      `${IMAGE_CDN_OPERATOR_ARCHIVE}/portraits/${enc}.png`,
      `${IMAGE_BASE}/characters/${enc}.png`,
      `${IMAGE_MIRROR_RESOURCE}/charportraits/${enc}.png`,
      `${IMAGE_MIRROR_ACESHIP}/characters/${enc}.png`,
      `${IMAGE_MIRROR_DYNAMIC}/charportraits/${enc}.png`,
      `${IMAGE_OPERATOR_ARCHIVE}/portraits/${enc}.png`,
    );
  }

  return urls;
}

function getItemIconSourceUrls(iconId) {
  const id = encodeURIComponent(iconId);
  return [
    `${IMAGE_CDN_BASE}/items/${id}.png`,
    `${IMAGE_CDN_MIRROR_ACESHIP}/items/${id}.png`,
    `${IMAGE_BASE}/items/${id}.png`,
    `${IMAGE_MIRROR_ACESHIP}/items/${id}.png`,
  ];
}

function getSkillIconSourceUrls(iconId) {
  const ids = uniqueBy(
    [iconId, String(iconId || '').startsWith('skill_icon_') ? iconId : `skill_icon_${iconId}`].filter(Boolean),
    (id) => id
  );
  const urls = [];

  for (const candidateId of ids) {
    const id = encodeURIComponent(candidateId);
    urls.push(
      `${IMAGE_CDN_BASE}/skills/${id}.png`,
      `${IMAGE_CDN_MIRROR_ACESHIP}/skills/${id}.png`,
      `${IMAGE_CDN_RESOURCE}/skill/${id}.png`,
      `${IMAGE_CDN_BASE}/skill/${id}.png`,
      `${IMAGE_CDN_MIRROR_ACESHIP}/skill/${id}.png`,
      `${IMAGE_BASE}/skills/${id}.png`,
      `${IMAGE_MIRROR_ACESHIP}/skills/${id}.png`,
      `${IMAGE_MIRROR_RESOURCE}/skill/${id}.png`,
      `${IMAGE_BASE}/skill/${id}.png`,
      `${IMAGE_MIRROR_ACESHIP}/skill/${id}.png`,
    );
  }

  return urls;
}

function safeAssetName(value) {
  const raw = String(value || 'unknown');
  const safe = raw.replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (safe === raw) return safe;
  const hash = createHash('sha1').update(raw).digest('hex').slice(0, 8);
  return `${safe}-${hash}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'ArknightMusicWeb asset audit',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const suffix = body ? ` ${body.slice(0, 240)}` : '';
    throw new Error(`Fetch failed ${response.status}: ${url}${suffix}`);
  }

  return response.json();
}

async function fetchOperators(apiBase) {
  const payload = await fetchJson(`${apiBase}/api/recruit/operators`);
  if (!Array.isArray(payload.operators)) {
    throw new Error('Recruit operators payload is invalid.');
  }
  return payload.operators;
}

async function fetchOperatorDetail(apiBase, operatorId) {
  const payload = await fetchJson(`${apiBase}/api/recruit/operators/${encodeURIComponent(operatorId)}`);
  return payload.operator || null;
}

async function fetchGameDataTable(gameDataBase, tableName, fallback = {}) {
  try {
    return await fetchJson(`${gameDataBase}/${tableName}.json`);
  } catch (error) {
    console.warn(`GameData table ${tableName} failed: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

async function buildAssetRecord({ type, id, label, relativePath, sourceUrls = [], extra = {} }) {
  const absolutePath = toAbsolutePath(relativePath);
  const exists = await pathExists(absolutePath);

  return {
    type,
    id,
    label: label || id,
    publicPath: toPublicPath(relativePath),
    relativePath: relativePath.replaceAll(path.sep, '/'),
    exists,
    sourceUrls: uniqueBy(sourceUrls.filter(Boolean).map((url) => String(url)), (url) => url),
    ...extra,
  };
}

async function auditAvatars(operators) {
  return Promise.all(
    operators.map((operator) => buildAssetRecord({
      type: 'avatar',
      id: operator.id,
      label: operator.name || operator.id,
      relativePath: path.join('public/images/operators/avatars', `${operator.id}.png`),
      sourceUrls: getAvatarSourceUrls(operator),
      extra: {
        operatorId: operator.id,
        rarity: operator.rarity,
        factionId: operator.factionId,
        profession: operator.profession,
      },
    }))
  );
}

async function auditFactions(operators) {
  const factions = uniqueBy(
    operators
      .map((operator) => ({
        factionId: operator.factionId || operator.nation,
        factionName: operator.factionName || operator.nationName || operator.factionId || operator.nation,
      }))
      .filter((item) => item.factionId),
    (item) => item.factionId
  );

  return Promise.all(
    factions.map((faction) => {
      const logoKey = factionIdToLogoKey(faction.factionId);
      return buildAssetRecord({
        type: 'faction',
        id: logoKey,
        label: faction.factionName || faction.factionId,
        relativePath: path.join('public/images/factions', `${logoKey}.png`),
        sourceUrls: getFactionLogoSourceUrls(logoKey),
        extra: {
          factionId: faction.factionId,
          logoKey,
        },
      });
    })
  );
}

async function auditClasses(operators) {
  const professions = uniqueBy(
    operators.map((operator) => operator.profession).filter(Boolean),
    (profession) => profession
  );

  return Promise.all(
    professions.map((profession) => {
      const slug = professionToClassSlug(profession);
      return buildAssetRecord({
        type: 'class',
        id: `class_${slug}`,
        label: profession,
        relativePath: path.join('public/images/classes', `class_${slug}.png`),
        sourceUrls: getClassIconSourceUrls(slug),
        extra: {
          profession,
          slug,
        },
      });
    })
  );
}

async function auditPortraits(options, operators) {
  if (!options.includePortraits) return { records: [], errors: [] };

  const targetOperators = options.detailLimit > 0
    ? operators.slice(0, options.detailLimit)
    : operators;

  const [charTable, skinTable] = await Promise.all([
    fetchGameDataTable(options.gameDataBase, 'character_table', {}),
    fetchGameDataTable(options.gameDataBase, 'skin_table', {}),
  ]);
  const portraits = [];
  const errors = [];
  let completed = 0;

  for (const operator of targetOperators) {
    completed += 1;
    process.stdout.write(`\rAuditing operator portraits ${completed}/${targetOperators.length}`);
    const charData = charTable?.[operator.id];
    if (!charData) {
      errors.push({
        operatorId: operator.id,
        operatorName: operator.name || operator.id,
        message: 'Character not found in character_table.',
      });
      continue;
    }

    const displaySkins = Array.isArray(charData.displaySkins) ? charData.displaySkins : [];
    const phases = Array.isArray(charData.phases) ? charData.phases : [];

    if (phases.length > 1) {
      const phase1 = phases[1];
      const elite1Skin = displaySkins.find((skin) =>
        skin?.portraitId && (skin.portraitId.includes('_1') || skin.portraitId.includes('#1'))
      ) || displaySkins[0];
      const portraitId = elite1Skin?.portraitId || phase1?.displayId || `${operator.id}_1`;
      const alternativeIds = [`${operator.id}_1+`, `${operator.id}_1`, `${operator.id}#1`, phase1?.displayId]
        .filter((id) => id && id !== portraitId);
      portraits.push({
        operatorId: operator.id,
        operatorName: operator.name || operator.id,
        portraitId,
        skinId: null,
        name: `${operator.name || operator.id} Elite 1`,
        sourceUrls: getPortraitSourceUrls(portraitId, alternativeIds),
        category: 'elite',
        phase: 1,
      });
    }

    if (phases.length > 2) {
      const phase2 = phases[2];
      const elite2Skin = displaySkins.find((skin) =>
        skin?.portraitId && (skin.portraitId.includes('_2') || skin.portraitId.includes('#2'))
      ) || displaySkins[1];
      const portraitId = elite2Skin?.portraitId || phase2?.displayId || `${operator.id}_2`;
      portraits.push({
        operatorId: operator.id,
        operatorName: operator.name || operator.id,
        portraitId,
        skinId: null,
        name: `${operator.name || operator.id} Elite 2`,
        sourceUrls: getPortraitSourceUrls(portraitId),
        category: 'elite',
        phase: 2,
      });
    }

    const elitePortraitIds = new Set(portraits
      .filter((portrait) => portrait.operatorId === operator.id)
      .map((portrait) => portrait.portraitId));
    const costumeRows = [];
    const charSkins = skinTable?.charSkins || {};

    for (const skin of Object.values(charSkins)) {
      if (!skin || skin.charId !== operator.id) continue;
      const groupId = skin.displaySkin?.skinGroupId;
      if (typeof groupId === 'string' && groupId.startsWith('ILLUST_')) continue;

      const portraitId = skin.portraitId;
      if (!portraitId || elitePortraitIds.has(portraitId)) continue;

      costumeRows.push({
        portraitId,
        skinId: skin.skinId || portraitId,
        name: skin.displaySkin?.skinName || skin.displaySkin?.skinGroupName || skin.skinId || portraitId,
        sortId: typeof skin.displaySkin?.sortId === 'number' ? skin.displaySkin.sortId : 0,
      });
    }

    costumeRows.sort((a, b) => a.sortId - b.sortId || String(a.skinId).localeCompare(String(b.skinId)));
    for (const row of costumeRows) {
      portraits.push({
        operatorId: operator.id,
        operatorName: operator.name || operator.id,
        portraitId: row.portraitId,
        skinId: row.skinId,
        name: `${operator.name || operator.id} - ${row.name}`,
        sourceUrls: getPortraitSourceUrls(row.portraitId),
        category: 'skin',
        phase: null,
      });
    }
  }

  if (targetOperators.length > 0) {
    process.stdout.write('\n');
  }

  const uniquePortraits = uniqueBy(portraits, (portrait) => `${portrait.operatorId}:${portrait.portraitId}`);

  const records = await Promise.all(
    uniquePortraits.map((portrait) => buildAssetRecord({
      type: 'portrait',
      id: portrait.portraitId,
      label: `${portrait.operatorName} - ${portrait.name}`,
      relativePath: path.join('public/images/operators/portraits', `${safeAssetName(portrait.portraitId)}.png`),
      sourceUrls: portrait.sourceUrls,
      extra: {
        operatorId: portrait.operatorId,
        skinId: portrait.skinId,
        portraitId: portrait.portraitId,
        category: portrait.category,
        phase: portrait.phase,
      },
    }))
  );

  return { records, errors };
}

function collectItemIdsFromCharacter(charData) {
  const itemIds = new Set();

  for (const phase of charData?.phases || []) {
    for (const cost of phase?.evolveCost || []) {
      if (cost?.id) itemIds.add(cost.id);
    }
  }

  for (const upgrade of charData?.allSkillLvlup || []) {
    for (const cost of upgrade?.lvlUpCost || []) {
      if (cost?.id) itemIds.add(cost.id);
    }
  }

  return itemIds;
}

async function auditItems(options, operators) {
  const [charTable, itemTable] = await Promise.all([
    fetchGameDataTable(options.gameDataBase, 'character_table', {}),
    fetchGameDataTable(options.gameDataBase, 'item_table', { items: {} }),
  ]);
  const itemIds = new Set();

  for (const operator of operators) {
    const charData = charTable?.[operator.id];
    for (const itemId of collectItemIdsFromCharacter(charData)) {
      itemIds.add(itemId);
    }
  }

  return Promise.all(
    [...itemIds].sort().map((itemId) => {
      const item = itemTable?.items?.[itemId] || {};
      const iconId = item.iconId || itemId;
      return buildAssetRecord({
        type: 'item',
        id: iconId,
        label: item.name || itemId,
        relativePath: path.join('public/images/items', `${safeAssetName(iconId)}.png`),
        sourceUrls: getItemIconSourceUrls(iconId),
        extra: {
          itemId,
          iconId,
          rarity: item.rarity ?? null,
        },
      });
    })
  );
}

async function auditSkills(options, operators) {
  const [charTable, skillTable] = await Promise.all([
    fetchGameDataTable(options.gameDataBase, 'character_table', {}),
    fetchGameDataTable(options.gameDataBase, 'skill_table', {}),
  ]);
  const skillIds = new Set();

  for (const operator of operators) {
    const charData = charTable?.[operator.id];
    for (const skillRef of charData?.skills || []) {
      const skillId = skillRef?.skillId || skillRef;
      if (skillId) skillIds.add(skillId);
    }
  }

  return Promise.all(
    [...skillIds].sort().map((skillId) => {
      const skill = skillTable?.[skillId] || {};
      const iconId = skill.iconId || skillId;
      const level = Array.isArray(skill.levels) ? skill.levels.find(Boolean) : null;
      return buildAssetRecord({
        type: 'skill',
        id: iconId,
        label: level?.name || skillId,
        relativePath: path.join('public/images/skills', `${safeAssetName(iconId)}.png`),
        sourceUrls: getSkillIconSourceUrls(iconId),
        extra: {
          skillId,
          iconId,
        },
      });
    })
  );
}

function summarize(records) {
  const total = records.length;
  const existing = records.filter((record) => record.exists).length;
  const missing = total - existing;
  return { total, existing, missing };
}

function missingPaths(records) {
  return records.filter((record) => !record.exists).map((record) => record.relativePath);
}

async function ensureOutputDirs(outputPath) {
  const directories = [
    'public/images/manifest',
    'public/images/factions',
    'public/images/classes',
    'public/images/operators/avatars',
    'public/images/operators/portraits',
    'public/images/items',
    'public/images/skills',
    path.dirname(outputPath),
  ];

  await Promise.all(
    uniqueBy(directories, (directory) => directory).map((directory) =>
      mkdir(toAbsolutePath(directory), { recursive: true })
    )
  );
}

function printSummary(report) {
  console.log('\nAsset audit complete.');
  console.table({
    operators: { total: report.summary.operators },
    avatars: report.summary.avatars,
    factions: report.summary.factions,
    classes: report.summary.classes,
    portraits: report.summary.portraits,
    items: report.summary.items,
    skills: report.summary.skills,
  });
  console.log(`Report: ${report.output}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = options.output;
  await ensureOutputDirs(outputPath);

  console.log(`Recruit API: ${options.apiBase}`);
  console.log(`GameData: ${options.gameDataBase}`);
  const operators = await fetchOperators(options.apiBase);
  console.log(`Operators: ${operators.length}`);

  const [avatars, factions, classes, portraitAudit, items, skills] = await Promise.all([
    auditAvatars(operators),
    auditFactions(operators),
    auditClasses(operators),
    auditPortraits(options, operators),
    auditItems(options, operators),
    auditSkills(options, operators),
  ]);
  const portraits = portraitAudit.records;

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    output: outputPath.replaceAll(path.sep, '/'),
    options: {
      apiBase: options.apiBase,
      gameDataBase: options.gameDataBase,
      includePortraits: options.includePortraits,
      detailLimit: options.detailLimit,
    },
    paths: {
      avatars: 'public/images/operators/avatars',
      factions: 'public/images/factions',
      classes: 'public/images/classes',
      portraits: 'public/images/operators/portraits',
      items: 'public/images/items',
      skills: 'public/images/skills',
    },
    summary: {
      operators: operators.length,
      avatars: summarize(avatars),
      factions: summarize(factions),
      classes: summarize(classes),
      portraits: summarize(portraits),
      items: summarize(items),
      skills: summarize(skills),
    },
    missing: {
      avatars: missingPaths(avatars),
      factions: missingPaths(factions),
      classes: missingPaths(classes),
      portraits: missingPaths(portraits),
      items: missingPaths(items),
      skills: missingPaths(skills),
    },
    errors: {
      portraits: portraitAudit.errors,
    },
    assets: {
      avatars,
      factions,
      classes,
      portraits,
      items,
      skills,
    },
  };

  await writeFile(toAbsolutePath(outputPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printSummary(report);
}

main().catch((error) => {
  console.error('\nAsset audit failed.');
  console.error(error);
  process.exitCode = 1;
});

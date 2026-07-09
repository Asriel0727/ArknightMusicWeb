/** 招募卡製作：職業 slug（對應 Arknight-Images/classes/class_*.png） */
export const PROFESSION_TO_CLASS_SLUG = {
  PIONEER: 'vanguard',
  WARRIOR: 'guard',
  TANK: 'defender',
  SNIPER: 'sniper',
  CASTER: 'caster',
  MEDIC: 'medic',
  SUPPORT: 'supporter',
  SPECIAL: 'specialist',
};

/** handbook / mainPower 陣營 ID → factions/logo_*.png */
export const FACTION_ID_TO_LOGO = {
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

export const RECRUIT_FACTION_LOGO_OPTIONS = [
  'logo_rhodes',
  'logo_yan',
  'logo_lungmen',
  'logo_egir',
  'logo_bolivar',
  'logo_columbia',
  'logo_higashi',
  'logo_iberia',
  'logo_kazimierz',
  'logo_kjerag',
  'logo_laterano',
  'logo_leithanien',
  'logo_minos',
  'logo_rim',
  'logo_sami',
  'logo_sargon',
  'logo_siracusa',
  'logo_ursus',
  'logo_victoria',
  'logo_babel',
  'logo_blacksteel',
  'logo_dublinn',
  'logo_rhine',
  'logo_penguin',
  'logo_lee',
  'logo_rainbow',
];

const STAR_SVG = `<svg width="161" height="165" viewBox="0 0 161 165" fill="none" xmlns="http://www.w3.org/2000/svg"><g filter="url(#filter0_d)"><path d="M150.856 73.4283L100.028 95.0034L104.84 150.011L68.6145 108.338L17.7868 129.913L46.2258 82.5822L10 40.9092L63.802 53.3304L92.241 6L97.0535 61.0071L150.856 73.4283Z" fill="white"/></g><defs><filter id="filter0_d" x="0" y="0" width="160.855" height="164.01" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/><feOffset dy="4"/><feGaussianBlur stdDeviation="5"/><feComposite in2="hardAlpha" operator="out"/><feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.75 0"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/><feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/></filter></defs></svg>`;

export const RECRUIT_STAR_IMAGE_URL =
  'data:image/svg+xml,' + encodeURIComponent(STAR_SVG);

export const RECRUIT_CARD_SIZE = { width: 1920, height: 1080 };

function withAppBase(path) {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const cleanPath = String(path || '').replace(/^\/+/, '');
  return `${base}/${cleanPath}`.replace(/^\/\//, '/');
}

export const RECRUIT_DEFAULT_BACKGROUND_URL = withAppBase('images/recruit/recruit-bg.webp');
export const RECRUIT_NEW_BADGE_URL = withAppBase('images/recruit/recruit-new.webp');

export function getRecruitFactionLogoUrl(logoKey) {
  const key = logoKey?.startsWith('logo_') ? logoKey : factionIdToLogoKey(logoKey);
  return withAppBase(`images/factions/${key}.png`);
}

export function getRecruitProfessionIconUrl(profession) {
  const slug = professionToClassSlug(profession);
  return withAppBase(`images/classes/class_${slug}.png`);
}

export const DEFAULT_RECRUIT_BACKGROUND = `linear-gradient(
  165deg,
  #2a3548 0%,
  #151b26 38%,
  #0a0e14 72%,
  #1a2230 100%
)`;

export function rarityToStars(rarity) {
  if (typeof rarity === 'number') {
    return Math.max(1, Math.min(6, rarity + 1));
  }
  if (typeof rarity === 'string') {
    const match = rarity.match(/TIER_(\d+)/);
    if (match) return Math.max(1, Math.min(6, parseInt(match[1], 10)));
    const num = parseInt(rarity, 10);
    if (!Number.isNaN(num)) return Math.max(1, Math.min(6, num));
  }
  return 6;
}

export function factionIdToLogoKey(factionId) {
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

export function professionToClassSlug(profession) {
  return PROFESSION_TO_CLASS_SLUG[profession] || 'vanguard';
}

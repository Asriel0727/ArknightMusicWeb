/**
 * 明日方舟表格 JSON：簡中在 ArknightsGameData；其餘語系在 ArknightsGameData_YoStar。
 * @see https://github.com/Kengxxiao/ArknightsGameData
 * @see https://github.com/Kengxxiao/ArknightsGameData_YoStar
 */

const CN_EXCEL_BASE =
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';

const yostarExcelBase = (folder) =>
  `https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData_YoStar/main/${folder}/gamedata/excel`;

/** @type {'zh_CN' | 'en_US' | 'ja_JP' | 'ko_KR'} */
let gameDataFolder = 'zh_CN';

/** 介面語系（與 vue-i18n 一致），用於簡中遊戲表在繁中 UI 下轉成繁體 */
let currentUiLocale = 'zh-TW';

const UI_LOCALE_TO_FOLDER = {
  // 繁中服目前沒有受維護的公開 GameData 鏡像；保留 CN fallback，避免混用國際服進度。
  'zh-TW': 'zh_CN',
  'zh-CN': 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
  ko: 'ko_KR',
};

export function getGameDataServer() {
  if (currentUiLocale === 'zh-TW') return 'tw-fallback-cn';
  if (currentUiLocale === 'zh-CN') return 'cn';
  return 'global';
}

const LABELS = {
  zh_CN: {
    elite1: '精一',
    elite2: '精二',
    costumePrefix: '時裝 ·',
    unknownSkill: '未知技能',
    portraitFallback: '立繪',
    potential: {
      COST: '部署費用',
      ATK: '攻擊力',
      DEF: '防禦力',
      MAX_HP: '生命上限',
      ATTACK_SPEED: '攻擊速度',
      MAGIC_RESISTANCE: '法術抗性',
      RESPAWN_TIME: '再部署時間',
    },
  },
  en_US: {
    elite1: 'Elite 1',
    elite2: 'Elite 2',
    costumePrefix: 'Outfit · ',
    unknownSkill: 'Unknown skill',
    portraitFallback: 'Artwork',
    potential: {
      COST: 'DP cost',
      ATK: 'ATK',
      DEF: 'DEF',
      MAX_HP: 'HP',
      ATTACK_SPEED: 'ASPD',
      MAGIC_RESISTANCE: 'RES',
      RESPAWN_TIME: 'Redeploy time',
    },
  },
  ja_JP: {
    elite1: '昇進1',
    elite2: '昇進2',
    costumePrefix: 'コーデ · ',
    unknownSkill: '不明なスキル',
    portraitFallback: '立ち絵',
    potential: {
      COST: 'コスト',
      ATK: '攻撃力',
      DEF: '防御力',
      MAX_HP: 'HP上限',
      ATTACK_SPEED: '攻撃速度',
      MAGIC_RESISTANCE: '術耐性',
      RESPAWN_TIME: '再配置時間',
    },
  },
  ko_KR: {
    elite1: '정예 1',
    elite2: '정예 2',
    costumePrefix: '의상 · ',
    unknownSkill: '알 수 없는 스킬',
    portraitFallback: '초상화',
    potential: {
      COST: '배치 비용',
      ATK: '공격력',
      DEF: '방어력',
      MAX_HP: 'HP',
      ATTACK_SPEED: '공격 속도',
      MAGIC_RESISTANCE: '예술 적응력',
      RESPAWN_TIME: '재배치 시간',
    },
  },
};

export function getGameDataExcelBase() {
  return gameDataFolder === 'zh_CN' ? CN_EXCEL_BASE : yostarExcelBase(gameDataFolder);
}

export function getRecruitmentGameDataExcelBase(server, uiLocale = currentUiLocale) {
  if (server === 'cn' || server === 'tw') return CN_EXCEL_BASE;
  const folder = uiLocale === 'ja' ? 'ja_JP' : uiLocale === 'ko' ? 'ko_KR' : 'en_US';
  return yostarExcelBase(folder);
}

export function getCnGameDataExcelBase() {
  return CN_EXCEL_BASE;
}

export function setGameDataFolderFromUiLocale(uiLocale) {
  currentUiLocale = uiLocale || 'zh-TW';
  gameDataFolder = UI_LOCALE_TO_FOLDER[uiLocale] || 'zh_CN';
}

export function getCurrentUiLocale() {
  return currentUiLocale;
}

/** 遊戲表為簡中（zh_CN）且介面為繁中時，將字串轉為台灣繁體 */
export function shouldApplyS2tGameData() {
  return gameDataFolder === 'zh_CN' && currentUiLocale === 'zh-TW';
}

/** 塞壬等音樂 API 中文多為簡體：繁中介面下轉為台灣繁體 */
export function shouldApplyS2tMusicApi() {
  return currentUiLocale === 'zh-TW';
}

export function getGameDataFolder() {
  return gameDataFolder;
}

export function getApiBuiltLabels() {
  return LABELS[gameDataFolder] || LABELS.zh_CN;
}

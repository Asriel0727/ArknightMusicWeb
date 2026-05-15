import { fetchWithCache } from './cache.js';
import { parseLRC } from '../utils/lyrics.js';

const API_BASE = 'https://monstersiren-web-api.vercel.app/api';

/** 歌曲詳情記憶體快取（切歌／重播會重複請求同一 cid） */
const SONG_DETAILS_CACHE_TTL_MS = 45 * 60 * 1000;
const songDetailsCache = new Map();

/** 歌詞記憶體快取（同一首多次開播放器不重打 proxy） */
const LYRICS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const lyricsCache = new Map();

/**
 * 獲取所有專輯列表
 * @returns {Promise<Array>} 專輯列表
 */
export async function fetchAlbums() {
  const response = await fetch(`${API_BASE}/albums`);
  if (!response.ok) throw new Error('Network response was not ok');
  const { data } = await response.json();
  return data;
}

/**
 * 獲取專輯詳情
 * @param {string} albumId - 專輯ID
 * @returns {Promise<Object>} 專輯詳情
 */
export async function fetchAlbumDetails(albumId) {
  const { data } = await fetchWithCache(`${API_BASE}/album/${albumId}/detail`);
  return data;
}

/**
 * 獲取所有歌曲列表
 * @returns {Promise<Array>} 歌曲列表
 */
export async function fetchSongs() {
  const response = await fetch(`${API_BASE}/songs`);
  if (!response.ok) throw new Error('無法獲取歌曲列表');
  const { data } = await response.json();
  return data.list;
}

/**
 * 獲取歌曲詳情
 * @param {string} songId - 歌曲ID
 * @returns {Promise<Object>} 歌曲詳情
 */
export async function fetchSongDetails(songId) {
  const hit = songDetailsCache.get(songId);
  if (hit && Date.now() - hit.t < SONG_DETAILS_CACHE_TTL_MS) {
    return hit.data;
  }
  const response = await fetch(`${API_BASE}/song/${songId}`);
  if (!response.ok) throw new Error('Network response was not ok');
  const { data } = await response.json();
  songDetailsCache.set(songId, { data, t: Date.now() });
  return data;
}

/**
 * 獲取歌詞
 * @param {string} lyricUrl - 歌詞URL
 * @returns {Promise<Array>} 解析後的歌詞數組
 */
export async function fetchLyrics(lyricUrl) {
  if (!lyricUrl) {
    return [];
  }

  const cacheHit = lyricsCache.get(lyricUrl);
  if (cacheHit && Date.now() - cacheHit.t < LYRICS_CACHE_TTL_MS) {
    return cacheHit.lines;
  }

  try {
    const proxyUrl = `${API_BASE}/proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      if (response.status === 404) {
        lyricsCache.set(lyricUrl, { lines: [], t: Date.now() });
        return [];
      }
      throw new Error(`HTTP錯誤! 狀態碼: ${response.status}`);
    }
    const lrcText = await response.text();
    const parsedLyrics = parseLRC(lrcText);
    lyricsCache.set(lyricUrl, { lines: parsedLyrics, t: Date.now() });
    return parsedLyrics;
  } catch (error) {
    console.warn('歌詞加載失敗:', error.message);
    return [];
  }
}

/**
 * 獲取代理圖片URL
 * @param {string} imageUrl - 原始圖片URL
 * @returns {string} 代理後的圖片URL
 */
export function getProxyImageUrl(imageUrl) {
  return `${API_BASE}/proxy-image?url=${encodeURIComponent(imageUrl)}`;
}

// ========== 明日方舟角色相關 API ==========

const GAMEDATA_BASE = 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel';

/** 角色頭像／立繪／道具圖等主要圖床（較完整，優先使用） */
const ARKNIGHT_IMAGES_BASE =
  'https://raw.githubusercontent.com/PuppiizSunniiz/Arknight-Images/main';
/** 與上者路徑相同的備援鏡像 */
const ARKNIGHT_IMAGES_MIRROR_ACESHIP =
  'https://raw.githubusercontent.com/Aceship/Arknight-Images/main';

/** skin_table 快取有效時間（毫秒），過期後下次取得詳情會重新下載 */
const SKIN_TABLE_CACHE_TTL_MS = 60 * 60 * 1000;

/** skin_table 體積大，用記憶體＋進行中共用 Promise 快取（避免 sessionStorage 配額與重複下載） */
let skinTableMemoryCache;
let skinTableCachedAt = 0;
let skinTableLoadingPromise;

function isSkinTableCacheFresh() {
  return (
    skinTableMemoryCache != null &&
    typeof skinTableMemoryCache === 'object' &&
    skinTableMemoryCache.charSkins &&
    Date.now() - skinTableCachedAt < SKIN_TABLE_CACHE_TTL_MS
  );
}

async function getSkinTableShared() {
  if (isSkinTableCacheFresh()) {
    return skinTableMemoryCache;
  }
  if (!skinTableLoadingPromise) {
    skinTableLoadingPromise = fetch(`${GAMEDATA_BASE}/skin_table.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.charSkins) {
          skinTableMemoryCache = data;
          skinTableCachedAt = Date.now();
        } else {
          skinTableMemoryCache = null;
          skinTableCachedAt = Date.now();
        }
        return skinTableMemoryCache;
      })
      .catch(() => {
        skinTableMemoryCache = null;
        skinTableCachedAt = Date.now();
        return null;
      })
      .finally(() => {
        skinTableLoadingPromise = null;
      });
  }
  return skinTableLoadingPromise;
}

// 多個圖片來源（按優先順序）
const AVATAR_SOURCES = [
  (id) => `${ARKNIGHT_IMAGES_BASE}/avatars/${id}.png`,
  (id) => `${ARKNIGHT_IMAGES_MIRROR_ACESHIP}/avatars/${id}.png`,
  (id) => `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/${id}.png`,
  (id) => `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charavatars/${id}.png`,
];

/**
 * 獲取所有角色數據
 * @returns {Promise<Array>} 角色列表
 */
export async function fetchCharacters() {
  try {
    const response = await fetch(`${GAMEDATA_BASE}/character_table.json`);
    if (!response.ok) throw new Error('無法獲取角色數據');
    const data = await response.json();
    
    // 解析稀有度函數
    const parseRarity = (rarity) => {
      if (typeof rarity === 'number') {
        return rarity; // 已經是數字 0-5
      }
      if (typeof rarity === 'string') {
        // 處理 TIER_1, TIER_2 等格式
        const match = rarity.match(/TIER_(\d+)/);
        if (match) {
          return parseInt(match[1]) - 1; // TIER_1 -> 0, TIER_2 -> 1, ...
        }
        // 嘗試直接轉換為數字
        const num = parseInt(rarity);
        if (!isNaN(num)) {
          return num;
        }
      }
      return 0; // 默認值
    };
    
    // 轉換為數組並過濾出可用的幹員（排除敵人、召喚物等）
    const characters = Object.entries(data)
      .filter(([id, char]) => {
        // 只保留真正的幹員（以 char_ 開頭，且有名字和稀有度）
        return id.startsWith('char_') && 
               char.name && 
               (char.rarity !== undefined || char.rarity !== null) &&
               char.profession !== 'TOKEN' && // 排除召喚物
               char.profession !== 'TRAP';    // 排除陷阱
      })
      .map(([id, char]) => {
        const rarity = parseRarity(char.rarity);
        return {
          id,
          name: char.name,
          appellation: char.appellation, // 代號/英文名
          profession: char.profession,   // 職業
          rarity: rarity,                // 稀有度 (0-5 對應 1-6星)
          position: char.position,       // 位置 (MELEE/RANGED)
          tagList: char.tagList || [],   // 標籤
          nation: char.nationId,         // 國家/陣營
          // 使用第一個圖片來源
          avatarUrl: AVATAR_SOURCES[0](id)
        };
      })
      .sort((a, b) => b.rarity - a.rarity); // 按稀有度排序
    
    return characters;
  } catch (error) {
    console.error('獲取角色資料失敗:', error);
    throw error;
  }
}

/**
 * 獲取角色頭像URL列表（所有可能的來源）
 * @param {string} charId - 角色ID
 * @returns {string[]} 頭像URL列表
 */
export function getCharacterAvatarUrls(charId) {
  return AVATAR_SOURCES.map(source => source(charId));
}

/**
 * 獲取角色頭像URL（主要來源）
 * @param {string} charId - 角色ID
 * @returns {string} 頭像URL
 */
export function getCharacterAvatarUrl(charId) {
  return AVATAR_SOURCES[0](charId);
}

/**
 * 獲取角色頭像備用URL（指定索引）
 * @param {string} charId - 角色ID
 * @param {number} index - 來源索引
 * @returns {string|null} 備用頭像URL
 */
export function getCharacterAvatarFallbackUrl(charId, index = 1) {
  if (index < AVATAR_SOURCES.length) {
    return AVATAR_SOURCES[index](charId);
  }
  return null;
}

// 清理描述中的特殊標籤並替換變量
function cleanDescription(text, blackboard = []) {
  if (!text) return '';
  
  // 建立變量映射
  const varMap = {};
  if (blackboard && blackboard.length > 0) {
    blackboard.forEach(item => {
      if (item.key) {
        // 處理百分比
        let value = item.value;
        if (Math.abs(value) < 10 && value !== Math.floor(value)) {
          value = (value * 100).toFixed(0) + '%';
        } else if (value > 0 && item.key.toLowerCase().includes('prob')) {
          value = (value * 100).toFixed(0) + '%';
        }
        varMap[item.key.toLowerCase()] = value;
      }
    });
  }
  
  return text
    .replace(/<@[^>]+>/g, '')  // 移除 <@xxx> 開始標籤
    .replace(/<\/>/g, '')       // 移除 </> 結束標籤
    .replace(/<\$[^>]+>/g, '')  // 移除 <$xxx> 標籤
    .replace(/\{([^}:]+)(?::([^}]+))?\}/g, (match, varName, format) => {
      // 處理變量如 {atk}、{atk:0%}
      const key = varName.toLowerCase();
      if (varMap[key] !== undefined) {
        return varMap[key];
      }
      // 如果找不到變量，返回空或原始格式提示
      return '';
    })
    .replace(/\s+/g, ' ')  // 清理多餘空格
    .trim();
}

// 格式化潛能提升效果
function formatPotentialBuff(buff) {
  if (!buff || !buff.attributes) return null;
  
  const modifiers = buff.attributes.attributeModifiers;
  if (!modifiers || modifiers.length === 0) return null;
  
  const typeNames = {
    'COST': '部署費用',
    'ATK': '攻擊力',
    'DEF': '防禦力',
    'MAX_HP': '生命上限',
    'ATTACK_SPEED': '攻擊速度',
    'MAGIC_RESISTANCE': '法術抗性',
    'RESPAWN_TIME': '再部署時間'
  };
  
  return modifiers.map(mod => {
    const typeName = typeNames[mod.attributeType] || mod.attributeType;
    const value = mod.value > 0 ? `+${mod.value}` : mod.value;
    return `${typeName} ${value}`;
  }).join(', ');
}

/**
 * 獲取角色詳細資料
 * @param {string} charId - 角色ID
 * @returns {Promise<Object>} 角色詳細資料
 */
export async function fetchCharacterDetails(charId) {
  try {
    // 並行獲取所有需要的數據
    const [charTableRes, skillTableRes, buildingDataRes, uniequipTableRes, handbookInfoTableRes, itemTableRes, rangeTableRes, skinTable] = await Promise.all([
      fetch(`${GAMEDATA_BASE}/character_table.json`),
      fetch(`${GAMEDATA_BASE}/skill_table.json`).catch(() => null),
      fetch(`${GAMEDATA_BASE}/building_data.json`).catch(() => null),
      fetch(`${GAMEDATA_BASE}/uniequip_table.json`).catch(() => null),
      fetch(`${GAMEDATA_BASE}/handbook_info_table.json`).catch(() => null),
      fetch(`${GAMEDATA_BASE}/item_table.json`).catch(() => null),
      fetch(`${GAMEDATA_BASE}/range_table.json`).catch(() => null),
      getSkinTableShared()
    ]);
    
    if (!charTableRes.ok) throw new Error('無法獲取角色資料');
    const charTable = await charTableRes.json();
    const charData = charTable[charId];
    if (!charData) throw new Error('角色不存在');
    
    const skillTable = skillTableRes?.ok ? await skillTableRes.json() : {};
    const buildingData = buildingDataRes?.ok ? await buildingDataRes.json() : {};
    const uniequipTable = uniequipTableRes?.ok ? await uniequipTableRes.json() : {};
    const handbookInfo = handbookInfoTableRes?.ok ? await handbookInfoTableRes.json() : {};
    const itemTable = itemTableRes?.ok ? await itemTableRes.json() : {};
    const rangeTable = rangeTableRes?.ok ? await rangeTableRes.json() : {};
    
    // 解析稀有度
    const parseRarity = (rarity) => {
      if (typeof rarity === 'number') return rarity;
      if (typeof rarity === 'string') {
        const match = rarity.match(/TIER_(\d+)/);
        if (match) return parseInt(match[1]) - 1;
        const num = parseInt(rarity);
        if (!isNaN(num)) return num;
      }
      return 0;
    };
    
    const rarity = parseRarity(charData.rarity);
    
    // 獲取材料信息的輔助函數
    const getItemInfo = (itemId) => {
      const item = itemTable?.items?.[itemId];
      return {
        id: itemId,
        name: item?.name || itemId,
        iconId: item?.iconId || itemId,
        rarity: item?.rarity || 0,
        iconUrl: `${ARKNIGHT_IMAGES_BASE}/items/${item?.iconId || itemId}.png`
      };
    };
    
    // 處理技能（更詳細）
    const skills = [];
    if (charData.skills && skillTable) {
      for (const skillRef of charData.skills) {
        const skillId = skillRef.skillId || skillRef;
        const skill = skillTable[skillId];
        if (skill) {
          // 取得最高等級的技能數據
          const levels = skill.levels || [];
          const maxLevel = levels[levels.length - 1] || {};
          const blackboard = maxLevel.blackboard || [];
          skills.push({
            id: skillId,
            name: maxLevel.name || skill.skillId || '未知技能',
            description: cleanDescription(maxLevel.description || '', blackboard),
            skillType: maxLevel.skillType || '',
            spData: maxLevel.spData || {},
            duration: maxLevel.duration || 0,
            blackboard: blackboard,
            rangeId: maxLevel.rangeId || '',
            iconId: skill.iconId || skillId
          });
        }
      }
    }
    
    // 處理天賦（更詳細，清理標籤，傳入 blackboard）
    const talents = (charData.talents || []).map(talent => {
      const candidates = (talent.candidates || []).map(candidate => ({
        name: candidate.name || '',
        description: cleanDescription(candidate.description || '', candidate.blackboard || []),
        unlockCondition: candidate.unlockCondition || {},
        requiredPotentialRank: candidate.requiredPotentialRank || 0,
        prefabKey: candidate.prefabKey || '',
        rangeId: candidate.rangeId || ''
      }));
      return {
        candidates: candidates
      };
    });
    
    // 處理潛能提升（格式化顯示）
    const potentialRanks = (charData.potentialRanks || []).map((rank, index) => ({
      type: rank.type || '',
      description: cleanDescription(rank.description || ''),
      buffDescription: formatPotentialBuff(rank.buff),
      equivalentCost: rank.equivalentCost || null
    }));
    
    // 處理精英化材料（包含材料名稱和圖片）
    const evolveCosts = [];
    if (charData.phases) {
      charData.phases.forEach((phase, index) => {
        if (index > 0 && phase.evolveCost) {
          evolveCosts.push({
            phase: index,
            cost: phase.evolveCost.map(cost => ({
              ...getItemInfo(cost.id),
              count: cost.count,
              type: cost.type
            }))
          });
        }
      });
    }
    
    // 處理技能升級材料（包含材料名稱和圖片）
    const skillUpgradeCosts = [];
    if (charData.allSkillLvlup) {
      charData.allSkillLvlup.forEach((upgrade, index) => {
        skillUpgradeCosts.push({
          level: index + 2,
          lvlUpCost: (upgrade.lvlUpCost || []).map(cost => ({
            ...getItemInfo(cost.id),
            count: cost.count,
            type: cost.type
          })),
          unlockCond: upgrade.unlockCond || {}
        });
      });
    }
    
    // 處理後勤技能（從 chars 中獲取）
    const buildingSkills = [];
    if (buildingData?.chars && buildingData.chars[charId]) {
      const charBuildingInfo = buildingData.chars[charId];
      if (charBuildingInfo.buffChar) {
        charBuildingInfo.buffChar.forEach(buffInfo => {
          if (buffInfo.buffData) {
            buffInfo.buffData.forEach(buff => {
              const buffDetail = buildingData.buffs?.[buff.buffId];
              if (buffDetail) {
                buildingSkills.push({
                  id: buff.buffId,
                  name: buffDetail.buffName || '',
                  description: cleanDescription(buffDetail.description || ''),
                  roomType: buffDetail.roomType || '',
                  buffCategory: buffDetail.buffCategory || '',
                  skillIcon: buffDetail.skillIcon || '',
                  sortId: buffDetail.sortId || 0,
                  cond: buff.cond || {}
                });
              }
            });
          }
        });
      }
    }
    
    // 處理模組（從 equipDict 中根據 charId 篩選）
    const modules = [];
    if (uniequipTable?.equipDict) {
      Object.entries(uniequipTable.equipDict).forEach(([equipId, equipData]) => {
        if (equipData.charId === charId) {
          modules.push({
            id: equipId,
            uniEquipName: equipData.uniEquipName || '',
            uniEquipDesc: cleanDescription(equipData.uniEquipDesc || ''),
            typeName1: equipData.typeName1 || '',
            typeName2: equipData.typeName2 || '',
            typeIcon: equipData.typeIcon || '',
            equipShiningColor: equipData.equipShiningColor || '',
            unlockEvolvePhase: equipData.unlockEvolvePhase || 0,
            unlockLevel: equipData.unlockLevel || 1,
            unlockFavorPoint: equipData.unlockFavorPoint || 0,
            missionList: equipData.missionList || [],
            itemCost: equipData.itemCost || {}
          });
        }
      });
    }
    
    // 處理幹員檔案
    const handbookData = handbookInfo?.handbookDict?.[charId] || {};
    
    // 立繪檔名可能含 # 等字元，需編碼後再放入 URL path（否則 # 會被當成 fragment）
    const encodePortraitFileId = (id) => encodeURIComponent(id);

    // 獲取立繪 URL（使用多個來源和備用 URL）
    const getPortraitUrls = (portraitId, alternativeIds = []) => {
      if (!portraitId) return [];

      // 合併主要 ID 和備用 ID
      const allIds = [portraitId, ...alternativeIds].filter(Boolean);
      const urls = [];

      // 為每個 ID 生成所有來源的 URL
      allIds.forEach(id => {
        const enc = encodePortraitFileId(id);
        urls.push(
          `${ARKNIGHT_IMAGES_BASE}/characters/${enc}.png`,
          `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/charportraits/${enc}.png`,
          `${ARKNIGHT_IMAGES_MIRROR_ACESHIP}/characters/${enc}.png`,
          `https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets/cn/assets/torappu/dynamicassets/arts/charportraits/${enc}.png`,
          `https://raw.githubusercontent.com/ak-cn-archive/arknights-operator-image/main/portraits/${enc}.png`
        );
      });

      return urls;
    };
    
    // 構建立繪列表（不包含初始：精一、精二 + skin_table 時裝）
    const portraits = [];
    const displaySkins = charData.displaySkins || [];

    // 精一立繪
    if (charData.phases && charData.phases.length > 1) {
      const phase1 = charData.phases[1];
      let displayId1 = null;
      if (displaySkins.length > 0) {
        const elite1Skin = displaySkins.find(skin =>
          skin.portraitId && (skin.portraitId.includes('_1') || skin.portraitId.includes('#1'))
        ) || displaySkins[0];
        displayId1 = elite1Skin?.portraitId;
      }
      if (!displayId1) {
        displayId1 = phase1.displayId || `${charId}_1`;
      }
      const alternativeIds1 = [
        `${charId}_1+`,
        `${charId}_1`,
        `${charId}#1`,
        phase1.displayId
      ].filter(id => id && id !== displayId1);

      portraits.push({
        name: '精一',
        portraitId: displayId1,
        urls: getPortraitUrls(displayId1, alternativeIds1),
        skinId: null
      });
    }

    // 精二立繪
    if (charData.phases && charData.phases.length > 2) {
      const phase2 = charData.phases[2];
      let displayId2 = null;
      if (displaySkins.length > 1) {
        const elite2Skin = displaySkins.find(skin =>
          skin.portraitId && (skin.portraitId.includes('_2') || skin.portraitId.includes('#2'))
        ) || displaySkins[1];
        displayId2 = elite2Skin?.portraitId;
      }
      if (!displayId2) {
        displayId2 = phase2.displayId || `${charId}_2`;
      }

      portraits.push({
        name: '精二',
        portraitId: displayId2,
        urls: getPortraitUrls(displayId2),
        skinId: null
      });
    }

    const elitePortraitIds = new Set(portraits.map(p => p.portraitId).filter(Boolean));

    // 時裝：charSkins 內 charId 相符者，排除預設戰鬥立繪群 ILLUST_*（對應初始／精一／精二美術）
    const charSkinsMap = skinTable?.charSkins;
    if (charSkinsMap && typeof charSkinsMap === 'object') {
      const isDefaultSkinGroup = (gid) => typeof gid === 'string' && gid.startsWith('ILLUST_');
      const costumeRows = [];

      for (const skin of Object.values(charSkinsMap)) {
        if (!skin || skin.charId !== charId) continue;
        const gid = skin.displaySkin?.skinGroupId;
        if (isDefaultSkinGroup(gid)) continue;

        const portraitId = skin.portraitId;
        if (!portraitId || elitePortraitIds.has(portraitId)) continue;

        const ds = skin.displaySkin || {};
        const rawLabel = [ds.skinName, ds.skinGroupName].find(Boolean) || skin.skinId || portraitId;
        const labelStr = String(rawLabel);
        const tabName = labelStr.startsWith('時裝') ? labelStr : `時裝 · ${labelStr}`;

        costumeRows.push({
          skinId: skin.skinId,
          portraitId,
          tabName,
          sortId: typeof ds.sortId === 'number' ? ds.sortId : 0
        });
      }

      costumeRows.sort((a, b) => a.sortId - b.sortId || String(a.skinId).localeCompare(String(b.skinId)));

      const seenPortrait = new Set();
      for (const row of costumeRows) {
        if (seenPortrait.has(row.portraitId)) continue;
        seenPortrait.add(row.portraitId);

        portraits.push({
          name: row.tabName,
          portraitId: row.portraitId,
          urls: getPortraitUrls(row.portraitId),
          skinId: row.skinId
        });
      }
    }

    // 獲取攻擊範圍數據
    const getRangeData = (rangeId) => {
      if (!rangeId || !rangeTable[rangeId]) return null;
      const range = rangeTable[rangeId];
      return {
        id: rangeId,
        direction: range.direction || 1,
        grids: range.grids || []
      };
    };
    
    // 獲取各階段的攻擊範圍
    const phaseRanges = [];
    if (charData.phases) {
      charData.phases.forEach((phase, index) => {
        const rangeData = getRangeData(phase.rangeId);
        if (rangeData) {
          phaseRanges.push({
            phase: index,
            ...rangeData
          });
        }
      });
    }
    
    // 處理特性描述（從 trait 中獲取最終候選的描述）
    let traitDescription = '';
    if (charData.trait && charData.trait.candidates && charData.trait.candidates.length > 0) {
      const lastCandidate = charData.trait.candidates[charData.trait.candidates.length - 1];
      traitDescription = cleanDescription(lastCandidate.overrideDescripton || lastCandidate.additionalDescription || '', lastCandidate.blackboard || []);
    }
    // 如果沒有 trait，使用 description
    if (!traitDescription && charData.description) {
      traitDescription = cleanDescription(charData.description);
    }
    
    return {
      id: charId,
      name: charData.name,
      appellation: charData.appellation,
      profession: charData.profession,
      subProfessionId: charData.subProfessionId || '',
      rarity: rarity,
      position: charData.position,
      tagList: charData.tagList || [],
      nation: charData.nationId,
      description: charData.itemUsage || charData.itemDesc || '',
      itemUsage: charData.itemUsage || '',
      itemDesc: charData.itemDesc || '',
      itemObtainApproach: charData.itemObtainApproach || '',
      
      // 1. 干员信息（立繪）
      portraits: portraits,
      
      // 2. 特性
      traitDescription: traitDescription,
      
      // 3. 獲得方式
      obtainApproach: charData.itemObtainApproach || '',
      
      // 4. 屬性（各等級）
      phases: charData.phases || [],
      
      // 5. 攻擊範圍
      phaseRanges: phaseRanges,
      
      // 6. 天賦
      talents: talents,
      
      // 7. 潛能提升
      potentialRanks: potentialRanks,
      
      // 8. 技能
      skills: skills,
      
      // 9. 後勤技能
      buildingSkills: buildingSkills,
      
      // 10. 精英化材料
      evolveCosts: evolveCosts,
      
      // 11. 技能升級材料
      skillUpgradeCosts: skillUpgradeCosts,
      
      // 12. 模組
      modules: modules,
      
      // 13. 幹員檔案
      handbook: handbookData,
      
      avatarUrl: AVATAR_SOURCES[0](charId)
    };
  } catch (error) {
    console.error('獲取角色詳情失敗:', error);
    throw error;
  }
}


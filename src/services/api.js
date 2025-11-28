import { fetchWithCache } from './cache.js';
import { parseLRC } from '../utils/lyrics.js';

const API_BASE = 'https://monstersiren-web-api.vercel.app/api';

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
  const response = await fetch(`${API_BASE}/song/${songId}`);
  if (!response.ok) throw new Error('Network response was not ok');
  const { data } = await response.json();
  return data;
}

/**
 * 獲取歌詞
 * @param {string} lyricUrl - 歌詞URL
 * @returns {Promise<Array>} 解析後的歌詞數組
 */
export async function fetchLyrics(lyricUrl) {
  if (!lyricUrl) {
    console.warn('歌詞URL為空');
    return [];
  }
  
  try {
    // 使用和原本一樣的方法構建代理URL
    const proxyUrl = `https://monstersiren-web-api.vercel.app/proxy-lyrics?url=${encodeURIComponent(lyricUrl)}`;
    console.log('請求歌詞URL:', proxyUrl);
    
    const response = await fetch(proxyUrl);
    if (!response.ok) {
      // 404或其他錯誤時，返回空數組而不是拋出錯誤
      if (response.status === 404) {
        console.warn('歌詞不存在 (404):', lyricUrl);
        return [];
      }
      throw new Error(`HTTP錯誤! 狀態碼: ${response.status}`);
    }
    const lrcText = await response.text();
    const parsedLyrics = parseLRC(lrcText);
    console.log('歌詞解析成功，共', parsedLyrics.length, '行');
    return parsedLyrics;
  } catch (error) {
    // 捕獲所有錯誤，返回空數組而不是拋出錯誤
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

// 多個圖片來源（按優先順序）
const AVATAR_SOURCES = [
  // 來源1: Aceship (最常用)
  (id) => `https://raw.githubusercontent.com/Aceship/Arknight-Images/main/avatars/${id}.png`,
  // 來源2: yuanyan3060 的資源庫
  (id) => `https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/avatar/${id}.png`,
  // 來源3: 另一個備用來源
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
    console.error('獲取角色數據失敗:', error);
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


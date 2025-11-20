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


/**
 * 使用 sessionStorage 進行快取的網路請求
 * @param {string} url - 請求的URL
 * @returns {Promise<any>} 返回解析後的JSON數據
 */
export async function fetchWithCache(url) {
  // 檢查 sessionStorage 中是否已經有這筆資料
  const cachedData = sessionStorage.getItem(url);
  if (cachedData) {
    // 如果有，直接回傳快取中的資料
    console.log(`[Cache] Hit for ${url}`);
    return JSON.parse(cachedData);
  }

  console.log(`[Cache] Miss for ${url}. Fetching from network...`);
  // 如果沒有，才發起網路請求
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Network response was not ok");
  }
  const data = await response.json();

  // 將獲取的資料存入 sessionStorage，以便下次使用
  sessionStorage.setItem(url, JSON.stringify(data));

  return data;
}


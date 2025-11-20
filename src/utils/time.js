/**
 * 格式化時間（秒數轉換為 MM:SS 格式）
 * @param {number} seconds - 秒數
 * @returns {string} 格式化後的時間字符串
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}


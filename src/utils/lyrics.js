/**
 * 解析LRC歌詞格式
 * @param {string} lrc - LRC格式的歌詞文本
 * @returns {Array} 解析後的歌詞數組，每個元素包含 {time, text}
 */
export function parseLRC(lrc) {
  const lines = lrc.split("\n");
  const result = [];
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/;

  lines.forEach((line) => {
    const match = timeRegex.exec(line);
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseInt(match[3].padEnd(3, "0"));
      const time = minutes * 60 + seconds + milliseconds / 1000;
      const text = line.replace(timeRegex, "").trim();
      if (text) {
        result.push({ time, text });
      }
    }
  });
  return result;
}


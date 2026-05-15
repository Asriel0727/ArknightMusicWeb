/**
 * 將 API／JSON 中常見的「字面 \\n」或 \\r 轉成真正的換行，供 white-space: pre-line 顯示。
 */
export function normalizeEscapedNewlines(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n');
}

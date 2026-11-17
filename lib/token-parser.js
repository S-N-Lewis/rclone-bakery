'use strict';
/**
 * 纯函数：从 `rclone authorize drive` 的输出中解析 token JSON。
 * rclone 输出格式：
 *   Paste the following into your remote machine --->
 *   {"access_token":"...","token_type":"Bearer","refresh_token":"...","expiry":"..."}
 *   <---End paste---
 */

function extractTokenText(output) {
  const text = String(output).replace(/\r/g, '');
  const startMarker = '--->';
  const endMarker = '<---End paste---';

  const startIdx = text.indexOf(startMarker);
  if (startIdx !== -1) {
    const after = text.slice(startIdx + startMarker.length);
    const endIdx = after.indexOf(endMarker);
    const raw = endIdx !== -1 ? after.slice(0, endIdx) : after;
    if (raw.trim()) return raw.trim();
  }
  // 兜底：找第一个完整的 {...} 块
  const begin = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (begin !== -1 && end > begin) {
    const raw = text.slice(begin, end + 1);
    if (raw.trim()) return raw.trim();
  }
  return null;
}

/**
 * @param {string} output rclone authorize 的 stdout（含 stderr 也兼容）
 * @returns {object|null} 解析出的 token 对象；失败返回 null
 */
function parseAuthorizeOutput(output) {
  if (output == null) return null;
  const raw = extractTokenText(output);
  if (!raw) return null;
  try {
    const token = JSON.parse(raw);
    if (!token || typeof token !== 'object' || Array.isArray(token)) return null;
    if (typeof token.access_token !== 'string' || !token.access_token) return null;
    if (typeof token.token_type !== 'string' || !token.token_type) return null;
    return token;
  } catch {
    return null;
  }
}

module.exports = { parseAuthorizeOutput, extractTokenText };

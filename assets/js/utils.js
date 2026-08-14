// 纯工具函数：转义、内容格式化、时间格式化（无副作用，可复用）

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const escAttr = esc;

// 动态内容 → 安全 HTML：转义后识别链接、#话题#，并按搜索词高亮
export function fmtContent(text, query = '') {
  let s = esc(text);
  s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  s = s.replace(/#([^#\n]{1,50})#/g, '<span class="topic">#$1#</span>');
  return highlight(s, query);
}

// 只在 HTML 标签之外的文本段做关键词高亮
function highlight(html, query) {
  const q = String(query || '').trim();
  if (!q) return html;
  const needle = esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${needle})`, 'gi');
  return html
    .split(/(<[^>]+>)/g)
    .map((part) => (part.startsWith('<') ? part : part.replace(re, '<mark>$1</mark>')))
    .join('');
}

const pad = (n) => String(n).padStart(2, '0');

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60e3) return '刚刚';
  if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
  if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
  if (diff < 7 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fmtFull(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

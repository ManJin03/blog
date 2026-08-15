// 纯工具函数：转义、内容格式化、时间格式化（无副作用，可复用）

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export const escAttr = esc;

// ---- 轻量 Markdown 渲染 ----
// 安全策略：先提取需要保护的片段（代码围栏/行内代码/#话题#）为哨兵，再对全文 HTML 转义，
// 之后仅做语法替换；所有标签由本文件生成，URL 一律经 safeUrl 校验协议，杜绝注入。
// #话题# 必须在转义前提取，否则 &#39; 等实体中的 # 会被误判为话题开头（历史 bug）。

const P = '\u0000'; // 哨兵字符：临时保护代码围栏/行内代码/链接/话题，避免被后续规则误处理

// 只放行安全协议；其余降级为占位链接
function safeUrl(url) {
  return /^(?:https?:|mailto:|\/|#)/i.test(url) ? url : '#';
}

// 分离 URL 与其尾部标点/HTML 实体（如 https://a.com&#39;; → url 与 '; 分离），
// 避免把引号/分号/括号吞进链接（历史 bug：const x = 'https://a.com'; 的 '; 被并入 href）
function splitUrlTail(raw) {
  const m = raw.match(/((?:&(?:[a-z]+|#\d+|#x[0-9a-f]+);|[.,;:!?)\]}>"'])+)$/i);
  return m ? { url: raw.slice(0, -m[1].length), tail: m[1] } : { url: raw, tail: '' };
}

// 行内解析：链接 → 自动 URL → 加粗/斜体/删除线
function inline(s) {
  if (!s) return '';
  const links = [];

  // 1) Markdown 链接 [text](url "title")：立即生成 <a> 并用哨兵保护，避免自动 URL 误匹配其 href
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (_, label, url) => {
    const idx = links.length;
    links.push(
      `<a href="${escAttr(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${inline(label)}</a>`,
    );
    return `${P}l${idx}${P}`;
  });

  // 2) 自动 URL（此时 Markdown 链接已是哨兵，不会重复匹配其 href）
  s = s.replace(/(https?:\/\/[^\s<]+)/g, (m) => {
    const { url, tail } = splitUrlTail(m);
    return `<a href="${escAttr(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${url}</a>${tail}`;
  });

  // 3) 加粗 / 斜体 / 删除线（先粗后斜，避免 ** 干扰 * ）
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // 4) 还原链接
  return s.replace(new RegExp(`${P}l(\\d+)${P}`, 'g'), (_, n) => links[+n]);
}

// Markdown → 安全 HTML
export function renderMarkdown(text) {
  const fences = []; // 代码围栏块（已转义）
  const codes = [];  // 行内代码（已转义）
  const topics = []; // #话题#（已转义）

  // 1) 提取代码围栏（``` / ~~~）：整块替换为哨兵，内部不参与任何解析
  let s = String(text).replace(/^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)^\1[ \t]*$/gm, (_m, _mark, body) => {
    const idx = fences.length;
    fences.push(esc(body.replace(/\n+$/, '')));
    return `${P}f${idx}${P}`;
  });

  // 2) 提取行内代码：保护其内容不被加粗/话题/自动链接误处理
  s = s.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codes.length;
    codes.push(esc(code));
    return `${P}c${idx}${P}`;
  });

  // 3) 提取 #话题#（必须在转义前，避免 &#39; 等实体中的 # 被误判）
  s = s.replace(/#([^#\n]{1,50})#/g, (_, tag) => {
    const idx = topics.length;
    topics.push(`<span class="topic">#${esc(tag)}#</span>`);
    return `${P}t${idx}${P}`;
  });

  // 4) 全量转义：此后用户内容一律按纯文本
  s = esc(s);

  const blocks = [];
  const lines = s.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码围栏占位符：作为独立块保留，最后统一还原
    if (line.startsWith(`${P}f`)) {
      blocks.push(line);
      i++;
      continue;
    }

    // 标题：# → h3，## → h4，依次类推，最多 h6
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(6, h[1].length + 2);
      blocks.push(`<h${level}>${inline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    // 引用：连续 > 行合并为一个 blockquote（转义后 > 为 &gt;）
    if (/^&gt;\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^&gt;\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^&gt;\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote>${buf.map((l) => inline(l)).join('<br>')}</blockquote>`);
      continue;
    }

    // 无序列表
    let m = line.match(/^[-*+]\s+(.*)$/);
    if (m) {
      const items = [`<li>${inline(m[1])}</li>`];
      i++;
      while (i < lines.length && (m = lines[i].match(/^[-*+]\s+(.*)$/))) {
        items.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      blocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    // 有序列表
    m = line.match(/^\d+[.)]\s+(.*)$/);
    if (m) {
      const items = [`<li>${inline(m[1])}</li>`];
      i++;
      while (i < lines.length && (m = lines[i].match(/^\d+[.)]\s+(.*)$/))) {
        items.push(`<li>${inline(m[1])}</li>`);
        i++;
      }
      blocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push('<hr>');
      i++;
      continue;
    }

    // 空行：跳过（作为段落分隔）
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // 普通段落：连续非空行合并，行内以 <br> 换行
    const para = [line];
    i++;
    while (
      i < lines.length &&
      !lines[i].startsWith(P) &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6}\s|&gt;\s?|[-*+]\s|\d+[.)]\s|(-{3,}|\*{3,}|_{3,})\s*$)/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(`<p>${para.map((l) => inline(l)).join('<br>')}</p>`);
  }

  // 统一还原：行内代码 → 话题 → 代码围栏
  let html = blocks.join('\n');
  html = html.replace(new RegExp(`${P}c(\\d+)${P}`, 'g'), (_, n) => `<code>${codes[+n]}</code>`);
  html = html.replace(new RegExp(`${P}t(\\d+)${P}`, 'g'), (_, n) => topics[+n]);
  return html.replace(new RegExp(`${P}f(\\d+)${P}`, 'g'), (_, n) => `<pre><code>${fences[+n]}</code></pre>`);
}

// 动态内容 → 安全 HTML：Markdown 渲染 + 搜索高亮
export function fmtContent(text, query = '') {
  return highlight(renderMarkdown(text), query);
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

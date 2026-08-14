// 动态流组件：渲染（关键词/标签/时间过滤、编辑态）与列表内交互，通过 handlers 与外部通信
import { SITE } from './config.js';
import { esc, escAttr, fmtContent, timeAgo, fmtFull } from './utils.js';

let handlers = {};

const listEl = document.getElementById('postList');
const emptyEl = document.getElementById('emptyState');
const emptyTextEl = emptyEl.querySelector('p');
const countEl = document.getElementById('postCount');
const filterBarEl = document.getElementById('filterBar');

export function initFeed(h) {
  handlers = h;
  listEl.addEventListener('click', onClick);
  listEl.addEventListener('input', onInput);
  listEl.addEventListener('keydown', onKeyDown);
  filterBarEl.addEventListener('click', onFilterClick);
  filterBarEl.addEventListener('change', onFilterChange);
}

/* ---------- 标签 / 时间工具 ---------- */

// 提取一条动态里的全部 #话题# 标签（去重）
function postTags(p) {
  const tags = [];
  for (const m of p.content.matchAll(/#([^#\n]{1,50})#/g)) {
    if (!tags.includes(m[1])) tags.push(m[1]);
  }
  return tags;
}

function monthKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function hasFilter(state) {
  return !!(state.query.trim() || state.tag || state.month);
}

function visiblePosts(state) {
  if (!hasFilter(state)) return state.posts;
  const q = state.query.trim().toLowerCase();
  return state.posts.filter((p) => {
    // 正在编辑的帖子固定显示，避免筛选条件把它过滤掉导致编辑框消失、输入丢失
    if (state.editingId === p.id) return true;
    if (q && !p.content.toLowerCase().includes(q)) return false;
    if (state.tag && !postTags(p).includes(state.tag)) return false;
    if (state.month && monthKey(p.createdAt) !== state.month) return false;
    return true;
  });
}

/* ---------- 渲染 ---------- */

export function renderFeed(state) {
  renderFilterBar(state);

  const posts = visiblePosts(state);
  const filtered = hasFilter(state);

  countEl.textContent = state.posts.length
    ? (filtered ? `${posts.length}/${state.posts.length} 条` : `共 ${state.posts.length} 条`)
    : '';

  const empty = posts.length === 0;
  emptyEl.classList.toggle('hidden', !empty);
  if (empty) {
    emptyTextEl.textContent = filtered ? '没有符合筛选条件的动态' : '还没有动态，发布第一条想法吧';
  }

  // 编辑中的条目保留现有 DOM 节点，避免搜索/筛选触发的重渲染丢失正在输入的内容
  const editingLi = listEl.querySelector('li.post.editing');
  const preserve = editingLi && editingLi.dataset.id === state.editingId ? editingLi : null;

  listEl.innerHTML = posts
    .map((p) => (preserve && p.id === state.editingId
      ? `<li data-slot="${escAttr(p.id)}"></li>`
      : postHtml(p, state)))
    .join('');

  if (preserve) {
    listEl.querySelector(`[data-slot="${CSS.escape(state.editingId)}"]`)?.replaceWith(preserve);
    return; // 保留节点时不动焦点
  }

  // 进入编辑态：自动聚焦。必须延迟到下一帧再 focus + setSelectionRange，
  // 同一帧内 innerHTML + 选区操作会破坏 Windows 中文输入法的组合输入（表现为无法键入、只能粘贴）
  const area = listEl.querySelector('.edit-area');
  if (area) {
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(area.value.length, area.value.length);
    });
  }
}

function renderFilterBar(state) {
  // 汇总全部动态的标签（按出现次数降序）与月份（降序）
  const tagCount = new Map();
  for (const p of state.posts) {
    for (const t of postTags(p)) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const tags = [...tagCount.keys()].sort((a, b) => tagCount.get(b) - tagCount.get(a));
  // 当前筛选的标签即使已无帖子也保留为可点击的 chip，便于取消筛选
  if (state.tag && !tags.includes(state.tag)) tags.unshift(state.tag);

  const months = [...new Set(state.posts.map((p) => monthKey(p.createdAt)))].sort().reverse();

  if (!tags.length && months.length <= 1 && !state.month) {
    filterBarEl.classList.add('hidden');
    filterBarEl.innerHTML = '';
    return;
  }

  filterBarEl.classList.remove('hidden');
  filterBarEl.innerHTML = `
    <div class="filter-chips">
      ${tags.map((t) => `
        <button class="filter-chip${state.tag === t ? ' active' : ''}" type="button" data-tag="${escAttr(t)}">#${esc(t)}#</button>`).join('')}
    </div>
    ${months.length > 1 || state.month ? `
    <select class="filter-select" aria-label="按时间筛选">
      <option value="">全部时间</option>
      ${months.map((m) => `<option value="${m}"${state.month === m ? ' selected' : ''}>${m}</option>`).join('')}
    </select>` : ''}`;
}

function postHtml(p, state) {
  if (state.editingId === p.id) return editHtml(p);

  const actions = state.authed ? `
    <div class="post-actions">
      <button class="act-btn" type="button" data-edit="${escAttr(p.id)}" title="编辑">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        编辑
      </button>
      <button class="act-btn danger" type="button" data-del="${escAttr(p.id)}" title="删除">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        删除
      </button>
    </div>` : '';

  return `
    <li class="post" data-id="${escAttr(p.id)}">
      <div class="post-content">${fmtContent(p.content, state.query)}</div>
      <div class="post-meta">
        <time datetime="${new Date(p.createdAt).toISOString()}" title="${fmtFull(p.createdAt)}">${timeAgo(p.createdAt)}</time>
        ${p.updatedAt ? `<span class="edited-tag" title="${fmtFull(p.updatedAt)}">已编辑</span>` : ''}
        ${actions}
      </div>
    </li>`;
}

function editHtml(p) {
  return `
    <li class="post editing" data-id="${escAttr(p.id)}">
      <textarea class="edit-area" maxlength="${SITE.maxPostLen}" rows="3">${esc(p.content)}</textarea>
      <div class="edit-bar">
        <span class="char-count">${p.content.length}/${SITE.maxPostLen}</span>
        <div class="edit-actions">
          <button class="btn-ghost" type="button" data-cancel>取消</button>
          <button class="publish-btn small" type="button" data-save>保存</button>
        </div>
      </div>
    </li>`;
}

function onClick(e) {
  const btn = e.target.closest('button');
  if (!btn) return;
  const li = btn.closest('li');
  const id = li?.dataset.id;
  if (btn.dataset.del) handlers.onDelete?.(id);
  else if (btn.dataset.edit) handlers.onEdit?.(id);
  else if (btn.hasAttribute('data-cancel')) handlers.onCancelEdit?.();
  else if (btn.hasAttribute('data-save')) {
    const area = li.querySelector('.edit-area');
    if (area.value.trim()) handlers.onSaveEdit?.(id, area.value);
  }
}

function onInput(e) {
  const area = e.target.closest('.edit-area');
  if (!area) return;
  const li = area.closest('li');
  li.querySelector('.char-count').textContent = `${area.value.length}/${SITE.maxPostLen}`;
  li.querySelector('[data-save]').disabled = !area.value.trim();
}

function onKeyDown(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
  const area = e.target.closest('.edit-area');
  if (!area) return;
  const li = area.closest('li');
  if (area.value.trim()) handlers.onSaveEdit?.(li.dataset.id, area.value);
}

function onFilterClick(e) {
  const chip = e.target.closest('[data-tag]');
  if (chip) handlers.onTagSelect?.(chip.dataset.tag);
}

function onFilterChange(e) {
  const select = e.target.closest('select');
  if (select) handlers.onMonthSelect?.(select.value);
}

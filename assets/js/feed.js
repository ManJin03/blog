// 动态流组件：渲染（关键词/标签/时间过滤、编辑态、置顶、折叠展开）与列表内交互，通过 handlers 与外部通信
import { SITE } from './config.js';
import { esc, escAttr, fmtContent, timeAgo, fmtFull } from './utils.js';

let handlers = {};

const listEl = document.getElementById('postList');
const emptyEl = document.getElementById('emptyState');
const emptyTextEl = emptyEl.querySelector('p');
const countEl = document.getElementById('postCount');
const filterBarEl = document.getElementById('filterBar');
const filterDateEl = document.getElementById('filterDate');
const pinnedWrapEl = document.getElementById('pinnedWrap');
const pinnedListEl = document.getElementById('pinnedList');
const listToggleEl = document.getElementById('listToggle');
const listToggleBtn = document.getElementById('listToggleBtn');

// 普通动态列表默认展示条数，超过则折叠为“展开全部”
const DEFAULT_SHOW = 5;

export function initFeed(h) {
  handlers = h;
  listEl.addEventListener('click', onClick);
  listEl.addEventListener('input', onInput);
  listEl.addEventListener('keydown', onKeyDown);
  pinnedListEl.addEventListener('click', onClick);
  pinnedListEl.addEventListener('input', onInput);
  pinnedListEl.addEventListener('keydown', onKeyDown);
  filterBarEl.addEventListener('click', onFilterClick);
  filterDateEl.addEventListener('change', onDateChange);
  listToggleBtn.addEventListener('click', () => handlers.onListToggle?.());
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

  const all = visiblePosts(state);
  const pinned = all.filter((p) => p.pinned);
  const normal = all.filter((p) => !p.pinned);
  const filtered = hasFilter(state);

  countEl.textContent = state.posts.length
    ? (filtered ? `${all.length}/${state.posts.length} 条` : `共 ${state.posts.length} 条`)
    : '';

  const empty = all.length === 0;
  emptyEl.classList.toggle('hidden', !empty);
  if (empty) {
    emptyTextEl.textContent = filtered ? '没有符合筛选条件的动态' : '还没有动态，发布第一条想法吧';
  }

  // 置顶模块：无置顶帖时整体隐藏
  pinnedWrapEl.classList.toggle('hidden', pinned.length === 0);

  // 普通动态默认折叠为 5 条；编辑中的帖子强制保留可见，避免编辑框被折叠掉
  let shown = state.listExpanded ? normal : normal.slice(0, DEFAULT_SHOW);
  if (state.editingId && !shown.some((p) => p.id === state.editingId)) {
    const editing = normal.find((p) => p.id === state.editingId);
    if (editing) shown = shown.concat(editing);
  }

  renderList(pinnedListEl, pinned, state);
  renderList(listEl, shown, state);

  // 普通动态多于 DEFAULT_SHOW 条时显示“展开全部/收起”
  if (normal.length > DEFAULT_SHOW) {
    listToggleEl.classList.remove('hidden');
    listToggleBtn.textContent = state.listExpanded ? '收起' : `展开全部（共 ${normal.length} 条）`;
  } else {
    listToggleEl.classList.add('hidden');
  }

  afterRender(state);
}

// 渲染单个列表；若列表中存在正在编辑的条目，保留其 DOM 节点避免输入丢失
function renderList(el, posts, state) {
  const editingId = state.editingId;
  const editingLi = el.querySelector('li.post.editing');
  const preserve = editingLi && editingLi.dataset.id === editingId ? editingLi : null;

  if (preserve) {
    el.innerHTML = posts
      .map((p) => (p.id === editingId
        ? `<li data-slot="${escAttr(p.id)}"></li>`
        : postHtml(p, state)))
      .join('');
    el.querySelector(`[data-slot="${CSS.escape(editingId)}"]`)?.replaceWith(preserve);
  } else {
    el.innerHTML = posts.map((p) => postHtml(p, state)).join('');
  }
}

function afterRender(state) {
  // 单帖内容 3 行折叠检测：未超过 3 行则隐藏“展开”按钮
  [listEl, pinnedListEl].forEach((el) => {
    el.querySelectorAll('.post-content.clamped').forEach(initContentClamp);
  });

  // 进入编辑态：自动聚焦。必须延迟到下一帧再 focus + setSelectionRange，
  // 同一帧内 innerHTML + 选区操作会破坏 Windows 中文输入法的组合输入（表现为无法键入、只能粘贴）
  if (state.editingId) {
    const area = listEl.querySelector('.edit-area') || pinnedListEl.querySelector('.edit-area');
    if (area) {
      requestAnimationFrame(() => {
        area.focus();
        area.setSelectionRange(area.value.length, area.value.length);
      });
    }
  }
}

function renderFilterBar(state) {
  // 汇总全部动态的标签（按出现次数降序）
  const tagCount = new Map();
  for (const p of state.posts) {
    for (const t of postTags(p)) tagCount.set(t, (tagCount.get(t) || 0) + 1);
  }
  const tags = [...tagCount.keys()].sort((a, b) => tagCount.get(b) - tagCount.get(a));
  // 当前筛选的标签即使已无帖子也保留为可点击的 chip，便于取消筛选
  if (state.tag && !tags.includes(state.tag)) tags.unshift(state.tag);

  if (!tags.length) {
    filterBarEl.classList.add('hidden');
    filterBarEl.innerHTML = '';
  } else {
    filterBarEl.innerHTML = `
      <div class="chips-row">
        <div class="filter-chips">
          ${tags.map((t) => `
            <button class="filter-chip${state.tag === t ? ' active' : ''}" type="button" data-tag="${escAttr(t)}">#${esc(t)}#</button>`).join('')}
        </div>
        <button class="chips-toggle hidden" type="button" data-chips-toggle aria-expanded="false">展开</button>
      </div>`;
    filterBarEl.classList.remove('hidden');

    // 标签超过一行时显示“展开/收起”按钮（需先按未展开的 nowrap 状态检测溢出）
    const chips = filterBarEl.querySelector('.filter-chips');
    const toggle = filterBarEl.querySelector('.chips-toggle');
    if (chips && toggle) {
      const overflow = chips.scrollWidth > chips.clientWidth;
      if (overflow) {
        toggle.classList.remove('hidden');
        // 展开状态存于全局 state，点击标签触发重渲染后依然保留
        toggle.textContent = state.chipsExpanded ? '收起' : '展开';
        toggle.setAttribute('aria-expanded', String(state.chipsExpanded));
        if (state.chipsExpanded) chips.classList.add('expanded');
      }
    }
  }

  // 时间筛选（动态模块右上角）：有动态时提供月份选项
  const months = [...new Set(state.posts.map((p) => monthKey(p.createdAt)))].sort().reverse();
  if (state.posts.length) {
    filterDateEl.classList.remove('hidden');
    filterDateEl.innerHTML = '<option value="">全部时间</option>' +
      months.map((m) => `<option value="${m}"${state.month === m ? ' selected' : ''}>${m}</option>`).join('');
  } else {
    filterDateEl.classList.add('hidden');
    filterDateEl.innerHTML = '';
  }
}

function postHtml(p, state) {
  if (state.editingId === p.id) return editHtml(p);

  const actions = state.authed ? `
    <div class="post-actions">
      <button class="act-btn${p.pinned ? ' pinned' : ''}" type="button" data-pin="${escAttr(p.id)}" title="${p.pinned ? '取消置顶' : '置顶'}">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76V2h6v8.76L17.5 13h-11L9 10.76z"/></svg>
        ${p.pinned ? '取消置顶' : '置顶'}
      </button>
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
      <div class="post-content clamped">${fmtContent(p.content, state.query)}</div>
      <button class="post-expand hidden" type="button" data-expand aria-expanded="false">展开</button>
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
  else if (btn.hasAttribute('data-pin')) handlers.onTogglePin?.(id);
  else if (btn.hasAttribute('data-expand')) togglePostExpand(btn);
  else if (btn.hasAttribute('data-cancel')) handlers.onCancelEdit?.();
  else if (btn.hasAttribute('data-save')) {
    const area = li.querySelector('.edit-area');
    if (area.value.trim()) handlers.onSaveEdit?.(id, area.value);
  }
}

function togglePostExpand(btn) {
  const li = btn.closest('li');
  const content = li.querySelector('.post-content');
  const expanded = content.classList.toggle('expanded');
  btn.textContent = expanded ? '收起' : '展开';
  btn.setAttribute('aria-expanded', String(expanded));
}

// 检测单帖内容是否超过 3 行，未超过则隐藏“展开”按钮
function initContentClamp(contentEl) {
  const li = contentEl.closest('li');
  const btn = li?.querySelector('.post-expand');
  if (!btn) return;
  const clampedH = contentEl.clientHeight; // 3 行截断时的高度
  contentEl.classList.add('no-clamp'); // 临时移除截断，读取完整高度
  const fullH = contentEl.scrollHeight;
  contentEl.classList.remove('no-clamp');
  btn.classList.toggle('hidden', fullH <= clampedH + 1);
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
  if (chip) {
    handlers.onTagSelect?.(chip.dataset.tag);
    return;
  }
  const toggle = e.target.closest('[data-chips-toggle]');
  if (toggle) {
    handlers.onChipsToggle?.();
  }
}

function onDateChange(e) {
  handlers.onMonthSelect?.(e.target.value);
}

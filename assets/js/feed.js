// 动态流组件：渲染（含搜索过滤、编辑态）与列表内交互（编辑/删除），通过 handlers 与外部通信
import { SITE } from './config.js';
import { esc, escAttr, fmtContent, timeAgo, fmtFull } from './utils.js';

let handlers = {};

const listEl = document.getElementById('postList');
const emptyEl = document.getElementById('emptyState');
const emptyTextEl = emptyEl.querySelector('p');
const countEl = document.getElementById('postCount');

export function initFeed(h) {
  handlers = h;
  listEl.addEventListener('click', onClick);
  listEl.addEventListener('input', onInput);
  listEl.addEventListener('keydown', onKeyDown);
}

function visiblePosts(state) {
  const q = state.query.trim().toLowerCase();
  if (!q) return state.posts;
  return state.posts.filter((p) => p.content.toLowerCase().includes(q));
}

export function renderFeed(state) {
  const posts = visiblePosts(state);
  const q = state.query.trim();

  countEl.textContent = state.posts.length
    ? (q ? `${posts.length}/${state.posts.length} 条` : `共 ${state.posts.length} 条`)
    : '';

  const empty = posts.length === 0;
  emptyEl.classList.toggle('hidden', !empty);
  if (empty) {
    emptyTextEl.textContent = q ? `没有找到与「${q}」相关的动态` : '还没有动态，发布第一条想法吧';
  }

  listEl.innerHTML = posts.map((p) => postHtml(p, state)).join('');

  // 编辑态自动聚焦，光标置于末尾
  const area = listEl.querySelector('.edit-area');
  if (area) {
    area.focus();
    area.selectionStart = area.selectionEnd = area.value.length;
  }
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

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

// 提取一段文本里的全部 #话题# 标签（去重）
function textTags(text) {
  const tags = [];
  for (const m of String(text || '').matchAll(/#([^#\n]{1,50})#/g)) {
    if (!tags.includes(m[1])) tags.push(m[1]);
  }
  return tags;
}

// 提取一条动态里的全部 #话题# 标签（含评论中的标签）
function postTags(p) {
  const tags = textTags(p.content);
  for (const c of (p.comments || [])) {
    for (const t of textTags(c.content)) {
      if (!tags.includes(t)) tags.push(t);
    }
  }
  return tags;
}

// 动态是否命中关键词：正文或任一评论包含即命中（搜索同样适用于评论）
function postMatchesQuery(p, q) {
  if (!q) return true;
  if (p.content.toLowerCase().includes(q)) return true;
  return (p.comments || []).some((c) => c.content.toLowerCase().includes(q));
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
    if (q && !postMatchesQuery(p, q)) return false;
    if (state.tag && !postTags(p).includes(state.tag)) return false;
    if (state.month && monthKey(p.createdAt) !== state.month) return false;
    return true;
  });
}

/* ---------- 渲染 ---------- */

export function renderFeed(state) {
  renderFilterBar(state);

  // 搜索命中评论的帖子自动展开评论，保证命中内容可见
  if (state.query.trim()) {
    const q = state.query.trim().toLowerCase();
    for (const p of state.posts) {
      const hitComment = (p.comments || []).some((c) => c.content.toLowerCase().includes(q));
      if (hitComment && !p.content.toLowerCase().includes(q)) state.commentsVisible[p.id] = true;
    }
  }

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

  const actions = state.isAdmin ? `
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

  const comments = Array.isArray(p.comments) ? p.comments : [];
  const commentsVisible = !!state.commentsVisible[p.id];
  const liked = isLikedInFeed(p, state);

  return `
    <li class="post" data-id="${escAttr(p.id)}">
      <div class="post-content clamped">${fmtContent(p.content, state.query)}</div>
      <button class="post-expand hidden" type="button" data-expand aria-expanded="false">展开</button>
      <div class="post-meta">
        <time datetime="${new Date(p.createdAt).toISOString()}" title="${fmtFull(p.createdAt)}">${timeAgo(p.createdAt)}</time>
        ${p.updatedAt ? `<span class="edited-tag" title="${fmtFull(p.updatedAt)}">已编辑</span>` : ''}
        ${actions}
        <div class="post-meta-actions">
          <button class="meta-btn${commentsVisible ? ' active' : ''}" type="button" data-comments-toggle="${escAttr(p.id)}" title="${commentsVisible ? '收起评论' : '查看评论'}" aria-expanded="${commentsVisible}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            <span class="meta-count">${comments.length}</span>
          </button>
          <button class="meta-btn${liked ? ' liked' : ''}" type="button" data-like="${escAttr(p.id)}" title="${liked ? '取消点赞' : '点赞'}" aria-pressed="${liked}">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
            <span class="meta-count">${p.likes || 0}</span>
          </button>
        </div>
      </div>
      ${commentsVisible ? commentsHtml(p, state) : ''}
    </li>`;
}

/* ---------- 评论区 ---------- */

// 当前点赞者是否已点赞某帖（liker 由 state 传入：登录为 user:xxx，未登录为 device:xxx）
function isLikedInFeed(post, state) {
  const d = post && post.likedDevices;
  const liker = state && state.liker;
  return Array.isArray(d) && !!liker && d.includes(liker);
}

// 评论头像 URL：github 主页 + '.png'，兜底用账号名首字母
function commentAvatar(c) {
  const g = (c.authorGithub || '').replace(/\/+$/, '');
  const url = g ? `${g}.png` : null;
  const name = (c.author || '').trim();
  const fallback = name ? name.slice(0, 1).toUpperCase() : '?';
  return { url, fallback };
}

function commentItemHtml(p, c, state) {
  const editing = state.commentEditingId === `${p.id}:${c.id}`;
  if (editing) return commentEditHtml(c);

  const isAuthor = state.me && state.me.username === c.author;
  // 作者本人或管理员可改/删
  const canManage = isAuthor || state.isAdmin;

  const { url, fallback } = commentAvatar(c);
  // 头像：字母兜底 + 图片覆盖，图片加载失败时透明，字母自然显示（避免内联脚本）
  const avatarHtml = url
    ? `<span class="comment-avatar-fallback">${esc(fallback)}</span><img class="comment-avatar-img" src="${escAttr(url)}" alt="${escAttr(c.author)}" loading="lazy" />`
    : `<span class="comment-avatar-fallback">${esc(fallback)}</span>`;

  return `
    <li class="comment" data-cid="${escAttr(c.id)}">
      <div class="comment-avatar">${avatarHtml}</div>
      <div class="comment-body">
        <div class="comment-head">
          <span class="comment-author">${esc(c.author)}</span>
          <time datetime="${new Date(c.createdAt).toISOString()}" title="${fmtFull(c.createdAt)}">${timeAgo(c.createdAt)}</time>
          ${c.updatedAt ? `<span class="edited-tag" title="${fmtFull(c.updatedAt)}">已编辑</span>` : ''}
        </div>
        <div class="comment-content">${fmtContent(c.content, state.query)}</div>
        ${canManage ? `
          <div class="comment-actions">
            <button class="act-btn" type="button" data-cedit="${escAttr(c.id)}" title="编辑">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
              编辑
            </button>
            <button class="act-btn danger" type="button" data-cdel="${escAttr(c.id)}" title="删除">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              删除
            </button>
          </div>` : ''}
      </div>
    </li>`;
}

function commentsHtml(p, state) {
  const comments = Array.isArray(p.comments) ? p.comments : [];
  // 普通账号可评论；GitHub 映射管理员（带 GitHub 身份）同样可评论；
  // 纯密码管理员（无 GitHub 身份）不可评论；未登录给出 GitHub 登录入口
  const canComment = state.authed && (!state.isAdmin || !!(state.me && state.me.github));

  // 评论区内显示全部评论（整体显示/隐藏由气泡图标控制）
  const list = comments.map((c) => commentItemHtml(p, c, state)).join('');

  const draft = state.commentDraft[p.id] || '';
  const composer = canComment ? `
    <div class="comment-composer">
      <textarea class="comment-input" placeholder="写下你的评论…（支持 Markdown，500 字以内）" rows="2">${esc(draft)}</textarea>
      <div class="comment-composer-bar">
        <span class="char-count">${draft.length}/${SITE.maxCommentLen}</span>
        <button class="publish-btn small" type="button" data-csend disabled>发表评论</button>
      </div>
    </div>` : '';
  const loginTip = !state.authed ? `
    <div class="comment-login">
      <a class="github-login-btn small" href="/api/login/github">使用 GitHub 登录后即可发表评论</a>
    </div>` : '';

  return `
    <div class="comments">
      <div class="comments-head">
        <span class="comments-count">${comments.length ? `${comments.length} 条评论` : '暂无评论'}</span>
      </div>
      <ul class="comment-list">${list}</ul>
      ${composer}
      ${loginTip}
    </div>`;
}

function commentEditHtml(c) {
  return `
    <li class="comment editing" data-cid="${escAttr(c.id)}">
      <div class="comment-body">
        <textarea class="comment-edit-area" rows="3">${esc(c.content)}</textarea>
        <div class="comment-edit-bar">
          <span class="char-count">${c.content.length}/${SITE.maxCommentLen}</span>
          <div class="edit-actions">
            <button class="btn-ghost" type="button" data-ccancel>取消</button>
            <button class="publish-btn small" type="button" data-csave>保存</button>
          </div>
        </div>
      </div>
    </li>`;
}

function editHtml(p) {
  return `
    <li class="post editing" data-id="${escAttr(p.id)}">
      <textarea class="edit-area" rows="3">${esc(p.content)}</textarea>
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
  const postLi = btn.closest('li.post');
  const id = postLi?.dataset.id;

  // 帖子级操作
  if (btn.dataset.del) handlers.onDelete?.(id);
  else if (btn.dataset.edit) handlers.onEdit?.(id);
  else if (btn.hasAttribute('data-pin')) handlers.onTogglePin?.(id);
  else if (btn.hasAttribute('data-expand')) togglePostExpand(btn);
  else if (btn.hasAttribute('data-comments-toggle')) handlers.onCommentsToggle?.(btn.dataset.commentsToggle);
  else if (btn.hasAttribute('data-like')) handlers.onToggleLike?.(btn.dataset.like);
  else if (btn.hasAttribute('data-cancel')) handlers.onCancelEdit?.();
  else if (btn.hasAttribute('data-save')) {
    const area = postLi?.querySelector('.edit-area');
    if (area.value.trim() && area.value.length <= SITE.maxPostLen) handlers.onSaveEdit?.(id, area.value);
  }

  // 评论操作
  const commentLi = btn.closest('li.comment');
  const cid = commentLi?.dataset.cid;
  if (btn.hasAttribute('data-csend')) {
    const composer = btn.closest('.comment-composer');
    const area = composer?.querySelector('.comment-input');
    if (area && area.value.trim() && area.value.length <= SITE.maxCommentLen) {
      handlers.onSubmitComment?.(id, area.value.trim());
    }
  } else if (btn.hasAttribute('data-cedit')) {
    handlers.onCommentEdit?.(id, cid);
  } else if (btn.hasAttribute('data-cdel')) {
    handlers.onCommentDelete?.(id, cid);
  } else if (btn.hasAttribute('data-ccancel')) {
    handlers.onCommentCancelEdit?.();
  } else if (btn.hasAttribute('data-csave')) {
    const area = commentLi?.querySelector('.comment-edit-area');
    if (area && area.value.trim() && area.value.length <= SITE.maxCommentLen) {
      handlers.onCommentSaveEdit?.(id, cid, area.value.trim());
    }
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
  // 帖子编辑框
  const area = e.target.closest('.edit-area');
  if (area) {
    const li = area.closest('li');
    const over = area.value.length > SITE.maxPostLen;
    li.querySelector('.char-count').textContent = `${area.value.length}/${SITE.maxPostLen}`;
    li.querySelector('.char-count').classList.toggle('over', over);
    // 超出字数上限时禁止保存（允许继续输入，不截断）
    li.querySelector('[data-save]').disabled = !area.value.trim() || over;
    return;
  }

  // 评论编辑框
  const cArea = e.target.closest('.comment-edit-area');
  if (cArea) {
    const li = cArea.closest('li.comment');
    const over = cArea.value.length > SITE.maxCommentLen;
    li.querySelector('.char-count').textContent = `${cArea.value.length}/${SITE.maxCommentLen}`;
    li.querySelector('.char-count').classList.toggle('over', over);
    li.querySelector('[data-csave]').disabled = !cArea.value.trim() || over;
    return;
  }

  // 评论输入框
  const input = e.target.closest('.comment-input');
  if (!input) return;
  const composer = input.closest('.comment-composer');
  const postLi = composer.closest('li.post');
  const over = input.value.length > SITE.maxCommentLen;
  composer.querySelector('.char-count').textContent = `${input.value.length}/${SITE.maxCommentLen}`;
  composer.querySelector('.char-count').classList.toggle('over', over);
  composer.querySelector('[data-csend]').disabled = !input.value.trim() || over;
  // 保存草稿，避免重渲染丢失
  handlers.onCommentDraft?.(postLi.dataset.id, input.value);
}

function onKeyDown(e) {
  if (!(e.ctrlKey || e.metaKey) || e.key !== 'Enter') return;
  // 帖子编辑框
  const area = e.target.closest('.edit-area');
  if (area) {
    const li = area.closest('li');
    if (area.value.trim() && area.value.length <= SITE.maxPostLen) handlers.onSaveEdit?.(li.dataset.id, area.value);
    return;
  }
  // 评论编辑框
  const cArea = e.target.closest('.comment-edit-area');
  if (cArea) {
    const li = cArea.closest('li.comment');
    if (cArea.value.trim() && cArea.value.length <= SITE.maxCommentLen) {
      handlers.onCommentSaveEdit?.(li.closest('li.post')?.dataset.id, li.dataset.cid, cArea.value.trim());
    }
    return;
  }
  // 评论输入框
  const input = e.target.closest('.comment-input');
  if (input) {
    const postLi = input.closest('li.post');
    if (input.value.trim() && input.value.length <= SITE.maxCommentLen) {
      handlers.onSubmitComment?.(postLi.dataset.id, input.value.trim());
    }
  }
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

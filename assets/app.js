/* 前端逻辑：会话状态、动态流渲染、发帖/删帖/登录 */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    authBtn: $('#authBtn'),
    authBtnText: $('#authBtnText'),
    composer: $('#composer'),
    postInput: $('#postInput'),
    charCount: $('#charCount'),
    postBtn: $('#postBtn'),
    postList: $('#postList'),
    empty: $('#emptyState'),
    postCount: $('#postCount'),
    loginModal: $('#loginModal'),
    modalClose: $('#modalClose'),
    modalMask: $('#modalMask'),
    loginForm: $('#loginForm'),
    passwordInput: $('#passwordInput'),
    loginBtn: $('#loginBtn'),
    loginError: $('#loginError'),
  };

  const state = { authed: false, posts: [] };

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      headers: { 'content-type': 'application/json' },
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch { /* 空响应体 */ }
    if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
    return data;
  }

  /* ---------- 渲染 ---------- */

  function renderAuth() {
    els.composer.classList.toggle('hidden', !state.authed);
    els.authBtnText.textContent = state.authed ? '退出' : '登录';
    els.authBtn.title = state.authed ? '退出登录' : '站长登录后可发布动态';
    renderPosts();
  }

  function renderPosts() {
    els.postCount.textContent = state.posts.length ? `共 ${state.posts.length} 条` : '';
    els.empty.classList.toggle('hidden', state.posts.length > 0);
    els.postList.innerHTML = state.posts.map((p) => `
      <li class="post" data-id="${escAttr(p.id)}">
        <div class="post-content">${fmtContent(p.content)}</div>
        <div class="post-meta">
          <time datetime="${new Date(p.createdAt).toISOString()}" title="${fmtFull(p.createdAt)}">${timeAgo(p.createdAt)}</time>
          ${state.authed ? `
          <button class="del-btn" type="button" data-del="${escAttr(p.id)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
            删除
          </button>` : ''}
        </div>
      </li>`).join('');
  }

  /* ---------- 工具函数 ---------- */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function escAttr(s) { return esc(s); }

  function fmtContent(text) {
    let s = esc(text);
    s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/#([^#\n]{1,50})#/g, '<span class="topic">#$1#</span>');
    return s;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60e3) return '刚刚';
    if (diff < 3600e3) return `${Math.floor(diff / 60e3)} 分钟前`;
    if (diff < 86400e3) return `${Math.floor(diff / 3600e3)} 小时前`;
    if (diff < 7 * 86400e3) return `${Math.floor(diff / 86400e3)} 天前`;
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtFull(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  /* ---------- 发帖 ---------- */

  function updateCharCount() {
    els.charCount.textContent = `${els.postInput.value.length}/500`;
    els.postBtn.disabled = !els.postInput.value.trim();
  }

  async function submitPost() {
    const content = els.postInput.value.trim();
    if (!content || els.postBtn.disabled) return;
    els.postBtn.disabled = true;
    els.postBtn.textContent = '发布中…';
    try {
      const { post } = await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      state.posts.unshift(post);
      els.postInput.value = '';
      renderPosts();
    } catch (err) {
      alert(err.message);
    } finally {
      els.postBtn.textContent = '发布';
      updateCharCount();
    }
  }

  /* ---------- 删帖 ---------- */

  async function deletePost(id) {
    if (!confirm('确定删除这条动态吗？')) return;
    try {
      await api(`/api/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.posts = state.posts.filter((p) => p.id !== id);
      renderPosts();
    } catch (err) {
      alert(err.message);
    }
  }

  /* ---------- 登录 / 退出 ---------- */

  function openModal() {
    els.loginError.classList.add('hidden');
    els.passwordInput.value = '';
    els.loginModal.classList.remove('hidden');
    els.passwordInput.focus();
  }

  function closeModal() {
    els.loginModal.classList.add('hidden');
  }

  async function login(e) {
    e.preventDefault();
    const password = els.passwordInput.value;
    if (!password) return;
    els.loginBtn.disabled = true;
    els.loginError.classList.add('hidden');
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
      state.authed = true;
      closeModal();
      renderAuth();
      refreshPosts(); // 静默刷新，保证数据最新
    } catch (err) {
      els.loginError.textContent = err.message;
      els.loginError.classList.remove('hidden');
    } finally {
      els.loginBtn.disabled = false;
    }
  }

  async function logout() {
    try { await api('/api/login', { method: 'DELETE' }); } catch { /* 忽略 */ }
    state.authed = false;
    renderAuth();
  }

  async function refreshPosts() {
    try {
      const { posts } = await api('/api/posts');
      state.posts = posts;
      renderPosts();
    } catch { /* 静默失败，保留现有内容 */ }
  }

  /* ---------- 事件绑定 ---------- */

  els.postInput.addEventListener('input', updateCharCount);
  els.postInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPost();
  });
  els.postBtn.addEventListener('click', submitPost);

  els.postList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del]');
    if (btn) deletePost(btn.dataset.del);
  });

  els.authBtn.addEventListener('click', () => (state.authed ? logout() : openModal()));
  els.modalClose.addEventListener('click', closeModal);
  els.modalMask.addEventListener('click', closeModal);
  els.loginForm.addEventListener('submit', login);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.loginModal.classList.contains('hidden')) closeModal();
  });

  /* ---------- 初始化 ---------- */

  (async function init() {
    updateCharCount();
    try {
      const [me, feed] = await Promise.all([
        api('/api/me').catch(() => ({ authed: false })),
        api('/api/posts').catch(() => null),
      ]);
      state.authed = !!me.authed;
      if (feed) state.posts = feed.posts;
      else {
        const err = document.createElement('p');
        err.className = 'load-error';
        err.textContent = '动态加载失败，请稍后刷新重试';
        els.postList.before(err);
      }
    } finally {
      renderAuth();
    }
  })();
})();

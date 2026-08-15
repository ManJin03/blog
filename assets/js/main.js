// 应用入口：持有全局状态，接线导航/搜索/发帖/登录，并把动态流操作委托给 feed 组件
import { SITE } from './config.js';
import * as api from './api.js';
import { initFeed, renderFeed } from './feed.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  authBtn: $('#authBtn'),
  authBtnText: $('#authBtnText'),
  composer: $('#composer'),
  postInput: $('#postInput'),
  charCount: $('#charCount'),
  postBtn: $('#postBtn'),
  searchInput: $('#searchInput'),
  searchClear: $('#searchClear'),
  loginModal: $('#loginModal'),
  modalClose: $('#modalClose'),
  modalMask: $('#modalMask'),
  loginForm: $('#loginForm'),
  passwordInput: $('#passwordInput'),
  loginBtn: $('#loginBtn'),
  loginError: $('#loginError'),
};

const state = {
  authed: false,   // 是否已登录（站长）
  posts: [],       // 全部动态
  query: '',       // 搜索关键词
  tag: null,       // 选中的标签筛选（#话题#内容，不含井号）
  month: '',       // 选中的时间筛选（YYYY-MM，空为全部）
  editingId: null, // 正在编辑的动态 id
  listExpanded: false, // 普通动态列表是否已展开（默认折叠为 5 条）
  chipsExpanded: false, // 标签栏是否已展开（默认只显示一行）
};

function render() {
  els.composer.classList.toggle('hidden', !state.authed);
  els.authBtnText.textContent = state.authed ? '退出' : '登录';
  els.authBtn.title = state.authed ? '退出登录' : '站长登录后可发布动态';
  els.searchClear.classList.toggle('hidden', !state.query);
  renderFeed(state);
}

/* ---------- 发帖 ---------- */

function updateCharCount() {
  const len = els.postInput.value.length;
  const over = len > SITE.maxPostLen;
  els.charCount.textContent = `${len}/${SITE.maxPostLen}`;
  els.charCount.classList.toggle('over', over);
  // 超出字数上限时禁止提交（允许继续输入，不截断）
  els.postBtn.disabled = !els.postInput.value.trim() || over;
}

async function submitPost() {
  const content = els.postInput.value.trim();
  if (!content || content.length > SITE.maxPostLen || els.postBtn.disabled) return;
  els.postBtn.disabled = true;
  els.postBtn.textContent = '发布中…';
  try {
    const { post } = await api.createPost(content);
    state.posts.unshift(post);
    els.postInput.value = '';
    state.editingId = null;
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    els.postBtn.textContent = '发布';
    updateCharCount();
  }
}

/* ---------- 搜索 ---------- */

function clearSearch() {
  els.searchInput.value = '';
  state.query = '';
  render();
  els.searchInput.focus();
}

els.searchInput.addEventListener('input', () => {
  state.query = els.searchInput.value;
  render();
});
els.searchClear.addEventListener('click', clearSearch);
els.searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.query) clearSearch();
});

/* ---------- 动态流（编辑 / 删除） ---------- */

initFeed({
  onEdit(id) {
    state.editingId = id;
    render();
  },
  onCancelEdit() {
    state.editingId = null;
    render();
  },
  async onSaveEdit(id, content) {
    try {
      const { post } = await api.updatePost(id, content);
      state.posts = state.posts.map((p) => (p.id === id ? post : p));
      state.editingId = null;
      render();
    } catch (err) {
      alert(err.message);
    }
  },
  async onDelete(id) {
    if (!confirm('确定删除这条动态吗？')) return;
    try {
      await api.deletePost(id);
      state.posts = state.posts.filter((p) => p.id !== id);
      if (state.editingId === id) state.editingId = null;
      render();
    } catch (err) {
      alert(err.message);
    }
  },
  onTagSelect(tag) {
    state.tag = state.tag === tag ? null : tag; // 再次点击同一标签取消筛选
    render();
  },
  onMonthSelect(month) {
    state.month = month;
    render();
  },
  onListToggle() {
    state.listExpanded = !state.listExpanded;
    render();
  },
  onChipsToggle() {
    state.chipsExpanded = !state.chipsExpanded;
    render();
  },
  async onTogglePin(id) {
    const p = state.posts.find((x) => x.id === id);
    if (!p) return;
    try {
      const { post } = await api.togglePin(id, !p.pinned);
      state.posts = state.posts.map((x) => (x.id === id ? post : x));
      render();
    } catch (err) {
      alert(err.message);
    }
  },
});

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
    await api.login(password);
    state.authed = true;
    closeModal();
    render();
    refreshPosts(); // 静默刷新，保证数据最新
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.classList.remove('hidden');
  } finally {
    els.loginBtn.disabled = false;
  }
}

async function refreshPosts() {
  try {
    const { posts } = await api.getPosts();
    state.posts = posts;
    render();
  } catch { /* 静默失败，保留现有内容 */ }
}

/* ---------- 事件绑定 ---------- */

els.postInput.addEventListener('input', updateCharCount);
els.postInput.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitPost();
});
els.postBtn.addEventListener('click', submitPost);

els.authBtn.addEventListener('click', async () => {
  if (!state.authed) return openModal();
  await api.logout();
  state.authed = false;
  state.editingId = null;
  render();
});
els.modalClose.addEventListener('click', closeModal);
els.modalMask.addEventListener('click', closeModal);
els.loginForm.addEventListener('submit', login);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.loginModal.classList.contains('hidden')) closeModal();
});

/* =====================================================================
 * 以下为页面增强部分：作品展示、右侧导航高亮、滚动揭示、时钟、阅读进度
 * ===================================================================== */

/* ---------- 作品展示渲染 ---------- */
function renderWorks() {
  const grid = document.getElementById('worksGrid');
  if (!grid || !SITE.works) return;
  grid.innerHTML = SITE.works.map((w) => `
    <a class="works-card" href="${w.url}" target="_blank" rel="noopener noreferrer">
      <div class="works-card-head">
        <span class="works-ic">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 9h16M9 9v11"/></svg>
        </span>
        <div>
          <div class="works-name">${escapeHtml(w.name)}</div>
          <div class="works-lang"><span class="lang-dot" style="background:${w.langColor || '#4f8dff'}"></span>${escapeHtml(w.lang || '—')}</div>
        </div>
      </div>
      <p class="works-desc">${escapeHtml(w.desc || '')}</p>
      <div class="works-foot">
        <span title="Stars">★ ${w.stars ?? 0}</span>
        <span title="Forks">⑂ ${w.forks ?? 0}</span>
      </div>
    </a>
  `).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- 头像：使用 GitHub 头像，加载失败回退字母 ---------- */
function setupAvatar() {
  const box = document.getElementById('avatarBox');
  if (!box || !SITE.avatar) return;
  const img = new Image();
  img.alt = `${SITE.name} 头像`;
  img.className = 'avatar-img';
  img.loading = 'lazy';
  img.onload = () => {
    box.textContent = '';
    box.appendChild(img);
    box.setAttribute('aria-label', `${SITE.name} 头像`);
  };
  img.onerror = () => { /* 保留 MJ 兜底文字 */ };
  img.src = SITE.avatar;
}

/* ---------- 状态栏：显示当前在学习/在做的东西 ---------- */
function setupStatus() {
  const text = document.getElementById('statusText');
  if (!text) return;
  text.textContent = SITE.status || '暂无状态';
}

/* ---------- 友情链接（个人资料底部） ---------- */
function setupFriendLink() {
  const box = document.getElementById('friendLink');
  const val = document.getElementById('friendLinkVal');
  if (!box || !val) return;
  const f = SITE.friendLink;
  if (!f || !f.url) { box.classList.add('hidden'); return; }
  val.textContent = f.name || f.url;
  val.href = f.url;
  val.title = f.url;
}

/* ---------- 最新文章（优先拉取技术博客实时文章；接口失败回退本地配置） ---------- */
async function setupLatestPost() {
  const box = document.getElementById('latestPost');
  if (!box) return;
  // 后端代理抓取技术博客 RSS 并返回最新文章；失败时为 null，走本地配置兜底
  const remote = await api.getLatestPost();
  const p = remote?.latestPost || SITE.latestPost;
  if (!p || !p.url) {
    box.classList.add('is-empty');
    box.innerHTML = '<p class="latest-empty">暂无</p>';
    return;
  }
  const tags = (p.tags || []).map((t) => `<span class="latest-tag">#${escapeHtml(t)}</span>`).join('');
  box.innerHTML = `
    <a class="latest-link" href="${encodeURI(p.url)}" target="_blank" rel="noopener noreferrer">
      <div class="latest-meta">
        <span class="latest-badge">文章</span>
        ${p.date ? `<span class="latest-date">${escapeHtml(p.date)}</span>` : ''}
      </div>
      <h3 class="latest-title">${escapeHtml(p.title)}</h3>
      ${p.excerpt ? `<p class="latest-excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
      ${tags ? `<div class="latest-tags">${tags}</div>` : ''}
    </a>
  `;
}

/* ---------- 右侧导航高亮（滚动联动） ---------- */
function setupSideNav() {
  const links = Array.from(document.querySelectorAll('.side-link'));
  const sections = links
    .map((l) => document.getElementById(l.dataset.target))
    .filter(Boolean);
  if (!sections.length) return;

  const setActive = () => {
    const y = window.scrollY + 120;
    let current = sections[0].id;
    for (const sec of sections) {
      if (sec.offsetTop <= y) current = sec.id;
    }
    links.forEach((l) => l.classList.toggle('active', l.dataset.target === current));
  };
  window.addEventListener('scroll', setActive, { passive: true });
  window.addEventListener('resize', setActive);
  setActive();
}

/* ---------- 滚动揭示动画 ---------- */
function setupReveal() {
  const items = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || !items.length) {
    items.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
}

/* ---------- 本地时钟 ---------- */
function setupClock() {
  const el = document.getElementById('sideClock');
  if (!el) return;
  const tick = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------- 阅读进度条 ---------- */
function setupProgress() {
  const bar = document.getElementById('readBar');
  if (!bar) return;
  const update = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    bar.style.width = `${Math.min(100, Math.max(0, pct))}%`;
  };
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------- 初始化 ---------- */

(async function init() {
  updateCharCount();
  const [me, feed] = await Promise.all([
    api.getMe(),
    api.getPosts().catch(() => null),
  ]);
  state.authed = !!me.authed;
  if (feed) state.posts = feed.posts;
  else {
    const err = document.createElement('p');
    err.className = 'load-error';
    err.textContent = '动态加载失败，请稍后刷新重试';
    listFallback(err);
  }
  render();

  // 页面增强模块（不依赖后端）
  renderWorks();
  setupAvatar();
  setupStatus();
  setupFriendLink();
  setupLatestPost();
  setupSideNav();
  setupReveal();
  setupClock();
  setupProgress();
})();

function listFallback(errEl) {
  document.getElementById('postList').before(errEl);
}

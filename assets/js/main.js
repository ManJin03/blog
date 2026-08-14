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
  editingId: null, // 正在编辑的动态 id
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
  els.charCount.textContent = `${els.postInput.value.length}/${SITE.maxPostLen}`;
  els.postBtn.disabled = !els.postInput.value.trim();
}

async function submitPost() {
  const content = els.postInput.value.trim();
  if (!content || els.postBtn.disabled) return;
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
})();

function listFallback(errEl) {
  document.getElementById('postList').before(errEl);
}

// 应用入口：持有全局状态，接线导航/搜索/发帖/登录，并把动态流操作委托给 feed 组件
import { SITE } from './config.js';
import * as api from './api.js';
import { initFeed, renderFeed } from './feed.js';
import { toast, confirmBox } from './toast.js';

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
    toast(err.message, 'error');
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
      toast(err.message, 'error');
    }
  },
  async onDelete(id) {
    const ok = await confirmBox({
      message: '确定删除这条动态吗？删除后无法恢复。',
      confirmText: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deletePost(id);
      state.posts = state.posts.filter((p) => p.id !== id);
      if (state.editingId === id) state.editingId = null;
      render();
    } catch (err) {
      toast(err.message, 'error');
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
      toast(err.message, 'error');
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

/* ---------- 作品展示渲染（传入实时 GitHub 仓库数据；缺省回退本地配置） ---------- */
function renderWorks(repos) {
  const grid = document.getElementById('worksGrid');
  const list = Array.isArray(repos) ? repos : SITE.works;
  if (!grid || !list) return;
  if (!list.length) {
    grid.innerHTML = '<p class="empty">暂无仓库</p>';
    return;
  }
  grid.innerHTML = list.map((w) => `
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

/* ---------- 头像：使用 GitHub 头像，加载失败回退本地 head.jpg，再失败回退字母 ---------- */
function setupAvatar() {
  const box = document.getElementById('avatarBox');
  if (!box || !SITE.avatar) return;
  const img = new Image();
  img.alt = `${SITE.name} 头像`;
  img.className = 'avatar-img';
  let triedFallback = false;
  img.onload = () => {
    box.textContent = '';
    box.appendChild(img);
    box.setAttribute('aria-label', `${SITE.name} 头像`);
  };
  img.onerror = () => {
    if (!triedFallback && SITE.fallbackAvatar) {
      // 首选网络头像失败，尝试本地兜底图（用标志位避免 src 比较失效导致的循环重试）
      triedFallback = true;
      img.src = SITE.fallbackAvatar;
    }
    // 若本地兜底图也失败，保留原字母 MJ 兜底
  };
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
    <a class="latest-link" href="${escapeHtml(p.url)}" target="_blank" rel="noopener noreferrer">
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

/* ---------- GitHub 资料：统计实时更新 + 作品展示 + 最近提交 ---------- */

// GitHub 风格数字缩写：1024 → 1k，15200 → 15.2k
function fmtCount(n) {
  const num = Number(n) || 0;
  if (num >= 1000) return `${(num / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(num);
}

// 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / x 周前 / x 个月前 / x 年前
function timeAgo(dateStr) {
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR, WEEK = 7 * DAY, MONTH = 30 * DAY, YEAR = 365 * DAY;
  if (diff < MIN) return '刚刚';
  if (diff < HOUR) return `${Math.floor(diff / MIN)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < WEEK) return `${Math.floor(diff / DAY)} 天前`;
  if (diff < MONTH) return `${Math.floor(diff / WEEK)} 周前`;
  if (diff < YEAR) return `${Math.floor(diff / MONTH)} 个月前`;
  return `${Math.floor(diff / YEAR)} 年前`;
}

// 个人资料统计（左栏）：公开仓库 / 获星数 / 关注者
function renderStats(profile) {
  if (!profile) return;
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el && v != null) el.textContent = fmtCount(v);
  };
  set('statRepos', profile.publicRepos);
  set('statStars', profile.stars);
  set('statFollowers', profile.followers);
}

// 最近提交时间轴（仿 GitHub 活动流）
function renderCommits(commits) {
  const box = document.getElementById('commitsList');
  if (!box) return;
  if (!Array.isArray(commits) || !commits.length) {
    box.classList.add('is-empty');
    box.innerHTML = '<p class="github-empty">暂无最近提交</p>';
    return;
  }
  box.classList.remove('is-empty');
  const items = commits.slice(0, 10).map((c) => `
    <li class="commit-item">
      <div class="commit-body">
        <a class="commit-msg" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(c.message)}">${escapeHtml(c.message)}</a>
        <div class="commit-meta">
          <a class="commit-repo" href="${escapeHtml(c.repoUrl || 'https://github.com')}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.repo || '')}</a>
          <span class="commit-sha">${escapeHtml(c.sha || '')}</span>
          <span class="commit-date" title="${escapeHtml(c.date || '')}">${escapeHtml(timeAgo(c.date))}</span>
        </div>
      </div>
    </li>
  `).join('');
  const collapsed = commits.length > 3;
  box.innerHTML = `
    <ul class="github-timeline${collapsed ? ' is-collapsed' : ''}">
      ${items}
    </ul>
    ${collapsed ? `
      <button type="button" class="commits-toggle" aria-expanded="false">
        <span class="commits-toggle-label">查看全部 ${commits.length} 条提交</span>
        <span class="commits-toggle-icon" aria-hidden="true"></span>
      </button>
    ` : ''}
  `;
  const btn = box.querySelector('.commits-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const ul = box.querySelector('.github-timeline');
      // toggle() 返回操作后该 class 是否存在：移除了（已展开）返回 false
      const expanded = !ul.classList.toggle('is-collapsed');
      btn.setAttribute('aria-expanded', String(expanded));
      btn.querySelector('.commits-toggle-label').textContent = expanded
        ? '收起'
        : `查看全部 ${commits.length} 条提交`;
      btn.querySelector('.commits-toggle-icon').classList.toggle('is-open', expanded);
    });
  }
}

// 聚合入口：一次请求拿到统计 + 仓库 + 提交；失败时全部回退本地兜底
async function setupGithub() {
  const box = document.getElementById('commitsList');
  if (box) {
    // 先渲染骨架屏，避免模块空跳
    box.innerHTML = `
      <ul class="github-timeline" aria-hidden="true">
        ${Array.from({ length: 4 }).map(() => `
          <li class="commit-item">
            <div class="commit-body">
              <div class="skeleton" style="width:72%;height:16px"></div>
              <div class="skeleton" style="width:46%;height:12px;margin-top:9px"></div>
            </div>
          </li>
        `).join('')}
      </ul>
    `;
  }
  try {
    const data = await api.getGithub();
    renderStats(data?.profile);
    renderWorks(data?.repos);
    renderCommits(data?.commits);
  } catch (err) {
    console.warn('[github] 实时数据获取失败，使用本地兜底：', err);
    renderCommits(null);
  }
}

/* ---------- GitHub 贡献热力图（仿 GitHub 主页贡献图） ---------- */
const CONTRIB_MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const actState = { year: new Date().getFullYear(), years: [], loading: false };

// 生成热力图标记：days 为"列优先"（每周一列、周日开头），用 CSS grid 列填充即可对齐
function buildActivityMarkup(data) {
  const days = data.days;
  const cols = Math.ceil(days.length / 7);

  // 月份标签：记录每月首个格子所在列。
  // 跨年首列可能同时含去年 12 月与今年 1 月，12 月标签不占位（直接跳过），
  // 让 1 月正确显示在首列，避免同列两个 span 互相挤到下一行。
  const monthCols = [];
  days.forEach((d, i) => {
    const m = Number(d.date.slice(5, 7));
    const col = Math.floor(i / 7);
    if (col === 0 && m === 12) return;
    if (!monthCols.length || monthCols[monthCols.length - 1].m !== m) {
      monthCols.push({ m, col });
    }
  });
  const monthsHtml = monthCols.map(({ m, col }) =>
    `<span class="activity-month" style="grid-column:${col + 1}">${CONTRIB_MONTHS[m]}</span>`
  ).join('');

  const cellsHtml = days.map((d) => {
    const count = d.count || 0;
    const tip = count
      ? `${count} ${count === 1 ? 'contribution' : 'contributions'} on ${d.date}`
      : `No contributions on ${d.date}`;
    return `<span class="gh-cell lv${d.level}" data-date="${d.date}" title="${tip}"></span>`;
  }).join('');

  return { cols, monthsHtml, cellsHtml };
}

function renderActivity(data) {
  const totalEl = document.getElementById('actTotal');
  const yearEl = document.getElementById('actYear');
  const monthsEl = document.getElementById('actMonths');
  const gridEl = document.getElementById('actGrid');
  if (!gridEl || !data || !Array.isArray(data.days)) return;

  actState.year = data.year;
  actState.years = (Array.isArray(data.years) && data.years.length) ? data.years : [data.year];
  if (totalEl) totalEl.textContent = data.total ?? 0;
  if (yearEl) yearEl.textContent = data.year;
  renderYearButtons();

  const { cols, monthsHtml, cellsHtml } = buildActivityMarkup(data);
  monthsEl.style.gridTemplateColumns = `repeat(${cols}, var(--gh-cell))`;
  gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--gh-cell))`;

  if (!data.days.length) {
    gridEl.innerHTML = '<p class="activity-error">暂无贡献数据</p>';
    gridEl.style.gridTemplateColumns = '1fr';
    return;
  }
  monthsEl.innerHTML = monthsHtml;
  gridEl.innerHTML = cellsHtml;
}

function renderYearButtons() {
  const wrap = document.getElementById('actYears');
  if (!wrap) return;
  wrap.innerHTML = actState.years.map((y) => `
    <button type="button" class="year-btn${y === actState.year ? ' active' : ''}" data-year="${y}" role="tab"
      aria-selected="${y === actState.year}" ${actState.loading ? 'disabled' : ''}>${y}</button>
  `).join('');
  wrap.querySelectorAll('.year-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const y = Number(btn.dataset.year);
      if (actState.loading || y === actState.year) return;
      loadActivity(y);
    });
  });
}

async function loadActivity(year) {
  const gridEl = document.getElementById('actGrid');
  const monthsEl = document.getElementById('actMonths');
  const totalEl = document.getElementById('actTotal');
  actState.loading = true;
  if (totalEl) totalEl.textContent = '…';
  if (gridEl && monthsEl) {
    // 骨架：7 行 × 2 列灰色格子
    monthsEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = 'repeat(2, var(--gh-cell))';
    gridEl.innerHTML = Array.from({ length: 14 })
      .map(() => '<span class="gh-cell skeleton-cell"></span>').join('');
  }
  renderYearButtons();
  try {
    renderActivity(await api.getGithubContributions(year));
  } catch (err) {
    console.warn('[activity] 贡献数据加载失败：', err);
    if (totalEl) totalEl.textContent = '–';
    if (gridEl && monthsEl) {
      monthsEl.innerHTML = '';
      gridEl.innerHTML = '<p class="activity-error">贡献数据加载失败</p>';
      gridEl.style.gridTemplateColumns = '1fr';
    }
  } finally {
    actState.loading = false;
    renderYearButtons();
  }
}

function setupActivity() {
  if (!document.getElementById('actGrid')) return;
  loadActivity(new Date().getFullYear());
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
  renderWorks(); // 先以本地配置渲染，GitHub 实时数据到达后覆盖
  setupAvatar();
  setupStatus();
  setupFriendLink();
  setupLatestPost();
  setupGithub();
  setupActivity();
  setupSideNav();
  setupReveal();
  setupClock();
  setupProgress();
})();

function listFallback(errEl) {
  document.getElementById('postList').before(errEl);
}

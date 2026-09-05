// GitHub 资料聚合接口：服务端代理 GitHub API，一次返回
//   1. profile  —— 公开仓库 / 获星数 / 关注者等统计（用于左栏个人资料实时更新）
//   2. repos    —— 本人公开仓库列表（用于"作品展示"实时更新）
//   3. commits  —— 最近提交（GitHub 用户公开事件中的 PushEvent，仿 GitHub 主页活动流）
// 前端若请求失败会回退到本地配置，因此这里出错时返回 500 即可。
//
// 缓存策略（四级降级，防止用户经常链接不到 GitHub）：
//   1. 内存热点缓存（5 分钟，单实例内有效）
//   2. KV 持久化缓存（24 小时，每天刷新一次，跨实例共享）
//   3. 从 GitHub 实时拉取（成功即写回 KV）
//   4. GitHub 连不上时回退到 KV 中最近一次成功的数据（允许过期）
// 支持 ?refresh=1：跳过 1/2 级缓存强制实时拉取（前端刷新按钮），失败仍回退 KV 过期数据。
import { json } from '../_lib/http.js';
import { KEY_PROFILE, kvRead, kvReadStale, kvWrite } from '../_lib/github-kv.js';

const USERNAME = 'ManJin03';
// 内存缓存（单实例内有效，5 分钟），既降低 GitHub API 调用量（未认证 60 次/h/IP），
// 也让数据保持"接近实时"。设置 GITHUB_TOKEN 环境变量可提升配额并读取私有信息。
const CACHE_TTL = 5 * 60 * 1000;
let cache = { time: 0, data: null };

// 常见编程语言色板（与 GitHub 官方 linguist 颜色一致，未知语言回退主题蓝）
const LANG_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  C: '#555555',
  'C++': '#f34b7d',
  Python: '#3572a5',
  Go: '#00add8',
  Rust: '#dea584',
  Java: '#b07219',
  Shell: '#89e051',
  Markdown: '#083fa1',
  Vue: '#41b883',
  Dart: '#00b4ab',
  Kotlin: '#a97bff',
  Swift: '#f05138',
  PHP: '#4f5d95',
  Ruby: '#701516',
  'C#': '#178600',
  'Objective-C': '#438eff',
};

async function gh(env, path) {
  const headers = {
    'user-agent': 'manjin-home/1.0 (+github-profile)',
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
  };
  const token = env && env.GITHUB_TOKEN;
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`GitHub API ${path}: ${res.status}`);
  return res.json();
}

const PINNED_TIMEOUT = 15000; // 主页 HTML 抓取超时

// 抓取 GitHub 主页 HTML，解析 pinned（主页置顶）仓库名单。
// GitHub REST API 不提供 pinned 数据，主页 HTML 是唯一免 Token 来源；
// 解析失败（页面改版 / 网络抖动）直接抛错，由调用方降级为空名单，不影响其余数据。
async function fetchPinnedNames() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PINNED_TIMEOUT);
  let html;
  try {
    const res = await fetch(`https://github.com/${USERNAME}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ManJin-home/1.0)', accept: 'text/html' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GitHub 主页 HTTP ${res.status}`);
    html = await res.text();
  } finally {
    clearTimeout(timer);
  }

  // 定位 "Pinned" 区块：从 Pinned 标题起，到 "Popular repositories" / 区块收尾标签止，
  // 只在该片段内提取仓库链接，避免误匹配页面上其他指向仓库的锚点。
  const startIdx = html.search(/>\s*Pinned\s*</);
  if (startIdx === -1) return [];
  const rest = html.slice(startIdx);
  const endRe = /Popular repositories|Achievements|<\/section>/;
  const endMatch = endRe.exec(rest);
  const section = endMatch ? rest.slice(0, endMatch.index) : rest.slice(0, 30000);

  const re = new RegExp(`href="/${USERNAME}/([^"']+)`, 'g');
  const names = new Set();
  let m;
  while ((m = re.exec(section))) {
    // 只取路径首段为仓库名（排除 /stargazers 之类子路径）
    const name = decodeURIComponent(m[1].split('/')[0]);
    if (name) names.add(name);
  }
  return [...names];
}

async function fetchAll(env) {
  // 用户资料、公开仓库与主页 pinned 解析并行拉取；
  // pinned 解析失败降级为空名单（全部标记非置顶），不影响资料与仓库数据
  // sort=pushed：以最近提交（push）时间为参考排序，作为作品展示顺序
  const [user, repos, pinnedNames] = await Promise.all([
    gh(env, `/users/${USERNAME}`),
    gh(env, `/users/${USERNAME}/repos?sort=pushed&per_page=100&type=owner`),
    fetchPinnedNames().catch(() => []),
  ]);

  // 仅统计本人创建的仓库（排除 fork），累加获星数
  const own = (repos || []).filter((r) => !r.fork);
  const stars = own.reduce((s, r) => s + (r.stargazers_count || 0), 0);

  const profile = {
    publicRepos: user.public_repos,
    stars,
    followers: user.followers,
    following: user.following,
    name: user.name || USERNAME,
    bio: user.bio || '',
  };

  // 作品展示：返回全部本人仓库（前端默认只展示 pinned，其余折叠），
  // pinned（主页置顶）优先排前，同组内按最近提交（pushed_at）倒序排序
  const pinnedSet = new Set(pinnedNames.map((n) => n.toLowerCase()));
  const repoList = own
    .map((r) => ({
      name: r.name,
      desc: r.description || '',
      lang: r.language || '',
      langColor: LANG_COLORS[r.language] || '#4f8dff',
      stars: r.stargazers_count || 0,
      forks: r.forks_count || 0,
      url: r.html_url,
      pushedAt: r.pushed_at || '',
      pinned: pinnedSet.has(r.name.toLowerCase()),
    }))
    .sort((a, b) => (b.pinned - a.pinned) || (new Date(b.pushedAt) - new Date(a.pushedAt)));

  // 最近提交：对最近提交的仓库（最多 3 个）并行拉取提交，合并按时间倒序取前 10。
  // 单个仓库拉取失败时降级为空数组，不影响其余数据。
  const commits = [];
  try {
    const sources = repoList.slice(0, 3);
    const results = await Promise.all(
      sources.map((r) => gh(env, `/repos/${USERNAME}/${r.name}/commits?per_page=5`).catch(() => []))
    );
    sources.forEach((r, i) => {
      for (const c of results[i] || []) {
        if (!c || !c.sha) continue;
        const meta = c.commit || {};
        commits.push({
          repo: r.name,
          repoUrl: r.url,
          message: (meta.message || '').split('\n')[0],
          sha: c.sha.slice(0, 7),
          url: c.html_url || `https://github.com/${USERNAME}/${r.name}/commit/${c.sha}`,
          date: (meta.author && meta.author.date) || (meta.committer && meta.committer.date) || '',
        });
      }
    });
    commits.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch { /* 提交拉取失败不影响资料与仓库 */ }

  return { profile, repos: repoList, commits: commits.slice(0, 10) };
}

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const now = Date.now();
  // ?refresh=1：前端刷新按钮触发，跳过内存与 KV 有效缓存，强制实时拉取
  const forceRefresh = new URL(context.request.url).searchParams.get('refresh') === '1';

  if (!forceRefresh) {
    // 1) 内存热点缓存（5 分钟）直接命中
    if (cache.data && now - cache.time < CACHE_TTL) {
      return json(cache.data);
    }

    // 2) KV 持久化缓存（24 小时）：命中即返回，实现"每天只访问一次 GitHub"
    const hit = await kvRead(env, KEY_PROFILE);
    if (hit) {
      cache = { time: now, data: hit };
      return json(hit);
    }
  }

  try {
    // 3) 缓存未命中 / 强制刷新：从 GitHub 拉取，成功后写回 KV（下次请求起 24h 内直接命中）
    const data = await fetchAll(env);
    cache = { time: now, data }; // 仅成功结果入缓存
    await kvWrite(env, KEY_PROFILE, data);
    return json(data);
  } catch (err) {
    // 4) GitHub 拉取失败：回退到 KV 中最近一次成功的数据（允许过期），保证页面可用。
    //    强刷场景不把过期数据写入内存缓存，避免污染后续正常请求。
    const stale = await kvReadStale(env, KEY_PROFILE);
    if (stale) {
      if (!forceRefresh) cache = { time: now, data: stale };
      return json({ ...stale, stale: true });
    }
    return json({ error: `GitHub 数据获取失败：${err.message}` }, 502);
  }
}

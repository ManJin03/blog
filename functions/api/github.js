// GitHub 资料聚合接口：服务端代理 GitHub API，一次返回
//   1. profile  —— 公开仓库 / 获星数 / 关注者等统计（用于左栏个人资料实时更新）
//   2. repos    —— 本人公开仓库列表（用于"作品展示"实时更新）
//   3. commits  —— 最近提交（GitHub 用户公开事件中的 PushEvent，仿 GitHub 主页活动流）
// 前端若请求失败会回退到本地配置，因此这里出错时返回 500 即可。
import { json } from '../_lib/http.js';

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

async function fetchAll(env) {
  // 用户资料与公开仓库并行拉取
  const [user, repos] = await Promise.all([
    gh(env, `/users/${USERNAME}`),
    gh(env, `/users/${USERNAME}/repos?sort=updated&per_page=100&type=owner`),
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

  // 作品展示：按最近更新时间取前 6 个
  const repoList = own.slice(0, 6).map((r) => ({
    name: r.name,
    desc: r.description || '',
    lang: r.language || '',
    langColor: LANG_COLORS[r.language] || '#4f8dff',
    stars: r.stargazers_count || 0,
    forks: r.forks_count || 0,
    url: r.html_url,
  }));

  // 最近提交：对最近更新的仓库（最多 3 个）并行拉取提交，合并按时间倒序取前 10。
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
  if (cache.data && now - cache.time < CACHE_TTL) {
    return json(cache.data);
  }
  try {
    const data = await fetchAll(env);
    cache = { time: now, data }; // 仅成功结果入缓存
    return json(data);
  } catch (err) {
    return json({ error: `GitHub 数据获取失败：${err.message}` }, 502);
  }
}

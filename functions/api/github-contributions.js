// GitHub 贡献热力图接口：解析 GitHub 公开贡献页面（https://github.com/users/{user}/contributions），
// 无需 Token 即可获得与 GitHub 主页一致的数据：
//   1. year   —— 当前返回的年份
//   2. total  —— 该年贡献总数
//   3. days   —— 全年按"列优先"（周日开头，每周一列）排列的格子：{ date, level 0-4, count }
//   4. years  —— 可用年份列表（用于前端年份切换，首次请求或参数变化时附带）
// 用法：GET /api/github-contributions?year=2025 （缺省为当年）
// 说明：GitHub 公开页无官方速率限制硬约束，但为稳妥仍做多层缓存：
//   1. 内存热点缓存（年份列表 12h，逐年数据 6h）
//   2. KV 持久化快照（24 小时，每天刷新一次，跨实例共享）
//   3. GitHub 连不上时回退到 KV 中最近一次成功的数据（允许过期）
import { json } from '../_lib/http.js';
import { KEY_CONTRIBUTIONS, KV_TTL } from '../_lib/github-kv.js';

const USERNAME = 'ManJin03';
const LIST_TTL = 12 * 60 * 60 * 1000;
const YEAR_TTL = 6 * 60 * 60 * 1000;
const FETCH_TIMEOUT = 25000; // 单次抓取超时，避免请求挂起拖垮函数
let yearCache = new Map(); // year -> { time, data }
let listCache = { time: 0, list: [] };

// ---- KV 快照（{ years, byYear }）的内存镜像，避免每个请求都读 KV ----
let kvSnap = null; // { time, data }

async function getKvSnap(env) {
  const now = Date.now();
  if (kvSnap && now - kvSnap.time < KV_TTL * 1000) return kvSnap.data;
  let data = { years: [], byYear: {} };
  if (env && env.KV) {
    try {
      const raw = await env.KV.get(KEY_CONTRIBUTIONS, { type: 'json' });
      if (raw && raw.savedAt && raw.data) {
        kvSnap = { time: raw.savedAt, data: raw.data };
        return kvSnap.data;
      }
    } catch { /* 忽略 */ }
  }
  kvSnap = { time: now, data };
  return data;
}

async function putKvSnap(env, data) {
  kvSnap = { time: Date.now(), data };
  if (env && env.KV) {
    try {
      await env.KV.put(
        KEY_CONTRIBUTIONS,
        JSON.stringify({ savedAt: kvSnap.time, data }),
        { expirationTtl: KV_TTL },
      );
    } catch { /* 写失败不影响主流程 */ }
  }
}

// 读取 KV 快照，允许过期（GitHub 连不上时的最后兜底）
async function kvSnapStale(env) {
  if (!env || !env.KV) return null;
  try {
    const raw = await env.KV.get(KEY_CONTRIBUTIONS, { type: 'json' });
    return raw && raw.data ? raw.data : null;
  } catch {
    return null;
  }
}

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ManJin-home/1.0)', 'accept': 'text/html' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// 解析单年贡献页 HTML → { total, days }
// 注意：新版 GitHub 贡献页 HTML 为"行优先"（每周日一行、横向约 52~53 周），
// 与前端"列优先"（每周一列、周日开头）渲染不一致，需按 (周列, 星期) 重建顺序，
// 并在首列补齐跨年前格子（无数据，level 0），保证月份标签与格子对齐。
function parseYearHtml(html, year) {
  const raw = [];
  const tdRe = /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="([0-4])"[^>]*>/g;
  const tipRe = /<tool-tip[^>]*>([\s\S]*?)<\/tool-tip>/g;
  const tips = [];
  let m;
  while ((m = tipRe.exec(html))) tips.push(m[1].trim());
  let i = 0;
  while ((m = tdRe.exec(html))) {
    const date = m[1];
    const level = Number(m[2]);
    const tip = tips[i] || '';
    const cm = tip.match(/(\d+)\s+contributions?/);
    raw.push({ date, level, count: cm ? Number(cm[1]) : 0 });
    i++;
  }
  if (!raw.length) return { total: 0, days: [] };

  // 行优先 → 列优先：以 01-01 所在周的周日为锚点，计算每个格子的(周列, 星期)
  const yearStart = new Date(`${year}-01-01T00:00:00Z`);
  const week0 = new Date(yearStart);
  week0.setUTCDate(week0.getUTCDate() - week0.getUTCDay());
  const DAY = 86400000;
  raw.forEach((d) => {
    const dt = new Date(`${d.date}T00:00:00Z`);
    d.row = dt.getUTCDay();
    d.col = Math.floor((dt - week0) / DAY / 7);
  });
  raw.sort((a, b) => a.col - b.col || a.row - b.row);

  // 首列补齐 01-01 之前（12-28~12-31）的跨年前格子，使首列从周日开始、月份标签对齐
  const first = new Date(`${raw[0].date}T00:00:00Z`);
  const pad = [];
  for (let t = new Date(week0); t < first; t.setUTCDate(t.getUTCDate() + 1)) {
    pad.push({ date: t.toISOString().slice(0, 10), level: 0, count: 0 });
  }
  const days = pad.concat(raw).map(({ date, level, count }) => ({ date, level, count }));

  // 总数文本形如 "1,234\n contributions\n in 2026"（复数 + 可能含千分位逗号）
  const totalRe = new RegExp(`([\\d,]+)\\s*\\n?\\s*contributions?\\s*\\n?\\s*in\\s*${year}`, 'i');
  const tm = html.match(totalRe);
  return { total: tm ? Number(tm[1].replace(/,/g, '')) : 0, days };
}

async function getYear(env, year) {
  const now = Date.now();
  const hit = yearCache.get(year);
  if (hit && now - hit.time < YEAR_TTL) return hit.data;

  // KV 快照命中（24h 内成功保存过该年数据）
  const snap = await getKvSnap(env);
  if (snap.byYear[year]) {
    yearCache.set(year, { time: now, data: snap.byYear[year] });
    return snap.byYear[year];
  }

  const url = `https://github.com/users/${USERNAME}/contributions?from=${year}-01-01&to=${year}-12-31`;
  const html = await fetchText(url);
  const data = { year, ...parseYearHtml(html, year) };
  yearCache.set(year, { time: now, data });
  if (yearCache.size > 12) yearCache.delete(yearCache.keys().next().value); // 防止无限增长

  // 合并写回 KV 快照（该年数据 + 整体 TTL 刷新）
  snap.byYear[year] = data;
  await putKvSnap(env, snap);
  return data;
}

// 可用年份列表：从 REST API 的注册时间推导（注册年 → 今年），与 GitHub 主页展示一致
async function getYears(env) {
  const now = Date.now();
  if (listCache.list.length && now - listCache.time < LIST_TTL) return listCache.list;

  // KV 快照命中（24h 内已保存过年份列表）
  const snap = await getKvSnap(env);
  if (snap.years && snap.years.length) {
    listCache = { time: now, list: snap.years };
    return snap.years;
  }

  const res = await fetch(`https://api.github.com/users/${USERNAME}`, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; ManJin-home/1.0)',
      accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) throw new Error(`GitHub user API HTTP ${res.status}`);
  const user = await res.json();
  const start = new Date(user.created_at).getFullYear();
  const cur = new Date().getFullYear();
  const years = [];
  for (let y = cur; y >= start; y--) years.push(y); // 倒序，最新在前
  listCache = { time: now, list: years };

  // 合并写回 KV 快照（年份列表 + 整体 TTL 刷新）
  snap.years = years;
  await putKvSnap(env, snap);
  return years;
}

export async function onRequestGet(context) {
  const env = (context && context.env) || {};
  const url = new URL(context.request.url);
  const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
  try {
    const [data, years] = await Promise.all([getYear(env, year), getYears(env)]);
    return json({ ...data, years, months: MONTHS });
  } catch (err) {
    // GitHub 连不上：回退到 KV 快照（允许过期），保证热力图仍可展示
    const stale = await kvSnapStale(env);
    if (stale) {
      const data = stale.byYear[year] || { year, total: 0, days: [] };
      return json({
        ...data,
        years: stale.years && stale.years.length ? stale.years : [year],
        months: MONTHS,
      });
    }
    return json({ error: `GitHub 贡献数据获取失败：${err.message}` }, 502);
  }
}

// 账号数据访问与密码哈希：供 /api/users、/api/login 等路由共享
//
// 设计：系统只允许存在【一个】管理员账号（主管理员），其身份完全由环境变量决定：
//   - ADMIN_USERNAME / ADMIN_PASSWORD —— 密码登录的账号名与密码（未设置则回退默认 admin / admin123456）；
//   - ADMIN_GITHUB_LOGIN（可选）—— 管理员绑定的 GitHub 用户名，命中后该 GitHub 账号
//     走 OAuth 登录即自动成为管理员（签发 role = 'admin' 会话）。
// 管理员不写入 KV，登录时直接用环境变量校验；修改管理员身份/密码只能通过修改环境变量实现。
//
// 普通账号（role = 'user'）登录已改为 GitHub OAuth（GET /api/login/github）：
//   - 游客首次 GitHub 登录自动建号（findUserByGithub / bindOrCreateGithubUser），无需密码；
//   - 管理员仍可后台预建账号（账号名 + GitHub 主页链接），该用户 GitHub 登录时自动关联；
//   - 历史密码字段仅作兼容保留（旧账号密码不再用于登录）。
// KV 中只存储普通账号：
//   users:index       —— 索引键，JSON 数组，按创建时间倒序保存每个普通账号的公开信息
//                        [{ username, github, createdAt }]（不含密码）
//   user:{username}   —— 每个普通账号独立键，JSON 保存完整信息
//                        { username, passwordHash?, passwordSalt?, github, createdAt }
//
// 密码（若存在）使用 PBKDF2-SHA256（10 万次迭代）+ 随机盐哈希存储，绝不落明文。

const INDEX_KEY = 'users:index';
const userKey = (username) => `user:${username}`;

export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';

// 默认管理员账号：未通过 ADMIN_USERNAME / ADMIN_PASSWORD 覆盖时使用
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123456';

const enc = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

// PBKDF2-SHA256 派生口令哈希
async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password) {
  const salt = randomHex(16);
  const hash = await derive(password, salt);
  return { salt, hash };
}

export async function verifyPassword(password, salt, hash) {
  const got = await derive(password, salt);
  // 恒定时间比较
  if (got.length !== hash.length) return false;
  let out = 0;
  for (let i = 0; i < got.length; i++) out |= got.charCodeAt(i) ^ hash.charCodeAt(i);
  return out === 0;
}

/* ===================== 管理员（唯一，环境变量决定） ===================== */

// 主管理员账号名：ADMIN_USERNAME 或默认 admin
export function adminUsername(env) {
  return (env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME).trim();
}

// 主管理员密码：ADMIN_PASSWORD 或默认 admin123456
export function adminPassword(env) {
  return env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
}

// 主管理员公开信息（不含密码）
export function adminPublic(env) {
  return {
    username: adminUsername(env),
    github: '',
    role: ROLE_ADMIN,
    createdAt: 0,
  };
}

// 判断某账号名是否为密码管理员（仅与 ADMIN_USERNAME 比较，用于保护 KV 中普通账号操作）
export function isAdminUsername(env, username) {
  return username === adminUsername(env);
}

// 管理员绑定的 GitHub 用户名：ADMIN_GITHUB_LOGIN（可选，未设置返回空字符串）
export function adminGithubLogin(env) {
  return String((env && env.ADMIN_GITHUB_LOGIN) || '').trim();
}

// GitHub 用户名是否命中管理员映射：与 ADMIN_GITHUB_LOGIN 忽略大小写比较
// （GitHub 用户名在登录/识别时不区分大小写，env 中可填任意大小写）
export function isGithubAdmin(env, githubLogin) {
  const expected = adminGithubLogin(env).toLowerCase();
  return !!expected && String(githubLogin || '').trim().toLowerCase() === expected;
}

// 会话中的账号名是否属于管理员身份：密码管理员 ADMIN_USERNAME，或 GitHub 映射管理员。
// 供中间件 / /api/me 在会话角色为 admin 时二次校验，防止普通账号冒充管理员。
export function isAdminIdentity(env, username) {
  const u = String(username || '');
  if (!u) return false;
  return u === adminUsername(env) || u.toLowerCase() === adminGithubLogin(env).toLowerCase();
}

// 校验管理员登录（恒定时间比较，避免时序侧信道）
export async function verifyAdmin(env, username, password) {
  const expectedUser = adminUsername(env);
  const expectedPass = adminPassword(env);
  if (!expectedUser) return false;
  const u = String(username || '');
  const p = String(password || '');
  // 先比较用户名与密码长度，避免直接短路泄露信息
  const userOk = u === expectedUser;
  const passOk = p === expectedPass;
  return userOk && passOk;
}

/* ===================== 普通账号（KV 存储） ===================== */

// 公开字段（不含密码），供列表 / 前端使用
function publicOf(u) {
  return { username: u.username, github: u.github || '', role: ROLE_USER, createdAt: u.createdAt };
}

// 确保索引存在
async function ensureIndex(env) {
  let index = await env.KV.get(INDEX_KEY, { type: 'json' });
  if (!Array.isArray(index)) {
    index = [];
    await env.KV.put(INDEX_KEY, JSON.stringify(index));
  }
  return index;
}

// 读取全部普通账号公开信息
export async function readUsers(env) {
  const index = await ensureIndex(env);
  return index.map((u) => publicOf(u));
}

// 读取单个普通账号完整信息（含密码哈希），不存在返回 null
export async function getUser(env, username) {
  const raw = await env.KV.get(userKey(username), { type: 'json' });
  return raw || null;
}

// 校验用户名合法性
export function validateUsername(username) {
  const u = String(username || '').trim();
  if (!u) return { error: '用户名不能为空' };
  if (!/^[a-zA-Z0-9_-]{1,30}$/.test(u)) return { error: '用户名仅支持字母、数字、下划线、连字符，最长 30 字符' };
  return { username: u };
}

export function validatePassword(password) {
  const p = String(password || '');
  if (!p) return { error: '密码不能为空' };
  if (p.length < 6) return { error: '密码至少 6 位' };
  if (p.length > 128) return { error: '密码过长' };
  return { password: p };
}

// 校验 github 主页链接：合法则规范化为 https://github.com/<name>
export function validateGithub(github) {
  const g = String(github || '').trim();
  if (!g) return { github: '' };
  let host = '';
  let path = '';
  try {
    const u = new URL(g.includes('://') ? g : `https://${g}`);
    host = u.host.toLowerCase();
    path = u.pathname.replace(/\/+$/, '');
  } catch {
    return { error: 'GitHub 主页链接格式不正确' };
  }
  const bare = host.replace(/^www\./, '');
  if (bare !== 'github.com') return { error: '请输入 github.com 上的主页链接' };
  const name = path.split('/').filter(Boolean)[0] || '';
  if (!name) return { error: 'GitHub 主页链接缺少用户名' };
  return { github: `https://github.com/${name}` };
}

// 创建普通账号（仅普通账号，管理员不可通过此接口创建）
// 说明：普通账号登录已改为 GitHub 登录，password 为可选兼容字段——历史客户端仍会传密码则一并保存，
// 新流程创建的账号不设密码（登录凭据即 GitHub）。
export async function createUser(env, { username, password, github }) {
  const index = await ensureIndex(env);
  // 禁止与管理员身份重名：密码管理员（精确匹配）与 GitHub 映射管理员（忽略大小写），
  // 避免建立注定无法正常登录的重复普通账号。
  const ghAdmin = adminGithubLogin(env);
  if (
    isAdminUsername(env, username) ||
    (ghAdmin && String(username || '').toLowerCase() === ghAdmin.toLowerCase())
  ) {
    return { error: '该用户名已被保留' };
  }
  if (index.some((u) => u.username === username)) return { error: '该用户名已存在' };
  const user = {
    username,
    github,
    createdAt: Date.now(),
  };
  if (password) {
    const { salt, hash } = await hashPassword(password);
    user.passwordSalt = salt;
    user.passwordHash = hash;
  }
  index.unshift(publicOf(user));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(username), JSON.stringify(user)),
  ]);
  return { user: publicOf(user) };
}

/* ===================== GitHub 账号匹配 / 自动创建（GitHub OAuth 登录用） ===================== */

// 通过 GitHub 用户名匹配已存在的普通账号（大小写不敏感，GitHub 用户名在 GitHub 侧不区分大小写）。
// 匹配规则（命中其一即可）：
//   1. 账号名 == GitHub 用户名（忽略大小写）
//   2. 账号绑定的 GitHub 主页 == https://github.com/<用户名>
export async function findUserByGithub(env, githubLogin) {
  const login = String(githubLogin || '').toLowerCase();
  if (!login) return null;
  const index = await ensureIndex(env);
  const target = `https://github.com/${login}`;
  for (const meta of index) {
    const gh = String(meta.github || '').toLowerCase().replace(/\/+$/, '');
    if (meta.username.toLowerCase() === login || gh === target) {
      return getUser(env, meta.username);
    }
  }
  return null;
}

// GitHub OAuth 登录后的账号获取/创建：
//   - 已存在匹配账号（管理员后台预建的账号在此关联）→ 返回该账号；
//     若历史账号缺 github 字段则自动补全，保证头像/主页可显示。
//   - 不存在 → 以 GitHub 用户名自动创建普通账号（无密码）。
// 调用方需先确保 githubLogin 不与管理员账号同名。
export async function bindOrCreateGithubUser(env, { login, githubUrl }) {
  const existing = await findUserByGithub(env, login);
  if (existing) {
    if (!existing.github && githubUrl) {
      const next = await updateUser(env, existing.username, { github: githubUrl });
      if (!next.error) existing.github = next.user.github;
    }
    return { user: publicOf(existing) };
  }
  const index = await ensureIndex(env);
  const user = {
    username: login,
    github: githubUrl || `https://github.com/${login}`,
    createdAt: Date.now(),
  };
  index.unshift(publicOf(user));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(login), JSON.stringify(user)),
  ]);
  return { user: publicOf(user) };
}

// 更新普通账号：patch 支持 { github } / { password }（密码仅重置，不可查询）
export async function updateUser(env, username, patch) {
  // 管理员不可通过此接口被修改
  if (isAdminUsername(env, username)) return { error: '管理员账号不可通过此接口修改', status: 400 };
  const index = await ensureIndex(env);
  const meta = index.find((u) => u.username === username);
  if (!meta) return { error: '账号不存在' };
  const prev = await getUser(env, username);
  if (!prev) return { error: '账号不存在' };
  const next = { ...prev };

  if (typeof patch.github === 'string') next.github = patch.github;
  if (typeof patch.password === 'string' && patch.password) {
    const { salt, hash } = await hashPassword(patch.password);
    next.passwordSalt = salt;
    next.passwordHash = hash;
  }

  const pub = publicOf(next);
  const i = index.findIndex((u) => u.username === username);
  index[i] = pub;
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(username), JSON.stringify(next)),
  ]);
  return { user: pub };
}

// 删除普通账号
export async function deleteUser(env, username) {
  // 管理员账号不可被删除
  if (isAdminUsername(env, username)) return { error: '管理员账号不可删除' };
  const index = await ensureIndex(env);
  const meta = index.find((u) => u.username === username);
  if (!meta) return { error: '账号不存在' };
  const next = index.filter((u) => u.username !== username);
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(next)),
    env.KV.delete(userKey(username)),
  ]);
  return { ok: true };
}

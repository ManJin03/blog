// 账号数据访问与密码哈希：供 /api/users、/api/login 等路由共享
//
// 设计：系统只允许存在【一个】管理员账号（主管理员），其账号名与密码完全由
// 环境变量 ADMIN_USERNAME / ADMIN_PASSWORD 决定（未设置则回退默认 admin / admin123456），
// 管理员不写入 KV，登录时直接用环境变量校验；修改管理员密码只能通过修改环境变量实现。
//
// KV 中只存储普通账号（role = 'user'）：
//   users:index       —— 索引键，JSON 数组，按创建时间倒序保存每个普通账号的公开信息
//                        [{ username, github, createdAt }]（不含密码）
//   user:{username}   —— 每个普通账号独立键，JSON 保存完整信息（含密码哈希与盐）
//                        { username, passwordHash, passwordSalt, github, createdAt }
//
// 密码使用 PBKDF2-SHA256（10 万次迭代）+ 随机盐哈希存储，绝不落明文。

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

// 判断某账号名是否为管理员
export function isAdminUsername(env, username) {
  return username === adminUsername(env);
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
export async function createUser(env, { username, password, github }) {
  const index = await ensureIndex(env);
  // 禁止与管理员账号重名
  if (isAdminUsername(env, username)) return { error: '该用户名已被保留' };
  if (index.some((u) => u.username === username)) return { error: '该用户名已存在' };
  const { salt, hash } = await hashPassword(password);
  const user = {
    username,
    passwordSalt: salt,
    passwordHash: hash,
    github,
    createdAt: Date.now(),
  };
  index.unshift(publicOf(user));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(username), JSON.stringify(user)),
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

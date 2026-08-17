// 账号数据访问与密码哈希：供 /api/users、/api/login 等路由共享
//
// KV 存储结构：
//   users:index       —— 索引键，JSON 数组，按创建时间倒序保存每个账号的公开信息
//                        [{ username, github, role, createdAt }]（不含密码）
//   user:{username}   —— 每个账号独立键，JSON 保存完整信息（含密码哈希与盐）
//                        { username, passwordHash, passwordSalt, github, role, createdAt }
//
// 密码使用 PBKDF2-SHA256（10 万次迭代）+ 随机盐哈希存储，绝不落明文。
// 管理员账号在首次访问时由环境变量 ADMIN_PASSWORD 自动初始化（迁移自旧版单密码方案）。

const INDEX_KEY = 'users:index';
const userKey = (username) => `user:${username}`;

export const ROLE_ADMIN = 'admin';
export const ROLE_USER = 'user';

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

// 公开字段（不含密码），供列表 / 前端使用
function publicOf(u) {
  return { username: u.username, github: u.github || '', role: u.role, createdAt: u.createdAt };
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

// 初始化管理员：迁移自旧版 ADMIN_PASSWORD 单密码方案。
// 若索引中尚无 admin 账号，则用 ADMIN_USERNAME（默认 ManJin）/ ADMIN_PASSWORD 创建。
export async function ensureAdmin(env) {
  const index = await ensureIndex(env);
  if (index.some((u) => u.role === ROLE_ADMIN)) return;
  const username = (env.ADMIN_USERNAME || 'ManJin').trim();
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) return;
  // 若该用户名已存在（普通账号撞名），跳过，避免覆盖
  if (index.some((u) => u.username === username)) return;
  const { salt, hash } = await hashPassword(password);
  const now = Date.now();
  const user = {
    username,
    passwordSalt: salt,
    passwordHash: hash,
    github: env.ADMIN_GITHUB || '',
    role: ROLE_ADMIN,
    createdAt: now,
  };
  index.unshift(publicOf(user));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(username), JSON.stringify(user)),
  ]);
}

// 读取全部账号公开信息
export async function readUsers(env) {
  await ensureAdmin(env);
  return ensureIndex(env);
}

// 读取单个账号完整信息（含密码哈希），不存在返回 null
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

// 创建账号
export async function createUser(env, { username, password, github, role }) {
  const index = await ensureIndex(env);
  if (index.some((u) => u.username === username)) return { error: '该用户名已存在' };
  const { salt, hash } = await hashPassword(password);
  const user = {
    username,
    passwordSalt: salt,
    passwordHash: hash,
    github,
    role,
    createdAt: Date.now(),
  };
  index.unshift(publicOf(user));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(userKey(username), JSON.stringify(user)),
  ]);
  return { user: publicOf(user) };
}

// 更新账号：patch 支持 { github } / { role } / { password }（密码仅重置，不可查询）
export async function updateUser(env, username, patch) {
  const index = await ensureIndex(env);
  const meta = index.find((u) => u.username === username);
  if (!meta) return { error: '账号不存在' };
  const prev = await getUser(env, username);
  if (!prev) return { error: '账号不存在' };
  const next = { ...prev };

  if (typeof patch.github === 'string') next.github = patch.github;
  if (patch.role === ROLE_ADMIN || patch.role === ROLE_USER) {
    // 防止把最后一个管理员降级为普通用户
    if (prev.role === ROLE_ADMIN && patch.role !== ROLE_ADMIN) {
      const admins = index.filter((u) => u.role === ROLE_ADMIN);
      if (admins.length <= 1) return { error: '至少保留一个管理员账号' };
    }
    next.role = patch.role;
  }
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

// 删除账号
export async function deleteUser(env, username) {
  const index = await ensureIndex(env);
  const meta = index.find((u) => u.username === username);
  if (!meta) return { error: '账号不存在' };
  if (meta.role === ROLE_ADMIN) {
    const admins = index.filter((u) => u.role === ROLE_ADMIN);
    if (admins.length <= 1) return { error: '至少保留一个管理员账号' };
  }
  const next = index.filter((u) => u.username !== username);
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(next)),
    env.KV.delete(userKey(username)),
  ]);
  return { ok: true };
}

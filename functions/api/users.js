// GET  /api/users —— 查询普通账号列表（需管理员）
// POST /api/users —— 创建普通账号（需管理员）
// 系统只允许存在一个管理员（由环境变量决定），管理员只能增删查改普通账号。
// 普通账号登录已改为 GitHub 登录：创建时填账号名 + GitHub 主页链接即可（密码为可选兼容字段）。
import { json } from '../_lib/http.js';
import {
  readUsers,
  createUser,
  validateUsername,
  validatePassword,
  validateGithub,
} from '../_lib/users.js';

function kvMissing() {
  return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
}

export async function onRequestGet({ env, data }) {
  if (!data.isAdmin) return json({ error: '仅管理员可查看账号列表' }, 403);
  if (!env.KV) return kvMissing();
  return json({ users: await readUsers(env) });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.isAdmin) return json({ error: '仅管理员可创建账号' }, 403);
  if (!env.KV) return kvMissing();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const uname = validateUsername(body?.username);
  if (uname.error) return json({ error: uname.error }, 400);
  // 密码可选：留空则账号仅支持 GitHub 登录；传入则按旧格式兼容保存（不再作为登录凭据）
  const password = typeof body?.password === 'string' && body.password ? body.password : '';
  if (password) {
    const pwd = validatePassword(password);
    if (pwd.error) return json({ error: pwd.error }, 400);
  }
  const gh = validateGithub(body?.github);
  if (gh.error) return json({ error: gh.error }, 400);

  const result = await createUser(env, {
    username: uname.username,
    password,
    github: gh.github,
  });
  if (result.error) return json({ error: result.error }, 409);

  return json({ user: result.user }, 201);
}

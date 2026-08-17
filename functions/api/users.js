// GET  /api/users —— 查询账号列表（需管理员）
// POST /api/users —— 创建账号（需管理员）
// 普通账号不允许自行注册，只能由管理员在后台创建。
import { json } from '../_lib/http.js';
import {
  readUsers,
  createUser,
  validateUsername,
  validatePassword,
  validateGithub,
  ROLE_ADMIN,
  ROLE_USER,
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
  const pwd = validatePassword(body?.password);
  if (pwd.error) return json({ error: pwd.error }, 400);
  const gh = validateGithub(body?.github);
  if (gh.error) return json({ error: gh.error }, 400);

  const role = body?.role === ROLE_ADMIN ? ROLE_ADMIN : ROLE_USER;

  const result = await createUser(env, {
    username: uname.username,
    password: pwd.password,
    github: gh.github,
    role,
  });
  if (result.error) return json({ error: result.error }, 409);

  return json({ user: result.user }, 201);
}

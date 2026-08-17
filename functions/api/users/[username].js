// PATCH  /api/users/:username —— 修改普通账号（github / password 重置），需管理员
// DELETE /api/users/:username —— 删除普通账号，需管理员
// 管理员账号不可通过此接口修改或删除；管理员密码只能通过环境变量 ADMIN_PASSWORD 修改。
import { json } from '../../_lib/http.js';
import {
  updateUser,
  deleteUser,
  validatePassword,
  validateGithub,
} from '../../_lib/users.js';

export async function onRequestPatch({ request, env, data, params }) {
  if (!data.isAdmin) return json({ error: '仅管理员可修改账号' }, 403);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const patch = {};

  if (typeof body.github === 'string') {
    const gh = validateGithub(body.github);
    if (gh.error) return json({ error: gh.error }, 400);
    patch.github = gh.github;
  }

  if (typeof body.password === 'string' && body.password) {
    const pwd = validatePassword(body.password);
    if (pwd.error) return json({ error: pwd.error }, 400);
    patch.password = pwd.password;
  }

  const result = await updateUser(env, params.username, patch);
  if (result.error) return json({ error: result.error }, result.status || 400);

  return json({ user: result.user });
}

export async function onRequestDelete({ env, data, params }) {
  if (!data.isAdmin) return json({ error: '仅管理员可删除账号' }, 403);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  const result = await deleteUser(env, params.username);
  if (result.error) return json({ error: result.error }, 400);

  return json({ ok: true });
}

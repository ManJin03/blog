// POST   /api/login —— 账号密码登录（管理员 / 普通账号），成功后签发 HttpOnly 会话 Cookie
// DELETE /api/login —— 退出登录，清除会话 Cookie
//
// 管理员：账号名与密码由环境变量决定（ADMIN_USERNAME / ADMIN_PASSWORD，默认 admin / admin123456），
// 直接校验环境变量，不落 KV。
// 普通账号：存储在 KV 中，PBKDF2 哈希校验。
import { createSessionToken, sessionCookieHeader, clearCookieHeader } from '../_lib/auth.js';
import { verifyAdmin, adminUsername, getUser, verifyPassword } from '../_lib/users.js';
import { json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) {
    return json({ error: '服务端未配置 SESSION_SECRET 环境变量' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const username = (typeof body?.username === 'string' ? body.username : '').trim();
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!username || !password) return json({ error: '请输入账号和密码' }, 400);

  // 管理员：直接校验环境变量
  if (username === adminUsername(env)) {
    const ok = await verifyAdmin(env, username, password);
    if (!ok) return json({ error: '账号或密码错误' }, 401);
    const token = await createSessionToken(env, { username, role: 'admin' });
    return json(
      { ok: true, user: { username, role: 'admin', github: '' } },
      200,
      { 'set-cookie': sessionCookieHeader(request, token) },
    );
  }

  // 普通账号：KV 校验
  const user = await getUser(env, username);
  if (!user) return json({ error: '账号或密码错误' }, 401);

  const ok = await verifyPassword(password, user.passwordSalt, user.passwordHash);
  if (!ok) return json({ error: '账号或密码错误' }, 401);

  const token = await createSessionToken(env, { username: user.username, role: 'user' });
  return json(
    { ok: true, user: { username: user.username, role: 'user', github: user.github || '' } },
    200,
    { 'set-cookie': sessionCookieHeader(request, token) },
  );
}

export async function onRequestDelete({ request }) {
  return json({ ok: true }, 200, { 'set-cookie': clearCookieHeader(request) });
}

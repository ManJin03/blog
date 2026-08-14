// POST   /api/login —— 密码登录，成功后签发 HttpOnly 会话 Cookie
// DELETE /api/login —— 退出登录，清除会话 Cookie
import { createSessionToken, sessionCookieHeader, clearCookieHeader } from '../_lib/auth.js';
import { json } from '../_lib/http.js';

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ error: '服务端未配置 ADMIN_PASSWORD / SESSION_SECRET 环境变量' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const password = typeof body?.password === 'string' ? body.password : '';
  if (!password || password !== env.ADMIN_PASSWORD) {
    return json({ error: '密码错误' }, 401);
  }

  const token = await createSessionToken(env);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookieHeader(request, token) });
}

export async function onRequestDelete({ request }) {
  return json({ ok: true }, 200, { 'set-cookie': clearCookieHeader(request) });
}

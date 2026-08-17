// GET /api/me —— 查询当前登录状态与身份
import { json } from '../_lib/http.js';
import { getUser } from '../_lib/users.js';

export async function onRequestGet({ env, data }) {
  if (!data.authed || !data.user) {
    return json({ authed: false });
  }
  const user = await getUser(env, data.user.username);
  if (!user) {
    // 账号已被删除，但会话仍有效
    return json({ authed: false });
  }
  return json({
    authed: true,
    username: user.username,
    role: user.role,
    github: user.github || '',
    isAdmin: user.role === 'admin',
  });
}

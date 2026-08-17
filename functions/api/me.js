// GET /api/me —— 查询当前登录状态与身份
import { json } from '../_lib/http.js';
import { getUser, isAdminUsername } from '../_lib/users.js';

export async function onRequestGet({ env, data }) {
  if (!data.authed || !data.user) {
    return json({ authed: false });
  }

  // 管理员：身份由环境变量决定，不落 KV
  if (isAdminUsername(env, data.user.username)) {
    return json({
      authed: true,
      username: data.user.username,
      role: 'admin',
      github: '',
      isAdmin: true,
    });
  }

  // 普通账号：查 KV
  const user = await getUser(env, data.user.username);
  if (!user) {
    // 账号已被删除，但会话仍有效
    return json({ authed: false });
  }
  return json({
    authed: true,
    username: user.username,
    role: user.role || 'user',
    github: user.github || '',
    isAdmin: false,
  });
}

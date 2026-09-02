// GET /api/me —— 查询当前登录状态与身份
import { json } from '../_lib/http.js';
import { getUser, isAdminIdentity, isGithubAdmin } from '../_lib/users.js';

export async function onRequestGet({ env, data }) {
  if (!data.authed || !data.user) {
    return json({ authed: false });
  }

  // 管理员：身份由环境变量决定，不落 KV（同时校验会话角色，防止普通账号冒充）
  if (data.user.role === 'admin' && isAdminIdentity(env, data.user.username)) {
    // GitHub 映射管理员（命中 ADMIN_GITHUB_LOGIN）：附上主页链接，前端据此显示 GitHub 头像；
    // 密码管理员（ADMIN_USERNAME 登录）无 GitHub 身份，保持 github 为空。
    const isGhAdmin = isGithubAdmin(env, data.user.username);
    return json({
      authed: true,
      username: data.user.username,
      role: 'admin',
      github: isGhAdmin ? `https://github.com/${data.user.username}` : '',
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

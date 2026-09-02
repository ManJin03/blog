// /api/* 公共中间件：解析并校验会话，结果挂到 context.data
//   data.user    —— 当前登录用户 { username, role }，未登录为 null
//   data.authed  —— 是否已登录
//   data.isAdmin —— 是否为管理员（同时校验会话角色与环境变量决定的管理员身份：
//                   ADMIN_USERNAME 密码管理员，或 ADMIN_GITHUB_LOGIN 映射的 GitHub 管理员）
import { verifySession } from '../_lib/auth.js';
import { isAdminIdentity } from '../_lib/users.js';

export async function onRequest(context) {
  const { request, env, data } = context;
  const user = await verifySession(request, env);
  data.user = user;
  data.authed = !!user;
  data.isAdmin = !!(user && user.role === 'admin' && isAdminIdentity(env, user.username));
  return context.next();
}

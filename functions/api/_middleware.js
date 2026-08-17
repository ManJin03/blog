// /api/* 公共中间件：解析并校验会话，结果挂到 context.data
//   data.user    —— 当前登录用户 { username, role }，未登录为 null
//   data.authed  —— 是否已登录
//   data.isAdmin —— 是否为管理员（同时校验会话角色与当前环境变量决定的用户名）
import { verifySession } from '../_lib/auth.js';
import { isAdminUsername } from '../_lib/users.js';

export async function onRequest(context) {
  const { request, env, data } = context;
  const user = await verifySession(request, env);
  data.user = user;
  data.authed = !!user;
  data.isAdmin = !!(user && user.role === 'admin' && isAdminUsername(env, user.username));
  return context.next();
}

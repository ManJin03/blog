// /api/* 公共中间件：解析并校验会话，结果挂到 context.data.authed
import { verifySession } from '../_lib/auth.js';

export async function onRequest(context) {
  const { request, env, data } = context;
  data.authed = await verifySession(request, env);
  return context.next();
}

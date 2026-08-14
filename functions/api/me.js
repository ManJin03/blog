// GET /api/me —— 查询当前登录状态
import { json } from '../_lib/http.js';

export async function onRequestGet({ data }) {
  return json({ authed: !!data.authed });
}

// POST /api/posts/:id/like —— 点赞/取消点赞（无需登录，人人可点）
// body: { "deviceId": "<匿名设备标识>" }
// 后端仅记录点赞数与匿名设备标识（用于"每设备一次"去重与取消），不记录点赞者身份。
import { json } from '../../../_lib/http.js';
import { toggleLike } from '../../../_lib/posts.js';

export async function onRequestPost({ request, env, params }) {
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
  if (!deviceId || deviceId.length > 64) return json({ error: '缺少设备标识' }, 400);

  const result = await toggleLike(env, params.id, deviceId);
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ likes: result.likes, liked: result.liked });
}

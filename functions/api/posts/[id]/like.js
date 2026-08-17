// POST /api/posts/:id/like —— 点赞/取消点赞（人人可点）
// 登录账号：点赞绑定到账号（由后端从会话解析用户名，前端无法伪造）。
// 陌生人：记录匿名设备标识（body: {"deviceId":"..."}），仅用于"每设备一次"去重，不关联身份。
import { json } from '../../../_lib/http.js';
import { toggleLike } from '../../../_lib/posts.js';

export async function onRequestPost({ request, env, data, params }) {
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  // 登录账号：点赞绑定到账号
  let liker = null;
  if (data.authed && data.user) {
    liker = `user:${data.user.username}`;
  } else {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '请求格式错误' }, 400);
    }
    const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : '';
    if (!deviceId || deviceId.length > 64) return json({ error: '缺少设备标识' }, 400);
    liker = `device:${deviceId}`;
  }

  const result = await toggleLike(env, params.id, liker);
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ likes: result.likes, liked: result.liked, liker });
}

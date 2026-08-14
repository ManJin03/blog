// GET  /api/posts —— 获取动态列表（无需登录）
// POST /api/posts —— 发布动态（需登录）
import { json } from '../_lib/http.js';

const MAX_LEN = 500;
const KV_KEY = 'posts';

export async function onRequestGet({ env }) {
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
  const posts = await env.KV.get(KV_KEY, { type: 'json' });
  return json({ posts: Array.isArray(posts) ? posts : [] });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const content = (typeof body?.content === 'string' ? body.content : '').trim();
  if (!content) return json({ error: '内容不能为空' }, 400);
  if (content.length > MAX_LEN) return json({ error: `内容不能超过 ${MAX_LEN} 字` }, 400);

  const list = (await env.KV.get(KV_KEY, { type: 'json' })) || [];
  const post = { id: crypto.randomUUID(), content, createdAt: Date.now() };
  await env.KV.put(KV_KEY, JSON.stringify([post, ...list]));

  return json({ post }, 201);
}

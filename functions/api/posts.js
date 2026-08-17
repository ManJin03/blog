// GET  /api/posts —— 获取动态列表（无需登录）
// POST /api/posts —— 发布动态（需管理员）
import { json } from '../_lib/http.js';
import { readPosts, addPost, parseContent } from '../_lib/posts.js';

function kvMissing() {
  return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
}

export async function onRequestGet({ env }) {
  if (!env.KV) return kvMissing();
  return json({ posts: await readPosts(env) });
}

export async function onRequestPost({ request, env, data }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!data.isAdmin) return json({ error: '仅管理员可发布动态' }, 403);
  if (!env.KV) return kvMissing();

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const parsed = parseContent(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const post = { id: crypto.randomUUID(), content: parsed.content, createdAt: Date.now() };
  await addPost(env, post);

  return json({ post }, 201);
}

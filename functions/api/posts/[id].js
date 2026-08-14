// PATCH   /api/posts/:id —— 修改动态（需登录）
// DELETE /api/posts/:id —— 删除动态（需登录）
import { json } from '../../_lib/http.js';
import { readPosts, writePosts, parseContent } from '../../_lib/posts.js';

export async function onRequestPatch({ request, env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const parsed = parseContent(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const posts = await readPosts(env);
  const idx = posts.findIndex((p) => p.id === params.id);
  if (idx === -1) return json({ error: '动态不存在' }, 404);

  posts[idx] = { ...posts[idx], content: parsed.content, updatedAt: Date.now() };
  await writePosts(env, posts);

  return json({ post: posts[idx] });
}

export async function onRequestDelete({ env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  const posts = await readPosts(env);
  const next = posts.filter((p) => p.id !== params.id);
  if (next.length === posts.length) return json({ error: '动态不存在' }, 404);

  await writePosts(env, next);
  return json({ ok: true });
}

// PATCH   /api/posts/:id —— 修改动态（需管理员）
// DELETE /api/posts/:id —— 删除动态（需管理员）
import { json } from '../../_lib/http.js';
import { updatePost, deletePost, parseContent } from '../../_lib/posts.js';

export async function onRequestPatch({ request, env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!data.isAdmin) return json({ error: '仅管理员可修改动态' }, 403);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  // 置顶切换：请求体仅含 pinned 时只更新置顶状态，不动内容
  if (typeof body?.pinned === 'boolean') {
    const post = await updatePost(env, params.id, { pinned: body.pinned });
    if (!post) return json({ error: '动态不存在' }, 404);
    return json({ post });
  }

  const parsed = parseContent(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const post = await updatePost(env, params.id, { content: parsed.content });
  if (!post) return json({ error: '动态不存在' }, 404);

  return json({ post });
}

export async function onRequestDelete({ env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!data.isAdmin) return json({ error: '仅管理员可删除动态' }, 403);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  const ok = await deletePost(env, params.id);
  if (!ok) return json({ error: '动态不存在' }, 404);

  return json({ ok: true });
}

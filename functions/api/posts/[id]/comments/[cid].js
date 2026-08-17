// PATCH  /api/posts/:id/comments/:cid —— 修改评论（作者本人或管理员）
// DELETE /api/posts/:id/comments/:cid —— 删除评论（作者本人或管理员）
import { json } from '../../../../_lib/http.js';
import { updateComment, deleteComment, findComment, parseComment } from '../../../../_lib/comments.js';

function kvMissing() {
  return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
}

export async function onRequestPatch({ request, env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return kvMissing();

  const found = await findComment(env, params.id, params.cid);
  if (!found) return json({ error: '评论不存在' }, 404);

  // 权限：作者本人，或管理员
  const isAuthor = data.user.username === found.comment.author;
  if (!isAuthor && !data.isAdmin) return json({ error: '无权修改该评论' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const parsed = parseComment(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const result = await updateComment(env, params.id, params.cid, parsed.content);
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ comment: result.comment });
}

export async function onRequestDelete({ env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return kvMissing();

  const found = await findComment(env, params.id, params.cid);
  if (!found) return json({ error: '评论不存在' }, 404);

  const isAuthor = data.user.username === found.comment.author;
  if (!isAuthor && !data.isAdmin) return json({ error: '无权删除该评论' }, 403);

  const result = await deleteComment(env, params.id, params.cid);
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ ok: true });
}

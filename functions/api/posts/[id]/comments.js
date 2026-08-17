// POST /api/posts/:id/comments —— 发布评论（仅登录的普通账号，管理员禁止评论）
import { json } from '../../../_lib/http.js';
import { addComment, parseComment } from '../../../_lib/comments.js';
import { getUser } from '../../../_lib/users.js';

export async function onRequestPost({ request, env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
  if (data.isAdmin) return json({ error: '管理员不能评论' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const parsed = parseComment(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const author = data.user.username;
  const user = await getUser(env, author);

  const result = await addComment(env, params.id, {
    content: parsed.content,
    author,
    authorGithub: (user && user.github) || '',
  });
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ comment: result.comment }, 201);
}

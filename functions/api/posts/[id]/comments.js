// POST /api/posts/:id/comments —— 发布评论
// 权限：普通账号可评论；GitHub 映射管理员（ADMIN_GITHUB_LOGIN）同样可评论；
// 仅纯密码管理员（ADMIN_USERNAME 会话，无 GitHub 身份）禁止评论。
import { json } from '../../../_lib/http.js';
import { addComment, parseComment } from '../../../_lib/comments.js';
import { getUser, isGithubAdmin } from '../../../_lib/users.js';

export async function onRequestPost({ request, env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);
  // 纯密码管理员无 GitHub 身份，仍维持"管理员不参与评论"的旧规则
  if (data.isAdmin && !isGithubAdmin(env, data.user.username)) {
    return json({ error: '管理员不能评论' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: '请求格式错误' }, 400);
  }

  const parsed = parseComment(body);
  if (parsed.error) return json({ error: parsed.error }, 400);

  const author = data.user.username;

  // GitHub 映射管理员不写入 KV，authorGithub 按其映射直接推导，保证评论头像正常显示
  let authorGithub = '';
  if (isGithubAdmin(env, author)) {
    authorGithub = `https://github.com/${author}`;
  } else {
    const user = await getUser(env, author);
    authorGithub = (user && user.github) || '';
  }

  const result = await addComment(env, params.id, {
    content: parsed.content,
    author,
    authorGithub,
  });
  if (result.error) return json({ error: result.error }, result.status || 500);

  return json({ comment: result.comment }, 201);
}

// 帖子数据访问与内容校验：供 /api/posts 相关路由共享
const KV_KEY = 'posts';

export const MAX_LEN = 500;

export async function readPosts(env) {
  const list = await env.KV.get(KV_KEY, { type: 'json' });
  return Array.isArray(list) ? list : [];
}

export async function writePosts(env, posts) {
  await env.KV.put(KV_KEY, JSON.stringify(posts));
}

// 校验并规范化动态内容，返回 { content } 或 { error }
export function parseContent(body) {
  const content = (typeof body?.content === 'string' ? body.content : '').trim();
  if (!content) return { error: '内容不能为空' };
  if (content.length > MAX_LEN) return { error: `内容不能超过 ${MAX_LEN} 字` };
  return { content };
}

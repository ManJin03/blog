// 帖子数据访问与内容校验：供 /api/posts 相关路由共享
//
// KV 存储结构：
//   posts:index   —— 索引键，JSON 数组，按时间倒序保存每帖元信息 { id, createdAt, updatedAt, pinned }
//   post:{id}     —— 每帖独立键，JSON 保存完整帖子 { id, content, createdAt, updatedAt, pinned }
// 旧版所有帖子存于单个 posts 键下，读取时自动迁移到新结构。

const INDEX_KEY = 'posts:index';
const postKey = (id) => `post:${id}`;
const LEGACY_KEY = 'posts';

export const MAX_LEN = 500;

function metaOf({ id, createdAt, updatedAt, pinned }) {
  return { id, createdAt, updatedAt, pinned };
}

// 确保索引存在；若只有旧版 posts 键，则自动迁移为新结构
async function ensureIndex(env) {
  let index = await env.KV.get(INDEX_KEY, { type: 'json' });
  if (Array.isArray(index) && index.length) return index;
  const legacy = await env.KV.get(LEGACY_KEY, { type: 'json' });
  if (!Array.isArray(legacy) || !legacy.length) return index || [];
  index = legacy.map(metaOf);
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    ...legacy.map((p) => env.KV.put(postKey(p.id), JSON.stringify(p))),
  ]);
  await env.KV.delete(LEGACY_KEY);
  return index;
}

// 读取全部帖子（按索引顺序，各帖并行读取）
export async function readPosts(env) {
  const index = await ensureIndex(env);
  if (!index.length) return [];
  const posts = await Promise.all(
    index.map(async ({ id }) => env.KV.get(postKey(id), { type: 'json' })),
  );
  return posts.filter(Boolean);
}

// 新增帖子：索引头部插入元信息，完整内容写入独立键
export async function addPost(env, post) {
  const index = await ensureIndex(env);
  index.unshift(metaOf(post));
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(postKey(post.id), JSON.stringify(post)),
  ]);
  return post;
}

// 更新帖子：patch 支持 { content } / { pinned }；仅改内容时更新 updatedAt
// 返回更新后的帖子，帖子不存在返回 null
export async function updatePost(env, id, patch) {
  const index = await ensureIndex(env);
  const meta = index.find((m) => m.id === id);
  if (!meta) return null;
  const prev = (await env.KV.get(postKey(id), { type: 'json' })) || {};
  const next = { ...prev, ...patch, id };
  if (typeof patch.pinned === 'boolean') meta.pinned = patch.pinned;
  if (patch.content) {
    next.updatedAt = Date.now();
    meta.updatedAt = next.updatedAt;
  }
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(index)),
    env.KV.put(postKey(id), JSON.stringify(next)),
  ]);
  return next;
}

// 删除帖子：索引移除 + 删除独立键；帖子不存在返回 false
export async function deletePost(env, id) {
  const index = await ensureIndex(env);
  const next = index.filter((m) => m.id !== id);
  if (next.length === index.length) return false;
  await Promise.all([
    env.KV.put(INDEX_KEY, JSON.stringify(next)),
    env.KV.delete(postKey(id)),
  ]);
  return true;
}

// 校验并规范化动态内容，返回 { content } 或 { error }
export function parseContent(body) {
  const content = (typeof body?.content === 'string' ? body.content : '').trim();
  if (!content) return { error: '内容不能为空' };
  if (content.length > MAX_LEN) return { error: `内容不能超过 ${MAX_LEN} 字` };
  return { content };
}

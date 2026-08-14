// DELETE /api/posts/:id —— 删除指定动态（需登录）
import { json } from '../../_lib/http.js';

const KV_KEY = 'posts';

export async function onRequestDelete({ env, data, params }) {
  if (!data.authed) return json({ error: '请先登录' }, 401);
  if (!env.KV) return json({ error: 'KV 存储未绑定，请查看 README 配置 KV 命名空间' }, 500);

  const { id } = params;
  const list = (await env.KV.get(KV_KEY, { type: 'json' })) || [];
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return json({ error: '动态不存在' }, 404);

  await env.KV.put(KV_KEY, JSON.stringify(next));
  return json({ ok: true });
}

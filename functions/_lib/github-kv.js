// GitHub 数据 KV 缓存工具：把 GitHub 拉取结果持久化到 Cloudflare KV，
// 每天刷新一次（TTL 24 小时）。GitHub 连接不上时，回退到最近一次成功的数据，
// 保证首页资料 / 作品展示 / 贡献热力图在 GitHub 抖动时仍能正常展示。
//
// KV 存储结构（每个键存一个 JSON 对象）：
//   github:profile        —— { savedAt, data }   data 为 /api/github 聚合结果
//   github:contributions  —— { savedAt, data }   data 为 { years, byYear }
//
// 约定：env.KV 为 Cloudflare KV 命名空间绑定；未绑定时自动退化为纯内存缓存。

export const KEY_PROFILE = 'github:profile';
export const KEY_CONTRIBUTIONS = 'github:contributions';

// 缓存有效期：24 小时（每天刷新一次 GitHub 数据）
export const KV_TTL = 86400; // 秒

// 读取有效期内缓存；未绑定 KV / 未命中 / 已过期均返回 null（不抛错）
export async function kvRead(env, key) {
  if (!env || !env.KV) return null;
  try {
    const raw = await env.KV.get(key, { type: 'json' });
    if (!raw || !raw.savedAt || !raw.data) return null;
    if (Date.now() - raw.savedAt > KV_TTL * 1000) return null;
    return raw.data;
  } catch {
    return null;
  }
}

// 读取缓存，允许过期数据（GitHub 完全连不上时的最后兜底）
export async function kvReadStale(env, key) {
  if (!env || !env.KV) return null;
  try {
    const raw = await env.KV.get(key, { type: 'json' });
    return raw && raw.data ? raw.data : null;
  } catch {
    return null;
  }
}

// 写入缓存（TTL 24 小时）；写失败静默忽略，不影响主流程
export async function kvWrite(env, key, data) {
  if (!env || !env.KV) return;
  try {
    await env.KV.put(key, JSON.stringify({ savedAt: Date.now(), data }), { expirationTtl: KV_TTL });
  } catch {
    /* 忽略 */
  }
}

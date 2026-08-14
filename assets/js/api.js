// 后端 API 客户端：所有网络请求集中在这里，新增接口时在此添加函数
async function request(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 空响应体 */ }
  if (!res.ok) throw new Error((data && data.error) || `请求失败（${res.status}）`);
  return data;
}

export const getMe = () => request('/api/me').catch(() => ({ authed: false }));
export const getPosts = () => request('/api/posts');
export const login = (password) => request('/api/login', {
  method: 'POST',
  body: JSON.stringify({ password }),
});
export const logout = () => request('/api/login', { method: 'DELETE' }).catch(() => {});
export const createPost = (content) => request('/api/posts', {
  method: 'POST',
  body: JSON.stringify({ content }),
});
export const updatePost = (id, content) => request(`/api/posts/${encodeURIComponent(id)}`, {
  method: 'PATCH',
  body: JSON.stringify({ content }),
});
export const deletePost = (id) => request(`/api/posts/${encodeURIComponent(id)}`, {
  method: 'DELETE',
});

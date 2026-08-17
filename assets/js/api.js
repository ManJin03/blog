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
export const getLatestPost = () => request('/api/latest-post').catch(() => null);
export const getGithub = () => request('/api/github');
export const getGithubContributions = (year) =>
  request(year ? `/api/github-contributions?year=${year}` : '/api/github-contributions');
export const login = (username, password) => request('/api/login', {
  method: 'POST',
  body: JSON.stringify({ username, password }),
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
export const togglePin = (id, pinned) => request(`/api/posts/${encodeURIComponent(id)}`, {
  method: 'PATCH',
  body: JSON.stringify({ pinned }),
});
export const deletePost = (id) => request(`/api/posts/${encodeURIComponent(id)}`, {
  method: 'DELETE',
});

/* ---------- 账号管理（仅管理员） ---------- */
export const getUsers = () => request('/api/users');
export const createUser = (username, password, github, role) => request('/api/users', {
  method: 'POST',
  body: JSON.stringify({ username, password, github, role }),
});
export const updateUser = (username, patch) => request(`/api/users/${encodeURIComponent(username)}`, {
  method: 'PATCH',
  body: JSON.stringify(patch),
});
export const deleteUser = (username) => request(`/api/users/${encodeURIComponent(username)}`, {
  method: 'DELETE',
});

/* ---------- 评论 ---------- */
export const createComment = (postId, content) => request(`/api/posts/${encodeURIComponent(postId)}/comments`, {
  method: 'POST',
  body: JSON.stringify({ content }),
});
export const updateComment = (postId, commentId, content) =>
  request(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
export const deleteComment = (postId, commentId) =>
  request(`/api/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    method: 'DELETE',
  });

/* ---------- 点赞 ---------- */
export const toggleLike = (postId, deviceId) => request(`/api/posts/${encodeURIComponent(postId)}/like`, {
  method: 'POST',
  body: JSON.stringify({ deviceId }),
});

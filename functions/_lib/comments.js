// 评论数据访问与内容校验：评论内嵌在帖子对象的 comments 数组中
//
// 存储结构：post:{id}.comments —— JSON 数组，按时间正序保存该帖评论
//   [{ id, content, author, authorGithub, createdAt, updatedAt }, ...]
//
// 读取帖子时（readPosts）会对旧帖自动补齐 comments: []，实现无感迁移。
// 评论上限 500 字符，与帖子共用同一套 Markdown 渲染与 #话题# 逻辑（前端处理）。

import { readPost, writePost } from './posts.js';

export const MAX_COMMENT_LEN = 500;

// 校验并规范化评论内容
export function parseComment(body) {
  const content = (typeof body?.content === 'string' ? body.content : '').trim();
  if (!content) return { error: '评论不能为空' };
  if (content.length > MAX_COMMENT_LEN) return { error: `评论不能超过 ${MAX_COMMENT_LEN} 字` };
  return { content };
}

function publicComment(c) {
  return { id: c.id, content: c.content, author: c.author, authorGithub: c.authorGithub || '', createdAt: c.createdAt, updatedAt: c.updatedAt || null };
}

// 新增评论：作者只能是普通账号（管理员禁止评论，由路由层约束）
export async function addComment(env, postId, { content, author, authorGithub }) {
  const parsed = parseComment({ content });
  if (parsed.error) return { error: parsed.error, status: 400 };
  const post = await readPost(env, postId);
  if (!post) return { error: '动态不存在', status: 404 };
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const comment = {
    id: crypto.randomUUID(),
    content: parsed.content,
    author,
    authorGithub: authorGithub || '',
    createdAt: Date.now(),
  };
  comments.push(comment);
  post.comments = comments;
  await writePost(env, post);
  return { comment: publicComment(comment) };
}

// 更新评论（作者本人或管理员）
export async function updateComment(env, postId, commentId, content) {
  const parsed = parseComment({ content });
  if (parsed.error) return { error: parsed.error, status: 400 };
  const post = await readPost(env, postId);
  if (!post) return { error: '动态不存在', status: 404 };
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) return { error: '评论不存在', status: 404 };
  comments[idx] = { ...comments[idx], content: parsed.content, updatedAt: Date.now() };
  post.comments = comments;
  await writePost(env, post);
  return { comment: publicComment(comments[idx]) };
}

// 删除评论（作者本人或管理员）
export async function deleteComment(env, postId, commentId) {
  const post = await readPost(env, postId);
  if (!post) return { error: '动态不存在', status: 404 };
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const idx = comments.findIndex((c) => c.id === commentId);
  if (idx === -1) return { error: '评论不存在', status: 404 };
  comments.splice(idx, 1);
  post.comments = comments;
  await writePost(env, post);
  return { ok: true };
}

// 按评论 id 查询，返回 { post, comment }（供权限判断复用）
export async function findComment(env, postId, commentId) {
  const post = await readPost(env, postId);
  if (!post) return null;
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const comment = comments.find((c) => c.id === commentId);
  return comment ? { post, comment } : null;
}

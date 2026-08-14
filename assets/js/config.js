// 站点配置：集中管理前端可扩展配置，改动尽量收敛在此文件
export const SITE = {
  name: 'ManJin',
  bio: '学生 · 西安交通大学大三在读',
  tags: ['C/C++', 'Linux'],
  links: {
    github: 'https://github.com/ManJin03',
    blog: 'https://tech-manjin.pages.dev/',
  },
  // 单条动态字数上限，需与 functions/_lib/posts.js 的 MAX_LEN 保持一致
  maxPostLen: 500,
};

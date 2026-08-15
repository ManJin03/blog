// 站点配置：集中管理前端可扩展配置，改动尽量收敛在此文件
export const SITE = {
  name: 'ManJin',
  handle: '@ManJin03',
  avatar: 'https://avatars.githubusercontent.com/u/199603197?v=4',
  bio: '学生 · 西安交通大学大三在读',
  status: '正在学习 Linux 内核与系统编程，折腾 Cloudflare Pages 部署',
  desc: '🎯 Focusing. 喜欢在代码与光影之间寻找秩序感，记录学习路上的点滴思考。',
  tags: ['C/C++', 'Linux', 'System', 'Open Source'],
  links: {
    github: 'https://github.com/ManJin03',
    blog: 'https://tech-manjin.pages.dev/',
    friend: 'https://homepage-afl.pages.dev/',
  },
  // 单条动态字数上限，需与 functions/_lib/posts.js 的 MAX_LEN 保持一致
  maxPostLen: 500,
  // 友情链接（显示在个人资料底部）
  friendLink: {
    name: 'Young man 的个人主页',
    url: 'https://homepage-afl.pages.dev/',
  },
  // 技术博客最新一篇文章（展示在"作品展示"与"关于我"之间；为空则显示"暂无"）
  latestPost: {
    title: 'C++ 内存模型：从原子操作到 happens-before 关系',
    url: 'https://tech-manjin.pages.dev/posts/cpp-memory-model-atomics.html',
    excerpt: '理解 std::atomic 的六种内存序，关键不在于背 API，而在于建立 happens-before 与同步关系的心智模型。',
    tags: ['C++', '并发', '内存模型', 'atomic'],
    date: '2026/07/12',
  },
  // 作品展示（GitHub 公开仓库 + 精选）
  works: [
    {
      name: 'tech-blog',
      desc: '个人技术博客：记录系统编程、Linux 与底层原理的学习笔记。',
      lang: 'JavaScript',
      langColor: '#f1e05a',
      stars: 2,
      forks: 0,
      url: 'https://github.com/ManJin03/tech-blog',
    },
    {
      name: 'manjin-blog',
      desc: '本个人主页：Cloudflare Pages + KV 驱动的微博式动态流。',
      lang: 'HTML',
      langColor: '#e34c26',
      stars: 1,
      forks: 0,
      url: 'https://github.com/ManJin03/manjin-blog',
    }
  ],
};

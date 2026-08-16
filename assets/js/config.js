// 站点配置：集中管理前端可扩展配置，改动尽量收敛在此文件
export const SITE = {
  name: 'ManJin',
  handle: '@ManJin03',
  avatar: 'https://github.com/ManJin03.png',
  fallbackAvatar: 'assets/head.jpg',
  bio: '学生 · 西安交通大学大三在读',
  status: '正在学习 C++ 与操作系统，折腾 Cloudflare Pages 部署',
  desc: '🎯 Focusing. 正在胡乱折腾代码，记录学习路上的点滴思考。',
  tags: ['C/C++', 'Linux', 'x86-64', 'git'],
  links: {
    github: 'https://github.com/ManJin03',
    blog: 'https://tech-manjin.pages.dev/',
    friend: 'https://homepage-afl.pages.dev/',
  },
  // SEO：浏览器标签页标题与站点描述
  seo: {
    title: 'ManJin 的个人主页',
    description: 'ManJin 的个人主页 —— 西安交通大学大三在读，记录日常想法与动态。',
  },
  // 邮箱（联系方式区）
  email: 'manjin_03@163.com',
  // 关于我（text 支持少量 HTML，如 <strong>；items 为要点列表）
  about: {
    text: '我是 <strong>ManJin</strong>，就读于西安交通大学，目前大三。专注于系统编程与开源实践，习惯用文字记录技术探索与日常感悟。',
    items: [
      '关注底层原理：内存、并发、操作系统',
      '日常使用 C/C++ 与 Linux 进行开发与实验',
      '持续维护个人技术博客与开源项目',
      '相信长期主义，把每一次"卡住"都当作成长机会',
    ],
  },
  // 页脚版权文案
  footer: '© 2026 ManJin · Powered by Cloudflare Pages',
  // 单条动态字数上限，需与 functions/_lib/posts.js 的 MAX_LEN 保持一致
  maxPostLen: 1000,
  // 友情链接（显示在个人资料底部）
  friendLink: {
    name: 'Young man 的个人主页',
    url: 'https://homepage-afl.pages.dev/',
  },
  // 技术博客最新一篇文章（展示在"作品展示"与"关于我"之间；为空则显示"暂无"）
  latestPost: {
    title: '前往我的技术博客',
    url: 'https://tech-manjin.pages.dev',
    excerpt: '查看更多相关内容',
    tags: [],
    date: '2026/08/15',
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

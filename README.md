# manjin

本人的个人主页：个人简介 + 微博式动态流。基于 Cloudflare Pages（静态页面 + Pages Functions）与 KV 存储，无需构建工具，无需数据库。

线上地址：<https://manjin.pages.dev/>

## 功能

- 顶部导航栏：站名、Vercount 访客计数、动态搜索、GitHub / 技术博客链接、右上角登录按钮
- 个人资料卡片：ManJin · 学生 · 西安交通大学大三在读 · C/C++ / Linux
- 微博式动态流：发帖（500 字以内，支持换行、链接、`#话题#` 高亮）、**编辑**、删除
- 检索：关键词搜索（命中高亮）+ 标签筛选（`#话题#` 自动汇总为标签）+ 时间筛选（按月），可组合使用
- 站长身份验证：密码登录，HMAC 签名的 HttpOnly Cookie 会话（7 天有效），未登录只能浏览

## 目录结构

```
├── index.html                  # 页面入口（导航栏 / 资料卡 / 发帖框 / 动态流 / 登录弹窗）
├── assets/
│   ├── css/style.css           # 样式（自动适配深色模式）
│   └── js/                     # ES Module 模块化前端
│       ├── config.js           # 站点配置（名称、链接、字数上限等），扩展先改这里
│       ├── api.js              # API 客户端（所有网络请求集中在此）
│       ├── utils.js            # 纯工具函数（转义 / 格式化 / 高亮）
│       ├── feed.js             # 动态流组件（渲染 + 编辑/删除交互）
│       └── main.js             # 应用入口（状态管理 + 各模块接线）
├── functions/                  # Cloudflare Pages Functions（后端 API）
│   ├── _lib/                   # 共享模块（不生成路由）
│   │   ├── http.js             # JSON 响应工具
│   │   ├── auth.js             # 会话签发与校验（HMAC Cookie）
│   │   └── posts.js            # 帖子数据访问与内容校验
│   └── api/                    # /api/* 接口
│       ├── _middleware.js      # 会话校验中间件
│       ├── me.js               # GET     /api/me        登录状态
│       ├── login.js            # POST    /api/login     登录 / DELETE 退出
│       ├── posts.js            # GET/POST /api/posts    列表 / 发帖
│       └── posts/[id].js       # PATCH/DELETE /api/posts/:id  编辑 / 删除
├── wrangler.toml               # Pages 配置（KV 绑定）
└── .dev.vars                   # 本地开发用环境变量（不入库）
```

## 如何扩展

- **改站点信息 / 链接**：`assets/js/config.js` 与 `index.html`（导航栏、资料卡）
- **加新的前端功能**：在 `assets/js/` 新增模块，由 `main.js` 接线；动态流相关改动集中在 `feed.js`
- **加新的后端接口**：在 `functions/api/` 下新建文件即自动生成路由，共享逻辑放 `functions/_lib/`
- **换数据存储**：只需替换 `functions/_lib/posts.js` 中的读写实现（如换 D1 / Durable Objects）

## 本地开发

```bash
npx wrangler pages dev .
```

打开 <http://localhost:8788> ，本地密码在 `.dev.vars` 中（默认 `test123456`），本地 KV 数据保存在 `.wrangler/` 目录。

> 注：Vercount 统计脚本只在 `http(s)://` 页面下计数，本地 `http://127.0.0.1` 会计入 `127.0.0.1` 域名，不影响线上数据。

## 部署到 Cloudflare Pages

1. **推送仓库**：把本仓库推送到 GitHub / GitLab。

2. **创建 KV 命名空间**：
   - 控制台：Storage & Databases → KV → Create namespace，然后在 Pages 项目 Settings → Bindings → Add → KV namespace，变量名填 `KV`

3. **创建 Pages 项目**：控制台 Workers & Pages → Create → Pages → Connect to Git，选择仓库：
   - Framework preset：None
   - Build command：留空
   - Build output directory：`/`

4. **配置环境变量**：Pages 项目 Settings → Environment variables，为 Production 和 Preview 都添加（也可用 `npx wrangler pages secret put <名称>`）：
   - `ADMIN_PASSWORD`：站长登录密码（务必使用强密码）
   - `SESSION_SECRET`：会话签名密钥，可用 `openssl rand -hex 32` 生成

5. **部署并使用**：部署完成后打开 `https://<你的域名>`，点击导航栏右侧"登录"输入密码，即可发布 / 编辑 / 删除动态。其他人只能浏览和搜索。

## 接口说明

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/me | - | 当前登录状态 |
| POST | /api/login | - | 登录（body: `{"password":"..."}`） |
| DELETE | /api/login | - | 退出登录 |
| GET | /api/posts | - | 动态列表 |
| POST | /api/posts | Cookie | 发布动态（body: `{"content":"..."}`） |
| PATCH | /api/posts/:id | Cookie | 编辑动态（body: `{"content":"..."}`） |
| DELETE | /api/posts/:id | Cookie | 删除动态 |

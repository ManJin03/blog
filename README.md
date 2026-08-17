# manjin-blog

本人的个人主页：个人简介 + 微博式动态流。基于 Cloudflare Pages（静态页面 + Pages Functions）与 KV 存储，无需构建工具，无需数据库。

线上地址：<https://manjin.pages.dev/>

## 功能

- 顶部导航栏：站名、Vercount 访客计数、动态搜索、GitHub / 技术博客链接、右上角登录按钮 / 用户头像
- 个人资料卡片：ManJin · 学生 · 西安交通大学大三在读 · C/C++ / Linux
- 微博式动态流：发帖（1000 字以内，支持 Markdown、`#话题#` 高亮）、**编辑**、删除、置顶
- 多账号系统：管理员 + 普通账号，账号密码登录（密码 PBKDF2 哈希存储，不可查询只能重置）；普通账号不可自行注册，仅管理员在后台创建/增删改查
- 评论系统：评论收进时间行右侧的气泡图标，点击展开/收起全部评论（每帖独立）；每帖可评论（500 字以内，支持 Markdown 与 `#话题#`），仅登录的普通账号可评论，管理员不可评论；作者本人与管理员可改/删评论；评论同样支持搜索与标签筛选
- 点赞：每帖点赞图标（爱心），人人可点（无需登录）、可再次点击取消；陌生人点赞记录匿名设备标识，登录账号后点赞绑定到账号；仅记录点赞数，不记录点赞者身份
- 作品展示：以最近提交（push）时间为参考排序，网格自适应窗口宽度，展示全部本人仓库
- 最新文章：首页实时拉取技术博客（tech-manjin.pages.dev）RSS 最新一篇，接口不可用时回退到本地配置
- 检索：关键词搜索（命中高亮，覆盖正文与评论）+ 标签筛选（`#话题#` 自动汇总为标签）+ 时间筛选（按月），可组合使用
- 身份验证：HMAC 签名的 HttpOnly Cookie 会话（7 天有效），令牌携带账号身份与角色，未登录只能浏览

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
│   │   ├── auth.js             # 会话签发与校验（HMAC Cookie，携带账号身份）
│   │   ├── users.js            # 账号数据访问 + PBKDF2 密码哈希 + 管理员初始化
│   │   ├── posts.js            # 帖子数据访问与内容校验（KV 结构见下文）
│   │   └── comments.js         # 评论数据访问与内容校验（内嵌于帖子）
│   └── api/                    # /api/* 接口
│       ├── _middleware.js      # 会话校验中间件（解析 user/authed/isAdmin）
│       ├── me.js               # GET     /api/me         登录状态与身份
│       ├── login.js            # POST    /api/login      账号密码登录 / DELETE 退出
│       ├── users.js            # GET/POST /api/users     账号列表 / 创建（管理员）
│       ├── users/[username].js # PATCH/DELETE /api/users/:username  改/删账号（管理员）
│       ├── latest-post.js      # GET     /api/latest-post 技术博客最新文章（代理 RSS）
│       ├── posts.js            # GET/POST /api/posts     列表 / 发帖
│       ├── posts/[id].js       # PATCH/DELETE /api/posts/:id  编辑 / 删除/置顶
│       └── posts/[id]/comments.js 及 comments/[cid].js    # 评论发/改/删
└── .dev.vars                   # 本地开发用环境变量（不入库）
```

## 如何扩展

- **改站点信息 / 链接**：`assets/js/config.js` 与 `index.html`（导航栏、资料卡）
- **加新的前端功能**：在 `assets/js/` 新增模块，由 `main.js` 接线；动态流相关改动集中在 `feed.js`
- **加新的后端接口**：在 `functions/api/` 下新建文件即自动生成路由，共享逻辑放 `functions/_lib/`
- **换数据存储**：只需替换 `functions/_lib/posts.js` 中的读写实现（如换 D1 / Durable Objects）
- **换技术博客源**：修改 `functions/api/latest-post.js` 顶部的 `BLOG_URL`（feed 路径为 `<BLOG_URL>/feed.xml`）与 `assets/js/config.js` 中的 `latestPost` 回退配置

## 本地开发

```bash
npx wrangler pages dev .
```

打开 <http://localhost:8880> ，本地密码在 `.dev.vars` 中（默认 `test123456`），本地 KV 数据保存在 `.wrangler/` 目录。端口可在 `wrangler.toml` 的 `[dev]` 表中修改，也可用 `--port` 参数临时覆盖。

> 注：Vercount 统计脚本只在 `http(s)://` 页面下计数，本地 `http://127.0.0.1` 会计入 `127.0.0.1` 域名，不影响线上数据。

## KV 存储结构

动态与账号数据存放在 KV 命名空间（绑定名 `KV`），采用"索引 + 独立键"结构：

```
posts:index          # 索引键：JSON 数组，按时间倒序存每帖元信息
                     # [{ id, createdAt, updatedAt, pinned }, ...]
post:{id}            # 每帖独立键：JSON 存完整帖子（含评论）
                     # { id, content, createdAt, updatedAt, pinned, comments: [...] }
                     # comments 每项：{ id, content, author, authorGithub, createdAt, updatedAt }

users:index          # 索引键：JSON 数组，存每账号公开信息（不含密码）
                     # [{ username, github, role, createdAt }, ...]
user:{username}      # 每账号独立键：JSON 存完整信息（含密码哈希与盐）
                     # { username, passwordHash, passwordSalt, github, role, createdAt }
```

- 索引只存元信息，帖子/账号内容按 id/username 独立存放，更新/删除单条无需整数组读写
- 旧版"全部帖子存于单个 `posts` 键"的数据会在首次读取时**自动迁移**到新结构并删除旧键，无需手动处理
- 旧帖无 `comments` 字段时，读取时自动补为 `[]`，评论功能对存量数据无感可用
- 旧版 `ADMIN_PASSWORD` 单密码方案：首次访问时自动初始化为管理员账号（用户名取 `ADMIN_USERNAME`，默认 `ManJin`），无需手动迁移
- 密码使用 PBKDF2-SHA256（10 万次迭代）+ 随机盐哈希存储，**密码不可查询、只能重置**
- 本地开发时数据位于 `.wrangler/` 目录（`miniflare` 模拟 KV）

## 部署到 Cloudflare Pages

1. **推送仓库**：把本仓库推送到 GitHub / GitLab。

2. **创建 KV 命名空间**：
   - 控制台：Storage & Databases → KV → Create namespace，然后在 Pages 项目 Settings → Bindings → Add → KV namespace，变量名填 `KV`

3. **创建 Pages 项目**：控制台 Workers & Pages → Create → Pages → Connect to Git，选择仓库：
   - Framework preset：None
   - Build command：留空
   - Build output directory：`/`

4. **配置环境变量**：Pages 项目 Settings → Environment variables，为 Production 和 Preview 都添加（也可用 `npx wrangler pages secret put <名称>`）：
   - `ADMIN_PASSWORD`：初始管理员账号密码（首次访问自动创建管理员，务必使用强密码）
   - `ADMIN_USERNAME`：初始管理员账号名（可选，默认 `ManJin`）
   - `ADMIN_GITHUB`：初始管理员的 GitHub 主页链接（可选，如 `https://github.com/ManJin03`）
   - `SESSION_SECRET`：会话签名密钥，可用 `openssl rand -hex 32` 生成

5. **部署并使用**：部署完成后打开 `https://<你的域名>`，点击导航栏右侧"登录"输入账号密码。管理员可发布 / 编辑 / 删除动态、置顶，并在登录后点击右上角头像进入"账号管理"页增删改查账号（重置密码）。普通账号登录后可评论、修改删除自己的评论，右上角显示其头像。未登录只能浏览和搜索。

## 接口说明

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/me | - | 当前登录状态与身份（username / role / github / isAdmin） |
| POST | /api/login | - | 账号密码登录（body: `{"username":"...","password":"..."}`） |
| DELETE | /api/login | - | 退出登录 |
| GET | /api/users | 管理员 | 账号列表（不含密码） |
| POST | /api/users | 管理员 | 创建账号（body: `{"username","password","github","role"}`） |
| PATCH | /api/users/:username | 管理员 | 修改账号（github / role / password 重置，密码不可查询） |
| DELETE | /api/users/:username | 管理员 | 删除账号 |
| GET | /api/latest-post | - | 技术博客最新文章（服务端代理 RSS，10 分钟缓存） |
| GET | /api/posts | - | 动态列表（含评论） |
| POST | /api/posts | 管理员 | 发布动态（body: `{"content":"..."}`） |
| PATCH | /api/posts/:id | 管理员 | 编辑动态 / 置顶（body: `{"content"}` 或 `{"pinned"}`） |
| DELETE | /api/posts/:id | 管理员 | 删除动态 |
| POST | /api/posts/:id/comments | 普通账号 | 发布评论（管理员禁止） |
| PATCH | /api/posts/:id/comments/:cid | 作者/管理员 | 修改评论 |
| DELETE | /api/posts/:id/comments/:cid | 作者/管理员 | 删除评论 |
| POST | /api/posts/:id/like | - | 点赞/取消点赞（登录账号绑定到账号；未登录 body: `{"deviceId":"..."}` 记录匿名设备，仅记录点赞数） |

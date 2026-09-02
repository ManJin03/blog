# manjin-blog

本人的个人主页：个人简介 + 微博式动态流。基于 Cloudflare Pages（静态页面 + Pages Functions）与 KV 存储，无需构建工具，无需数据库。

线上地址：<https://manjin.pages.dev/>

## 功能

- 顶部导航栏：站名、Vercount 访客计数、动态搜索、GitHub / 技术博客链接、右上角登录按钮 / 用户头像
- 个人资料卡片：ManJin · 学生 · 西安交通大学大三在读 · C/C++ / Linux
- 微博式动态流：发帖（1000 字以内，支持 Markdown、`#话题#` 高亮）、**编辑**、删除、置顶
- GitHub 登录：登录弹窗主体为"使用 GitHub 登录"，默认折叠的管理员表单只接受管理员账号密码。游客首次 GitHub 登录即自动创建普通账号，登录后可点赞、评论；管理员后台预建的账号会按 GitHub 用户名或主页链接自动关联，无需再设密码；若配置了 `ADMIN_GITHUB_LOGIN`，命中的 GitHub 账号直接用"使用 GitHub 登录"即可成为管理员
- 多账号系统：单一管理员（身份由环境变量决定：`ADMIN_USERNAME` / `ADMIN_PASSWORD` 密码登录，可选 `ADMIN_GITHUB_LOGIN` 将某个 GitHub 账号映射为管理员）+ 普通账号（无密码，登录凭据即 GitHub 身份）；管理员可对普通账号增删查改（创建/编辑时填账号名 + GitHub 主页链接）
- 评论系统：评论收进时间行右侧的气泡图标，点击展开/收起全部评论（每帖独立）；每帖可评论（500 字以内，支持 Markdown 与 `#话题#`），仅登录的普通账号可评论，管理员不可评论；未登录游客在评论区可直接点"使用 GitHub 登录"入口建号评论；作者本人与管理员可改/删评论；评论同样支持搜索与标签筛选
- 点赞：每帖点赞图标（爱心），人人可点（无需登录）、可再次点击取消；陌生人点赞记录匿名设备标识，登录账号后点赞绑定到账号；仅记录点赞数，不记录点赞者身份
- 作品展示：以最近提交（push）时间为参考排序，网格自适应窗口宽度，展示全部本人仓库
- 最新文章：首页实时拉取技术博客（tech-manjin.pages.dev）RSS 最新一篇，接口不可用时回退到本地配置
- 检索：关键词搜索（命中高亮，覆盖正文与评论）+ 标签筛选（`#话题#` 自动汇总为标签）+ 时间筛选（按月），可组合使用
- 身份验证：普通账号经 GitHub OAuth 登录（首次自动建号）；管理员走环境变量账号密码，或配置 `ADMIN_GITHUB_LOGIN` 后直接使用 GitHub 登录；会话为 HMAC 签名的 HttpOnly Cookie（7 天有效），令牌携带账号身份与角色，未登录只能浏览

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
│   │   ├── github-oauth.js     # GitHub OAuth：授权地址 / 换 token / 拉取身份 / state Cookie
│   │   ├── users.js            # 账号数据访问 + GitHub 账号匹配/自动创建 + 管理员初始化
│   │   ├── posts.js            # 帖子数据访问与内容校验（KV 结构见下文）
│   │   └── comments.js         # 评论数据访问与内容校验（内嵌于帖子）
│   └── api/                    # /api/* 接口
│       ├── _middleware.js      # 会话校验中间件（解析 user/authed/isAdmin）
│       ├── me.js               # GET     /api/me         登录状态与身份
│       ├── login.js            # POST    /api/login      管理员账号密码登录 / DELETE 退出
│       ├── login/github.js     # GET     /api/login/github           发起 GitHub 授权
│       ├── login/github/callback.js # GET /api/login/github/callback GitHub 回调（关联/建号+签发会话）
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

打开 <http://localhost:8880> ，管理员账号密码在 `.dev.vars` 中（默认 `admin` / `admin123456`）；若想本地验证"GitHub 账号映射管理员"，在 `.dev.vars` 加一行 `ADMIN_GITHUB_LOGIN=<你的 GitHub 用户名>` 即可。本地 KV 数据保存在 `.wrangler/` 目录。端口可在 `wrangler.toml` 的 `[dev]` 表中修改，也可用 `--port` 参数临时覆盖。

本地调试 GitHub 登录：`.dev.vars` 中填入 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`（本地与线上各用一个 OAuth App，回调地址不同——GitHub 一个 OAuth App 只能登记一个回调地址；本地 App 的回调地址填 `http://localhost:8880/api/login/github/callback`）。未配置时点击"使用 GitHub 登录"会得到提示页而不是跳转。

> 注：Vercount 统计脚本只在 `http(s)://` 页面下计数，本地 `http://127.0.0.1` 会计入 `127.0.0.1` 域名，不影响线上数据。

## KV 存储结构

动态与账号数据存放在 KV 命名空间（绑定名 `KV`），采用"索引 + 独立键"结构：

```
posts:index          # 索引键：JSON 数组，按时间倒序存每帖元信息
                     # [{ id, createdAt, updatedAt, pinned }, ...]
post:{id}            # 每帖独立键：JSON 存完整帖子（含评论）
                     # { id, content, createdAt, updatedAt, pinned, comments: [...] }
                     # comments 每项：{ id, content, author, authorGithub, createdAt, updatedAt }

users:index          # 索引键：JSON 数组，存每个普通账号公开信息（不含密码）
                     # [{ username, github, createdAt }, ...]
user:{username}      # 每个普通账号独立键：JSON 存完整信息（GitHub 登录建号时无密码字段）
                     # { username, github?, createdAt, passwordHash?/passwordSalt?（仅历史账号） }

# 管理员账号不写入 KV：系统只允许一个管理员，身份由环境变量决定
# ADMIN_USERNAME / ADMIN_PASSWORD（默认 admin / admin123456）密码登录；
# ADMIN_GITHUB_LOGIN 可将某 GitHub 用户名映射为管理员（OAuth 登录即管理员）
```

- 索引只存元信息，帖子/账号内容按 id/username 独立存放，更新/删除单条无需整数组读写
- 旧版"全部帖子存于单个 `posts` 键"的数据会在首次读取时**自动迁移**到新结构并删除旧键，无需手动处理
- 旧帖无 `comments` 字段时，读取时自动补为 `[]`，评论功能对存量数据无感可用
- 管理员账号：系统**只允许一个管理员**，其身份由环境变量决定（**不写入 KV**）。密码登录的账号名/密码由 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 决定（未设置则默认 `admin` / `admin123456`）；设置 `ADMIN_GITHUB_LOGIN`（GitHub 用户名）后，该 GitHub 账号走 OAuth 登录即自动成为管理员（会话 role = admin，同样不落 KV），`/api/me` 会按其主页显示 GitHub 头像；若此前该 GitHub 身份曾自动建过同名普通账号，登录时会自动清理该遗留记录（评论等数据内嵌于帖子不受影响）。修改管理员身份只能通过修改环境变量。GitHub 登录时若用户名与密码管理员账号同名且未命中 `ADMIN_GITHUB_LOGIN` 映射，会拒绝并提示走管理员密码登录
- KV 中只存储普通账号，管理员可对普通账号增删查改。普通账号登录为 GitHub OAuth：登录时按"账号名与 GitHub 用户名相同（忽略大小写）"或"账号绑定的 GitHub 主页与该用户名匹配"两种规则关联已有账号，找不到则**以 GitHub 用户名自动创建**（无密码字段）；历史账号的 PBKDF2 密码字段仅作兼容保留，不再用于登录
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
   - `ADMIN_PASSWORD`：管理员账号密码（不设置则默认 `admin123456`）
   - `ADMIN_USERNAME`：管理员账号名（可选；不设置则默认 `admin`）。管理员密码只能通过修改此环境变量来变更
   - `ADMIN_GITHUB_LOGIN`：（可选）管理员的 GitHub 用户名，如 `ManJin03`。设置后该 GitHub 账号用"使用 GitHub 登录"即可直接成为管理员（忽略大小写匹配）；不设置则 GitHub 登录只面向普通账号
   - `SESSION_SECRET`：会话签名密钥，可用 `openssl rand -hex 32` 生成
   - `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`：GitHub OAuth App 凭据（不配置则"使用 GitHub 登录"不可用，详见下方）
   - `GITHUB_REDIRECT_URI`：（可选）OAuth 回调地址，缺省自动取当前域名下的 `/api/login/github/callback`，需与 OAuth App 登记的回调地址完全一致

   > **GitHub OAuth App 配置**：在 GitHub → Settings → Developer settings → OAuth Apps → New OAuth App 中创建，Homepage URL 填 `https://<你的域名>`，Authorization callback URL 填 `https://<你的域名>/api/login/github/callback`；生成 Client secret 后填入上面的环境变量。一个 OAuth App 只能登记一个回调地址，因此**本地与线上各用一个 OAuth App**：本地 App 的回调地址填 `http://localhost:8880/api/login/github/callback`。

5. **部署并使用**：部署完成后打开 `https://<你的域名>`。游客/普通账号点击导航栏右侧"登录"，点"使用 GitHub 登录"即可建号登录（首次自动创建普通账号）；管理员展开"管理员密码登录"输入环境变量账号密码，或若配置了 `ADMIN_GITHUB_LOGIN` 直接点"使用 GitHub 登录"即可（命中后为管理员会话，右上角显示其 GitHub 头像）。管理员可发布 / 编辑 / 删除动态、置顶，点击右上角头像进入"账号管理"页对普通账号增删查改（创建/编辑时填账号名 + GitHub 主页链接，对方 GitHub 登录时自动关联）。普通账号登录后可评论、修改删除自己的评论，右上角显示其头像。未登录只能浏览、搜索与匿名点赞。

## 接口说明

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/me | - | 当前登录状态与身份（username / role / github / isAdmin） |
| GET | /api/login/github | - | 发起 GitHub OAuth（302 跳转 GitHub 授权页） |
| GET | /api/login/github/callback | - | GitHub OAuth 回调：命中 `ADMIN_GITHUB_LOGIN` 签发管理员会话；否则关联/自动创建普通账号；302 回首页（`?login=ok/cancelled/admin/failed`） |
| POST | /api/login | - | 管理员账号密码登录（body: `{"username":"...","password":"..."}`；普通账号请走 GitHub 登录） |
| DELETE | /api/login | - | 退出登录 |
| GET | /api/users | 管理员 | 普通账号列表（不含密码） |
| POST | /api/users | 管理员 | 创建普通账号（body: `{"username","github"}`；password 可选兼容字段） |
| PATCH | /api/users/:username | 管理员 | 修改普通账号（github；password 可选兼容） |
| DELETE | /api/users/:username | 管理员 | 删除普通账号 |
| GET | /api/latest-post | - | 技术博客最新文章（服务端代理 RSS，10 分钟缓存） |
| GET | /api/posts | - | 动态列表（含评论） |
| POST | /api/posts | 管理员 | 发布动态（body: `{"content":"..."}`） |
| PATCH | /api/posts/:id | 管理员 | 编辑动态 / 置顶（body: `{"content"}` 或 `{"pinned"}`） |
| DELETE | /api/posts/:id | 管理员 | 删除动态 |
| POST | /api/posts/:id/comments | 普通账号 | 发布评论（管理员禁止） |
| PATCH | /api/posts/:id/comments/:cid | 作者/管理员 | 修改评论 |
| DELETE | /api/posts/:id/comments/:cid | 作者/管理员 | 删除评论 |
| POST | /api/posts/:id/like | - | 点赞/取消点赞（登录账号绑定到账号；未登录 body: `{"deviceId":"..."}` 记录匿名设备，仅记录点赞数） |

# manjin

本人的个人主页：个人简介 + 微博式动态流。基于 Cloudflare Pages（静态页面 + Pages Functions）与 KV 存储，无需构建工具，无需数据库。

## 功能

- 个人资料卡片：ManJin · 学生 · 西安交通大学大三在读 · C/C++ / Linux
- 微博式动态流：发帖（500 字以内，支持换行、链接、`#话题#` 高亮）、删除
- 站长身份验证：密码登录，HMAC 签名的 HttpOnly Cookie 会话（7 天有效），未登录只能浏览

## 目录结构

```
├── index.html              # 页面入口
├── assets/                 # 样式与前端脚本
├── functions/              # Cloudflare Pages Functions（后端 API）
│   ├── _lib/               # 共享模块（不生成路由）
│   └── api/                # /api/* 接口
│       ├── _middleware.js  # 会话校验中间件
│       ├── me.js           # GET    /api/me       登录状态
│       ├── login.js        # POST   /api/login    登录 / DELETE 退出
│       ├── posts.js        # GET/POST /api/posts  列表 / 发帖
│       └── posts/[id].js   # DELETE /api/posts/:id 删帖
├── wrangler.toml           # Pages 配置（KV 绑定）
└── .dev.vars               # 本地开发用环境变量（不入库）
```

## 本地开发

```bash
npx wrangler pages dev .
```

打开 http://localhost:8788 ，本地密码在 `.dev.vars` 中（默认 `test123456`），本地 KV 数据保存在 `.wrangler/` 目录。

## 部署到 Cloudflare Pages

1. **推送仓库**：把本仓库推送到 GitHub / GitLab。

2. **创建 KV 命名空间**（二选一）：
   - 命令行：`npx wrangler kv namespace create BLOG_KV`，把输出的 id 填入 `wrangler.toml`；
   - 或控制台：Storage & Databases → KV → Create namespace，然后在 Pages 项目 Settings → Bindings → Add → KV namespace，变量名填 `KV`（若用控制台绑定，可删除 `wrangler.toml` 中的 `[[kv_namespaces]]` 段）。

3. **创建 Pages 项目**：控制台 Workers & Pages → Create → Pages → Connect to Git，选择仓库：
   - Framework preset：None
   - Build command：留空
   - Build output directory：`/`

4. **配置环境变量**：Pages 项目 Settings → Environment variables，为 Production 和 Preview 都添加（也可用 `npx wrangler pages secret put <名称>`）：
   - `ADMIN_PASSWORD`：站长登录密码（务必使用强密码）
   - `SESSION_SECRET`：会话签名密钥，可用 `openssl rand -hex 32` 生成

5. **部署并使用**：部署完成后打开 `https://<项目名>.pages.dev`，点击右上角"登录"输入密码，即可发布 / 删除动态。其他人只能浏览。

## 接口说明

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | /api/me | - | 当前登录状态 |
| POST | /api/login | - | 登录（body: `{"password":"..."}`） |
| DELETE | /api/login | - | 退出登录 |
| GET | /api/posts | - | 动态列表 |
| POST | /api/posts | Cookie | 发布动态（body: `{"content":"..."}`） |
| DELETE | /api/posts/:id | Cookie | 删除动态 |

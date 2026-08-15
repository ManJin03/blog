# 提供wrangler模板

```toml
name = "manjin-home"
compatibility_date = "2025-06-01"
pages_build_output_dir = "."

# 本地开发服务器配置（wrangler pages dev）
[dev]
port = 8880

# KV 存储绑定：用于保存动态数据
# 部署前请先创建 KV 命名空间，并把下面的 id 替换为真实值：
#   npx wrangler kv namespace create BLOG_KV
#   （或在 Cloudflare 控制台：Storage & Databases → KV → Create namespace）
[[kv_namespaces]]
binding = "KV"
id = "REPLACE_WITH_YOUR_KV_NAMESPACE_ID"
```
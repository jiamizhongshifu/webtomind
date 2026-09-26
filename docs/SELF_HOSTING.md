# 自托管指南

本文说明如何在自己的 Supabase 和 Cloudflare 账号上运行 WebToMind。开源版的所有账号相关值都是占位符，部署前必须替换。

## 1. 准备

- Node.js 24（`.node-version`）与 pnpm 8.15.0
- 一个 Supabase 项目（PostgreSQL + Auth + Storage）
- 一个 Cloudflare 账号（Workers、Queues、R2、KV、Hyperdrive；Images 和 Browser Run 为可选）
- 至少一个图像模型服务的 API Key（配置项见 `.env.example`）

```bash
pnpm runtime:check
pnpm install --frozen-lockfile
```

## 2. 数据库

1. 在 Supabase 项目中按文件名顺序执行 `supabase/migrations/` 下的迁移，例如使用 Supabase CLI：`supabase link` 后运行 `supabase db push`。
2. `server/migrations/` 是早期迁移目录，部分表（如 `image_generation_tasks`）最早在这里创建。全新部署时请先检查 `supabase/migrations/` 是否已覆盖你需要的表，缺失的再从 `server/migrations/` 补齐。
3. 迁移会创建 RLS 策略与 `SECURITY DEFINER` 函数（积分、API 钱包、任务租约等），只应由 service role 调用的函数已收回 `anon` / `authenticated` 的执行权限。

## 3. 环境变量

```bash
cp .env.example .env.local
cp server/.env.example server/.env
```

最少需要：

| 变量 | 用途 |
| --- | --- |
| `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` | 前端登录与公开数据读取 |
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | 服务端写入积分、任务、订单（只能放在服务端，不能暴露给前端） |
| 图像模型服务的 Key 与 Base URL | 见 `.env.example` 中 `TUZI_*`、`OPENAI_IMAGE_*` 等 |

管理后台没有内置管理员：用 `PROMPT_CASE_ADMIN_EMAILS`（逗号分隔）指定管理员邮箱；API 市场管理员是 `src/shared/api-marketplace.ts` 中的 `API_MARKETPLACE_ADMIN_EMAIL`。两者都按邮箱授权，请在 Supabase Auth 中保持“邮箱确认”开启，否则任何人都能用管理员邮箱注册。

支付（`STRIPE_*`、`ZPAY_*`）、邮件（`RESEND_API_KEY`）、定时任务鉴权（`CRON_SECRET`）、API 市场中继（`API_MARKETPLACE_*`）按需配置。服务端变量的完整列表可以在 `workers/webtomind.wrangler.toml` 的 `[vars]` 和各处 `process.env.*` 引用中找到。

## 4. 本地运行

```bash
pnpm dev:web      # 只启动前端，适合 UI 开发
pnpm dev          # 本地 Cloudflare Worker（默认端口 4173），接入真实 Supabase 与模型服务
```

`pnpm dev` 会从 `.env.local`、`server/.env` 和 `WEBTOMIND_ENV_FILE` 指向的文件生成 `workers/.dev.vars`。登录后的生成、支付等操作会调用真实服务，可能产生费用。

## 5. 部署到 Cloudflare

1. 修改 `workers/webtomind.wrangler.toml`：
   - `account_id` 与各资源 `id`（KV、Hyperdrive）改成你账号里创建的值；
   - `name`、Queue 名称、R2 bucket 名称改成你自己的；
   - `[vars]` 里 AI Gateway 等地址中的 `<your-cloudflare-account-id>` 替换为你的账号 ID。
2. 部署脚本 `scripts/deploy-cloudflare-worker.mjs` 通过 `--route` 参数绑定域名，`package.json` 中 `cf:deploy:routes:raw` 默认写的是托管站点的域名，请改成你自己的域名。
3. 生产环境变量放在 `~/.config/webtomind/runtime-production.env`（或用 `WEBTOMIND_RUNTIME_ENV_FILE` 指定路径），`pnpm build:web:prod-parity` 等命令会读取它；Worker 的密钥用 `wrangler secret put` 写入。
4. 代码中有少量托管站点专用的配置（域名 `webtomind.com`、统计脚本、SEO 路由等），部署自己的实例时请搜索并替换为自己的品牌与域名。

## 6. 后台任务

`workers/webtomind.wrangler.toml` 中的 Cron 会定时执行：

- 图片 / 视频任务队列兜底消费（每分钟）；
- API 钱包过期预留回收与结算重试、生成退款失败告警、结账召回与营销邮件（每 10 分钟）；
- 每日与每月的积分和营销任务。

告警邮件发往 `src/shared/api-marketplace.ts` 中的 `API_MARKETPLACE_ADMIN_EMAIL`。开源版在生产构建中默认为空（示例地址只在测试中使用），请改成你自己的地址。

## 7. 验证

```bash
pnpm lint
pnpm type-check:all
pnpm test:unit
pnpm test:release-integrity
pnpm check:api-marketplace-migrations
```

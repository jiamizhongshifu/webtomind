# WebToMind

面向内容创作者和开发者的 AI 创作平台，包含两条业务线：

- **商业视觉创作**：参考图 → Prompt 配方 → 图片/视频生成 → 历史与图库 → 情绪板与再创作 → 导出。
- **开发者 API**：模型目录与价格 → API Key 与账户钱包 → OpenAI 兼容网关调用 → 用量与结算记录。

本仓库是 [webtomind.com](https://webtomind.com) 的开源版本，使用 [AGPL-3.0](./LICENSE) 许可证。

> English summary: WebToMind is an AI creation platform (image/video generation workspace plus an OpenAI-compatible API gateway with a prepaid wallet), running on Cloudflare Workers and Supabase. Licensed under AGPL-3.0.

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite 7、React Router 7、Tailwind CSS、Radix UI、Zustand、TanStack Query |
| 边缘运行 | Cloudflare Workers（静态资源、API 路由、Queues、Cron、R2、KV、Hyperdrive） |
| 数据 | Supabase（PostgreSQL + Auth + Storage），迁移位于 `supabase/migrations/` |
| 本地图像推理 | `onnxruntime-web` + Web Worker |
| 支付 | Stripe、ZPAY（可选） |

## 目录结构

| 目录 | 说明 |
| --- | --- |
| `src/web/` | Web 应用：首页、创作台、图库、API 控制台等页面 |
| `src/workspace/` | 早期知识工作台（兼容维护，不再扩展） |
| `src/shared/` | 前后端共享的类型与工具 |
| `api/` | 业务处理器，由 Worker 显式路由调用 |
| `workers/webtomind.ts` | Cloudflare Worker 入口：路由表、Queue 消费者、Cron |
| `server/` | Hono 服务，用于本地开发和部分共享模块 |
| `supabase/migrations/` | 数据库结构、RLS 与账本函数 |
| `scripts/` | 构建、发布门禁、素材处理等脚本 |
| `infra/watermarks-remover/` | 图像修复容器 |

## 快速开始

需要 Node.js 24（见 `.node-version`）和 pnpm 8.15。

```bash
pnpm install --frozen-lockfile
cp .env.example .env.local        # 填入自己的 Supabase 与模型服务配置
pnpm dev:web                      # 仅启动前端
```

完整的本地 Worker 环境、数据库初始化和 Cloudflare 部署步骤见 [docs/SELF_HOSTING.md](./docs/SELF_HOSTING.md)。

## 开发与测试

```bash
pnpm lint
pnpm type-check:all
pnpm test:unit                    # Vitest 单元测试
pnpm test:release-integrity       # 发布门禁脚本测试
pnpm check:api-marketplace-migrations
```

API 钱包账本（`src/__tests__/api-marketplace-ledger-sql.test.ts`）会在进程内的 PGlite 中执行真实迁移，不需要外部数据库。

## 开源版与托管版的差异

为保护第三方权益和个人信息，开源版做了以下处理：

- 不包含第三方平台的发现页与情绪板数据集，相关 feed 为空，需要自行填充有授权的素材；
- 不包含 Prompt 素材的原始生产文件、带第三方商标的案例图、站点验证与广告配置；
- 不包含托管站点的 SEO/增长运营脚本、第三方内容导入脚本，以及已下线的 NotebookLM 自动化；
- 联系方式、统计 ID、Cloudflare 账号与资源 ID 已替换为占位符，部署前需要改成你自己的值。

## 参与贡献

欢迎提交 Issue 和 Pull Request，请先阅读 [CONTRIBUTING.md](./CONTRIBUTING.md)。安全问题请按 [SECURITY.md](./SECURITY.md) 私下报告，不要公开提交 Issue。

## 许可证

代码以 [GNU Affero General Public License v3.0](./LICENSE) 发布。如果你修改本项目并通过网络向他人提供服务，AGPL 要求你向这些用户提供修改后的完整源代码。

“WebToMind”名称和标识不在许可证授权范围内，部署自己的实例时请使用自己的品牌，详见 [NOTICE](./NOTICE)。

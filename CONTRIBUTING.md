# 参与贡献

感谢你愿意改进 WebToMind。提交代码即表示你同意以 [AGPL-3.0](./LICENSE) 许可证发布你的贡献。

## 开发环境

```bash
pnpm runtime:check              # 需要 Node 24（.node-version）
pnpm install --frozen-lockfile
pnpm dev:web
```

## 提交前检查

```bash
pnpm lint
pnpm type-check:all
pnpm test:unit
pnpm test:release-integrity
```

修改 `supabase/migrations/` 中 API 市场相关迁移时，还需要运行 `pnpm check:api-marketplace-migrations`。

## 代码约定

- 文件名 `kebab-case.ts`，React 组件 `PascalCase.tsx`，变量与函数 `camelCase`，常量 `UPPER_SNAKE_CASE`。
- 不使用 `any`；导出函数写明返回类型。
- 新增生产 API 放在 `api/` 下，提供 Fetch 兼容的处理器，并在 `workers/webtomind.ts` 路由表中显式注册。
- 涉及积分、钱包、订单、退款的改动必须幂等，并附带测试；账本 SQL 的行为用 PGlite 测试覆盖（参考 `src/__tests__/api-marketplace-ledger-sql.test.ts`）。
- 数据库变更只新增迁移文件，不修改已发布的迁移。
- UI 改动请在桌面（1440px、1024–1280px）和移动端（约 390px）检查，包括弹窗、菜单、空/错/加载等状态。

## Pull Request

- 一个 PR 只解决一件事，说明动机、改动和验证方式。
- 修复 bug 时，最好附一个修复前失败、修复后通过的测试。
- 不要提交 `.env`、密钥、个人数据，或没有再分发授权的图片与数据集。

## 报告问题

普通问题和建议请提交 Issue。安全漏洞请按 [SECURITY.md](./SECURITY.md) 私下报告。

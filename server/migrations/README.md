# server/migrations 说明

本目录**不是**独立的迁移真源。数据库迁移的唯一真源是
[`supabase/migrations/`](../../supabase/migrations/)（时间戳命名）。

本目录保留两类历史文件，用途如下：

1. **`001_*` ～ `095_*`**：历史快照。WebToMind 早期使用 Supabase CLI
   编号迁移，之后迁移到时间戳命名。这些文件仅作历史存档，不再被任何
   runner 或脚本引用，**请勿在此新增迁移**。

2. **`096_*` ～ `099_*`**：关键迁移的镜像副本。这四个文件是
   `supabase/migrations/` 中定价与安全迁移的逐字节镜像，供
   [`scripts/business-guardrails.mjs`](../../scripts/business-guardrails.mjs)
   做交叉校验（`validateSafetyMigrationMirrors` 要求精确一致，防止定价/权益
   迁移被单边篡改）。

## 规则

- 新增数据库迁移：一律写入 `supabase/migrations/`（时间戳命名）。
- 若迁移涉及定价/积分/权益等业务护栏管制的数值，需同步更新
  `server/migrations/` 对应镜像文件，并保证与 supabase 版本逐字节一致；
  否则 `pnpm business:guardrails` 会拦截发布。
- 不要在本目录新增 `100_*` 及以后的编号迁移。

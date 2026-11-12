# 项目审查与修复记录 · 2026-11-11

## 结论

本次完成全仓文件清点、引用与风险扫描、主要业务链路审查，并修复了能在本地确认的问题。**当前不能发布**：生产依赖安全门禁仍失败；Worker 请求环境存在已复现的并发问题，需要专项改造。

已有商城、支付、SEO 等未提交改动保留。本次没有提交、推送、部署、修改生产数据库，也没有发起真实支付或付费模型生成。

## 已修复

| 编号 | 问题与影响 | 本次处理与验证 |
| --- | --- | --- |
| F1 | 开发 CORS 用字符串包含判断；`localhost.evil.test` 等域名会被反射 | 新增纯函数 `server/src/utils/cors-origin.ts`，统一修复 API 公共鉴权、旧路由、PPT、debug 和 server API 共 9 处调用。仅允许实际 HTTP/HTTPS loopback origin；补 localhost、IPv4、IPv6、伪造域名与生产模式测试。 |
| F2 | 远程资源 URL 校验可被末尾点、IPv4-mapped IPv6、部分 IPv6 link-local 写法绕过 | 修复 `api/utils/safe-remote-url.ts`；同时修复本地 URL 提取器的 IPv6 方括号、内部域名后缀和 URL 用户信息校验。新增拒绝用例并保留合法公网 URL 用例。DNS 层残余风险见 R3。 |
| F3 | Redis 限流每次请求都刷新过期时间，持续重试可能一直被限流；两个内存实现到期边界不一致 | 使用原子 `multi-exec` 的 `INCR + PEXPIRE NX`，验证两个命令的返回，错误时沿用既有内存回退；窗口使用 `>=` 到期。回归测试模拟 Redis 命令语义、被限流重试与精确到期边界。 |
| F4 | 每次 API JWT 缓存命中都遍历全部 token，且缓存没有容量上限 | `api/utils/auth.ts` 改为最多 1000 项 LRU，容量满时才清理过期项。测试验证淘汰及 JWT 到期，未延长原有 5 分钟缓存期限。此为算法与容量修复，未声称生产延迟已降低。 |
| F5 | CLI 把 PAX 的字节长度当字符串字符数，中文文件名后跟元数据时路径被截错；损坏 tar 头未校验 | `packages/webtomind-cli/src/tar.mjs` 按字节读取 PAX，拒绝错误记录、非法数值及校验和不一致的 tar 头。覆盖中文路径、后续元数据、损坏包及已有正常安装流程。 |
| F6 | 重置 AI 配置只删除存储，内存中继续保留旧配置最多 5 分钟 | `ConfigManager.resetConfig()` 同时失效缓存；回归测试验证重置后立即读取默认值。 |
| F7 | server 编译成功但 start 入口不存在，修正入口后又因 ESM 目录导入失败；静态文件目录及路由不完整 | start/main 指向真实 `dist/src/index.js`；修复 server 源码的相对 ESM 扩展名；统一定位 `server/public`，服务所有公开静态资源。未知资源及 API 返回 404。实测健康检查、首页、深链接、图标、robots、service worker、JS MIME 与 404。另停止在日志输出完整代理 URL，避免携带代理凭据。Docker 独立路径见 R4。 |
| F8 | 商品接口返回 HTTP 200 但顶层数据结构不完整时，页面可能因 `.find` 访问 undefined 崩溃 | `useSkillCommerce` 校验 products/access 顶层结构，转为现有不可用与重试状态；4 个 hook 用例、1440/390 浏览器异常与恢复检查通过。此处不是全字段商品 schema 校验。 |
| F9 | 依赖扫描读取 Git 索引中的已删除文件报 ENOENT，并遗漏未追踪的新代码及 apps/packages | 扫描当前工作树中的 cached + others，忽略已删除项，覆盖 workspace 子包；新增真实临时 Git 工作树回归测试。既有 image-size 豁免文案更新，不再错误声称“没有修复版本”。 |
| F10 | 5 组脚本测试、13 个媒体存储测试未被常规门禁执行；利用率测试随真实日期失效 | 将脚本测试接入已有 CI 调用的 npm scripts，将 API 测试加入根 Vitest include；利用率计算支持注入 now，测试使用固定时间，不改默认生产取时行为。 |
| F11 | 设计系统浏览器脚本仍依赖旧首页选择器，商品模拟数据也不符合新契约 | 对齐当前首页两个 CTA 和动画容器，补合法的商品模拟响应；保留原有焦点、键盘、主题、布局断言。8 组浏览器检查通过。 |
| F12 | 7 个依赖存在可直接升级的已知安全问题 | 更新 DOMPurify、Hono、@hono/node-server、undici、fast-uri、ip-address、qs 及 lockfile；详见下表。剩余依赖见 R2。 |
| F13 | 旧 Skill 页面无引用；pytest 配置仅剩不存在插件的选项 | 将 `PublicSkillsPage.tsx`、`PublicSkillDetailPage.tsx` 和 `pytest.ini` 移入废纸篓。实际 Skill 路由已使用新页面，仓库无 glob 自动导入；Python 4 个测试不再产生该配置警告。 |

### 已更新依赖（实际锁定版本）

| 依赖 | 修改前 | 修改后 |
| --- | --- | --- |
| dompurify | 3.4.13 | 3.4.17 |
| hono | 4.13.7 | 4.13.17 |
| @hono/node-server | 2.0.11 | 2.1.3 |
| undici | 7.29.1 | 7.30.1 |
| fast-uri | 3.1.8 | 3.1.9 |
| ip-address | 10.7.1 | 10.7.4 |
| qs | 6.16.0 | 6.16.1 |

DOMPurify、Hono 修复版本已与 [DOMPurify 公告](https://github.com/advisories/GHSA-cg2g-xh64-v4q7)、[Hono 公告](https://github.com/advisories/GHSA-5r4p-p66f-jhc7) 核对。限流命令语义参考 [Upstash 原子事务](https://upstash.com/docs/redis/features/restapi#transactions) 和 [Redis PEXPIRE](https://redis.io/docs/latest/commands/pexpire/)。

## 待审清单

优先级：P1 为发布前应解决的风险，P2 为可靠性、维护或性能问题，P3 为清理选择。这里区分“已确认问题”与“需要更多环境证据的风险”，没有把源代码推断写成线上事故。

### R1 · P1 · Worker 请求环境在异步并发中互相干扰（已复现）

- 位置：`workers/webtomind.ts:1421` 的 `withRuntimeEnv`，尤其是 1446/1452 附近对全局 `processLike.env` 的替换和恢复；Images/R2 binding 也采用同一模式。
- 隔离复现：从当前源码提取该函数，启动 A、B 两个受控异步调用。A 先结束后，B 本应读取 `B`，实际得到空值；两者结束后，全局反而残留 `A`。使用假环境对象，没有请求生产服务。
- 影响：在同 isolate 交错请求或后台任务中，代码可能读到缺失或过期配置；尚未证明生产发生过凭据串用或用户数据泄漏。
- 建议审阅的改造：引入请求级配置上下文，逐步消除 handler 和全局单例对临时 `process.env` 的依赖；对 HTTP、Queue、Cron、`waitUntil` 分别做并发回归。不要用串行锁遮盖问题，它会让长请求阻塞其他用户。
- 本次未改原因：涉及大量 handler、单例和 Worker 生命周期，局部修补不能保证语义正确。

### R2 · P1 · 剩余安全依赖阻止发布（扫描确认，具体可利用性未全部验证）

更新前 `pnpm audit --prod` metadata：1 critical / 15 high / 16 moderate / 5 low。
更新后：**0 critical / 10 high / 6 moderate / 0 low**。这是依赖公告统计，不等于本应用有同等数量可利用的漏洞。

| 剩余依赖 | 已安装版本 | 公告修复版本 | 建议与待审取舍 |
| --- | --- | --- | --- |
| @modelcontextprotocol/sdk | 1.31.0 | >=1.32.0 | 与 open-agent-sdk 的 MCP 工具调用、授权、传输一起升级验收。 |
| @modelcontextprotocol/client | 2.2.0 | >=2.3.0 | 和 core 及 OpenAI agents 依赖对齐，验证 OAuth/重定向行为。 |
| zod | 3.25.76、4.4.3 | >=4.6.6 | 4.x 链可升级；3.x 来自 open-agent-sdk 与 zod-to-json-schema，不能全局强制换成 4.x。优先升级上游包。 |
| body-parser | 2.3.0 | >=2.4.0 | 随 MCP/Express 依赖链一起更新和验收请求体限制。 |
| seroval | 1.6.3 | >=1.6.11 | 位于 Toolcraft/TanStack 依赖链；建议按模板契约单独升级并跑模板浏览器完整验收。 |
| satori | 0.29.0 | >=0.33.5 | @vercel/og 的依赖；0.x 跨次版本升级需验证 OG/SVG 渲染输出。 |
| image-size | 1.2.1 | >=2.0.3 | 来自 pptxgenjs 4.0.1；保留原有两个“调用点已注释、无直接调用”豁免，未新增豁免。2.x 替换需兼容检查。 |

本次没有以扩充豁免或降低审计级别让门禁变绿。全部公告 ID、链接与安装版本保存在证据目录的 `dependencies-after.json`。Zod 的跨大版本边界见 [公告](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)。

### R3 · P1 · SSRF 防护还没有形成 DNS/连接层闭环（风险，未做内网请求验证）

- 位置：`api/utils/safe-remote-url.ts` 主要按主机名/字面 IP 判断；`server/src/utils/url-validator.ts:164` 只做一次 DNS lookup，解析失败后仍放行，实际 fetch 会再解析。
- 本次已修掉字面地址绕过，但域名解析到私网、多地址解析、DNS rebinding 及底层出站策略仍需统一设计。Node 与 Worker 的解析/网络能力不同。
- 建议：确定远程媒体是否可限定供应商域名；若必须抓取任意公网域名，使用可约束最终连接目标的出站代理或对应平台能力，并为重定向每一跳做相同约束。
- 待审：选择“已知媒体域名白名单”还是“任意公网 URL”。前者可能改变现有产品输入范围，本次没有擅自收紧。

### R4 · P2 · Docker 路线已经与当前项目不一致（源码确认，未构建镜像）

- `server/Dockerfile:2/21` 使用 Node 20，项目明确要求 Node 24。
- Dockerfile 使用 `npm ci`，仓库使用 pnpm workspace 且 server 没有 package-lock；README 又明确禁止在子目录使用 npm install。
- Docker CMD 仍指向 `dist/index.js`，真实产物为 `dist/src/index.js`；构建上下文和静态站点产物也未覆盖完整 workspace。
- 建议：若只支持当前 Cloudflare 生产路线，退休这份 Docker 部署说明及镜像文件；若需保留自托管 Node 容器，则以根 workspace 构建上下文重写并做实际 Docker 验收。

### R5 · P2 · 退役 NotebookLM 与旧 Agent 代码仍参与本地后端（源码确认）

- Worker 在 `workers/webtomind.ts:4411` 对 NotebookLM 返回 410，并明确标记 retired。
- `server/src/tools/index.ts` 仍注册 notebooklm_process/status/health，`server/src/skills/built-in-skills.ts` 仍注入 NotebookLM skill；README 宣称不包含已下线的自动化。
- 建议：确认本地 Node 后端是否还要保留此能力。若已完全退役，成组删除注册、服务、工具、旧测试和描述；不要只删文件，否则会再次破坏启动链。

### R6 · P2 · 商品列表全量拉取版本并反复扫描（源码确认，规模影响待测）

- `api/membership/skill-products.ts:54` 拉取全部已发布版本，随后对每个 Skill 做 `.some`，产品映射中再次扫描；当前实现随历史版本积累增加查询量和 O(S×V) 比较。
- 查询没有显式分页，也没有只取 `latest_version_id` 集合；在服务端行数上限下，可能把实际上架商品误判为不可安装。未读取生产总量和 API 行数配置，不能断言当前已经漏商品。
- 建议：用当前商品涉及的 Skill 集合限定查询，只取对应 latest version，并用 Map/Set 匹配；需覆盖超过单页的数据库夹具和当前商品/权益规则。

### R7 · P2 · 大文件与重型 bundle 需要按实际入口做性能拆分（构建确认，用户体验未测）

- `ImageCreatePage.tsx` 约 6589 行，`api/image/generate.ts` 约 6487 行，`PromptCasesPanel.tsx` 约 6111 行，Worker 约 5154 行。
- 主站构建存在约 1056 kB 的单块；Toolcraft 模板 JS 约 1640 kB，gzip 约 435 kB。部分图像/编辑器/播放依赖也是大块。
- 这些是单块体积，**不能当成首页首屏下载量或真实卡顿证据**。主站已使用路由 lazy 和 manualChunks。
- 建议先记录首页、创作台、移动端编辑器的网络瀑布和 CPU profile，再决定按工具或功能拆分。此次没有进行大规模重构或删除依赖。

### R8 · P2 · Toolcraft 在 workspace 中，但根 CI 没有覆盖其独立验证门禁

- 根 CI 运行主站 lint/type-check/build/unit；主站 Vitest 的 include 不包含 apps，模板 runtime 也在根 eslintignore 中。
- 本次额外运行了模板的 12 个脚本测试、217 个单元测试与构建，均通过；未执行模板的完整 browser/performance/ai 技能门禁。
- 建议确认模板是否属于正式维护交付范围。若是，增加按路径触发的独立 CI；若仅为参考源，明确维护边界，避免把根 CI 通过理解为模板已验收。

### R9 · P3 · 仍有可清理的孤立页面和一次性修补脚本

- `src/web/pages/AiMarksRemoverPage.tsx` 未发现静态或动态引用；相关 API/工具其他部分仍存在。待确认是计划重新接入，还是可删除的旧 UI。
- `scripts/fix_ext.py` 等一次性脚本仍指向已不存在的 `src/content/extractors/`；`fix_cors.py` 会从当前目录递归改写源码。它们没有正常开发/CI 调用证据。
- 建议一次性确认这组历史脚本的保留范围，归档或删除；不再作为修复工具执行。本次未运行这些脚本。

### R10 · P3 · 两个本地符号链接已经失效

`.agents`、`.artifacts` 仍指向迁移前的归档目录，当前目标不存在。未能确定正确替代目录，因此未修改。建议确认需要重新链接还是删除入口；它们不在 Git 跟踪文件中。

## 验证与证据边界

运行环境：Node 24.14.0（项目 `.node-version`），pnpm 8.15.0。没有使用本机默认 Node 22 做项目验证。

| 检查 | 结果 |
| --- | --- |
| 完整根 Vitest（最终状态） | 457 个文件通过、2 个文件跳过；3048 项通过、4 项跳过 |
| 类型检查 | frontend/API/server 全部通过 |
| ESLint | 通过 |
| 主站生产构建、发布 manifest | 通过；7 个 source/artifact 合约；有大块体积告警 |
| Node server 构建及 HTTP 冒烟 | 通过；真实启动与静态 MIME/404 已检查 |
| release-integrity 脚本 | 88 通过 |
| analytics 脚本 | 17 通过 |
| dependency-audit 自身测试 | 10 通过 |
| 媒体存储独立测试 | 13 通过，并已纳入根测试发现范围 |
| Toolcraft 独立测试/构建 | 12 个脚本测试、217 个单元测试通过；构建通过，有体积告警 |
| Python 图像修复测试 | 4 通过，清理配置后无上述 warning |
| 浏览器 | 1440/430/390/360 × light/dark 共 8 组通过；另有 1440/390 商品异常及重试恢复通过；已查看桌面和手机截图 |
| 源码合约、迁移审计、设计系统/治理检查 | 本地通过；设计系统部分为报告模式，不意味着所有视觉差异为零 |
| tracked-secrets 扫描 | 主站构建时通过 |
| 生产依赖安全门禁 | **未通过**，见 R2 |
| CI / 部署 / 线上验收 | 本次均未执行，不能用本地结果代替 |

浏览器使用本地模拟身份、目录与账单数据；不构成真实登录、支付、退款、商品交付或模型质量验收。4 个有外部环境条件的测试仍跳过。

证据位于 `output/project-audit-2026-11-11/`（被 Git 忽略）：浏览器截图与 results、商品异常恢复、server HTTP 响应汇总、Worker 并发探针结果、安全依赖前后对比，以及最终检查日志。原始日志中的正常失败分支模拟会打印 error/warn，以测试汇总为准。

## 覆盖范围

全仓清点约 3302 个文件，文本代码/配置/文档约 68 万行（不含 node_modules、构建产物；部分为模板、测试和生成数据）。进行了全仓引用/危险模式/入口/脚本/测试发现扫描，并沿前端路由与状态、API 鉴权、支付/权益、CLI 安装、Worker 环境与缓存、server 启动、迁移和发布门禁读取关键实现。

这是全仓扫描与关键路径深入审查，**不是对约 68 万行逐行无遗漏的保证**。未逐页验收全部工具、未逐条运行全部历史迁移、未做生产并发压测、实际支付、外部模型、完整容器镜像和全部 E2E 验收。长文件和遗留功能的进一步整理按上述具体清单决策。

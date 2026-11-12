# 首批 Skill 包交付验收

日期：2026-10-20。衔接 [交易首轮实施](SKILL_COMMERCE_IMPLEMENTATION_2026-10-20.md)。

## 本轮完成

5 个免费包和 1 个付费包已更新到 `1.0.2`，仍保持 `review`。每包补入 `LICENSE.md` 与 `DEPENDENCIES.md`，说明商业成品、可编辑交付、本地保留版本、订阅到期、单品更新、禁止转售原包、依赖安装和模型费用边界。历史案例版本记录未改写。

| Skill | 档位 | 当前归档包实际渲染 |
| --- | --- | --- |
| `xhs-cover-note` | 免费 | 1 张 1080×1440 PNG |
| `og-image` | 免费 | 1 张 1200×630 PNG |
| `weekly-report-deck` | 免费 | 7 张 1920×1080 PNG + PDF |
| `waitlist-page` | 免费 | 当前概念页 HTML + 桌面/手机预览 |
| `kinetic-typography-short` | 免费 | 1080×1920、14.4 秒、无音轨 MP4 |
| `xhs-carousel` | 付费 | 7 张 1080×1440 PNG + 输入与逐页 HTML |

共 18 张 PNG、1 份 PDF、1 条无声视频。视频是商品本身的竖版输出；宣传包装仍遵守英文、16:9、无口播的约定。

## 实际发现与修复

隔离安装后，渲染器无法从用户项目加载 Playwright：`require.resolve` 找到 CommonJS 入口，动态导入时实际运行对象位于 `default`，原代码只在内容仓库内的 ESM 依赖解析路径成功。已修复共享渲染器，并按内容仓库的共享机制同步到 30 个包；其余 24 个仍未获发布验收，发布前须独立更新版本及补齐交付材料。

候补页默认模板中的虚构等候人数和营收损失说法已移除，并标为概念演示。CLI README 的安装示例改为真实首发 slug；npm 包补入原仓库 AGPL 许可证，CLI 授权与付费内容授权分开说明。

发布工具 dry-run 和 apply 都检查包内完整许可及依赖文件；缺失时直接阻止。这个检查只证明文件存在且非空壳，不替代许可证内容或来源权利审阅。

## 验证范围

- 30/30 包通过自动隐私扫描；首发 6/6 通过要求真实案例与交付文档的结构检查，0 错误、0 警告。
- 全部 30 包的普通结构检查为 0 错误、71 警告；非首发包缺案例、许可或依赖说明，不能把结构通过当成可销售。
- 从真实确定性归档包出发，使用 CLI 安装实现写入全新隔离的 Codex 和 Claude Code 目录，共 12 次安装；再次安装返回 unchanged；篡改字节被哈希校验拒绝。
- 在独立临时项目显式安装 Playwright 1.58.2，然后从安装后的包调用渲染器；Node 24.14.0、macOS。系统浏览器和 FFmpeg 使用本机已装版本，因此不是全新操作系统或 Windows 验收。
- 对当前模板应用历史案例文案重新渲染；候补页使用当前默认概念模板。没有改写旧案例来冒充新 Agent 实跑。图片尺寸、文件数量、无溢出日志、视频时长/无音轨均检查；查看了成品缩略图及代表性完整图片/视频帧。没有新增独立 Agent 发现测试。
- 发布工具/隐私检测器回归 14 项通过；CLI Vitest 12 项通过。
- CLI `npm pack` 本地产物包含 12 个文件与 LICENSE，解包后的 `--help` 正常；未执行 `npm publish`。
- 最终包哈希与内容仓库当前字节逐一一致；6 包 publisher dry-run 通过，未上传。

本地证据：

- `output/skill-delivery-final/review.html`：实际成品、可编辑输入、归档包与视频预览。
- `output/skill-delivery-final/results.json`：版本、归档 SHA-256、图片尺寸/哈希和视频参数。
- `output/skill-delivery-readiness/cli-smoke.json`：npm 包入口验证。
- `output/skill-delivery-readiness/production-readonly.json`：生产只读探测及聚合记录；不作为公开报告提交。

复现入口：

```sh
node scripts/verify-skill-delivery.mjs --content <content-repository> \
  --runtime-project <isolated-project-with-playwright> --out output/skill-delivery
```

脚本模拟下载授权响应，以真实归档字节执行 CLI 校验和安装；不连接支付、目录或发布 API。它不证明生产鉴权、签名下载 URL、付费权益或独立 Agent 行为已验收。

## 当前上线条件

1. **目录与数据库。** 本轮公网目录 API 返回 404；运行配置指向的数据库对 6 张 Skill 表的只读 GET 查询均返回 `PGRST205`（REST schema cache 中不可用）。这不能区分未迁移与尚未暴露/刷新 schema；迁移前需要核对数据库迁移记录。最初 HEAD 探测无正文的结果已弃用，不能据此声称表存在。
2. **历史合同。** 不读取业务行的聚合查询确认既有订阅成功订单存在；不能按“没有老用户”设计迁移。新 Skill 单品/内容订阅的成功订单聚合为零，只代表查询时该订单类型没有成功记录，不证明其他履约渠道或全部历史合同已审计。
3. **支付环境。** 已检查的本地和 hosted runtime 配置中只找到 Stripe live 配置，未找到独立测试凭据；本轮没有创建真实收费或测试付款。需要隔离的支付测试项目、相应测试 webhook 和数据库完成真实服务端链路验收。
4. **私有分发。** 已检查的配置文件中未找到 Skill 私有桶与对应 R2 访问配置；不能推断云端 secrets 一定不存在。需要核对部署环境中的实际配置与桶隔离。
5. **CLI。** npm registry 对 `webtomind-cli` 返回 404；本地 tarball 可用，但公开 `npx` 路径尚未成立。
6. **权利与内容深度。** 许可正文已补齐，`source_recipes` 内部标识仍不是上游权利证明。发布前需完成源方法、字体/外部材料、示例身份与元数据的最终权利审阅。自动扫描不包括所有图片 OCR、音频转写或 PDF 解压文本。订阅所需至少 5 个可售付费商品尚未满足，目前只有这 1 个付费包完成本轮技术验收。

建议下一发布批次以“5 个免费包 + 单个轮播付费商品”为对象准备；内容全库订阅继续关闭，直到付费库数量和真实交易验收满足策略要求。本轮没有修改生产、上架商品、发布 npm、提交或部署。

# WebToMind Skill 转型进度盘点与首发建议

> 2026-10-20 商业方案更新：后续会员权益与销售策略以 [会员权益与 Skill 销售策略 v2](SKILL_MEMBERSHIP_AND_SALES_STRATEGY.md) 为准；一手竞品证据见 [Skillry 深度调研](SKILLRY_RESEARCH_2026-10-20.md)。本文件保留阶段性核验记录。v2 补充单品/套装，分离新内容会员与算力权益，保留旧会员合同，并明确终身方案开放条件；尚未改动生产套餐。

核验日期：2026-10-20（Asia/Shanghai）。按与本次描述吻合的 2026-10-18 Claude 开发批次回溯；含主会话、后端、内容和 SEO 工作线。本次仅盘点、读取和本地定向验证，未合并、部署、迁移数据库或发布商品。

## 结论

WebToMind 已形成 Skill 自营订阅商店的第一版代码，仍停在发布前整合阶段。当前线上没有提供新目录与安装链路。内容已有 30 个包，但只有 6 个记录了 Agent 实跑案例，其中 5 个免费、1 个 Premium；唯一 Premium 案例仍使用商品占位图。因此目前不能把它描述为已上线、可销售的完整平台。

建议将本机已经沉淀的商业视觉工作流纳入首发：免费模板帮助用户完成首次交付，付费产品聚焦门店营销物料、品牌提案、商品图和系列写真。先做自营精选商店；开放卖家入驻、分账与创作者交易属于后续范围。

## 1. Claude 当时决定了什么

主会话 `09ef4bf7-9fa9-49f6-af49-e8adff6df0b2`：

- 10 月 18 日 07:21：用户提出参考 Skillry，转向 Skill 推荐和订阅。
- 08:55：用户要求合并后端分支，继续前端页面与发布工具。
- 09:36 左右：创建转型 PR，并启动详情 SEO 工作线。
- 09:40：用户要求执行验证。
- 09:41：发现浏览器审计仍查找旧首页按钮，留下本地选择器修正。
- 09:50：记录以 Anthropic organization disabled 的 API 错误中断。SEO 会话也在 09:49 被相同错误中断。

计划保存在 [SKILL_SUBSCRIPTION_PLAN.md](./SKILL_SUBSCRIPTION_PLAN.md)：

| 决策 | 已记录的方向 |
| --- | --- |
| 商品来源 | 自研为主；最初计划由 Prompt slot 配方改造 |
| 用户 | Claude Code、Codex、Cursor 等 Agent 的创作者、运营、独立开发者和小团队 |
| 免费/付费 | 免费 Skill + Pro 月/年订阅 + 全库买断 |
| 地区 | 中英双市场；Stripe USD / ZPay CNY |
| 创作台 | 保留，未来改造为网页运行 Skill |
| 已有会员 | Pro/Max 附带 Premium Skill；历史有效订阅回填权益 |
| 第三方平台化 | 投稿、审核、签名、分成放 P2，尚未作为本期交付 |

现有数据模型保留单个 Skill 权益来源，但本次没有核验到完整的单品购物、卖家入驻或分账闭环。对外叫“Skill 平台”可以，当前落地形态应准确表述为自营推荐与订阅商店。

## 2. 代码、CI 与线上状态

主工作区：`/Users/zhongqingbiao/Developer/New project/zongjie`。

当前分支 `claude/skill-subscription-pivot`，HEAD `07368124be397ed390f3452943a5ae9d5ef83d80`。已推送到 [PR #4](https://github.com/jiamizhongshifu/webtomind/pull/4)，状态 OPEN，未合并。

| 模块 | 已落地证据 | 当前边界 |
| --- | --- | --- |
| 数据、API、CLI | `a6e7b97`：目录、不可变版本、案例、权益、安装记录、设备授权、凭证与 RLS；CLI login/status/install/list/logout | 代码已提交；线上迁移与真实下载未验证 |
| 会员兼容 | `de28daa`：Skill Pro 对齐现有 Pro 积分；Pro/Max 权益与幂等回填 | 回填脚本存在；本次未执行生产回填 |
| 发布工具 | `9b5fde1`：确定性归档、私有 R2、SHA-256、案例发布、版本不可变 | 6 包 dry-run 通过；没有上传 |
| 前端 | `0736812`：Skill 首页、目录、详情、定价、CLI 浏览器授权、安装 Markdown | 已在 PR；不代表浏览器完整交互验收完成 |
| 详情 SEO / sitemap | 独立 `claude/skill-detail-seo` 工作区存在修改 | 6 个已跟踪文件修改 + 1 个新测试文件，未提交、未合并 |
| CLI 分发 | 本地 `webtomind-cli@0.1.0` | npm registry 查询返回 404；对外 npx 安装链路未就绪 |
| 网页端运行 | 旧 `api/agent/skill-run.ts` 明确返回 `SKILL_RUNTIME_DISABLED` | 不能把现有创作台等同于“同一个 Skill 网页可运行” |
| Agent 文档 | 已实现 `/install/agent.md` 和 `/install/skills/<slug>.md` 的代码 | `public/llms.txt` 仍是旧 AI 图片工具定位 |
| 推荐与更新 | 搜索、筛选、排序及评分字段存在 | MCP 推荐、完整评分闭环、专用 CLI update 不应宣称完成 |

SEO 工作区路径：
`/Users/zhongqingbiao/Developer/New project/zongjie/.claude/worktrees/nice-snyder-3f6836`。

它的 Claude 记录报告过相关测试与 type-check 通过，但本次没有重跑该工作区的 SEO 测试；不能等同于当前主分支已具备这些能力。

### CI 的具体断点

[转型 PR CI 39087149468](https://github.com/jiamizhongshifu/webtomind/actions/runs/39087149468) 失败于 `Verify design-system browser contracts`：

`locator('.hero-actions .ui-button__label').first()` 等待 15 秒后超时。

该次 CI 的 lint、type-check、server build、release-integrity、生产相同配置的 web build 等前置步骤已通过；后面的全量 Vitest 被跳过。主工作区已有未提交修正，将 `.hero-actions` / `.hero-content` 换成 `.skill-hero-actions` / `.skill-hero`。本次保留原状，未把修正称为已验证通过。

### 当前线上

2026-10-20 实读 `https://webtomind.com/release-manifest.json`：

- live commit / originMain 均为 `5496dcc6358c5a635a30824dfcc979afd56da707`。
- builtAt：`2026-10-20T05:17:40.013Z`。
- `/api/skill-catalog` 返回 HTTP 404、`WORKER_API_ROUTE_NOT_FOUND`。
- `/install/agent.md` 返回 HTTP 404。

因此 Skill 转型尚未上线。数据库内部迁移状态、R2 私有桶配置、真实付费履约不在上述公网证据覆盖范围内，本次未查询生产私有数据。

## 3. 第一批 30 个 Skill 实际是什么

独立内容仓库：[webtomind-skills](/Users/zhongqingbiao/Developer/webtomind-skills)；HEAD `f194af5`，工作区干净。

| 维度 | 当前核验结果 |
| --- | --- |
| 数量 | 30 |
| 档位 | 免费 10 / Premium 20 |
| 类型 | 图片 14 / 幻灯片 6 / 网页 5 / 视频 5 |
| 发布状态 | 30 个 manifest 全为 `review` |
| 结构校验 | 30/30，0 errors，24 warnings |
| 必须有真实案例的校验 | 6/30；其余 24 个因缺案例失败 |
| 内容方法 | HTML 排版渲染 PNG/PDF/MP4；AI 配图通常输出提示词，由用户另行生成 |

完整选题：[CATALOG.md](/Users/zhongqingbiao/Developer/webtomind-skills/docs/CATALOG.md)。
已知问题：[STATUS.md](/Users/zhongqingbiao/Developer/webtomind-skills/docs/STATUS.md)。

| 有实跑记录的 Skill | 档位 | 本次确认 |
| --- | --- | --- |
| `xhs-cover-note` | 免费 | 案例文件存在；已目视查看封面 |
| `og-image` | 免费 | manifest 与案例文件通过校验 |
| `weekly-report-deck` | 免费 | 案例含 PDF 与 7 张 PNG |
| `waitlist-page` | 免费 | 案例含 HTML、桌面与手机截图 |
| `kinetic-typography-short` | 免费 | 案例含 MP4 与封面帧 |
| `ecommerce-main-image` | Premium | 5 张 PNG；目视确认商品是示意盒，未用真实产品图验收 |

“实跑”来源于 10 月 18 日 Claude 会话及 manifest 的运行记录；本次验证了文件、结构与打包，并未重新让 Agent 运行这 6 个业务任务。

该批内容中，HTML 渲染模板的数量已够启动目录，付费商品的示范与差异化仍明显不足。不能以 30/30 结构通过代替商业成品验收。

## 4. 本机既有资产怎样成为商品

本次抽样读取了本机 Skill 的入口、引用、LICENSE 与 README，并检查了 GPT-Prompt 项目。安装在本机不自动代表是用户原创；下表中的“候选”不是已完成的权属结论或已可发布商品。

### 优先提炼的产品

| 拟售卖的产品 | 本机来源 | 建议层级 | 发布前需要补齐 |
| --- | --- | --- | --- |
| 门店营销物料套装 | [GPT-Prompt/SKILL.md](/Users/zhongqingbiao/GPT-Prompt/SKILL.md)、`references/storefront-marketing-kit.md` | 旗舰 Premium | 抽取自有母版方法，补完整真实店铺案例；隔离收集的第三方 Prompt/参考库与私人渠道 |
| 品牌发布视觉提案 | 同项目 `references/brand-campaign-full-suite.md` | Premium | 独立触发入口；主视觉/品牌角色/包装/传播成套示例 |
| 系列写真编排 | [portrait-studio](/Users/zhongqingbiao/.codex/skills/portrait-studio/SKILL.md) + 八个 `portrait-*` 节点 | Premium 套装 | 修复跨目录引用；声明第三方导演依赖；移除私人生成渠道和不完整相对路径 |
| 单项机位/灯光控制 | `portrait-camera` / `portrait-lighting` 的独立子集 | 免费候选 | 提供独立可运行范围、一个前后对比案例；不要拆成缺依赖的空壳 |
| 风格探索与系列变体 | [rare-style-explorer](/Users/zhongqingbiao/.codex/skills/rare-style-explorer/SKILL.md)，含风格 JSON 与 Python 脚本 | 免费精选 / Premium 完整流程候选 | 核验风格库来源，补系列成品；不单靠条目数量作为收费理由 |
| 公众号逻辑关系图 | [space-text-logic-diagram](/Users/zhongqingbiao/.codex/skills/space-text-logic-diagram/SKILL.md) | 免费候选 | 核验维护来源；SVG/HTML 路径可独立，需真实文章示例 |
| 公众号安全区头图 | [space-gzh-cover](/Users/zhongqingbiao/.codex/skills/space-gzh-cover/SKILL.md) | 免费候选 | 当前依赖 Codex image_gen；正确标注兼容环境，补长图与中心裁切对照 |

GPT-Prompt 是“私人提示词工作流”，当前入口引用本机绝对路径、项目外 Skill、私人生成服务，并显式检索第三方案例库。适合抽取、产品化自有工作流，不适合把整个项目目录直接打包上架。

`portrait-studio` 还引用 `../../../references/image-generation-workflow.md`；把安装目录单独复制出去会改变解析位置。发布版本应自包含，或通过明确安装依赖解决，不能假设买家拥有相同目录结构。

首版 publisher 要求 `permissions.network` 和 `permissions.credentials` 都为 `none`。依赖外部图像/视频 API 的 Skill 不能直接套用这一声明。可先交付明确标为“提示词工作流”的版本；若要自动出图，需要扩展依赖与权限描述并验证真实执行路径。

### 已核实为第三方来源的例子

| 本机名称 | 文件中的作者/来源证据 | 本次建议 |
| --- | --- | --- |
| `female-portrait-director` | LICENSE：李岳；README：liyue-aigc 仓库 | 作为明确注明来源的依赖；不归为 WebToMind 原创 |
| `punk-ip-article-illustrations` | LICENSE：Jinchenma / Adrian Punk | 不把内置角色与整包当作自研产品 |
| `gbro-cover-design`、`gbro-collage-info` | LICENSE：狗哥笔记；封面包另列上游来源 | 区分原包与本地增量；不列为自研首发 |
| `animated-voiceover` | LICENSE：s1dashu | 区分方法、音色、参考素材等不同来源 |
| `gzh-design` | LICENSE：甲木 × 摸鱼小李；README 指向 isjiamu | 保留为使用工具，首批自研商品不直接收录 |

上述分类是来源核验，不是“第三方一律不能商业使用”的法律结论。确需分发衍生包时，再按具体许可证、素材来源与增量内容确定发行方式。

`kid-papercraft` 当前明确围绕多个既有儿童 IP，暂不作为自有商业展示的优先产品；可以另做原创角色版本。

## 5. 与 Skillry 的对应关系

截至本次读取，Skillry 强调团队自制、成品展示和持续维护，覆盖图片、幻灯片、网页与视频；免费内容用于完整体验，付费解锁 Premium。来源：[首页](https://skillry.dev/)。

其公开价格为 $9.99/月、$79/年、$169 买断，包含更新；浏览器授权后可用 CLI 安装。来源：[定价页](https://skillry.dev/pricing)、[安装说明](https://skillry.dev/learn/agents/claude-code)。

WebToMind 的既有转型计划已基本沿用这种结构。建议补足的竞争差异是：

- 明确面向中文创作者、运营、电商和小商家，围绕具体交付任务组织目录。
- 每个商品展示输入、实跑结果、所需 Agent/模型、额外模型成本和输出格式。
- 用用户已有的多步骤商业视觉经验形成付费价值；通用模板承担免费试用。
- 网页创作台作为后续便利入口，独立说明消耗积分；P0 先让本地安装与交付闭环成立。

这些是本次产品建议，不是经过流量、转化或付费实验验证的结论。也不以竞品展示的收入或用户数字作为本项目收入预测。

## 6. 建议首发：先验证 10 个

“首发 10 个”是本次收敛范围建议，替代一次性要求 30 个全量就绪；未改变现有商品或价格配置。

| 免费体验：5 个 | 原因 |
| --- | --- |
| 小红书封面 | 已有实跑样本，面向中文核心人群 |
| OG 分享图 | 已有实跑样本，覆盖英文与独立开发者 |
| 周报幻灯片 | 已有实跑样本，易展示输入与交付差别 |
| 候补预约页 | 已有桌面/手机样本 |
| 文字动效短视频 | 已有视频案例，覆盖视频类别 |

| 付费验证：5 个 | 下一项必要交付 |
| --- | --- |
| 门店营销物料套装（从既有工作流提炼） | 一家真实/原创示例店的整套物料 |
| 品牌发布视觉提案（从既有工作流提炼） | 一套完整提案板与生成过程 |
| 系列写真编排（从既有工作流提炼） | 独立安装包、依赖声明和一致性案例 |
| 电商主图五件套（现有 `ecommerce-main-image`） | 用真实产品素材替换示意盒并重跑 |
| 小红书图文轮播（现有 `xhs-carousel`） | 一条真实文章请求产出完整轮播 |

免费 5 个仍需处理 STATUS 中影响交付的问题并验收；付费 5 个目前是优先制作清单，不能提前标为可售。

本次不建议仅因为竞品有买断就立即启用全库终身承诺。已有月/年/买断代码可以保留，待内容更新能力、支持成本和至少一批付费成品成立后再选择首发档位。

## 7. 恢复开发的依赖顺序

1. 收拢遗留工作：核验并整合未提交首页审计修正、SEO 工作区、当前主线最新提交；补齐 `llms.txt` 定位。
2. 收敛首发内容：免费 5 个完成问题修正；付费优先把前述 5 个做成独立包、真实案例与清晰能力说明。
3. 完成安装验收：发布工具测试、包内引用/依赖检查、干净环境安装与校验、CLI 的正式分发准备。
4. 完成发布准备：hosted overlay 刷新、私有 R2 配置、迁移和回填方案、套餐启用项；保持完整性守卫。
5. 进入已授权的发布流程时，再执行合并/生产迁移/CLI 与内容发布/部署，分别检查结果。
6. 线上验收：免费安装、Premium 拒绝未付费用户、支付后授权、退款/到期权益变化、版本更新；桌面与移动端覆盖目录、详情、授权、结账交互。

“网页端运行同一个 Skill”、任务推荐 MCP、创作者入驻与分账放后续迭代，不成为首批可安装商品闭环的隐性承诺。

## 8. 本次验证记录

| 检查 | 结果与范围 |
| --- | --- |
| Node | 使用项目要求的 24.14.0；`pnpm runtime:check` 通过 |
| 定向测试 | Vitest 4 个文件、42 项通过：CLI、目录 API、迁移 SQL、权益履约 |
| 打包器 | Node test runner 6 项通过 |
| 内容结构 | `node tools/validate.mjs`：30/30，0 errors、24 warnings |
| 内容案例门槛 | `node tools/validate.mjs --require-examples`：6/30，24 个缺案例 |
| 发布预演 | 对 6 个有案例包 dry-run：可打包、生成 SHA-256；无上传和数据库写入 |
| 视觉抽查 | 查看小红书封面与电商主图第 1 张；不是 30 个商品视觉验收 |
| GitHub | 实读 PR 状态、CI 步骤与失败日志 |
| 生产 | 实读 manifest 与两个公开端点；新 Skill 路由未上线 |
| 未执行 | 全量 CI、本轮 UI 浏览器交互、真实支付、生产私有数据库检查、迁移/发布/部署 |

验证过程中最初误用 Node test runner 启动 Vitest CLI 测试，产生 runner 错误；随后改用项目 Vitest，相关测试全部通过。该次工具调用错误不作为代码缺陷。

历史记忆只用于定位旧交接资料；本报告的现状结论来自本次代码、Claude 原始记录、文件、GitHub 和公网读取。

## 9. 继续推进后的本地交付（2026-10-20）

此节记录后续开发结果；前文第 8 节是最初盘点时的检查范围。

### 平台代码

- 将 `claude/skill-detail-seo` 工作区中的 7 个未提交文件整合到当前工作区，原工作区保留。
- 补齐详情页服务端 SEO、canonical/hreflang/OG、SoftwareApplication 结构化数据，以及已发布版本的 sitemap。
- 无发布版本的 Skill 不作为可索引商品；目录查询异常返回 noindex shell，并设置 no-store，避免缓存临时错误。
- 根路径按语言进入 Skill 首页 `/overview`，保留查询参数；修复原首页仍跳往 Prompt 库的问题。
- 详情页切换商品时重置 Agent，加载成功恢复 index；更新首页、套餐说明和 llms.txt，明确 Skill 安装、外部模型费用与创作台积分的边界。
- 保留已有浏览器审计选择器改动，并用新首页完成验收。

### 新增付费内容案例

- `xhs-carousel` 升至 1.0.1，仍为 review。增加 Node 批量导出，不再依赖 sed/seq。
- 原创「小店上新物料清单」七页案例：7 PNG、可编辑 HTML、逐页源文件、配文、运行记录与 SHA-256。
- 实跑修复四/五步布局、提示条与页脚间距、金句换行。七页目视检查；五步 + TIP 边界通过浏览器几何和目视检查。
- 当前会话演示不是独立 Agent 发现测试或客户案例；macOS 通过，Windows 真机尚未验证。
- 内容库现在为 7 个带成品案例的 Skill（6 个历史案例 + 1 个本次演示），23 个仍缺案例。打包 dry-run 中的 ready 仅代表满足打包器门槛，不代表商业发布验收。

### 本地验证与边界

| 检查 | 结果 |
| --- | --- |
| 类型、Lint、构建 | `pnpm type-check:all`、`pnpm lint`、`pnpm build:web` 通过 |
| 定向回归 | 9 文件共 159 项；初跑 158 通过，修正 1 个旧首页断言后，该 worker 文件 87 项重跑全过，其余 8 文件已过 |
| 发布完整性测试 | 74/74 通过 |
| 源码约束 | UI governance、design-system、release contracts source 通过 |
| 浏览器交互 | 本地生产构建，1440/390px；首页、筛选、搜索、空态、错误重试、详情、Agent 切换、复制、404、月年切换、未开放套餐状态通过；API 为 fixtures，未验证真实结账 |
| 设计系统浏览器检查 | 1440/430/390/360px × 明暗主题 8 组合通过 |
| 内容 | 30/30 结构有效、23 个缺案例警告；xhs-carousel 严格案例校验通过，无错误/警告 |
| 发布预演 | xhs-carousel@1.0.1，约 800 KiB，7 张案例图；未上传、未写数据库 |
| 未完成 | 其余首发商品案例与缺陷修正、干净环境安装与真实支付权益验收、CLI 正式分发、生产配置/迁移/发布/部署 |

浏览器和测试证据保存在 `/Users/zhongqingbiao/.codex/visualizations/2026/10/20/skill-pivot-qa/`。所有改动目前均在本地，尚未提交、推送或部署。


## 10. 脱敏与首支英文功能演示（2026-10-20）

- 商品打包前增加脱敏守卫，dry-run 与发布共用；30 个 Skill 扫描通过。修正 3 个模板的 5 处非保留域名示例邮箱。该扫描不等于 OCR、音频或素材权利的完整审查。
- 按用户已确认的英文、16:9、无口播要求，用固定版本 huashu-motion 完成 xhs-carousel 首支 30 秒功能演示：简报、真实七页输出、改标题后重渲染、PNG 与源文件交付。可视化控件在片中标为 workflow visualization。
- 实际 MP4：1920×1080 / 30 fps / 900 frames / H.264 + AAC。完整解码通过；Chrome 1×播放到结束，900 帧中报告 3 帧掉帧；21 项输入及交付文件脱敏扫描通过。手机 390px 页面不溢出，七页总览细字需全屏横屏查看。
- 仅本地制作完成，成片视觉/听感仍待用户试看，不等于已上线。入口在自媒体工作区 `.video-workbench/2026-10-20-webtomind-carousel-promo/delivery-v1.html`；后续首批执行顺序见内容仓库 `docs/PROMO_PROGRESS.md`。


## 11. 其余五支演示片（2026-10-20）

- og-image、waitlist-page、xhs-cover-note、weekly-report-deck、kinetic-typography-short 均已生成英文、16:9、1080p、30 fps、24 秒功能演示。与首支轮播片合计 6 支本地成片。
- 各段均使用实际渲染输出或源动画；候补页标注无后端，周报为虚构示例数据，英文封面标为定制演示。无口播，无公开上传。
- 5 段完整解码与正常速度播放通过；80 项演示素材脱敏扫描通过；5 个对应商品结构/历史案例检查通过，30 包脱敏扫描通过。第一段本机播放报告 4/720 显示掉帧，其他四段为 0；未作真机或本人听感验收。
- 本轮修正四个 Skill 模板并升至 1.0.1：重复高亮、周报标签/单位/空白、动效转场空白、隐藏徽章；仍为 review。OG launch 固定仪表盘图案等未覆盖问题继续保留在内容 STATUS。
- 集中入口：自媒体工作区 `.video-workbench/2026-10-20-webtomind-free-skill-demos/review.html`。附单段 MP4、五段下载包、实际示例文件、可编辑源码及 SHA-256/核验记录。最终画面与配乐听感仍待用户试看；未提交、推送、发布或部署。

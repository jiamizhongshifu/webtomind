# SiSkill 搜索与业务核验

这两个工具服务于 SiSkill。身份或 API 凭证可以复用已有基础设施，报表范围固定为
SiSkill 的公开页面与 `siskill_*` 业务表，不查询 WebToMind 的流量、订单或会员。
输出默认保存到忽略提交的 `output/siskill-ops/YYYY-MM-DD/`，只包含汇总和公开搜索信号。

## 搜索检查

```sh
# 不需要 Google 凭证：核对当前发布目录的 sitemap、页面正文和索引信号
node scripts/siskill-search-console.mjs --public-only

# 读取 Google 已授权的 SiSkill 属性、已提交 sitemap 与三个核心 URL 的索引状态
node scripts/siskill-search-console.mjs --env-file /absolute/path/to/private.env --inspect

# 已有上架授权和 Google 权限后提交；存在同一 sitemap 时跳过重复提交
node scripts/siskill-search-console.mjs --env-file /absolute/path/to/private.env --submit --inspect
```

Google 配置沿用 `scripts/lib/google-report.mjs` 的 `GSC_SERVICE_ACCOUNT_JSON_B64`
或 `GSC_SERVICE_ACCOUNT_JSON`；没有单独配置时可以复用 GA4 服务账号身份。
这不意味着该身份已经拥有 Search Console 权限。也可使用明确授权了相应 scope 的 ADC。

工具默认只读；`--submit` 才使用 `webmasters` 写入 scope，其余使用
`webmasters.readonly`。仅接受 `sc-domain:siskill.dev` 或 `https://siskill.dev/`。
先检查公开页面，再读取属性权限，再查询现有 sitemap；只有明确的提交请求才执行 PUT。
网络异常后的提交结果标记为 unknown，不自动重试。后续先重新只读查询。

外部前置条件：

1. 在 Google Search Console 添加或选择 SiSkill 属性，完成所有权验证。
   Domain 属性如需 DNS TXT，应使用 Google 实际给出的 token，保留其他 DNS 记录。
2. API 路径需要在凭证所属 Google Cloud 项目中启用 Search Console API，并给该
   服务账号适当的 SiSkill 属性权限。`accessNotConfigured` 表示 API 未启用，
   不代表 sitemap 不存在；403/401 不能当成零流量。
3. `https://siskill.dev/sitemap.xml` 可直接提交。提交确认、抓取成功和页面收录是
   三个不同状态，分别看提交时间、sitemap 错误/抓取时间和 URL Inspection 结果。

工具不会自动申请权限、添加 DNS 或启用 Google API。URL Inspection 返回的是
Google 已索引版本，不是即时抓取测试，也不是请求收录。

依据：[Google sitemap 提交 API](https://developers.google.com/webmaster-tools/v1/sitemaps/submit)、
[URL Inspection API](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect)。

## 独立业务基线

```sh
node scripts/siskill-business-report.mjs --env-file /absolute/path/to/private.env
# 指定订单创建时间窗口，UTC，左闭右开
node scripts/siskill-business-report.mjs --env-file /absolute/path/to/private.env \
  --start 2026-10-01T00:00:00Z --end 2026-11-01T00:00:00Z
```

需要服务端 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`，只在本机运行，不能放入网页。
读取订单、会员合同及对应支付事件。账号查询只用于识别已明确标记的
`siskill_smoke` / `siskill_test` 验收记录；报告不保存账号、邮箱、订单 ID、令牌、
checkout URL 或支付标识。账号分类失败单列 unknown 并排除，不能默认为真实客户。

- 按创建窗口统计当前订单状态；不是按到账日期计算收入。
- 付费订单金额只计当前 paid 且有 paid 事件记录的订单；已退款订单不计入。
  USD 与 CNY 分开汇总，单位为最小货币单位，不做虚构汇率换算。
- 支付事件代表履约记录，不替代支付渠道、结算、手续费或部分退款对账。
- membership `bound` 不是有效付费会员的充分证据，不据此填充 activePaidMembers。
- 尚未接入的访问、登录、下载和转化率保持 null，不填 0。
- 明确验收账号会被排除；没有标记的人工测试无法自动判断，仍需审计。

## 独立转化漏斗

SiSkill 已创建独立 GA4 属性 `559941278` 与 Web 数据流 `G-CJQ69SZLVD`。
前端在访客同意后采集浏览、登录、有效结账和校验成功的下载，见
[统计接入说明](./SISKILL_ANALYTICS.md)。本页的 CLI 仍只核验公开页面和业务基线，
尚未合并 GA4 报表；其漏斗字段保持 null，不代表没有访问或转化。

| 阶段 | 有效触发依据 | 记录边界 |
| --- | --- | --- |
| 目录与详情 | 实际路由展示、点击的已知 Skill | 固定 route、slug、locale；不采集完整 query 或用户搜索文本 |
| 登录 | 已验证的登录回调 | 共用账号不等于新注册；不记录邮箱或用户资料 |
| 发起结账 | 服务端成功创建或返回有效 checkout | 点击购买按钮只代表意图，不代表订单已创建 |
| 支付 | 已验证并完成幂等处理的渠道事件 | 服务端记录，不能用 success URL 或前端通知代替 |
| 下载 | 已授权、文件大小和 SHA-256 校验通过 | 服务端发送与客户端校验完成是两种事件，不能混为已安装 |
| 退款 | 经验证的退款事件及相应权益变化 | 区分全额、部分退款和争议，不重复抵减 |

接入时为事件设置固定字段白名单和去重规则；不传令牌、密码、客户资料、原始文案、
任意 URL 参数。渠道归因与订单关联落地之前，不宣称已有渠道收入或完整转化率。

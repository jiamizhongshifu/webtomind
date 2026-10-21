# SiSkill 独立统计

## 属性与数据流

- Account: `384203641`; property: `559941278`, `SiSkill - siskill.dev`.
- Web stream: `16171920572`, `SiSkill Web`; measurement ID: `G-CJQ69SZLVD`.
- URL: `https://siskill.dev`; timezone: `Asia/Shanghai`; currency: `USD`.
- Business size: 1–10 人（用户确认）；行业 Technology，目标销售与流量。
- [打开 GA4](https://analytics.google.com/analytics/web/#/a384203641p559941278/)
- Enhanced measurement 关闭，避免额外采集表单、搜索词、外链及重复 SPA 浏览。
- 未启用 Google signals 或广告个性化。

## 同意与数据边界

标签仅在正式 `siskill.dev` 且访客明确允许后加载。默认及拒绝时不加载标签、
不缓存待补发事件；页脚可重开偏好。撤回后禁用标签、清理本产品 GA Cookie 并刷新，
卸载自动监听器。其他标签页的偏好改变会触发刷新。浏览器不能保存选择时保持关闭。
购买和下载不依赖统计成功。只覆盖同意且成功加载统计的访问，不代表全部用户。

固定 route/slug/locale 白名单；page_location 不含 query/hash，未知路径归为 not-found；
referrer 只保留 origin，不发送邮箱、密码、客户身份、订单 ID、checkout URL 或搜索原文。
不设置 user_id；GA 本身仍使用匿名浏览器标识与设备信息，不能称为完全匿名。
UTM 仅接受代码中的来源/媒介/活动白名单；任意值丢弃，无 utm_content/utm_term。
cookie_prefix 为 siskill，期限 180 天；拒绝时删除该前缀 GA cookies。

## 事件

| 事件 | 触发依据 | 边界 |
| --- | --- | --- |
| page_view | 同意后的首次已知页面和 SPA 路由变化 | 同路径参数变化不重复计数，离开再返回正常计数 |
| view_item | 已知 Skill 详情路由 | 固定 item_id/item_name，不报告价格或收入 |
| login | 邮箱登录成功，或本窗口发起的 Google 回调经 getUser 验证 | 登录不是注册，不发送用户标识 |
| begin_checkout | 服务端返回经校验的 Stripe URL 或支付宝表单 | 当前文档内按返回标识去重；标识仅存内存；不等于支付成功 |
| skill_download_verified | 文件长度及 SHA-256 校验通过，触发下载 | 不代表保存完成、安装或实际运行 |

未发送 purchase/refund/revenue；服务端订单报告仍是履约依据。未建立渠道与订单的
关联，不宣称完整购买转化率、渠道收入或 ROAS。新 GA4 没有回溯历史流量。

## 验收与 QA

GA4 创建 `SiSkill QA Developer Traffic` 开发者流量排除过滤器，ID `16172003071`，
Active（filterMode 3）。条件为 debug_mode 或 debug_event = 1；不影响无调试标记的访客。
正式站点验收前仅在测试浏览器 sessionStorage 设置 `siskill.analytics.qa=true`，
事件附带 debug_mode 与 traffic_type=qa。结束时关闭测试会话。
过滤器传播和报表处理可能延迟；当日调试事件不能当作真实获客或转化。
本地浏览器用独立站请求映射本地 Worker，并 stub Google 标签，避免污染正式报表。

本地验证：88 项测试、类型检查、构建、公开包检查；桌面与手机验证未选择、允许、
拒绝、重新打开、撤回和中英文说明，检查 URL 参数脱敏及 SPA 页面计数。
生产验收另记录 manifest、Worker version、实际 collect 响应和脱敏字段；
网络接受不等于已进入标准报表。未执行真实支付或退款。

## 实现参考

- [Google SPA page views](https://developers.google.com/analytics/devguides/collection/ga4/views?technology=websites)
- [Google privacy controls](https://developers.google.com/tag-platform/security/guides/privacy)
- [Google ecommerce events](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce?client_type=gtag&hl=en)

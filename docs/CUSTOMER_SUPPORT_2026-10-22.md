# 在线客服接入

采用 Chatwoot Cloud Hacker 免费版，后台账户 193052，WebToMind 网站收件箱 149206。
管理员在同一后台处理多个产品；收件箱区分产品，不代表独立联系人或权限租户。

本地新增 `SupportChat`，复用营销页脚联系入口。点击后才加载官方 SDK；加载完成后
官方悬浮入口可继续打开会话。提供中英文、连接失败重试和邮件兜底，不自动发送
产品账号、订单或创作数据。浏览器 SDK 保留 Chatwoot 品牌。

启用配置：`VITE_CHATWOOT_WEBSITE_TOKEN` 使用该网站收件箱的公开 website token；
未设置时保留邮箱联系入口。不要使用 API token 或 HMAC secret。正式构建需要传入
此变量；Worker CSP 已准备放行 `https://app.chatwoot.com` 的脚本、iframe 和音频请求。

免费方案最多 2 名客服、每月 500 会话、记录保留 30 天。网页聊天和留言可用；邮件
会话连续性在 Cloud 后台标记为付费功能，不能把本地 CE 的邮件能力当作免费套餐能力。
当前关闭邮箱收集提示，用户应在同一浏览器返回查看回复，或通过原有邮箱联系。

本次只修改本地源码，未推送、构建正式发布包或部署生产。发布仍遵循
`docs/PRODUCTION_RELEASE.md`，不得覆盖工作树中其他未发布改动。

本地验收：实际页面接入真实 Cloud 收件箱，访客发送与后台人工回复往返通过；
桌面与手机尺寸通过，SDK 加载失败重试、键盘关闭和焦点返回通过，类型检查通过。
证据保存在 SiSkill 工作区 `private/support/2026-10-22/cloud-products-result.json`
与 `cloud-products-ui-result.json`。未代表完整项目 CI 或生产环境验收。

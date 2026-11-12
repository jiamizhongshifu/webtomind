# 浮动 UI 类型审查与待批准决策

日期：2026-11-12。范围：当前工作区 WebToMind 的 `src/web`、`src/workspace`、`src/shared/ui`，含本地已有未提交版本。没有修改应用代码、样式、配置或用户数据。以下是源码审查，未进行浏览器交互验收，不代表线上所有入口均启用。

独立的 `apps/toolcraft-template` 是另一应用；其 Sheet/HoverCard 不属于主应用现有组件，不能当作主应用已经具备的抽屉。测试 Harness 不计为产品用法。第三方 Google 登录及 Chatwoot 内部 UI 无法从本仓库完整审查。

标记：**保留**＝类型正确，仍可能有行为缺失；**修改**＝推荐调整类型或触发方式；**条件**＝两种类型均可能适合，列出判定条件；**组件待批**＝主应用没有对应通用组件，添加前需另行批准。重复渲染的同一种业务用法合并为一行，独立操作分别列出。源码检索位置见文末附录。

## 现有组件与复用决策

| 类型 | 现有实现 | 决策 |
|---|---|---|
| 纯文本工具提示 | `src/shared/ui/radix/tooltip.tsx`；大量原生 `title` | 保留 Radix Tooltip 为行为实现；保留已有视觉类。原生 title 无法满足统一时序、焦点和触摸可达，逐入口补行为，不能简单给按钮添加拦截主动作的点击事件。 |
| 跟随指针提示 | 主应用未发现通用组件，也未发现需要最近数据点吸附的现有图表提示 | 不新增；画布拖拽、画笔光标、悬停视频播放不属于这种提示。以后有真实图表需求再申请组件。 |
| 点击弹出层 | `PopoverPrimitives.ts` 重导出 `radix/popover.tsx`；另有手写定位浮层 | 复用同一个 Radix Popover。重导出入口不是第二套实现，不应删除。 |
| 动作菜单／选择列表 | `radix/dropdown-menu.tsx`、`SelectPrimitives.ts`、`radix/select.tsx` | 继续保留各自菜单／listbox语义；不因都浮在页面上就替换成 Tooltip 或 Dialog。 |
| 弹出确认 | 无专门 Popconfirm；已有 Popover、按钮和确认文案 | 可在现有 Popover 内组合确认内容，沿用当前按钮和表面样式，不创建新视觉模式。若实施需要新通用 Popconfirm 组件，先请求批准。 |
| 普通对话框 | `shared/ui/Dialog.tsx` + `useOverlayBehavior`；`DialogPrimitives.ts` → `radix/dialog.tsx` | 两者职责重叠。长期建议以 Radix 为交互底座，保留共享 Dialog 的现有外观/API适配；本轮不做全量迁移。 |
| 确认对话框 | `workspace/components/ConfirmDialog.tsx` → `radix/alert-dialog.tsx`；若干普通 Dialog/自建层 | 确认场景优先复用 ConfirmDialog/AlertDialog；不把普通表单改成 AlertDialog。 |
| 底部操作面板 | `shared/ui/ActionSheet.tsx` | 保留移动端选项列表和动作菜单；系统 registry 明确支持。不能承担删除确认。 |
| 侧边抽屉 | 主应用没有通用侧边 Drawer/Sheet | 长表单建议需要时标记组件待批；不擅自搬入 toolcraft 的另一套样式。 |
| 撤销反馈 | `radix/sonner.tsx` 已有 actionButton 样式；业务自建 toast 多只显示文本；资料有回收站 | 保留现有反馈视觉；优先已有撤销按钮/回收站。新增业务撤销必须有可恢复数据，不把显示“撤销”误当成已经支持恢复。 |
| 图片预览 | `[CreationPreviewDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreationPreviewDialog.tsx>)`、`[ImageLightbox](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageLightbox.tsx>)`、工作台 `[ImagePreview](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ImagePreview.tsx>)` 及多个页面内实现 | 普通预览优先复用 CreationPreviewDialog；缩放/拖拽保留 ImageLightbox。先不合并不同功能的预览器。 |

## A. 提示、菜单、设置弹出层

| ID | 用法与位置（组件） | 打开方式；内容；执行后 | 当前 → 推荐 | 判断与原因 |
|---|---|---|---|---|
| A01 | 图片编辑器画笔色块（[ImageEditorPanel](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx>)） | 悬停/焦点；色值文字；点击色块选色 | Tooltip → Tooltip | 保留；Provider 当前 300ms，按要求改为首个约 500ms，补触摸文字可达。 |
| A02 | 全站 IconButton；创作导航、预览工具栏、画布、聊天消息工具条 | 原生 title；图标说明；按钮执行原有动作 | 原生 title → 系统 Tooltip | 修改行为；文本提示不承担操作，保留 aria-label，不能把第一次点击主动作吞掉。具体 title 候选见附录。 |
| A03 | 截断文件名、资料 URL、会话名、素材名（[SummaryDetail](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx>)、[CreateSideNav](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateSideNav.tsx>)、[PromptCompilerPanel](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx>) 等） | 悬停；完整文字；无确认 | title → 系统 Tooltip | 修改行为；触摸端用可点击文本展开；本身可导航的文字需保留导航入口。 |
| A04 | 禁用生成按钮、发布按钮、队列错误和积分估算说明 | 悬停；禁用原因/错误/费用文字；无确认 | title → Tooltip／可点击说明入口 | 修改；disabled 本身不可聚焦，应使用已有可聚焦承载元素；不要解除业务禁用。 |
| A05 | 图像模型、比例、分辨率、张数、技能、更多（[ImageStudioComposer](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageStudioComposer.tsx>)） | 悬停/焦点打开，点击固定；选项与开关；更新生成参数 | 手写交互悬浮层 → 点击 Popover | 修改；有操作，不应由悬停自动打开。 |
| A06 | 图像引用参考、情绪板（同上） | 工具按钮；素材选择；更新引用 | 悬停交互层 → 点击 Popover | 保留轻量选取；若实际需要长期比较多图才转抽屉，当前先不扩大。 |
| A07 | 可视化配方（同上 recipe） | 工具按钮；多分类素材；更改配方 | 悬停交互层 → 点击 Popover；复杂配置可抽屉 | 条件；只快速换素材用 Popover，连续多字段编辑且要看画布用抽屉（组件待批）。 |
| A08 | 视频模型、比例、时长、分辨率、音频、数量（[VideoStudioComposer](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/video-create/VideoStudioComposer.tsx>)） | 悬停/焦点/点击；参数列表；更新生成配置 | 悬停交互层 → 点击 Popover | 修改；保持原参数布局与文案。 |
| A09 | 视频参考、首尾帧、提示词工具（同上） | 工具按钮；选择图片/提示词选项；更新输入 | 悬停交互层 → 点击 Popover | 修改；图库大列表另由已有选择对话框负责。 |
| A10 | 服装材质（[WardrobeMaterialPicker](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/WardrobeMaterialPicker.tsx>)） | 点击材质按钮；选择材质；更新槽位 | Popover → Popover | 保留。 |
| A11 | 画笔自定义颜色（ImageEditorPanel） | 点击色彩按钮；调色器；实时更新颜色 | Popover → Popover | 保留；含操作不是 Tooltip。 |
| A12 | 创作头像菜单（[CreatorAccountMenu](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorAccountMenu.tsx>)） | 点击头像；身份、语言主题、账户入口；设置/跳转/退出 | Popover → Popover | 保留。 |
| A13 | 旧工作台侧栏用户卡（workspace/App） | 悬停用户区域；套餐、设置等操作；导航 | 手写 HoverCard → 点击 Popover | 修改；目前主触发是 div 悬停，须补按钮、键盘和触摸。 |
| A14 | 工作台项目切换（[WorkbenchTopbar](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/WorkbenchTopbar.tsx>) / WorkbenchProjectSwitcher） | 点击项目名称；项目列表；切换项目 | Popover → Popover | 保留；导航操作不需要确认。 |
| A15 | 工作台顶栏用户菜单（WorkbenchTopbar） | 点击头像；账户操作；导航 | Popover → Popover | 保留。 |
| A16 | 项目排序（[BoardsOverview](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BoardsOverview.tsx>)） | 点击排序；排序列表；重排项目 | Popover → Popover | 保留。 |
| A17 | 项目更多操作（BoardsOverview） | 点击更多；编辑/删除等；执行或进入确认 | Popover → Popover | 保留；删除确认独立按 B 表处理。 |
| A18 | 情绪板排序（[CreateMoodboardsPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateMoodboardsPage.tsx>)） | 点击排序；选项；重排列表 | Popover → Popover | 保留。 |
| A19 | 情绪板更多（同上） | 点击更多；板操作；导航/删除 | Popover → Popover | 保留；删除分离。 |
| A20 | 发现页保存到情绪板（[DiscoveryImageMoodboardActions](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/DiscoveryImageMoodboardActions.tsx>)） | 点击选板；列表/创建链接；选中目标，另按保存 | 桌面 Popover / 移动 ActionSheet → 原类型 | 保留；是选择目标，不是确认动作。 |
| A21 | 会话更多（[CreateSideNavSessionMenu](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateSideNavSessionMenu.tsx>)） | 点击更多；打开/删除会话；导航/发起删除 | DropdownMenu → DropdownMenu | 保留；锚点需在删除确认期间存在。 |
| A22 | 生成结果更多（[ImageSessionResultCard](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionResultCard.tsx>)） | 点击更多；预览/下载/删除等；执行操作 | 手写菜单 → 现有 DropdownMenu/Popover | 类型正确，补定位/键盘/焦点；纯动作优先 DropdownMenu。 |
| A23 | 资料详情更多、复制和导出子菜单（SummaryDetail） | 点击更多；子菜单另有悬停；复制/导出 | Popover + 手写子菜单 → 点击可达菜单 | 主层保留；子菜单保留文字及结构，补完整键盘关闭与触摸。 |
| A24 | 资料列表更多（[SummaryList](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryList.tsx>)） | 点击更多；重命名/删除；更新资料 | 手写下拉 → 现有菜单 | 保留类型、补行为；不要升级成模态框。 |
| A25 | 回收站更多（[TrashPanel](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/TrashPanel.tsx>)） | 点击更多；恢复/永久删除；恢复或二次确认 | 手写菜单 → 现有菜单 | 保留类型；永久删除另见 B。 |
| A26 | 聊天添加引用、Agent/图像模式（[ChatInputArea](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx>)，两种布局） | 点击按钮；添加项/模式；添加引用或切换模式 | Popover → Popover | 保留。 |
| A27 | 聊天消息复制格式（[MessageBlocks](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx>)） | 消息工具菜单；复制选项；写剪贴板 | 手写悬浮菜单 → 点击 Popover/菜单 | 修改触发行为；信息中包含动作。 |
| A28 | [SkillsPlaza](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillsPlaza.tsx>) 选项菜单 | 点击菜单按钮；列表操作；改变当前选择/管理状态 | 手写下拉 → 现有菜单 | 类型保留，补 Escape/外部关闭/焦点返回。 |
| A29 | Skill 图标（[SkillEditor](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillEditor.tsx>)） | 点击图标；emoji 列表；修改表单 | Popover → Popover | 保留。 |
| A30 | 项目/创建 Skill 的图标选择（[ProjectEditModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ProjectEditModal.tsx>)、[SkillCreateConfirmDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillCreateConfirmDialog.tsx>)） | 点击图标；emoji 网格；修改草稿 | 内嵌展开面板 → 保留内嵌 | 不要把普通展开内容误算为浮层；若实际脱离布局才复用 Popover。 |
| A31 | 全站模型/语言/主题/风格等 SelectContent | 点击选择器；单选列表；修改字段 | Select 弹层 → Select 弹层 | 保留 listbox；全部调用位置见附录。 |
| A32 | 资产库图片更多（[GalleryActionControls](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GalleryActionControls.tsx>)） | 点击更多；参考/编辑/收藏；执行并关闭 | ActionSheet → 移动端保留 | 保留；不含不可逆确认。桌面若也展示，优先锚定 Popover，但需先核对响应式可见性。 |
| A33 | 资产库视频更多（[CreateGalleryPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx>)） | 点击视频更多；视频动作；执行并关闭 | ActionSheet → 同 A32 | 条件；由设备/空间决定，不是删除确认抽屉。 |
| A34 | 资产筛选（[GalleryFilterSheet](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GalleryFilterSheet.tsx>)） | 点击筛选；模型/刷新；立即更新列表并关闭 | ActionSheet → ActionSheet | 保留；即时应用无需未保存确认。 |
| A35 | 卡片悬停操作条、示例预览、视频悬停播放 | hover/focus；原卡片内按钮、提示词预览或视频；点击执行 | 卡片内交互 → 保留 | 不是 Tooltip；已有点击入口应保留，不能为纯装饰悬停引入 Dialog。 |

## B. 确认与撤销

| ID | 用法与位置 | 打开方式；内容；确认后 | 当前 → 推荐 | 判断与原因 |
|---|---|---|---|---|
| B01 | 资料卡删除（SummaryList 两入口、SummaryDetail） | 删除按钮；确认删除卡片；调用 deleteSummary | confirm/ConfirmDialog → 无确认＋回收站（有条件） | 条件：`api/workspace/summaries/[id].ts` 软删，但 `server/src/services/supabase.ts` 硬删。先核对实际路径；硬删路径应为弹出确认，不能直接移除保护。 |
| B02 | 回收站永久删除（TrashPanel） | 单项菜单；永久删除；调用 permanentlyDeleteTrashItem | 自建模态框 → 弹出确认 | 修改；自己的单项、可锚定，按钮命名“永久删除”。 |
| B03 | 资料编辑删除顶部图片（SummaryDetail） | 删除图像；确认；saveToHistory 后移除并保存 | 浏览器 confirm → 无确认＋现有撤销 | 修改；已有编辑历史。须验收撤销后保存同步，不能只恢复画面。 |
| B04 | 资料恢复原文（SummaryDetail） | 重置按钮；确认；写回原文并清空历史 | confirm → 可撤销后无确认 | 当前清空历史导致无法恢复；先保留快照并接现有撤销。若不批准恢复逻辑，保留确认而非直接取消。 |
| B05 | 图像控制重置（PromptCompilerPanel） | 重置按钮；提示；重置创作状态 | confirm → 无确认＋撤销 | 修改前须保存完整参数快照；只改 UI 不能保证可撤销。 |
| B06 | 应用保存提示词（[ImageCreatePage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx>)） | 点击库条目；替换提示词确认；清理负向词/当前结果状态 | confirm → 无确认＋撤销 | 条件；需恢复全部被替换状态，不能只恢复提示词。 |
| B07 | 个人素材删除（useAssetLibrary / [CreatorLibrary](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorLibrary.tsx>)） | 素材删除；确认；删除个人素材并移除选中 | confirm → 弹出确认 | 修改；当前未看到恢复入口；实施前再次核对服务端恢复语义。 |
| B08 | 历史图像删除（[HistoryPreviewModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryPreviewModal.tsx>)） | 预览内删除；确认；删除生成记录 | confirm → 弹出确认 | 修改；锚定预览内删除按钮，关闭确认回到该按钮。 |
| B09 | 会话结果图片/视频删除（ImageSessionResultCard） | 更多→删除；确认；onDelete(item) | confirm → 弹出确认 | 修改；单项且文案明确不可撤销。 |
| B10 | 情绪板列表删除（CreateMoodboardsPage） | 更多→删除；板名及参考图永久删除说明；删除板 | [ConfirmDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ConfirmDialog.tsx>) → 弹出确认／Dialog | 条件：仅个人板用弹出确认；公开共享板或需说明关联影响保留 Dialog。不能按“一个板”忽视对其他人的影响。 |
| B11 | 情绪板详情删除（[CreateMoodboardDetailPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateMoodboardDetailPage.tsx>)） | 删除板；永久删除；删除后返回列表 | confirm → 同 B10 | 同一动作的列表/详情应一致。 |
| B12 | 创作会话删除（CreateSideNav） | 会话菜单删除；确认；删除会话并可能跳到新会话 | confirm → Dialog 或弹出确认 | 条件：若级联多个结果用 Dialog；仅删除个人会话索引且无级联才用弹出确认，需核对接口。 |
| B13 | 项目删除（BoardsOverview） | 项目菜单；提示项目内容归属变化；删除项目 | confirm → 系统 Dialog | 修改组件，保留中断级别；接口将资料和会话迁移默认项目后删除项目，影响多个对象。解释需准确说明归属变化。 |
| B14 | Skill 删除（SkillEditor） | 删除按钮；不可撤销说明；删除 Skill | AlertDialog → 弹出确认／Dialog | 条件：仅私人独立 Skill 用弹出确认；发布、分享或被他人依赖时保留 Dialog。 |
| B15 | 单个脚本删除（[SkillScriptsTab](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillScriptsTab.tsx>)） | 脚本删除；确认；删除文件 | confirm → 弹出确认／Dialog | 私有草稿文件用弹出确认；影响已发布 Skill 执行则 Dialog。 |
| B16 | 单个参考文档删除（[SkillReferencesTab](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillReferencesTab.tsx>)） | 文档删除；确认；删除引用文件 | confirm → 同 B15 | 按使用范围，而非文件数量决定。 |
| B17 | 快捷指令删除（[ShortcutEditor](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ShortcutEditor.tsx>)） | 删除快捷指令；确认名称；删除 | AlertDialog → 弹出确认 | 个人单项；若后端有恢复则改为直接删除＋恢复。 |
| B18 | 单素材缩略图重生成（useThumbnailQueue） | 重生成；确认；进入收费生成队列 | confirm → 系统 Dialog／弹出确认 | 条件：费用/替换影响显著用 Dialog；低影响且单项才弹出确认；不能假设撤销能退积分。 |
| B19 | 批量缩略图生成（useThumbnailQueue） | 批量按钮；数量；入队生成 | confirm → 系统 Dialog | 修改组件；批量及消耗积分，保留确认。 |
| B20 | 批量图片生成（[BatchImageConfirmDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BatchImageConfirmDialog.tsx>)） | 批量生成；数量/成本等；生成多图 | Dialog → Dialog | 保留。 |
| B21 | 发布单草稿（[PromptCasesPanel](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx>)） | 发布；预览信息；变为公开案例 | Dialog → Dialog | 保留；影响公开内容和读者，不是私人单项删除。 |
| B22 | 批量发布草稿（[PromptCaseDraftPublishAllDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCaseDraftPublishAllDialog.tsx>)） | 发布全部；汇总；批量发布 | Dialog → Dialog | 保留。 |
| B23 | 拒绝草稿（PromptCasesPanel） | 拒绝；原因表单；更新审核状态 | Dialog → Dialog | 保留；有待填写决定/原因，补未保存保护。 |
| B24 | 删除草稿（PromptCasesPanel） | 删除；草稿信息；删除草稿 | Dialog → 弹出确认／Dialog | 私人未提交草稿用弹出确认；审核他人投稿则 Dialog；当前管理入口保守保留。 |
| B25 | 删除公开案例（PromptCasesPanel） | 删除案例；案例信息；移除公共内容 | Dialog → Dialog | 保留；影响公共链接与用户。按钮可改“删除案例”。 |
| B26 | 取消订阅（[SubscriptionManagement](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SubscriptionManagement.tsx>)） | 取消续订；到期说明；提交取消 | Dialog → Dialog | 保留；先做出费用与权益决定，不能当作普通可逆开关。 |
| B27 | 退出登录（[SettingsPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SettingsPage.tsx>)） | 退出；说明；登出 | AlertDialog → 无确认 | 可重新登录；但如有未保存表单，应由该表单的离开保护拦截。 |
| B28 | 丢弃发现来源（[AddSourceModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx>)） | 删除未导入结果；说明无法检索；丢弃结果 | AlertDialog → AlertDialog | 保留；可能多来源且仍需决定导入还是丢弃。确认按钮改“丢弃来源”。这不是全表单未保存保护。 |
| B29 | Agent 创建/更新/删除卡片（[SummaryConfirmDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryConfirmDialog.tsx>) / [ChatArea](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx>)） | Agent 提议；结果/差异预览；执行工具操作 | 自建模态 → 系统 Dialog | 条件：这是审批提议时保留；用户已明确指令且删除可恢复时不应再重复确认。三种动作不能统一按危险删除处理。 |
| B30 | 使用 Skill 处理请求（[SkillSelector](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillSelector.tsx>) 的 SkillConfirmDialog） | 匹配 Skill 后；Skill 与输入；选择使用/不用 | 自建模态 → 系统 Dialog | 保留类型；仍需决定执行方式，补标准模态行为。 |

## C. 表单、预览、信息、页面及侧栏

| ID | 用法与位置 | 打开方式；内容；提交/选择后 | 当前 → 推荐 | 判断与原因 |
|---|---|---|---|---|
| C01 | 登录/注册/找回密码（[AuthModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/AuthModal.tsx>)） | 登录入口；认证字段；登录/注册/发恢复邮件 | 自建 Dialog → Dialog | 保留；短任务，无需背景参考；对会丢失的表单输入补关闭保护。 |
| C02 | Google One Tap 备用提示（[GoogleOneTapLoginPrompt](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/GoogleOneTapLoginPrompt.tsx>)） | 登录提示逻辑；登录说明及按钮；开始认证 | 非模态登录卡 → 保留非模态卡 | 条件；自动提示不应强制焦点陷阱。用户主动打开认证才是模态 Dialog；第三方部分另验。 |
| C03 | 提示词导入（[PromptImportModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptImportModal.tsx>)） | 导入按钮；一个文本域；分析提示词 | Radix Dialog → Dialog | 保留；短表单；父层保留草稿时不误报丢失，否则询问。 |
| C04 | 个人素材编辑（[AssetEditModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetEditModal.tsx>)） | 编辑素材；分类/标题/副标题/正负提示词/标签等；保存 | Dialog → 抽屉 | 修改、组件待批；长表单；当前仅禁止 saving 期间关闭，未保护脏草稿。 |
| C05 | 反推结果编辑保存（[UploadReverseModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/UploadReverseModal.tsx>)） | 上传反推完成；多项素材及表单；保存素材 | Dialog → 抽屉 | 修改、组件待批；需要宽度及反推图片对照，不能只因名为“确认”就当确认气泡。 |
| C06 | 草稿导入（PromptCasesPanel） | 导入；来源提取和多字段编辑；保存草稿 | Dialog → 页面 | 修改；长流程，宜复用管理页上下文并给草稿/导入状态 URL。 |
| C07 | 草稿编辑（PromptCasesPanel） | 编辑草稿；长表单与素材；保存 | Dialog → 页面／抽屉 | 主编辑任务推荐页面；仅快速对照列表编辑才抽屉（组件待批）。 |
| C08 | 新建案例（PromptCasesPanel） | 新建；多字段及图片；创建案例 | Dialog → 页面 | 修改；主要创作任务，需刷新恢复草稿。 |
| C09 | 编辑案例（PromptCasesPanel） | 编辑；完整案例字段；保存公共内容 | Dialog → 页面 | 修改；用案例 ID 保持可分享/重载的编辑上下文并补离开保护。 |
| C10 | 项目信息（ProjectEditModal） | 编辑项目；名称、图标、说明；保存 | Dialog → Dialog | 保留；少量字段且无需比较背景，补 dirty 保护。 |
| C11 | 项目中选择保存位置（[HistoryAddToProjectModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryAddToProjectModal.tsx>)） | 保存到项目；项目列表；写入选定项目 | Dialog → 点击 Popover | 修改建议；简单目的地选择。若列表长且需检索可保留 Dialog。 |
| C12 | 重命名资料（SummaryDetail） | 更多→重命名；名称；保存 | Dialog → Dialog | 保留；短表单。 |
| C13 | 资料列表重命名（SummaryList） | 更多→重命名；浏览器 prompt；保存标题 | 原生 prompt → 系统 Dialog | 修改；复用短表单视觉与输入组件。 |
| C14 | 提示词库重命名（ImageCreatePage） | 重命名；浏览器 prompt；本地库改名 | 原生 prompt → 系统 Dialog | 修改；同 C13，关闭保护只针对实际会丢失的改动。 |
| C15 | 画布节点文本/图片槽提示词（[InfiniteCanvasBoard](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/InfiniteCanvasBoard.tsx>)） | 节点编辑；prompt 输入；更新节点 | 原生 prompt → Dialog／抽屉 | 短标题用 Dialog；需要对照画布写长提示词用抽屉（组件待批）。 |
| C16 | 角色工作流（[ImageCreateCharacterWorkflowModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageCreateCharacterWorkflowModal.tsx>)） | 角色工作流入口；引用/一致性检查/套件；应用或生成 | 大 Dialog → 抽屉／页面 | 对照当前图像持续操作用抽屉（待批）；独立管理角色复用已有角色页面。 |
| C17 | 角色参考选择（[CharacterReferencePickerModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CharacterReferencePickerModal.tsx>)） | 选角色；角色列表、创建和选取；应用参考 | Dialog → Dialog／抽屉 | 快速选取保留；持续新建编辑并比较背景才抽屉。多选未提交须保护。 |
| C18 | 素材选择（[AssetPicker](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetPicker.tsx>)） | 选择素材；分类/搜索/导入入口；更新槽位 | Dialog → 抽屉 | 对照创作画布逐槽选择更适合抽屉（待批）；一次选择即关闭可保留 Dialog。 |
| C19 | 参考图总管理（PromptCompilerPanel） | 引用按钮；上传/选角色/历史图；更新引用 | Dialog → 抽屉／Dialog | 条件；连续比较用抽屉，短暂选择保留；避免多个嵌套 Dialog 同时处理 Escape。 |
| C20 | 历史图库（[HistoryGalleryModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryGalleryModal.tsx>)） | 更多历史/从历史选图；图库与多选；预览/应用 | Dialog → Dialog | 选择子任务保留；独立长期管理已有 gallery 页面。 |
| C21 | 图片编辑器选资产（[ImageEditorAssetPicker](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorAssetPicker.tsx>)） | 选图；单选/多选图库；替换/添加参考 | 自建模态 → Dialog | 类型正确；源码没有焦点陷阱与 Escape 处理，补现有底座行为。 |
| C22 | 情绪板添加来源（[MoodboardSourcePicker](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/MoodboardSourcePicker.tsx>)） | 添加图；搜索个人图/案例；直接加入情绪板 | Dialog → 抽屉／Dialog | 对照情绪板连续加图用抽屉；创建时一次选首图保留 Dialog。即时添加不要伪装未保存草稿。 |
| C23 | 角色页图库选择（[CreateCharactersPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx>)） | 从图库选；多参考图；填充角色引用 | 自建 Dialog → Dialog | 保留类型；未确认选择关闭时按是否丢失处理。 |
| C24 | 官方角色详情（CreateCharactersPage） | 点击角色；角色介绍及应用；使用角色 | Dialog → Dialog | 保留快速预览；需要公开分享时另用详情 URL。 |
| C25 | 提示词/预设库（PromptCompilerPanel） | 打开库；列表、应用/改名/删除；改变提示词 | 自建 Dialog → 点击 Popover／抽屉 | 简单预设选择用 Popover；大量保存内容与管理用抽屉（待批），不能把整个库塞成工具提示。 |
| C26 | 创建 Skill 审阅编辑（SkillCreateConfirmDialog） | Agent 草稿；名称/描述/提示词/类型等；创建 | Dialog → 抽屉／页面 | 长表单，参考对话用抽屉（待批），主编辑工作用页面；最终提交不是把长表单保留在确认框的理由。 |
| C27 | 执行 Skill 配置（[SkillConfigDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillConfigDialog.tsx>)） | 运行 Skill；动态参数/引用；执行 | Dialog → 按字段规模决定 | 短表单保留 Dialog；长配置或需对照资料用抽屉（待批），保留执行前费用说明。 |
| C28 | 编辑 Skill 脚本（SkillScriptsTab） | 编辑；代码文本；保存文件 | 自建模态 → 页面／抽屉 | 独立代码编辑主任务推荐页面；只临时改一段且对照 Skill 用抽屉（待批）；补脏数据保护。 |
| C29 | 编辑 Skill 参考文档（SkillReferencesTab） | 编辑；长文本；保存文档 | 自建模态 → 页面／抽屉 | 同 C28。 |
| C30 | 添加来源 URL（AddSourceModal） | 添加网址；短输入；导入 | Dialog → Dialog | 保留；补关闭保护。 |
| C31 | 添加来源文本（AddSourceModal） | 粘贴文本；文本编辑；导入 | Dialog → Dialog／抽屉 | 简短粘贴保留；长文编写且对照资料用抽屉（待批）。 |
| C32 | 搜索/发现来源（AddSourceModal、[SourceDiscoveryModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SourceDiscoveryModal.tsx>)） | 添加/发现；搜索结果及勾选；导入来源 | Dialog → Dialog／抽屉 | 一次选择保留；长时间筛选并对照资料用抽屉。已有丢弃结果确认保留。 |
| C33 | 聊天引用选择（[ReferenceSelector](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ReferenceSelector.tsx>)） | 添加引用；已有资料多选；附加到聊天 | Dialog → Dialog | 保留；选择暂存是否丢失决定关闭保护。 |
| C34 | 导出图片（[ExportImageModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ExportImageModal.tsx>)） | 导出；格式设置与框内预览；下载 | Dialog → Dialog | 保留；所需预览已在内部，无需背景参照；其升级提示仍为短 Dialog。 |
| C35 | 分享（[ShareButton](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ShareButton.tsx>)） | 分享按钮；开关/链接/复制；发布或复制分享链接 | Dialog → Dialog／Popover | 涉及公开权限决定保留 Dialog；仅复制既有链接才 Popover。 |
| C36 | 全局搜索（[GlobalSearchModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/GlobalSearchModal.tsx>)） | 搜索入口；查询和结果；导航 | Dialog → Dialog | 保留；短暂定位任务。 |
| C37 | 创作命令面板（[GlobalCommandPalette](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GlobalCommandPalette.tsx>)） | ⌘K/Ctrl+K；命令列表；导航 | 自建 Dialog → Dialog | 保留，补标准模态行为即可。 |
| C38 | 图片历史/视频历史预览（HistoryPreviewModal、[VideoHistoryPreviewDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/VideoHistoryPreviewDialog.tsx>)） | 点击结果；媒体及元信息/操作；下载/复用等 | CreationPreviewDialog → Dialog | 保留快速预览；其中删除单独按 B08。 |
| C39 | 首页案例预览（[CreateHomePage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx>)） | 点击案例；图和提示词；复制/使用/详情链接 | 自建 Dialog → Dialog | 保留；已有独立详情链接承担分享。 |
| C40 | 资产库图片预览（CreateGalleryPage） | 点击资产；大图/操作；复用/下载 | 自建 Dialog → Dialog | 保留；不强行升级为新页面。 |
| C41 | 提示词库案例预览（[PromptCasePreviewDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/prompt-library/PromptCasePreviewDialog.tsx>)） | 点击案例；图/文/操作；复制/使用/详情 | 自建 Dialog → Dialog | 保留；可分享内容使用现有 /prompts/:slug。 |
| C42 | 管理案例预览和嵌套媒体预览（PromptCasesPanel） | 预览按钮/媒体；图像及描述；关闭/复用 | 多个自建 Dialog → Dialog | 保留类型；复用底座，核查嵌套焦点与 Escape 层级。 |
| C43 | 大图缩放（ImageLightbox） | 查看大图；缩放/拖动；关闭 | 自建 Dialog＋overlay hook → Dialog | 保留；特殊图像交互不合并丢失。 |
| C44 | 工作台大图（ImagePreview） | 点击图片；图像缩放/下载；关闭 | 自建覆盖层 → Dialog | 保留类型；有 Escape，仍需补焦点约束/恢复。 |
| C45 | 每日奖励（[DailyLoginRewardModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/DailyLoginRewardModal.tsx>)） | 奖励可见状态；到账信息；关闭/下一步 | Dialog → 非阻断反馈或保留 Dialog | 条件：若已到账纯通知，不必暂停；若含用户需完成选择则 Dialog。不能仅为展示奖励重构视觉，需单独批准是否改触发。 |
| C46 | 任务奖励（[QuestRewardModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/QuestRewardModal.tsx>)） | 奖励入口；任务/奖励信息；领取或导航 | 自建 Dialog → Dialog／页面 | 短领取流程保留；持续做任务应使用已有任务页，未验运行时入口。 |
| C47 | 创作引导（[CreateOnboardingModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateOnboardingModal.tsx>)） | 新用户引导；步骤；完成/关闭 | Dialog → Dialog | 保留；无需背景比较的短引导。 |
| C48 | 工作台引导（[OnboardingModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/OnboardingModal.tsx>)） | 初次使用；步骤；完成/关闭 | Dialog → Dialog | 保留。 |
| C49 | 升级提示（[UpgradePromptModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/UpgradePromptModal.tsx>)） | 额度/功能入口；升级说明；去价格页 | 自建 Dialog → Dialog | 保留；阻断当前请求后需要决定下一步。 |
| C50 | 深度功能付费墙（[DeepFeaturePaywallModal](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/DeepFeaturePaywallModal.tsx>)） | 使用受限功能；权益说明；登录/升级 | 自建 Dialog → Dialog | 保留。 |
| C51 | 积分不足（[CreditsWarning](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/CreditsWarning.tsx>)） | 提交任务后额度不足；说明；关闭/升级 | 自建模态 → Dialog | 保留类型，补语义与焦点。 |
| C52 | 首页促销详情（CreateHomePage） | 点击促销入口；内容与 CTA；去价格页 | Dialog → Dialog／Popover | 主动阅读完整详情可保留；只有一行说明与链接时 Popover。当前不改视觉。 |
| C53 | 邀请奖励（[ReferralInviteDialog](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ReferralInviteDialog.tsx>)） | 点击邀请；规则/邀请链接；复制 | Dialog → Dialog | 保留；内容量超过简单锚定提示。 |
| C54 | 系统公告（CreateSideNav） | 公告按钮；公告列表；阅读/关闭 | 自建 Dialog → Dialog／页面 | 快速查看保留；长期公告档案使用 updates 页面。 |
| C55 | 账户积分历史（[CreateAccountPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateAccountPage.tsx>)） | 查看历史；分页明细；翻页/关闭 | Dialog → Dialog／页面 | 快速查账保留；需保存筛选或分享链接时页面。 |
| C56 | 案例素材覆盖助手（[PromptCaseAdminPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptCaseAdminPage.tsx>)） | 打开助手；素材运营内容；执行管理操作 | 大模态 → 页面 | 主要运营任务，优先现有 [PromptAssetOpsPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptAssetOpsPage.tsx>)，避免大任务塞入模态。 |
| C57 | AI 用量汇总（PromptCaseAdminPage） | 用量按钮；统计；查看/关闭 | 大模态 → Dialog／页面 | 快速概览保留；持续分析/筛选导出才页面。未发现跟随指针图表需求。 |
| C58 | 设置覆盖页（workspace/App） | 设置入口；整页设置；保存/返回 | fixed 全屏层 → 路由页面 | 修改可达旧入口；已有 [SettingsRoutePage](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/SettingsRoutePage.tsx>)，应保留 URL/刷新/返回行为。 |
| C59 | 套餐覆盖页（workspace/App、[PricingPage](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/PricingPage.tsx>)） | 升级入口；套餐比较/购买；结算 | fixed 全屏层 → 路由页面 | 主要比较任务；优先既有 pricing 路由；短升级解释弹窗可继续存在。 |
| C60 | 快捷指令管理（[ShortcutManager](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ShortcutManager.tsx>)、ShortcutEditor） | 管理入口；列表及编辑；保存 | fixed 全屏管理 → 页面 | 主任务需 URL 和离开保护；删除另见 B17。 |
| C61 | 联系我们二维码（workspace/App） | 联系按钮；二维码说明；扫码/关闭 | 自建 Dialog → Dialog | 保留类型；内容需独立阅读，补焦点行为。 |
| C62 | 在线客服（[SupportChat](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/SupportChat.tsx>)） | 点击在线客服；第三方聊天；发送/接收 | Chatwoot 浮动面板 → 非模态侧面板 | 保留；需参照产品页面，仓库只验证关闭回焦点逻辑，内部焦点/草稿由第三方运行态确认。 |
| C63 | 引用选择失败（ChatArea [ErrorBoundary](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ErrorBoundary.tsx>)） | 选择器加载失败；错误/关闭；返回聊天 | 手写模态 → Dialog | 保留类型，错误分支也要 Escape/焦点管理。 |
| C64 | 编辑器、角色、情绪板分析、生成记录、聊天素材等常驻 Panel | 页面导航/展开；持续编辑或信息；即时应用 | 页面内面板 → 保留页面内 | 不因命名 Panel 就改成抽屉；常驻布局不应添加遮罩。 |

## 行为缺失：只补实际缺少的部分

1. **工具提示**：全站共享 Provider 首次约 500ms、相邻快速切换；保留纯文本；焦点可见、aria-describedby、视口碰撞处理、指针可经过、同时只一个。色块已用 Radix，重点是时序和触摸；原生 title 的所有入口按附录逐一处理。可点击动作说明与点击主动作必须分清，不能吞掉主操作。
2. **交互弹出层**：图像/视频工具与工作台用户悬停卡改为点击打开；复用 Popover/DropdownMenu 的锚点、Escape、外部关闭、焦点返回。原样保留视觉类、尺寸、圆角、间距、阴影、字体、已有动画；不要用新底座默认类覆盖现有外观。
3. **单项确认**：Popover 组合现有按钮；保持锚点不卸载；确认后等待请求成功才收起，错误在原处显示；确认按钮命名实际动作。确认层不能被菜单关闭同时卸载。
4. **模态**：共享 Dialog 的 hook 已有初始焦点、Tab 循环、Escape、返回焦点、滚动锁；不应重复宣称全部缺失。但多个 hook 同时挂载会各自监听 document Escape，且没有统一最顶层栈，需检查嵌套一次 Escape 只关闭最顶层。ImageEditorAssetPicker、脚本/文档编辑、TrashPanel、自建 Skill/Summary 确认等缺少完整系统模态机制。
5. **未保存保护**：AssetEditModal、UploadReverseModal、案例/草稿编辑、ProjectEditModal、Skill 配置/创建/脚本/文档、重命名、来源文本等要按“关闭是否真丢数据”比较初始值。所有关闭路径统一走同一入口：Escape、遮罩、X、取消、路由返回、刷新。已有 beforeunload 只保护正在生成的缩略图队列，不等同于保护表单。即时保存的筛选/选项不得伪装成未保存。
6. **抽屉**：当前不实施。获批后须复用原表单和设计 token，页面保持可见，临时改动可预览，关闭能返回触发点；没有真实预览能力时不能宣称“实时显示在背景”。新增侧边进入动画与用户“动画不变”的要求存在需批准的例外，不能暗中改动。
7. **页面**：页面化需要可恢复 ID/草稿、路由返回和刷新后的状态；只把模态铺满屏幕不能算完成。
8. **可撤销动作**：资料软删、编辑历史、状态快照分别验证实际恢复。server/API 删除实现差异是明确阻塞项；不在本次 UI 范围擅自改后端语义。

## 建议批准顺序与边界

- 第一批：A05–A09、A13 的点击触发；A01–A04 的提示行为；C21/C44/C51/C61/C63 的模态行为；已有短表单的未保存保护。仅复用已有系统组件，保持样式和文案。
- 第二批：B02、B07–B09、B17 的单项弹出确认；B13/B19 的系统 Dialog。确认按钮和不可撤销解释行允许调整，其他文案原样保留。
- 条件项先不改：B01/B03–B06/B10–B12/B14–B16/B18/B24/B29 等需核实恢复/影响范围；保留表中分支，不把猜测写成不可撤销事实。
- 抽屉组件、页面化与组件底座整合分别审批；本报告不包含新组件授权，也不做全站组件重构。

实施后需分别报告：本地检查、桌面浏览器、触摸尺寸浏览器、键盘/焦点/嵌套/脏表单验收；若后续要求发布，再执行项目发布规则并分别报告 CI、部署、线上验收。本轮没有运行测试、CI 或部署。

本轮仅新增审查文档与源码索引；所有应用源文件和已有未提交改动保持原样。等待用户按 ID 或批次批准。

## 附录

[逐位置源码索引](</Users/zhongqingbiao/Developer/New project/zongjie/docs/reviews/FLOATING_UI_SOURCE_INDEX_2026-11-12.md>)：126 个覆盖层 JSX 定义/调用命中、111 个原生 title 候选、33 个 SelectContent 位置。数字包含同一业务的复用与不同渲染分支，不等于独立产品案例数。

关键恢复语义证据：[Web API 软删除](</Users/zhongqingbiao/Developer/New project/zongjie/api/workspace/summaries/[id].ts:246>)、[server 硬删除](</Users/zhongqingbiao/Developer/New project/zongjie/server/src/services/supabase.ts:263>)、[回收站恢复](</Users/zhongqingbiao/Developer/New project/zongjie/api/workspace/trash/[id].ts:65>)。

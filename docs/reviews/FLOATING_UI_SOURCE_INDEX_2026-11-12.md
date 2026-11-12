# 浮动 UI 源码位置索引

2026-11-12，当前工作区静态 JSX 索引。用于定位，**不是每条均已运行时验证**。同一组件的定义与调用均可能出现；原生 title 是候选，动态表达式保留原样，不把自定义组件的 title 属性误认为浏览器 Tooltip。

## 覆盖层定义及调用

| 位置 | 组件/元素 | role |
|---|---|---|
| [src/web/components/AuthModal.tsx:212](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/AuthModal.tsx:212>) | AuthModal | 由组件决定 |
| [src/web/components/AuthModal.tsx:388](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/AuthModal.tsx:388>) | Card | dialog |
| [src/web/components/GoogleOneTapLoginPrompt.tsx:356](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/GoogleOneTapLoginPrompt.tsx:356>) | div | dialog |
| [src/web/components/create-workspace/DiscoveryImageMoodboardActions.tsx:162](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/DiscoveryImageMoodboardActions.tsx:162>) | ActionSheet | 由组件决定 |
| [src/web/components/create-workspace/DiscoveryImageMoodboardActions.tsx:173](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/DiscoveryImageMoodboardActions.tsx:173>) | PopoverRoot | 由组件决定 |
| [src/web/components/create-workspace/MoodboardSourcePicker.tsx:37](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/MoodboardSourcePicker.tsx:37>) | Dialog | 由组件决定 |
| [src/web/components/image-create/AssetEditModal.tsx:118](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetEditModal.tsx:118>) | DialogRoot | 由组件决定 |
| [src/web/components/image-create/AssetPicker.tsx:121](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetPicker.tsx:121>) | Dialog | 由组件决定 |
| [src/web/components/image-create/CharacterReferencePickerModal.tsx:343](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CharacterReferencePickerModal.tsx:343>) | Dialog | 由组件决定 |
| [src/web/components/image-create/CreateOnboardingModal.tsx:197](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateOnboardingModal.tsx:197>) | Dialog | 由组件决定 |
| [src/web/components/image-create/CreateSideNav.tsx:1250](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateSideNav.tsx:1250>) | ReferralInviteDialog | 由组件决定 |
| [src/web/components/image-create/CreateSideNav.tsx:1287](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateSideNav.tsx:1287>) | section | dialog |
| [src/web/components/image-create/CreateSideNavSessionMenu.tsx:40](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateSideNavSessionMenu.tsx:40>) | DropdownMenu | 由组件决定 |
| [src/web/components/image-create/CreateWorkspaceFrame.tsx:187](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreateWorkspaceFrame.tsx:187>) | DailyLoginRewardModal | 由组件决定 |
| [src/web/components/image-create/CreationPreviewDialog.tsx:45](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreationPreviewDialog.tsx:45>) | section | dialog |
| [src/web/components/image-create/CreatorAccountMenu.tsx:278](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorAccountMenu.tsx:278>) | PopoverRoot | 由组件决定 |
| [src/web/components/image-create/DailyLoginRewardModal.tsx:136](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/DailyLoginRewardModal.tsx:136>) | Dialog | 由组件决定 |
| [src/web/components/image-create/DeepFeaturePaywallModal.tsx:220](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/DeepFeaturePaywallModal.tsx:220>) | motion.section | dialog |
| [src/web/components/image-create/GalleryActionControls.tsx:121](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GalleryActionControls.tsx:121>) | ActionSheet | 由组件决定 |
| [src/web/components/image-create/GalleryFilterSheet.tsx:31](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GalleryFilterSheet.tsx:31>) | ActionSheet | 由组件决定 |
| [src/web/components/image-create/GlobalCommandPalette.tsx:49](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GlobalCommandPalette.tsx:49>) | div | dialog |
| [src/web/components/image-create/GlobalCommandPalette.tsx:59](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/GlobalCommandPalette.tsx:59>) | GlobalCommandPaletteDialog | 由组件决定 |
| [src/web/components/image-create/HistoryAddToProjectModal.tsx:37](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryAddToProjectModal.tsx:37>) | Dialog | 由组件决定 |
| [src/web/components/image-create/HistoryGalleryModal.tsx:99](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryGalleryModal.tsx:99>) | section | dialog |
| [src/web/components/image-create/HistoryPreviewModal.tsx:270](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/HistoryPreviewModal.tsx:270>) | CreationPreviewDialog | 由组件决定 |
| [src/web/components/image-create/ImageCreateCharacterWorkflowModal.tsx:83](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageCreateCharacterWorkflowModal.tsx:83>) | section | dialog |
| [src/web/components/image-create/ImageLightbox.tsx:274](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageLightbox.tsx:274>) | div | dialog |
| [src/web/components/image-create/ImageSessionResultCard.tsx:193](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionResultCard.tsx:193>) | div | menu |
| [src/web/components/image-create/ImageStudioComposer.tsx:504](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageStudioComposer.tsx:504>) | motion.div | dialog |
| [src/web/components/image-create/PromptCaseDraftPublishAllDialog.tsx:37](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCaseDraftPublishAllDialog.tsx:37>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:841](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:841>) | section | dialog |
| [src/web/components/image-create/PromptCasesPanel.tsx:4085](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4085>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:4455](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4455>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:4548](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4548>) | PromptCaseDraftPublishAllDialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:4559](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4559>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:4639](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4639>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:4719](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:4719>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:5099](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:5099>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:5181](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:5181>) | Dialog | 由组件决定 |
| [src/web/components/image-create/PromptCasesPanel.tsx:5527](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:5527>) | section | dialog |
| [src/web/components/image-create/PromptCompilerPanel.tsx:594](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:594>) | DialogRoot | 由组件决定 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:1270](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:1270>) | section | dialog |
| [src/web/components/image-create/PromptImportModal.tsx:33](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptImportModal.tsx:33>) | Dialog | 由组件决定 |
| [src/web/components/image-create/ReferralInviteDialog.tsx:94](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ReferralInviteDialog.tsx:94>) | Dialog | 由组件决定 |
| [src/web/components/image-create/UpgradePromptModal.tsx:49](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/UpgradePromptModal.tsx:49>) | section | dialog |
| [src/web/components/image-create/UploadReverseModal.tsx:80](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/UploadReverseModal.tsx:80>) | DialogRoot | 由组件决定 |
| [src/web/components/image-create/VideoHistoryPreviewDialog.tsx:154](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/VideoHistoryPreviewDialog.tsx:154>) | CreationPreviewDialog | 由组件决定 |
| [src/web/components/image-create/WardrobeMaterialPicker.tsx:44](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/WardrobeMaterialPicker.tsx:44>) | Popover | 由组件决定 |
| [src/web/components/image-editor/ImageEditorAssetPicker.tsx:84](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorAssetPicker.tsx:84>) | section | dialog |
| [src/web/components/image-editor/ImageEditorPanel.tsx:723](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:723>) | Tooltip | 由组件决定 |
| [src/web/components/image-editor/ImageEditorPanel.tsx:748](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:748>) | Popover | 由组件决定 |
| [src/web/components/video-create/VideoStudioComposer.tsx:742](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/video-create/VideoStudioComposer.tsx:742>) | div | dialog |
| [src/web/pages/CreateAccountPage.tsx:637](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateAccountPage.tsx:637>) | Dialog | 由组件决定 |
| [src/web/pages/CreateCharactersPage.tsx:1143](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:1143>) | section | dialog |
| [src/web/pages/CreateCharactersPage.tsx:1204](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:1204>) | HistoryGalleryModal | 由组件决定 |
| [src/web/pages/CreateCharactersPage.tsx:1237](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:1237>) | section | dialog |
| [src/web/pages/CreateGalleryPage.tsx:1505](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1505>) | GalleryActionSheet | 由组件决定 |
| [src/web/pages/CreateGalleryPage.tsx:1528](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1528>) | GalleryFilterSheet | 由组件决定 |
| [src/web/pages/CreateGalleryPage.tsx:1538](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1538>) | ActionSheet | 由组件决定 |
| [src/web/pages/CreateGalleryPage.tsx:1614](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1614>) | VideoHistoryPreviewDialog | 由组件决定 |
| [src/web/pages/CreateGalleryPage.tsx:1633](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1633>) | section | dialog |
| [src/web/pages/CreateHomePage.tsx:1142](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1142>) | DeepFeaturePaywallModal | 由组件决定 |
| [src/web/pages/CreateHomePage.tsx:1155](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1155>) | Dialog | 由组件决定 |
| [src/web/pages/CreateHomePage.tsx:1605](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1605>) | section | dialog |
| [src/web/pages/CreateMoodboardsPage.tsx:478](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateMoodboardsPage.tsx:478>) | PopoverRoot | 由组件决定 |
| [src/web/pages/CreateMoodboardsPage.tsx:612](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateMoodboardsPage.tsx:612>) | PopoverRoot | 由组件决定 |
| [src/web/pages/CreateMoodboardsPage.tsx:782](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateMoodboardsPage.tsx:782>) | ConfirmDialog | 由组件决定 |
| [src/web/pages/CreateVideoPage.tsx:2057](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateVideoPage.tsx:2057>) | VideoHistoryPreviewDialog | 由组件决定 |
| [src/web/pages/CreateVideoPage.tsx:2068](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateVideoPage.tsx:2068>) | HistoryGalleryModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6326](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6326>) | DeepFeaturePaywallModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6355](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6355>) | CharacterReferencePickerModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6369](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6369>) | ImageCreateCharacterWorkflowModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6435](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6435>) | HistoryGalleryModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6455](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6455>) | HistoryPreviewModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6487](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6487>) | VideoHistoryPreviewDialog | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6509](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6509>) | UploadReverseModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6526](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6526>) | PromptImportModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6536](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6536>) | UpgradePromptModal | 由组件决定 |
| [src/web/pages/ImageCreatePage.tsx:6578](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageCreatePage.tsx:6578>) | AssetEditModal | 由组件决定 |
| [src/web/pages/PromptCaseAdminPage.tsx:184](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptCaseAdminPage.tsx:184>) | div | dialog |
| [src/web/pages/PromptCaseAdminPage.tsx:220](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptCaseAdminPage.tsx:220>) | div | dialog |
| [src/web/pages/PromptSeoLandingPage.tsx:3290](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptSeoLandingPage.tsx:3290>) | PromptCasePreviewDialog | 由组件决定 |
| [src/web/pages/prompt-library/PromptCasePreviewDialog.tsx:175](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/prompt-library/PromptCasePreviewDialog.tsx:175>) | article | dialog |
| [src/workspace/App.tsx:5223](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:5223>) | GlobalSearchModal | 由组件决定 |
| [src/workspace/App.tsx:5237](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:5237>) | div | dialog |
| [src/workspace/App.tsx:5294](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:5294>) | AddSourceModal | 由组件决定 |
| [src/workspace/components/AddSourceModal.tsx:241](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx:241>) | Dialog | 由组件决定 |
| [src/workspace/components/AddSourceModal.tsx:324](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx:324>) | Dialog | 由组件决定 |
| [src/workspace/components/AddSourceModal.tsx:398](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx:398>) | Dialog | 由组件决定 |
| [src/workspace/components/AddSourceModal.tsx:658](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx:658>) | SourceDiscoveryModal | 由组件决定 |
| [src/workspace/components/AddSourceModal.tsx:679](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/AddSourceModal.tsx:679>) | AlertDialog | 由组件决定 |
| [src/workspace/components/BatchImageConfirmDialog.tsx:54](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BatchImageConfirmDialog.tsx:54>) | Dialog | 由组件决定 |
| [src/workspace/components/BoardsOverview.tsx:966](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BoardsOverview.tsx:966>) | Popover | 由组件决定 |
| [src/workspace/components/BoardsOverview.tsx:1184](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BoardsOverview.tsx:1184>) | ProjectEditModal | 由组件决定 |
| [src/workspace/components/BoardsOverview.tsx:1195](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BoardsOverview.tsx:1195>) | GlobalSearchModal | 由组件决定 |
| [src/workspace/components/BoardsOverview.tsx:1499](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/BoardsOverview.tsx:1499>) | Popover | 由组件决定 |
| [src/workspace/components/ChatArea.tsx:1879](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1879>) | BatchImageConfirmDialog | 由组件决定 |
| [src/workspace/components/ChatArea.tsx:1897](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1897>) | SkillConfirmDialog | 由组件决定 |
| [src/workspace/components/ChatArea.tsx:1924](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1924>) | SkillCreateConfirmDialog | 由组件决定 |
| [src/workspace/components/ChatArea.tsx:1935](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1935>) | SummaryConfirmDialog | 由组件决定 |
| [src/workspace/components/ChatInputArea.tsx:468](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:468>) | Popover | 由组件决定 |
| [src/workspace/components/ChatInputArea.tsx:544](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:544>) | Popover | 由组件决定 |
| [src/workspace/components/ChatInputArea.tsx:874](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:874>) | Popover | 由组件决定 |
| [src/workspace/components/ConfirmDialog.tsx:38](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ConfirmDialog.tsx:38>) | AlertDialog | 由组件决定 |
| [src/workspace/components/ExportImageModal.tsx:182](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ExportImageModal.tsx:182>) | Dialog | 由组件决定 |
| [src/workspace/components/ExportImageModal.tsx:298](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ExportImageModal.tsx:298>) | Dialog | 由组件决定 |
| [src/workspace/components/GlobalSearchModal.tsx:139](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/GlobalSearchModal.tsx:139>) | Dialog | 由组件决定 |
| [src/workspace/components/OnboardingModal.tsx:78](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/OnboardingModal.tsx:78>) | Dialog | 由组件决定 |
| [src/workspace/components/ProjectEditModal.tsx:133](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ProjectEditModal.tsx:133>) | Dialog | 由组件决定 |
| [src/workspace/components/QuestRewardModal.tsx:184](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/QuestRewardModal.tsx:184>) | div | dialog |
| [src/workspace/components/ReferenceSelector.tsx:169](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ReferenceSelector.tsx:169>) | Dialog | 由组件决定 |
| [src/workspace/components/SettingsPage.tsx:251](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SettingsPage.tsx:251>) | AlertDialog | 由组件决定 |
| [src/workspace/components/ShareButton.tsx:211](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ShareButton.tsx:211>) | Dialog | 由组件决定 |
| [src/workspace/components/ShortcutEditor.tsx:287](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ShortcutEditor.tsx:287>) | AlertDialog | 由组件决定 |
| [src/workspace/components/SkillConfigDialog.tsx:1037](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillConfigDialog.tsx:1037>) | Dialog | 由组件决定 |
| [src/workspace/components/SkillCreateConfirmDialog.tsx:193](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillCreateConfirmDialog.tsx:193>) | Dialog | 由组件决定 |
| [src/workspace/components/SkillEditor.tsx:212](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillEditor.tsx:212>) | Popover | 由组件决定 |
| [src/workspace/components/SkillEditor.tsx:619](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillEditor.tsx:619>) | AlertDialog | 由组件决定 |
| [src/workspace/components/SourceDiscoveryModal.tsx:52](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SourceDiscoveryModal.tsx:52>) | Dialog | 由组件决定 |
| [src/workspace/components/SubscriptionManagement.tsx:159](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SubscriptionManagement.tsx:159>) | Dialog | 由组件决定 |
| [src/workspace/components/SummaryDetail.tsx:1920](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:1920>) | Popover | 由组件决定 |
| [src/workspace/components/SummaryDetail.tsx:2387](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2387>) | Dialog | 由组件决定 |
| [src/workspace/components/SummaryDetail.tsx:2432](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2432>) | ConfirmDialog | 由组件决定 |
| [src/workspace/components/SummaryDetail.tsx:2459](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2459>) | ExportImageModal | 由组件决定 |
| [src/workspace/components/WorkbenchTopbar.tsx:134](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/WorkbenchTopbar.tsx:134>) | Popover | 由组件决定 |
| [src/workspace/components/WorkbenchTopbar.tsx:282](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/WorkbenchTopbar.tsx:282>) | Popover | 由组件决定 |

## 原生 title 文本提示候选（逐位置）

触发：桌面原生悬停；内容：表中的 title；提示自身没有确认操作。推荐均为纯文本 Tooltip，实际按钮/链接点击动作原样保留。禁用控件及触摸入口按主报告 A04 单独处理。

| 位置 | 元素 | 内容表达式 | 决策 |
|---|---|---|---|
| [src/web/components/AiRechargeLink.tsx:37](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/AiRechargeLink.tsx:37>) | a | `{ isZh ? '前往 AICZ AI 会员代充（新窗口打开）' : 'Visit AICZ AI membership top-ups (opens in a new tab)' }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-home/HomeReferenceStrip.tsx:38](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-home/HomeReferenceStrip.tsx:38>) | div | `{reference.label}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-workspace/CreationCreditEstimate.tsx:56](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/CreationCreditEstimate.tsx:56>) | span | `{accessibleLabel}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-workspace/CreationCreditEstimate.tsx:83](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/CreationCreditEstimate.tsx:83>) | span | `{accessibleLabel}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-workspace/CreationGenerateButton.tsx:48](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/CreationGenerateButton.tsx:48>) | button | `{label}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-workspace/PromptReferenceThumbnail.tsx:56](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/PromptReferenceThumbnail.tsx:56>) | button | `{mentionLabel}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/create-workspace/PromptReferenceThumbnail.tsx:64](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/create-workspace/PromptReferenceThumbnail.tsx:64>) | button | `{removeLabel}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/AssetPicker.tsx:177](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetPicker.tsx:177>) | small | `{assetLoadError \|\| undefined}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/CreatorLibrary.tsx:109](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorLibrary.tsx:109>) | small | `{assetLoadError \|\| undefined}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/CreatorLibrary.tsx:401](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorLibrary.tsx:401>) | span | `{batchQueue[asset.id].error \|\| undefined}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionConversation.tsx:110](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionConversation.tsx:110>) | button | `"点击复制提示词"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionConversation.tsx:133](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionConversation.tsx:133>) | button | `"查看任务提示词"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionConversation.tsx:143](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionConversation.tsx:143>) | button | `"取消生成任务"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionConversation.tsx:238](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionConversation.tsx:238>) | button | `"点击复制提示词"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionResultCard.tsx:138](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionResultCard.tsx:138>) | button | `{isEnglish ? 'Edit in image editor' : '编辑图片'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionResultCard.tsx:151](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionResultCard.tsx:151>) | button | `{item.isFavorite ? '取消收藏' : '加入收藏'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageSessionResultCard.tsx:164](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageSessionResultCard.tsx:164>) | button | `{isVideo ? '更多视频操作' : '更多图片操作'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/ImageStudioComposer.tsx:456](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ImageStudioComposer.tsx:456>) | button | `{TOOL_LABELS[tool]}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/PromptCasesPanel.tsx:3957](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:3957>) | button | `{asset.title}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/PromptCasesPanel.tsx:5547](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:5547>) | button | `{t('promptCases.share') as string}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:715](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:715>) | strong | `{item.fileName}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorCanvas.tsx:775](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorCanvas.tsx:775>) | button | `{`${version.label}${version.id === activeVersionId ? ` · ${isEnglish ? 'current' : '当前'}` : ` · ${isEnglish ? 'view' : '查看'}`}`}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorCanvas.tsx:877](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorCanvas.tsx:877>) | button | `{isEnglish ? 'Remove region' : '删除该区域'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorPanel.tsx:396](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:396>) | button | `{referenceCopy.mention}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorPanel.tsx:405](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:405>) | button | `{isEnglish ? 'Remove reference' : '移除参考图'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorPanel.tsx:471](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:471>) | button | `{isEnglish ? 'Remove region' : '删除区域'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/image-editor/ImageEditorPanel.tsx:750](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-editor/ImageEditorPanel.tsx:750>) | button | `{ isEnglish ? 'Custom color' : '自定义颜色' }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/video-create/VideoStudioComposer.tsx:473](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/video-create/VideoStudioComposer.tsx:473>) | button | `{label}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/components/video-create/VideoStudioComposer.tsx:1219](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/video-create/VideoStudioComposer.tsx:1219>) | label | `{copy.webSearchHint}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/pages/ImageEditorPage.tsx:280](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageEditorPage.tsx:280>) | button | `{isEnglish ? 'Undo' : '撤销'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/pages/ImageEditorPage.tsx:289](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/ImageEditorPage.tsx:289>) | button | `{isEnglish ? 'Redo' : '重做'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/web/pages/LinksPage.tsx:88](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/LinksPage.tsx:88>) | a | `{item.title}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4026](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4026>) | div | `{user?.email \|\| 'User Settings'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4148](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4148>) | button | `"查看套餐"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4322](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4322>) | button | `"个人中心"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4607](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4607>) | button | `"收起素材栏"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4639](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4639>) | button | `{t('chat.close')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4722](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4722>) | button | `"瀑布流展示"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4734](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4734>) | button | `"列表展示"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4746](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4746>) | button | `{ effectiveProjectId ? '搜索当前项目来源' : t('summaryList.searchPlaceholder') }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4765](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4765>) | button | `{ effectiveProjectId ? '添加来源' : t('app.add') }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4900](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4900>) | button | `{t('chat.close')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4927](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4927>) | button | `"瀑布流展示"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/App.tsx:4939](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/App.tsx:4939>) | button | `"列表展示"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1527](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1527>) | button | `{`${item.label}：${item.title}`}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1560](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1560>) | button | `"收起 Agent"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1572](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1572>) | button | `{t('chat.newConversation')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1582](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1582>) | button | `{t('chat.conversationHistory')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1765](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1765>) | input | `{t('chat.uploadImage')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatArea.tsx:1775](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatArea.tsx:1775>) | input | `{t('chat.uploadDocument')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:348](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:348>) | div | `{ref.summaryTitle \|\| ref.preview}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:668](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:668>) | button | `{t('chat.moreFeatures')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:700](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:700>) | button | `"清除当前功能"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:741](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:741>) | button | `{t('chat.slideSettings', 'PPT 设置')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:770](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:770>) | button | `{ selectedSkill ? `当前技能：${selectedSkill.displayName \|\| selectedSkill.name}` : '技能入口' }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatInputArea.tsx:798](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatInputArea.tsx:798>) | button | `"取消当前技能"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatSkillEntryPopover.tsx:124](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatSkillEntryPopover.tsx:124>) | button | `"关闭"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatSkillEntryPopover.tsx:178](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatSkillEntryPopover.tsx:178>) | button | `"移除引用"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatSkillEntryPopover.tsx:201](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatSkillEntryPopover.tsx:201>) | button | `"添加引用"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ChatSkillEntryPopover.tsx:272](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ChatSkillEntryPopover.tsx:272>) | button | `"关闭技能列表"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ConversationHistory.tsx:82](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ConversationHistory.tsx:82>) | button | `{t('conversationHistory.back')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ConversationHistory.tsx:135](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ConversationHistory.tsx:135>) | button | `{t('conversationHistory.delete')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/CreditsDisplay.tsx:169](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/CreditsDisplay.tsx:169>) | button | `{`${compactLabel} · ${t('membership.buyCredits')}`}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/CreditsDisplay.tsx:194](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/CreditsDisplay.tsx:194>) | button | `{t('membership.buyCredits')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/FlashcardsBlock.tsx:74](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/FlashcardsBlock.tsx:74>) | button | `{t('flashcards.reset', '重新开始')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ImagePreview.tsx:192](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ImagePreview.tsx:192>) | button | `{t('imagePreview.zoomOut')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ImagePreview.tsx:204](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ImagePreview.tsx:204>) | button | `{t('imagePreview.zoomIn')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ImagePreview.tsx:214](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ImagePreview.tsx:214>) | button | `{t('imagePreview.download')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/ImagePreview.tsx:223](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ImagePreview.tsx:223>) | button | `{t('imagePreview.close')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:602](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:602>) | span | `{i18n.t('workspace:messageBlocks.linkBlocked')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1697](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1697>) | button | `{ copySuccess ? t('messageBlocks.copied') : t('messageBlocks.copyImage') }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1711](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1711>) | button | `{t('messageBlocks.saveToWorkspace')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1719](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1719>) | button | `{t('messageBlocks.downloadImage')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1930](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1930>) | p | `{task.title}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1971](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1971>) | button | `{t('messageBlocks.copy')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1982](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1982>) | button | `{t('messageBlocks.save')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:1993](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:1993>) | button | `{t('messageBlocks.download')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2473](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2473>) | span | `{event.detail}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2660](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2660>) | button | `{ copySuccess ? t('messageBlocks.copied') : t('messageBlocks.copyImage') }` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2686](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2686>) | button | `{t('messageBlocks.saveToWorkspace')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2697](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2697>) | button | `{t('messageBlocks.downloadImage')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2729](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2729>) | button | `{t('messageBlocks.copy')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2770](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2770>) | button | `{t('messageBlocks.regenerate')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/MessageBlocks.tsx:2782](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/MessageBlocks.tsx:2782>) | button | `{t('messageBlocks.saveToNotes')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/NotebookLMBlocks.tsx:529](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/NotebookLMBlocks.tsx:529>) | button | `{t('audio.download', '下载音频')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/NotebookLMBlocks.tsx:585](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/NotebookLMBlocks.tsx:585>) | button | `{t('video.download', '下载视频')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/NotebookLMBlocks.tsx:635](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/NotebookLMBlocks.tsx:635>) | button | `{t('infographic.download', '下载图片')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/NotebookLMBlocks.tsx:780](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/NotebookLMBlocks.tsx:780>) | button | `{t('dataTable.download', '下载 CSV')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillRunsPanel.tsx:150](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillRunsPanel.tsx:150>) | select | `"按时间范围过滤"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillRunsPanel.tsx:164](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillRunsPanel.tsx:164>) | select | `"选择清理范围"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillRunsPanel.tsx:184](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillRunsPanel.tsx:184>) | select | `"按运行状态过滤"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillSelector.tsx:71](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillSelector.tsx:71>) | button | `{t('skillSelector.dismiss', '忽略')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillSelector.tsx:181](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillSelector.tsx:181>) | button | `{t('skillSelector.remove', '移除')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillsPlaza.tsx:601](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillsPlaza.tsx:601>) | button | `"关闭"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillsPlaza.tsx:727](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillsPlaza.tsx:727>) | button | `"从素材库添加引用"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SkillsPlaza.tsx:735](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillsPlaza.tsx:735>) | label | `"上传文件"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SlideSettingsPanel.tsx:141](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SlideSettingsPanel.tsx:141>) | button | `{style.description}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/StudioDocumentsList.tsx:81](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/StudioDocumentsList.tsx:81>) | button | `"删除文档"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SummaryDetail.tsx:2251](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2251>) | button | `{t('imagePreview.hint') as string}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SummaryDetail.tsx:2267](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2267>) | button | `{t('imagePreview.hint') as string}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SummaryDetail.tsx:2378](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryDetail.tsx:2378>) | span | `{summary.url}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SummaryList.tsx:1082](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryList.tsx:1082>) | button | `"更多"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/SummaryList.tsx:1286](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SummaryList.tsx:1286>) | button | `"删除"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VideoPlayer.tsx:213](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VideoPlayer.tsx:213>) | iframe | `{title \|\| 'Video'}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VirtualMessageList.tsx:98](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VirtualMessageList.tsx:98>) | button | `{t('chat.viewOriginal')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VirtualMessageList.tsx:125](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VirtualMessageList.tsx:125>) | span | `{t('chat.referenceImage')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VirtualMessageList.tsx:149](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VirtualMessageList.tsx:149>) | button | `{copySuccess ? t('messageBlocks.copied') : t('messageBlocks.copy')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VirtualMessageList.tsx:163](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VirtualMessageList.tsx:163>) | button | `{t('messageBlocks.regenerate')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VirtualMessageList.tsx:174](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VirtualMessageList.tsx:174>) | button | `{t('messageBlocks.saveToNotes')}` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VisualSummaryCard.tsx:320](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VisualSummaryCard.tsx:320>) | button | `"删除"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |
| [src/workspace/components/VisualSummaryCard.tsx:382](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/VisualSummaryCard.tsx:382>) | button | `"删除"` | 文本工具提示；保留原控件动作；按 A02–A04 补行为 |

## 选择器弹层

| 位置 | 当前类型 | 决策 |
|---|---|---|
| [src/web/components/image-create/AssetEditModal.tsx:165](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/AssetEditModal.tsx:165>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorAccountMenu.tsx:366](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorAccountMenu.tsx:366>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorAccountMenu.tsx:394](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorAccountMenu.tsx:394>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorControls.tsx:100](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorControls.tsx:100>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorControls.tsx:172](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorControls.tsx:172>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorControls.tsx:227](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorControls.tsx:227>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/CreatorControls.tsx:282](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/CreatorControls.tsx:282>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/PromptCasesPanel.tsx:3392](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCasesPanel.tsx:3392>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:1029](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:1029>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:1072](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:1072>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:1097](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:1097>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/PromptCompilerPanel.tsx:1130](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/PromptCompilerPanel.tsx:1130>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/ReferenceImagePanel.tsx:216](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/ReferenceImagePanel.tsx:216>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/components/image-create/UploadReverseModal.tsx:170](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/components/image-create/UploadReverseModal.tsx:170>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateAccountPage.tsx:511](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateAccountPage.tsx:511>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateAccountPage.tsx:536](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateAccountPage.tsx:536>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateCharactersPage.tsx:997](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:997>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateCharactersPage.tsx:1020](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:1020>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateCharactersPage.tsx:1043](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateCharactersPage.tsx:1043>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateGalleryPage.tsx:1186](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateGalleryPage.tsx:1186>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateHomePage.tsx:1300](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1300>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateHomePage.tsx:1342](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1342>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/CreateHomePage.tsx:1372](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/CreateHomePage.tsx:1372>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/PromptAssetOpsPage.tsx:306](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptAssetOpsPage.tsx:306>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/web/pages/PromptAssetOpsPage.tsx:398](</Users/zhongqingbiao/Developer/New project/zongjie/src/web/pages/PromptAssetOpsPage.tsx:398>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/ExportImageModal.tsx:213](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/ExportImageModal.tsx:213>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SettingsPage.tsx:970](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SettingsPage.tsx:970>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SettingsPage.tsx:1000](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SettingsPage.tsx:1000>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SettingsPage.tsx:1079](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SettingsPage.tsx:1079>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SkillConfigDialog.tsx:866](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillConfigDialog.tsx:866>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SkillCreateConfirmDialog.tsx:382](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillCreateConfirmDialog.tsx:382>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SkillCreateConfirmDialog.tsx:404](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillCreateConfirmDialog.tsx:404>) | Select 弹层 | 保留；点击选项更新对应字段 |
| [src/workspace/components/SkillEditor.tsx:417](</Users/zhongqingbiao/Developer/New project/zongjie/src/workspace/components/SkillEditor.tsx:417>) | Select 弹层 | 保留；点击选项更新对应字段 |

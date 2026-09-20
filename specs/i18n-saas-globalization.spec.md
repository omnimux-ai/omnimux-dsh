# 规格说明：插件全矩阵中英文多语言国际化修复与 SaaS 专业术语对齐

## 1. 业务背景与问题现象
在英文语言环境下，系统多处界面存在中文硬编码残留、英文翻译不地道或多语言未联动切换的严重体验问题（参见用户提供的 4 处典型场景）：
1. **左侧导航栏一级入口残留中文**：在英文界面下，侧边栏导航项出现「Devices」、「Projects」、「技能/专家」、「Assets」，其中「技能/专家」未做多语言适配且未动态响应系统语言切换；
2. **技能库「我的技能 (My Skills)」卡片描述残留中文**：在英文界面下，顶部 Tab、筛选器等均为英文，但核心已安装技能（如 clip-craft、cinematic-ai-comic-director、ip-character-consistency-studio、viral-video-replication、tiktok-shop-product-video-maker 等）卡片描述仍回退并展示为大段中文，且部分技能描述语法不符合科技专业规范；
3. **工作流二级导航/Tab 标题出现中文「AI 应用」**：在英文环境下，侧边栏出现「Creative Canvas」、「AI 应用」、「Image Generation」，其中「AI 应用」系硬编码 fallback 导致；
4. **创作画布资产抽屉（Assets Drawer）全链路纯中文硬编码**：
   - 顶栏 Tab：「创作画布」、「资产」、「关闭抽屉 (Esc / A)」；
   - 搜索栏与视图工具：搜索框 placeholder「搜索文件」、提示「列表视图」、「网格视图」、「刷新创作画布素材」；
   - 快速筛选下拉：按钮「类型」、「标签」、「时间」及其对应的浮层选项（如「全部」、「图片」、「视频」、「音频」、「文本」、「其他」；「最新优先」、「最旧优先」、「今天」、「近 7 天」等；「人物」、「场景」、「待定版」、「最终版」等）；
   - 空状态提示：「创作画布暂无素材」、「请导入文件或添加节点并生成」、「当前创作画布暂无匹配素材」；
   - 底部行动栏按钮：「↑ 导入文件」；
   - 资产定位与上下文操作等提示文案均为硬编码中文。

## 2. 解决方案设计与 SaaS 科技专业术语对齐
遵循现代 B 端科技产品（对标 Stripe / Linear / Vercel / Figma）的国际化专业规范与标准术语设计：

### 2.1 导航栏与工作台 Tab 国际化修复
- **侧边栏入口 (`plugins/omnimux-market/src/client/apply.js`)**：
  - 将侧边栏 entry 改造为支持动态感知系统 locale（接入 `c.locale.subscribe` 与 `c.locale.getLocale`），语言切换时即时刷新标签与 aria-label；
  - 术语对齐：将原 `"Skills/Experts"` 统一升级为规范优雅的 SaaS 术语 `"Skills & Experts"`（中文：「技能/专家」）；
- **工作台 Tab 兜底标题 (`plugins/omnimux/src/client/workbench/focus-state.js`)**：
  - 提供 `WORKBENCH_TAB_TITLE_FALLBACKS_EN` 映射表，确保在英文环境下 fallback 为专业英文名称（如 `'omnimux-market:plaza': 'Skills & Experts'`, `'omnimux-workflow:canvas': 'Creative Canvas'`, `'omnimux-workflow:library': 'Projects'`, `'omnimux:media-viewer': 'Image Generation'`, `'omnimux-device:library': 'Devices'`, `'omnimux-assets:library': 'Assets'`）；
  - `resolveWorkbenchTabTitle` 动态根据当前激活语言选用对应 fallback；
- **AI 应用 Tab 注册 (`plugins/omnimux-workflow/src/client/index.js`)**：
  - 消除第 108 行硬编码 `'AI 应用'`，改为 `seed?.title || t('workflow.tab.aiApps') || t('projects.appCategoryUnknown') || 'AI Apps'`；
  - 在 `plugins/omnimux-workflow/src/client/locales.js` 中将 `'projects.appCategoryUnknown'` 的英文对齐为 `'AI Apps'`。

### 2.2 技能库多语言感知与核心技能英文专业翻译补齐
- **多语言判断机制修复 (`plugins/omnimux-market/src/client/i18n.js`)**：
  - 增强 `browserLang` / `currentLang`，优先读取宿主 `window.__omnimuxLocale` 或 `document.documentElement.lang`；
  - 在 `apply(ctx)` 中将注入的 `ctx.locale` 深度绑定至 market 的 i18n 系统；
- **核心技能英文专业描述补齐**：
  - 在 `i18n.js` 的 `EN` 字典中录入核心高频技能的标准专业 SaaS 英文描述：
    - `clip-craft`: "OmniMux Clip intelligent editing and timeline orchestration engine. Professional video trimming, subtitles, and export automation."
    - `cinematic-ai-comic-director`: "Cinematic AI comic and drama director. End-to-end scriptwriting, shot planning, and cinematic visual style matching."
    - `ip-character-consistency-studio`: "Consistent AI IP character and asset generator. Multi-angle reference sheets, expressions, and recurring persona styling."
    - `viral-video-replication`: "High-performing viral video deconstruction and reproduction suite. Hook extraction, beat alignment, and multi-variant generation."
    - `tiktok-shop-product-video-maker`: "AI video ad generator for TikTok Shop. High-converting hooks, actionable camera scripts, and localized product showcases."
    - `3d-animation-short-generator`: "3D animation short video generator for stylized narrative scenes and characters."
    - `skill-creator`: "Skill scaffolding and authoring toolkit for custom Agent capabilities and tool extensions."
    - `video-analysis`: "Comprehensive video breakdown engine for shot pacing, auditory beats, and narrative hooks."
    - `video-hook-analysis`: "Opening hook analysis and retention scoring for viral short-form video content."

### 2.3 创作画布抽屉组件全量国际化
- **词典扩展 (`plugins/omnimux-workflow/src/canvas/i18n/dict.zh.ts` & `dict.en.ts`)**：
  - 扩充 `assets.*` 命名空间下的完整词条，涵盖抽屉 Tab、搜索、筛选下拉、选项、空状态、定位、底部按钮等；
- **组件重构接入 `useT()`**：
  - `AssetsDrawerHeader.tsx`：Tab 切换与关闭按钮文案全面由 `useT()` 驱动；
  - `CanvasOutlineView.tsx`：搜索框 placeholder、视图切换 title、筛选栏按钮文案、空状态标题与副标题、导入/生成 Badge、定位操作等全面由 `useT()` 驱动；
  - `TypeFilterPopover.tsx`、`TimeFilterPopover.tsx`、`TagFilterPopover.tsx`、`SortFilterPopover.tsx`：选项文本全面支持基于当前语言的动态国际化，输出规范的英文与中文；
  - `ProjectAssetsView.tsx`、`SubjectLibraryView.tsx`、`AssetsDrawer.tsx`：主体库、搜索、底部新建文件夹、导入文件等全面国际化；
  - `AppTab.jsx`：已发布 AI 应用视图中的空状态与报错提示中文硬编码清理并接入国际化。

## 3. 验收标准
1. **单测与契约验证**：
   - `focus-state.test.js`、`workbench-seat.test.js` 等单测断言在英文环境下正确返回 `'Skills & Experts'`、`'AI Apps'`、`'Creative Canvas'` 等英文术语；
   - `i18n.test.mjs` 全量覆盖抽屉与筛选组件的新增国际化词条，中英文字典对称无缺失；
2. **静态构建与类型检查**：
   - `pnpm --filter omnimux-workflow typecheck` / 构建通过；
   - `pnpm --filter omnimux-market build` 通过且测试无破坏；
   - 全工作区质量门禁检查 `pnpm test:gates` 100% 绿灯。

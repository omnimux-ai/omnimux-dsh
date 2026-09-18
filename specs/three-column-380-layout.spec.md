# 任务规格：三栏空间重塑与大屏全量自适应（中栏380定宽控制台，右栏弹性铺满主舞台）

- 关联 Issue: #2316
- 目标模块: 
  - `plugins/omnimux/src/client/workbench/geometry.js`
  - `plugins/omnimux/src/client/workbench/split-layout.js`
  - `plugins/omnimux/src/client/conversation-box.js`
  - `plugins/omnimux/src/client/composer-compact.js`
  - `plugins/omnimux/tests/e2e/three-column-380-layout.spec.js`

## 1. 业务目标与问题分析
在三栏分屏状态（左侧导航/会话树、中间会话流、右侧创作工作台/画布）下：
1. 原有布局采用“中间会话栏吞噬所有大屏多余空间”逻辑，导致在 1440px、1920px、2560px 等大屏下，中间对话流被拉扯得过度宽大（成荒原状），单行文本过长，阅读效率低；
2. 真正承载创作生产力的右侧主工作台（创作画布、应用工作流、大图预览、视频剪辑）却被固定锁死在较窄的辅助抽屉尺寸（默认仅 ~360px），生产力空间严重逼仄；
3. 按照对标竞品（MiniMax Design）与新一代多模态创作工具的交互层级：
   - 左栏（索引层）：保持 280px 稳定索引不变；
   - 中栏（控制台）：在分栏状态下收敛为 380px 黄金紧凑控制台，聚焦指令交互；
   - 右栏（主舞台）：弹性铺满屏幕所有剩余空间（`视口宽度 - 左栏 - 中栏 380px`），大屏多出空间 100% 反哺给右侧主舞台，占比达 60%～74%。

## 2. 技术方案与变更规格

### 2.1 分栏几何算法与核心基准调整（geometry.js）
- `WORKBENCH_CONVERSATION_TARGET_PX`: 从 420 调整为 380。
- `workbenchDefaultWidthPx`:
  - 当右栏分屏开启且视口宽度足够时，默认计算右栏宽度为 `usable - 380`（即精确保留中间会话栏 380px，右侧吸收剩余全量空间）。
- `workbenchSplitMaxPanelPx`:
  - 允许右侧面板最大拉伸至 `viewport - leftRail - 360`（保留 360px 中栏安全底线）。

### 2.2 三栏网格轨道样式加固（conversation-box.js 与 split-layout.js）
- 在分屏状态且右栏打开、中间未全屏收起时：
  - 中间会话栏网格列声明为 `380px` 或 `minmax(340px, 380px)`，或者通过 CSS 变量 `--omnimux-conversation-width: 380px` 确保主视窗内会话栏精确占位 380px；
  - 右侧面板声明为 `minmax(0px, 1fr)` 弹性铺满；
  - 当右栏收起（单聊模式）时，中间栏恢复弹性全屏居中阅读状态（最大宽度 768px），保持纯聊天美感。

### 2.3 输入框与紧凑容器联动保护（composer-compact.js）
- 确保护航规则在 380px 宽度下：
  - 容器查询 `@container composer-card (max-width: 459px)` 正确生效，模型选择器与附件操作项收缩为纯图标或紧凑胶囊，单行无折行与重叠；
  - 会话流内部容器设置最大宽度限制 `max-width: 380px`（在分栏模式下），避免溢出。

## 3. 验收标准
1. **几何计算准确**：在 1280px、1440px、1920px、2560px 视口下，计算出的中栏宽度均为 380px，右栏自动吸收全部剩余空间；
2. **网格样式无死区**：分屏开启时无黑边、无黑洞死区，右侧工作台与创作画布 100% 贴边铺满；
3. **输入框不溢出**：中栏 380px 下，输入卡片各项控件单行排列，无文字溢出与元素重叠；
4. **自动化测试 100% 绿灯**：新增并运行全套 E2E 契约测试与单元测试；
5. **构建物化与实机验收**：产物成功编译物化至 `~/.omnimux-dev`，界面达到图 1 竞品般开阔大舞台体验。

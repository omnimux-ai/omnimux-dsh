# 工程实现报告：返回画布按钮与导出按钮并排布局及样式优化 (Issue #822)

## 1. 任务背景与目标
针对用户提出的“‘返回画布’按钮要和‘导出’按钮在一行，而且该按钮的样式、布局、位置都要做优化”的需求，完成以下工程实施：
- 消除原有 `omnimux-clip-stage-header` 对垂直空间的占用及与外部宿主右上角控件的冲突，将空间 100% 留给 OpenReel 编辑器；
- 将“返回画布”按钮无缝集成至 OpenReel 顶栏组件 `Toolbar.tsx` 的右侧操作区，与 `Export` 按钮同行并排；
- 优化按钮视觉规范、内嵌 SVG 图标、多语言动态响应与原生拖拽保护；
- 彻底清理遗留的 `.omnimux-clip-stage-close-btn` 历史截断规则及多余样式；
- 完成本地单元测试、重新构建打包并严格通过所有静态契约门禁。

## 2. 核心实施内容

### 2.1 移除独立 Stage Header（`ClipStage.jsx`）
- 移除 `omnimux-clip-stage-header` 结构（包含原 48px 占位行、action 容器及内部关闭按钮）；
- 清理未使用的方法与状态（`handleSaveDraft`, `handleClose`, `saveStatus` 及相关的 CanvasBridge import）；
- 容器空间 100% 留给 OpenReel 编辑器，消除了与宿主窗口右上角控件的冲突。

### 2.2 顶栏并排集成与视觉优化（`Toolbar.tsx`）
- **布局定位**：定位右侧区域 `data-toolbar-section="right"`，类名保持 `openreel-toolbar-right flex items-center justify-end shrink-0 gap-2.5`，通过 `gap-2.5` 保持“返回画布”与“Export”两按钮之间协调的间距；
- **展示条件**：仅在画布联动模式时（`getActiveClipSession()?.source === "canvas"`）在导出按钮左侧并排渲染；
- **视觉与尺寸规范**：
  - 高度：高度设定为 36px（与 Export 按钮对齐），带 `rounded-[8px]` 圆角；
  - 风格：Secondary / Outline 风格，具有明确的背景色、边框与悬浮反馈（`px-3.5 py-[8px] bg-bg-2 hover:bg-hover border border-border hover:border-border-focus text-fg-2 hover:text-fg text-[13px] font-medium whitespace-nowrap transition-colors select-none`）；
  - 图标：内嵌 14px 返回箭头 SVG（`<path d="M9 3L4 8L9 13M4 8H14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>`）；
  - 排版与防截断：`whitespace-nowrap`，彻底防止文字折行或被裁切；
  - 原生拖拽保护：设置 `WebkitAppRegion: "no-drag", pointerEvents: "auto"`，避免原生 Electron 拖拽吞噬点击事件；
- **交互与保活逻辑**：点击后调用 `notifyCanvasClose({ nodeId: activeSession.nodeId })`，并调用 `getActiveClipStageStore()?.set(false)` 关闭当前 stage 视图，同时严格保留 editor 实例保活（`display: none` 保活机制不变）；
- **动态语言响应**：通过 `useHostLocale()` 订阅宿主语言，中文渲染“返回画布”，英文渲染“Back to canvas”。

### 2.3 宿主语言 Hook 强化（`useHostLocale.js`）
- 支持当顶层组件传入 `locale` 时自动记录活跃实例，子组件无参数调用 `useHostLocale()` 即可直接订阅宿主语言流，实现无缝动态多语言切换。

### 2.4 清理历史遗留 CSS 规则（`styles.js`）
- 彻底删除了第 184 行遗留的历史 `.omnimux-clip-stage-close-btn` 规则（尤其是 `width: 32px; background: transparent; border: none;`，消除了导致文字被 32px 挤爆截断的根因）；
- 清理多余的 `stage-header` 样式，在 canvas 模式下强制保障 `openreel-toolbar-right` 正常 `display: flex !important; margin-left: auto !important;`。

## 3. 测试与构建验证结果

### 3.1 单元测试验证
- 更新调整 `canvas-toolbar-mode.test.js`、`composition-locale-qa.test.js`、`host-locale.test.js` 中对新 Toolbar 结构、行为及多语言切换的断言；
- 运行 `pnpm_config_verify_deps_before_run=false pnpm --filter omnimux-clip test`：
  - 测试用例数：**104 / 104 全部 PASS**（0 失败，0 告警）。

### 3.2 产物构建
- 运行 `pnpm_config_verify_deps_before_run=false pnpm --filter omnimux-clip build`：
  - 成功重新打包生成 `lib/client.js`（9539231 字节），`entry-contract.test.js` 的 bundle drift guard 验证通过。

### 3.3 静态质量门禁
- `node scripts/scan-ui-gates.mjs`：共分析 276 个客户端视图源文件，**UI01~UI10 静态扫描全部合规（0 违规拦截）**；
- `pnpm verify:stages`：**PASS: 10 Stage components; 8 registered sidebar targets**；
- `pnpm check:boundaries`：**2175 source file(s) across plugins verified for dependency and runtime boundaries** 全部通过；
- `pnpm lint:i18n`：**100% Quality Gate Passed!**（8 locale files & 12 manifests scanned）。

## 4. 后续交付状态
- 遵守工作协议与安全边界：本阶段已完成全部代码修改、测试适配、构建与静态门禁验证，不擅自创建 PR、不擅自合并、不假冒 L2 通过；
- 交付物已就绪，等待主理人及 QA 工程师开展真实的 L2 验证。

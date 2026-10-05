# Google Vids 中栏入口打开后空白修复规格（Issue #3165）

- **Issue**: #3165
- **关联基线**: #2767（Vids 迁至 `main` 插槽，commit `fd127b520`）、#2721 回归规格、#2698 split-stage Spec
- **状态**: Agent 自拟并实施；可见 UI、文案、图标、布局零变化
- **设计约束**: 遵循仓库根 `design.md`；本次不改任何可见元素与文案

## 1. 用户旅程与期望反馈

1. 用户在 OmniMux 桌面应用（advanced 桌面外壳，默认形态）左侧栏展开「探索」浮动菜单。
2. 点击菜单中的「Google Vids」条目。
3. 期望：右侧 `视频剪辑`（Clip 工作台）以 split 焦点打开；中间会话列显示 Google Vids 生成页（标题 `Google Vids`、模式 Tab、提示词输入区）。
4. 点击生成页右上角关闭按钮。
5. 期望：中间会话列恢复原生会话，Clip 仍留在右栏。

**缺陷（修复前）**：第 3 步中间会话列完全空白。

## 2. 根因（已取证）

- `fd127b520` 把 Vids 从 `shell.overlay` 迁到官方 `main` 插槽（`ctx.slots.inject('main', …)`、manifest `target: main`、`layout.selectPanel('omnimux-vids')`），但入口 `handleClick` 仍保留 `stage.claim('omnimux-vids')`。
- `claimProductStage` 写入 `data-dsh-product-stage="omnimux-vids"` 并注入 hub 产品舞台 chrome；其中
  `html[data-dsh-product-stage]:not([data-dsh-product-stage="omnimux-apps"]) .dshDesktopConversationSurface > *:not([data-slot="shell.overlay"]) { visibility: hidden !important }`
  只豁免 `omnimux-apps`。
- advanced 桌面框架下 `.dshDesktopConversationSurface` 的唯一 DOM 子节点就是 `main` 插槽的挂载点（官方 renderer `MainPanel` → `renderSlot("main", {}, { entryKey: activePanelId })`，渲染为 `<div data-slot="main" style="display:contents">`），而 `shell.overlay` 位于其兄弟节点 `div.dshDesktopOverlay` 内。
- 因此 `:not([data-slot="shell.overlay"])` 恒真：claim 一发生，刚被选中的 Vids 面板连同整列一起被 `visibility:hidden`，表现为空白。

## 3. 修复（源头修复，不做 CSS 遮掩）

Vids 已是 `main` 插槽面板，不再是 overlay 产品舞台，因此**不得**再 claim 产品舞台：

1. `plugins/omnimux-video/src/client/sidebar-entry.js`
   - `handleClick`：仍需 `workbench.open({ tabId: 'omnimux-clip:studio', title: '视频剪辑', focus: 'split' })` 严格返回 `true`；随后只调用 `layout.selectPanel('omnimux-vids')`，删除 `stage.claim('omnimux-vids')`。
   - 前置守卫由「需要 `stage.claim`」改为「需要 `layout.selectPanel`」。
   - `syncActive` 不再读 `data-dsh-product-stage`，激活态只由 `layout.panelInfo.activePanelId === 'omnimux-vids'` 决定；移除 `dsh-product-stage` 事件监听。
2. `plugins/omnimux-video/src/client/GoogleVidsStage.jsx`
   - 关闭时只调用 `layout.selectPanel(null)`；删除 `__omnimuxStage.release('omnimux-vids')`、手工删除 dataset 与伪造 `dsh-product-stage` 事件。
3. `plugins/omnimux/src/client/conversation-box.js`
   - 从 `STAGE_CSS_CLASS_MAP` 移除 `omnimux-vids`（不再有 overlay 舞台），随之删除 7 条已失效的 `:not([data-dsh-product-stage="omnimux-vids"])` 豁免。

**非目标**：不新增 CSS 例外来「放行」main 插槽面板（属仓库禁止的界面层遮掩）；不改 Vids 的视觉/文案/元素白名单；不改 Clip 注册；不改 Dev 45120 实例。

## 4. 硬门禁（防复发）

- `scripts/verify-stage-contracts.mjs`（`pnpm verify:stages`）新增确定性门禁：**任何在客户端注册 `main` 插槽的插件，其源码不得出现 `claimProductStage` / `__omnimuxStage.claim` / `stage.claim(`**。这条门禁在修复前为红。
- `plugins/omnimux-video/src/client/workbench-seat.test.js`（新增，对齐 ADR `2026-08-31-workbench-libraries-and-toggle` 对每个包 `workbench-seat.test.js` 的要求）：Vids 侧栏入口与舞台不得出现产品舞台 claim/release。
- `tests/e2e/google-vids-main-slot-visibility.e2e.test.mjs`（新增）：真实 Chromium 中加载**真实** `PRODUCT_STAGE_CHROME` 与 advanced 桌面框架的真实 DOM 形状，驱动**真实** `mountSidebarEntry` 的点击路径，断言点击后 `.omnimux-vids-stage` 的 computed `visibility !== 'hidden'` 且正几何、正可见后代。修复前该断言为红。

## 5. 验收用例

| ID | 用例 | 判据 |
| --- | --- | --- |
| AC-01 | 入口点击成功后调用 `layout.selectPanel('omnimux-vids')` | 单测：调用序列 `open → selectPanel` |
| AC-02 | 入口任何路径都不 claim 产品舞台 | 单测 + 源码门禁：无 `claim` 调用 |
| AC-03 | `open` 非严格 `true`、抛错、拒绝、API 缺失时不切换面板 | 单测：仅 `open` 调用 |
| AC-04 | 卸载竞态：`open` 未 settle 时卸载，不再切换面板 | 单测 |
| AC-05 | advanced 框架下点击后 Vids 面板可见（非 hidden、正几何、有可见内容） | 真实 Chromium e2e |
| AC-06 | 关闭后 `selectPanel(null)` 且不触碰产品舞台 | 单测 + e2e |
| AC-07 | 侧栏激活态由 `panelInfo.activePanelId` 投影 | 单测 |
| AC-08 | 注册拓扑：manifest `target: main`，不注册 `betterSidebar` Tab | 单测 |
| AC-09 | 隔离 worktree 完整应用真实浏览器：入口可用、面板渲染、关闭恢复 | `pnpm verify:app -- --journey …` |

## 6. 命令与测试策略

- 回归单测：`node --test plugins/omnimux-video/src/client/sidebar-entry.test.js plugins/omnimux-video/src/client/workbench-seat.test.js`
- 宿主门禁：`node --test plugins/omnimux/src/client/stage-mutual-exclusion.test.js`、`pnpm verify:stages`
- 真实 Chromium 可见性回归：`node --test tests/e2e/google-vids-main-slot-visibility.e2e.test.mjs`
- 契约 e2e：`node --test tests/e2e/google-vids-split-stage.e2e.test.mjs tests/e2e/google-vids-sidebar.e2e.test.mjs`
- 插件行为：`pnpm --filter omnimux-video test`、`pnpm --filter omnimux test`
- 应用级浏览器验收：`pnpm verify:app -- --journey .workbuddy/qa-journeys/vids-blank-3165.mjs`
- **已知装置边界**：`dsh-plugin-desktop`（advanced 桌面框架）由 Electron 外壳在窗口创建时注入 profile，隔离 Web QA 运行器只起服务不起窗口，故该运行器下 `.dshDesktopConversationSurface` 不存在、缺陷不可见。缺陷的完整应用形态复现属 Electron 外壳；AC-05 用真实 Chromium + 真实 CSS + 真实入口模块在同一 worktree 内补上这一判别力。Dev 45120 真机验收为人工职责。

## 7. 新用户基线

全新安装（未登录、无 Dev 机器状态）下：Vids 入口位于「探索」菜单（离线准入），点击先请求 Clip 工作台，成功后在中间会话列原生切换为 Vids 面板；`layout` 或 Workbench 服务缺失时不做任何状态变更，也不产生空白列。不依赖本机模型服务、兼容代理、Dev profile 或绝对路径。

## 8. 风险与约束

- 风险：移除 claim 后若仍有其它路径写入 `data-dsh-product-stage="omnimux-vids"`，main 插槽面板会被旧 chrome 隐藏。已核对：`claimProductStage` 是仓库唯一写入者，修复后无调用方；`omnimux_active_product_stage` 仅被 `apps-store.js` 读取且只比较 `omnimux-apps`，陈旧值不会复活该舞台。
- 不通过造假 DOM、静态 grep 或私搭宿主取代真实浏览器验收。

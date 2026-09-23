---
title: "three-column-layout — 三分栏收起布局契约"
id: "contract-three-column-layout"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-17"
updated: "2026-09-23"
authors: ["x", "agent-architect"]
subsystem: "client"
---

# 三分栏收起布局契约

本文件是「左侧栏 / 中间会话栏 / 右侧工作台」三分栏在**隐藏与收起**行为上的唯一契约真源。
改动 `sidebar-toggle-topbar.js`、`conversation-box.js`（`PRODUCT_STAGE_CHROME`）、
`conversation-collapse.js` 的收起相关规则前必须读本文件；违反条款的改动会被
`plugins/omnimux/src/client/three-column-layout-contract.test.js` 与
`scripts/three-column-collapse-qa.mjs` 拦下。

## 为什么会「乱」

三分栏的列宽分配由**六条互相覆盖的 `grid-template-columns !important` 规则**决定，
谁生效取决于 CSS 层叠：**重要性 → 特异性 → 源码顺序**。规则分布在两个模块里
（`conversation-box.js` 的 `PRODUCT_STAGE_CHROME` 与 `conversation-collapse.js` 的
`CONVERSATION_COLLAPSE_CSS`），**新增一条靠后的同特异性规则即可改变真实几何**。

历史修复链（同一处反复出事）：`#2074` 保宽 → `#2076` 落地 → `#2087` 取样纠偏 →
`#2091` 点击快照 → `#2097` 改派生态 → `#2080` 完全收起 → `#2068` 全屏顶栏避让。

## 一、状态标记（唯一真源）

| 标记 | 写入方 | 语义 |
| --- | --- | --- |
| `html[data-omnimux-left-collapsed]` | `sidebar-toggle-topbar.js` 镜像 | 左栏收起（用户意图优先于壳层读数） |
| `[data-sidebar-collapsed]` | 官方 AppFrame（插件只读） | 外壳自身的左栏收起 |
| `[data-rightbar-collapsed="true"]` | 官方 AppFrame（插件只读） | 右栏确证收起 |
| `html[data-omnimux-conversation-collapsed]` | `conversation-collapse.js` | 中间会话栏收起 |
| `[data-details-collapsed="true"]` | 官方 AppFrame（插件只读） | 详情栏收起 |
| `html[data-omnimux-sidebar-toggle-topbar]` | `sidebar-toggle-topbar.js` | 顶栏几何接管已安装（多数网格规则的前置条件） |

## 二、网格规则真值表

| 条款 | 状态组合 | 期望列宽 |
| --- | --- | --- |
| INV-11 | 无收起标记（展开态） | 插件不介入，交外壳原生网格 |
| INV-1 / INV-2 | 左栏收起（或壳层收起）∧ 右栏开 | `0px var(--omnimux-conversation-width,380px) minmax(0px,1fr)` |
| INV-6 | 左栏收起 ∧ 右栏确证收起 | `0px minmax(0px,1fr) 0px`（会话栏占满视口） |
| INV-8 | 收起意图为真 | 意图优先于壳层读数，抵抗官方 1024px 自动展开 |
| INV-9 | 中间栏收起 ∧ 右栏开 | `var(--omnimux-sidebar-width,280px) 0px minmax(0px,1fr)` |
| INV-6 | 右栏确证收起（左栏展开） | `var(--omnimux-sidebar-width,280px) minmax(0px,1fr) 0px` |

**INV-14**：上述组合的**胜出规则**不得被新增规则静默夺取。门禁在胜出者变化时变红，
不只在规则文本被删除时变红。

## 三、不变量

| 编号 | 规则 | 真源 |
| --- | --- | --- |
| INV-1 | 收起左栏不得改变会话栏像素宽度 | `deriveConversationWidthPx` |
| INV-2 | 释放的左栏宽度全部归右栏，右栏绝不塌陷为 0 | 保宽规则第三轨 `minmax(0px,1fr)` |
| INV-3 | 会话栏宽度从外壳 authored 栅格派生，禁止记忆式基准 | `readShellSplitPx` |
| INV-4 | 测量宽度不得作为权威读数（自我确证的中毒读数） | 同上；样式表 `!important` 钉轨 |
| INV-5 | 收起态拖动分隔线，会话栏宽度跟随 | `bindFrameObserver` 观察 frame `style` |
| INV-6 | 右栏确证收起重时会话栏占满，绝不黑屏死区 | 保宽规则的 `:not([data-rightbar-collapsed="true"])` 排除 |
| INV-7 | 左栏收起即完全收起，`--omnimux-sidebar-width` 写 0 | `applyTopbarToggleCssVars` |
| INV-8 | 收起意图优先于壳层读数 | `explicitLeftCollapseIntent` |
| INV-9 | 中间栏收起时中间列收缩为 0，右栏占满右侧 | `CONVERSATION_COLLAPSE_CSS` + 网格规则 |
| INV-10 | 第三轨严禁 `auto`、严禁写死像素 | 保宽规则 |
| INV-11 | 顶栏标签让位量 = 按钮与可见面板的重叠量（不是 collapsed 布尔） | `computeChromeLayout.tabPadLeft` |
| INV-12 | 写布局必须经 rAF 合并；必须观察外壳内联栅格 | `scheduleSync` |
| INV-13 | 会话栏宽度地板 320px；无 authored 栅格时回退 380px | `CONVERSATION_WIDTH_MIN_PX` / `_FALLBACK_PX` |
| INV-14 | 状态组合的胜出规则不得被静默夺取 | 本文件 + 契约门禁 |
| INV-15 | **稳态**会话栏宽度 = `clamp(round(舞台 × 比例), 360, min(舞台 × 72%, 舞台 − 320))`；舞台 = 视口内容宽 − 左栏（收起左栏时锁展开态左栏基线） | `conversation-ratio.js` + `deriveConversationWidthPx` 稳态分支 |
| INV-16 | **交互期**（外壳分隔线拖拽中）会话栏宽度只从外壳 authored 栅格派生；比例只记录、绝不参与写入 | `deriveConversationWidthPx` 拖拽分支 + `isShellSplitDragging` |
| INV-17 | 比例的持久化合法：**只存比例、不存像素**，全局一份，键 `omnimux.conversationRatio`；键缺失走「老用户按当前几何反推一次」，损坏值回落 0.3 | `workbench/workspace-layout-store.js` |

### INV-3 / INV-13 的口径澄清（新增，不改原行）

比例制落地后两条既有条款的适用范围需要收窄，原行一字不动，澄清如下：

- **INV-3**「会话栏宽度从外壳 authored 栅格派生」自 Issue #2608 起限定于**交互期**（INV-16）。
  稳态不再读 authored 第三轨：稳态的真源是比例（INV-15），authored 第三轨只在拖拽期与
  「结算反推」两处被读。禁改清单第 4 条（只读内联栅格、不读 `getBoundingClientRect`）不变。
- **INV-13** 的 320px 是**拖拽分支**的地板（与 #2097 修复逐字一致）；比例制的稳态地板为
  360px（用户 2026-09-23 拍板，见 INV-15）。380px 兜底仍然存在，但只用于
  「外壳尚未 authored / 视口不可测」的首帧，不再参与任何稳态算式。

## 四、禁改清单

1. **保宽规则的 `:not` 链**：去掉 `:not([data-rightbar-collapsed="true"])` 会让右栏收起时会话栏无法全宽（复现 #1749）。
2. **保宽规则与右栏收起规则的相对顺序**：右栏收起规则特异性较低，靠顺序压住保宽分支；调整顺序即可改变行为。
3. **`--omnimux-sidebar-width` 收起态强制写 0**：改回「照抄壳层读数」会复现屏左 90px 死带（#2077）。
4. **`readShellSplitPx` 只读内联栅格**：改成读 `getBoundingClientRect` 会引入中毒读数（#2087 教训）。
5. **第三轨写 `auto` 或写死像素**：右栏会与 `1fr` 竞争后被压成 0（#2074 原始缺陷）。
6. **引入记忆式会话栏基准**：收起态拖动分割线会被吞掉（#2097 教训）。
7. **ResizeObserver 回调里同步写布局**：触发浏览器 `ResizeObserver loop` 告警（INV-12）。
8. **第 6 条的边界：比例 ≠ 记忆式基准**（Issue #2608 新增澄清，第 6 条原文不动）。
   第 6 条禁的是「把**测量出来的像素宽度**存起来当权威读数」——#2097 的根因正是
   `rememberConversationWidth` 测 `.dshDesktopConversationSurface` 的 `offsetWidth` 再回写。
   **比例**不是测量值：它由用户拖拽结算（读外壳 authored 栅格）或产品默认给出，落盘后只参与
   稳态算式，交互期一律不参与写入（INV-16）。把第 6 条扩大解释成「禁止持久化比例」会让
   比例制无法落地；反过来，任何「存测量宽度当基准」的改动仍被第 6 条拦下。
9. **两个写入通道不得互相冒充**（Issue #2608 新增）。`panels.rightbar`（外壳私有 store，
   决定 authored 第三轨 / 拖拽起点 / 右分隔把手位置）与 better-sidebar 的 tab store
   `state.width`（决定右栏内容宽）是**两条互不相通的通道**：外壳客户端不读 better-sidebar
   store，插件主通道也不写 `panels.rightbar`。稳态比例只钉中栏视觉；把手对齐由
   `workbench/split-layout.js` 的 `reconcileRightbarFromRatio` 经 `layout.setRightbar()`
   单独负责（方案 D7-S1′）。把两者当成同一条通道会让把手漂移重新出现。

## 五、改动的正确姿势

- **新增网格规则**：先读本文件确认不夺取既有状态组合；必须在契约门禁的矩阵里**新增一行**说明新状态，而不是修改既有行的期望值。
- **调整既有规则**：契约门禁变红即表示真实行为改变；此时应更新本文件与矩阵（含理由），而不是把断言改宽松。
- **纯重构（选择器/顺序等价改写）**：门禁应保持全绿；若变红说明改写不等价。

## 六、验证矩阵

| 层次 | 入口 | 覆盖 |
| --- | --- | --- |
| 契约门禁（快，毫秒级） | `pnpm --filter omnimux test`（含 `src/client/three-column-layout-contract.test.js`） | 7 个状态组合的胜出规则 + 篡改检出能力 + 禁改清单 |
| 真实内核矩阵（慢，无头 Chrome） | `node scripts/three-column-collapse-qa.mjs` | 6 个状态组合的实际三列宽度 + 往返稳定性 + 反向对照（旧 `auto` 规则必须复现右栏塌陷） |
| 缩放档位矩阵（慢，无头 Chrome） | 同上脚本的 `viewportTiers` 段 | 1920 / 2560 / 1440 三档：页面内跑生产比例算法 → 生产 CSS 钉轨 → 实测三列宽度与缩放过渡（±2px） |
| 派生宽度单测 | `sidebar-toggle-topbar.test.js` | INV-1/3/4/5/13 的纯函数语义 |
| 权威切换与结算 | `conversation-ratio-authority.test.js` | INV-15/INV-16：拖拽期逐帧跟随 + 逐帧写入 + `pointerup` 结算比例（±0.005） |
| 面板宽度协调 | `workbench/ratio-reconcile.test.js` | 禁改清单第 9 条：把手对齐写入值与三条「绝不写」边界 |
| 比例持久化 | `workbench/workspace-layout-store.test.js` | INV-17：只存比例、缺失/损坏分流、迁移后 ±4px |

证据归档：`docs/evidence/three-column-collapse-qa-report.json` 的 `matrix` 段含每个组合的实测三列宽度与期望值。

## 七、已登记偏差

| 编号 | 现象 | 契约期望 | 当前实测 | 影响 |
| --- | --- | --- | --- | --- |
| K-1 | 中间栏收起 **且** 左栏收起（右栏开）时，中间列未收缩为 0 | `0px 0px minmax(0px,1fr)`（右栏吃掉全部宽度） | `0px var(--omnimux-conversation-width,420px) minmax(0px,1fr)`（中间列保留一行会话栏宽度，1920 视口实测 485px） | 该组合下右侧工作台左侧会出现等宽空白占位 |

根因：`#2074` 引入的保宽规则特异性为 `[0,5,1]`，高于既有的中间栏收缩规则 `[0,4,1]`，
后者在含顶栏标记的真实环境下**永不生效**。修复方向是提升中间栏收缩规则的特异性
（补 `[data-omnimux-sidebar-toggle-topbar]` 前置条件），但会改变可见布局，
必须先向用户演示确认后再改。K-1 由契约门禁的第 ⑥ 条与 QA 矩阵第 ⑤ 条同时登记锁住：
**任何人改动该组合的胜出规则都会让两处同时变红**。

## 八、比例制状态机（Issue #2608，新增）

中间会话栏自 Issue #2608 起由「固定像素」改为「舞台 × 比例」。状态机只有三个态，
`--omnimux-conversation-width` 始终是唯一写入通道（CSS 零改动，见方案 §4.6）：

| 状态 | 进入条件 | 宽度来源 | 比例 |
| --- | --- | --- | --- |
| `ratio`（稳态） | 默认；`pointerup` 结算后 | `conversationWidthFromRatio(舞台, 存储比例)`（INV-15） | 只读 |
| `dragging`（交互期） | `body[data-dsh-sidebar-dragging]` 或外壳 `[data-dragging]` 存在 | `视口 − 可见左栏 − 外壳 authored 第三轨 − 收起释放宽`（INV-16，与 #2097 修复逐字一致） | 只写（250ms 防抖） |
| `settling`（结算） | `pointerup` / `pointercancel` 后一帧 | 同 `dragging`（取外壳最后一帧值） | 立即写（跳过防抖） |

**硬规则**：`dragging` 态下比例读值不得参与任何写入路径。违反此条即等价于把
「记忆式基准」重新钉回轨道——#2097 原样复发。

三条与状态机配套的通道约定（违反任一条都会产生可见缺陷）：

1. **中栏**只经 `--omnimux-conversation-width` 下发（幂等写：几何不变不 `setProperty`，防自激）。
2. **右栏内容宽**经 better-sidebar tab store（`applyDefaultWidth`），算式为「可见舞台 − 比例中栏宽」。
3. **外壳面板宽 / 把手对齐**经 `layout.setRightbar(可见舞台 − 比例中栏宽, frame 实测宽)`；
   拖拽期绝不写、单栏态（中栏收起 / 右栏收起 / gui）绝不写、拿不到外壳 layout 句柄时绝不猜。

**老用户迁移**：键缺失且外壳已持有用户自己写出的面板宽（`panels.rightbar` 是数字，即用户
亲手拖过分隔线）时，按 `中栏 ÷ 舞台` 反推一次并落盘；全新用户没有可迁移的版式，必须拿到
产品默认 30%（否则会被外壳默认 45% 面板反推成 47%）。

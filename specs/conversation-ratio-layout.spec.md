# 任务规格：三分栏中间会话栏改为比例制（对齐 MiniMax Design 分栏算法）

- 关联 Issue: #2608
- 目标模块:
  - `plugins/omnimux/src/client/workbench/geometry.js`
  - `plugins/omnimux/src/client/sidebar-toggle-topbar.js`
  - `plugins/omnimux/src/client/workbench/split-layout.js`
  - `plugins/omnimux/src/client/workbench.js`
  - `plugins/omnimux/src/client/chrome.js`
  - 新增 `plugins/omnimux/src/client/conversation-ratio.js`
  - 新增 `plugins/omnimux/src/client/workbench/workspace-layout-store.js`
  - `docs/contracts/three-column-layout.md`（修订）
- 设计依据: `.agent-reports/column-ratio-alignment/architecture-plan.md`、`.agent-reports/column-ratio-alignment/product-spec.md`
- 实施状态：T00–T06 已落地（2026-09-23），本文按**实际落地形状**回填

## 1. 业务目标与问题分析

三分栏（左栏 + 中间会话栏 + 右栏工作台）的中间会话栏原先被插件钉在固定 380px。取证结论：外壳的中间列轨道本就是 `minmax(0px, 1fr)` 弹性轨，380 完全由插件写入 `--omnimux-conversation-width` 钉出。

两个待修问题：

1. 窗口拉大时，派生值 = 视口 − 左栏 − 右栏，多出的宽度全部落进中间栏；大屏上「对话栏越拉越宽」的老毛病（#2316 要消灭的荒原）在缩放路径上依然存在。
2. 拖拽记住的是右侧面板像素（按会话 + 页签各记一份），换会话或重开就回默认，同一软件出现多套版式。

目标：中间会话栏改为「舞台宽度 × 比例」计算，默认 30%；拖拽记住的是**比例**（全局一份）；窗口缩放按同一比例重算。

## 2. 技术方案与变更规格

### 2.1 算法（对齐 MiniMax Design 3.0.16）

- 舞台 = 视口内容宽 − 左栏可见宽；**收起左栏时锁定展开态左栏基线作为分母**（保持保宽）
- 中间栏 = clamp(舞台 × 比例, 下限, min(舞台 × 72%, 舞台 − 320px))
- 默认比例 `0.3`；归一化：有限数则 clamp(0, 0.72)，否则回落 0.3
- 下限 = `360px`（用户 2026-09-23 拍板；竞品 220px 不采纳，输入框在 360px 以下退化为图标密度）
- 上限小于下限时下限优先，画布拿剩余
- 拖到最左的止点受外壳自身 400px 拖拽地板约束（接受，不改外壳代码）
- 数值四舍五入到整数像素；三栏之和 = 视口内容宽（容差 ±2px）

**拖拽上限的边界行为**：比例上限 0.72 只约束**稳态**。交互期宽度由外壳 authored 栅格决定，
用户可以拖到 0.72 以上；松手结算时比例被夹到 0.72，中栏随之回到 `舞台 × 72%`。
这是「比例是唯一真源」的必然结果，登记为已知行为而非缺陷。

### 2.2 单写者状态机（防 #2097 复发）

| 状态 | 进入条件 | 宽度来源 | 比例 |
| --- | --- | --- | --- |
| `ratio`（稳态） | 默认；`pointerup` 结算后 | `conversationWidthFromRatio(舞台, 存储比例)` | 只读 |
| `dragging`（交互期） | `body[data-dsh-sidebar-dragging]` 或外壳 `[data-dragging]` 存在 | `视口 − 可见左栏 − 外壳 authored 第三轨 − 收起释放宽` | 只写（250ms 防抖） |
| `settling`（结算） | `pointerup` / `pointercancel` 后一帧 | 同 `dragging`（取外壳最后一帧值） | **立即写**（跳过防抖）+ 稳态重算一次 |

- **稳态**：比例权威 —— 插件按 `舞台 × 比例` 写入 `--omnimux-conversation-width`
- **交互期**：以引擎当帧写出的内联栅格为权威，比例只记录、不干预
- 严禁用测量值反推宽度再写回（自证读数即 #2097 根因）
- 幂等写：几何不变时不得重复 `setProperty`

### 2.3 持久化与迁移

- 只存比例，不存像素；全局一份；键 `omnimux.conversationRatio`，载荷 `{"version":1,"chatRatio":n}`
- 写入去抖阈值 `5e-4`；交互期 250ms 防抖，`pointerup` 走立即写并取消待发防抖写
- **键缺失**与**键损坏**分流：缺失 → `null`（触发迁移）；损坏/非有限 → 回落 `0.3` 并清洗写回；有限数越界 → clamp
- **迁移前提（重要）**：只有在「外壳已持有用户自己写出的面板宽」（`panels.rightbar` 是数字，
  即用户亲手拖过分隔线）时才反推 `比例 = 中栏 ÷ 舞台` 并落盘。
  全新用户没有可迁移的版式，必须拿到产品默认 30%；否则会被外壳默认 45% 面板反推成 47%，
  永远看不到本任务要交付的默认比例。
- 迁移幂等：已存比例时直接返回已存值，绝不覆盖

### 2.4 面板宽度协调与把手对齐（D7-S1′）

外壳的 `panels.rightbar` 一个字段同时决定三件事：authored 第三轨、拖拽起点
（`setRightbar(base − dx)` 是 delta 模型）、右分隔把手位置（`left = viewport − rightbar`）。
因此协调写必须维持 `panels.rightbar ≡ 可见舞台 − 比例中栏宽`，写入通道复用
`tab-viewport-reconciler.js` 已持有的 `layout.setRightbar()`（取证：S1 原文所指的
`applyDefaultWidth → updateStoreWithDefaultWidth` 终点是 better-sidebar tab store，
外壳客户端不读它，故 S1 不成立、走 S1′）。

三条「绝不写」：拖拽期绝不写；单栏态（中栏收起 / 右栏收起 / gui）绝不写；拿不到外壳
layout 句柄时绝不猜。夹紧视口与外壳同口径（frame 实测宽，测不到才退回窗口宽）。

原 `ensureHealthySplitWidth` 的「视口 45% 健康宽度」不再与比例协调写抢同一根轨道：
比例权威适用时让位，仅在比例权威不适用（面板未展开等）时保留兜底。

### 2.5 明确不改动

- `conversation-box.js` 六条网格 `!important` 规则零改动
- 中间栏收起（列宽 0）、右栏收起（中间栏占满）两个单栏态不比例化
- 不修改官方外壳（`omnimux-desktop-fork`）任何代码

## 3. 验收标准

采用 `.agent-reports/column-ratio-alignment/product-spec.md` 的 AC-1..AC-12，关键刻度（左栏 280 展开、默认比例 30%，±2px）：

| 编号 | 验收项 | 判定口径 | 落地状态 |
| --- | --- | --- | --- |
| AC-1 | 比例是唯一真源 | 三栏态实测「中间栏 ÷ 舞台」∈ [0.295, 0.305] | 单测 + QA 缩放档位 |
| AC-2 | 大屏刻度 | 1728 → 434px；1920 → 492px；2560 → 684px | 单测 + E2E + QA 缩放档位 |
| AC-3 | 小屏与下限 | 1440 → 360px；1280 → 360px（被下限夹住） | 同上 |
| AC-4 | 缩放跟随 | 1920→2560：492→684；2560→1440：684→360；任一时刻三栏和 = 视口内容宽 ±2px，无黑边死区 | QA 缩放档位矩阵（真实浏览器 + 生产算法 + 生产 CSS） |
| AC-5 | 拖拽下限 | 拖到最左 = max(360, 外壳 400 地板) ±2px | 拖拽分支单测（INV-13 口径） |
| AC-6 | 拖拽上限 | 拖到最右 = min(舞台×72%, 舞台−320) ±2px，且画布 ≥320px | 单测 |
| AC-7 | 比例记忆 | 切会话 / 重开应用 / 改窗口大小后比例保持 ±0.005 | `workspace-layout-store.test.js` + 结算用例 |
| AC-8 | 收起态不回归 | 中间栏收起 → 列宽 0；右栏收起 → 中间栏占满；与现行 QA 矩阵一致 ±2px | QA 矩阵（CSS 零改动） |
| AC-9 | 收起左栏保宽 | 中间栏像素与收起前一致 ±2px，释放宽度全部进画布 | 单测 + E2E |
| AC-10 | 视觉可用性 | 360px 下限下输入区控件单行不折行、不重叠、无横向溢出；684px 下无溢出错位 | 容器查询契约断言（CSS 零改动） |
| AC-11 | 老用户不突变 | 升级后首开中间栏宽度与升级前一致 ±4px | 迁移用例（口径见 §2.3 的迁移前提） |
| AC-12 | 门禁与既有测试 | 契约门禁除「三栏态预期值」外全部通过；新增状态行走契约修订流程，不得把既有断言改宽松 | 全量门禁 + 契约修订（新增行，不改既有行） |

工程侧补充：

| 编号 | 验收项 | 判定口径 |
| --- | --- | --- |
| E-1 | 单一写入通道 | 中栏宽度只经 `--omnimux-conversation-width` 下发；无 `frame.style.gridTemplateColumns` 写 |
| E-2 | 幂等写 | 连续 10 次同步且几何不变时，`setProperty` 实际写入次数 ≤ 1 |
| E-3 | 交互期逐帧跟随 | 拖拽中存储比例与 authored 冲突时仍逐帧跟随；拖拽期间写入计数 ≥ 帧数 − 1 |
| E-4 | 结算即真源 | `pointerup` 后存储比例 = 终态宽度 ÷ 舞台（±0.005），且稳态重算对可见宽度是恒等变换 |
| E-5 | 把手对齐 | 协调写维持 `panels.rightbar = 可见舞台 − 中栏`（±1px），拖拽起点即真实列边界（缩放后立即拖拽无首帧跳变） |
| E-6 | 结算不读自证读数 | 结算只读外壳 authored 栅格，绝不读插件自己写出去的 CSS 变量 |

## 4. 命令

- 插件单测与契约门禁：`pnpm --filter omnimux test`（工作树内执行）
- 三栏真实内核矩阵 + 缩放档位：`node scripts/three-column-collapse-qa.mjs`
- 全仓静态门禁：`pnpm test:gates`
- 产品基线：`pnpm verify:product-baseline`

## 5. 项目结构

- 纯函数层：`plugins/omnimux/src/client/conversation-ratio.js` + 同名 `.test.js`
- 持久化：`plugins/omnimux/src/client/workbench/workspace-layout-store.js` + 同名 `.test.js`
- 权威切换与结算：`plugins/omnimux/src/client/conversation-ratio-authority.test.js`
- 面板宽度协调：`plugins/omnimux/src/client/workbench/ratio-reconcile.test.js`
- 改造：`workbench/geometry.js`、`sidebar-toggle-topbar.js`、`workbench/split-layout.js`、`workbench.js`、`chrome.js`、`workbench/host-adapter.js`、`workbench/tab-viewport-reconciler.js`
- 规格与契约：本文件、`docs/contracts/three-column-layout.md`
- 证据目录：`.agent-reports/conversation-ratio-layout/`

## 6. 代码风格

沿用既有 client 模块约定：具名导出、纯函数优先、JSDoc 说明契约意图、常量用 `SCREAMING_SNAKE_CASE`、不新增依赖。示例：

```js
/** Published conversation-column width; the only writer of this variable. */
export function conversationWidthFromRatio(stageWidth, ratio) { … }
```

## 7. 测试策略

- 纯函数单测：比例归一化、像素预算、宽度↔比例往返换算（`conversation-ratio.test.js`）
- 权威与结算单测：拖拽逐帧跟随 / 逐帧写入计数 / `pointerup` 结算 / #2097 收起态拖拽（`conversation-ratio-authority.test.js`）
- 持久化单测：只存比例、缺失与损坏分流、防抖与立即写、迁移 ±4px（`workspace-layout-store.test.js`）
- 协调写单测：写入值、幂等、拖拽期与单栏态绝不写、拿不到句柄不猜（`ratio-reconcile.test.js`）
- 源码契约回归：网格规则仍引用 `--omnimux-conversation-width`，且几何写入方仍发布该变量
- 行为单测：`sidebar-toggle-topbar.test.js` 按「拖拽组 / 稳态组」拆分改写
- 真实内核矩阵：`scripts/three-column-collapse-qa.mjs` 新增缩放档位（页面内跑生产算法 + 生产 CSS 钉轨 + 真实缩放）
- E2E：`tests/e2e/three-column-ratio-layout.spec.js`（取代 380 版旧规格）

## 8. 边界

- **总是**：改完跑 `pnpm --filter omnimux test`；保持单一写入通道；保持幂等写
- **先问**：修订契约文本（已随 Issue #2608 授权）；新增依赖
- **绝不**：修改官方外壳源码；用测量值反推写回；把既有断言改宽松；提交密钥

## 9. 假设

1. 外壳中间列轨道保持 `minmax(0px, 1fr)` 弹性，插件继续以 `!important` 规则介入
2. 外壳拖拽地板 400px 不修改（跨仓改动另议）
3. 用户 2026-09-23「实施方案」已授权：下限 360px、接受 400px 地板、收起左栏保宽、修订契约文本

## 10. 新用户基线

全新用户机器上不依赖任何本机私有状态：比例默认 0.3，首次打开即按比例计算；持久化键缺失时回落默认值且不报错，且**不会**被外壳默认面板宽反推成非默认比例（见 §2.3 迁移前提）。

## 11. 设计偏离登记（实施期发现，逐条留档）

| # | 方案/规格原文 | 实际落地 | 理由 |
| --- | --- | --- | --- |
| 1 | 纯函数模块落在 `workbench/conversation-ratio.js` | `src/client/conversation-ratio.js` | 任务规格与 Issue 交付清单定在 `src/client/` 根，两者冲突以规格为准 |
| 2 | `normalizeConversationRatio` 用 `Number.isFinite(Number(v))` 一阶判定 | 显式拒绝 `null` / 空串 / 布尔 / 对象 | 一阶判定会把 `null` 与 `''` 经 `Number()` 变成有限数 0 → 静默把中栏压到下限 |
| 3 | 面板宽算式用基线舞台 | 用**可见舞台** | 收起左栏时基线舞台比可见舞台小 280px，会把面板上限夹小、中栏被反向挤窄，保宽 INV-1 当场失效 |
| 4 | D7-S1 沿用 `applyDefaultWidth` 写入路径 | 走 D7-S1′（`layout.setRightbar()` 桥） | 取证证明该路径终点是 better-sidebar tab store，与外壳 `panels.rightbar` 无连接 |
| 5 | `ensureHealthySplitWidth` 按视口 45% 写健康宽度 | 比例权威适用时让位给协调写 | 两个写入者会在换页签与缩放之间来回打架 |
| 6 | 迁移在键缺失时无条件反推 | 只在「外壳已持有用户自己写出的面板宽」时反推 | 否则全新用户被反推成 47%，看不到产品默认 30% |
| 7 | 未提 | 删除已死的 `WORKBENCH_CONVERSATION_TARGET_PX`；地板统一到 `CONVERSATION_MIN_CHAT_PX` | 死常量清理 + 地板单一真源（原先 360/320 两处不一致） |
| 8 | 未提 | 拖拽到 0.72 以上后松手会回到 72% | 比例是唯一真源的必然结果，见 §2.1 |
| 9 | 未提 | 外壳对面板宽的夹紧会让 1440/1280 档把手漂移最多 40px | 外壳 `CENTER_MIN=400` 与插件中栏地板 360 之差；已登记，属外壳夹紧而非插件错位 |

## 12. 未完成项（如实登记）

- **真实桌面外壳的三栏缩放实测未取得**：工作树 Web 测试环境内没有桌面外壳插件
  （不存在 `.dshDesktopFrame`），唯一真实外壳实例是共享的开发版桌面应用，改其用户状态
  超出 Agent 边界。缩放档位证据改由 `scripts/three-column-collapse-qa.mjs` 在**真实无头
  Chrome**里给出：页面内跑生产比例算法、由生产 CSS 钉轨、按真实视口切换测量三列宽度。
  该证据覆盖 AC-2/AC-4 的算法与渲染链，但不覆盖「外壳 React 重算 + 外壳把手位置」这一段；
  外壳把手对齐由 `ratio-reconcile.test.js` 以句柄替身覆盖。

## 13. 第 1 轮独立审查退修记录（2026-09-23 新增）

`ocr` 第 1 轮审查（`d866bae10..7c2056fcd`，v1.12.9）保留高 5 条、中 6 条，逐条处置如下；
契约侧口径见 `docs/contracts/three-column-layout.md` 第九节（新增行，不改既有行）。

| 编号 | 意见 | 处置 | 落地位置 |
| --- | --- | --- | --- |
| H-1 | 迁移门槛被协调写破坏，全新用户被自证读数反推 | 修复：迁移前提改为两个用户信号（① 观察到外壳分隔线拖拽；② 首次读到的 `panels.rightbar` 已是数字且那一刻插件尚未写过它），插件每次写该字段都登记 | `sidebar-toggle-topbar.js`（`hasUserAuthoredPanelWidth` / `notePluginPanelWidthWrite`）、`split-layout.js`、`tab-viewport-reconciler.js` |
| H-2 | 拖拽判据与外壳不同源，拖拽期仍写面板宽（INV-16） | 修复：`reconcileRightbarFromRatio` 的拖拽判据并入 `isShellSplitDragging`（与面板级判据取并集，保守方向是「不写」） | `split-layout.js` |
| H-3 | 拖拽地板 320 与稳态 360 冲突，§11 第 7 条自述失真 | 修复：删除 `CONVERSATION_WIDTH_MIN_PX`，拖拽分支改用 `CONVERSATION_MIN_CHAT_PX`；§11 第 7 条自述自此与实现一致 | `sidebar-toggle-topbar.js`、契约第九节第 1 条 |
| H-4 | 两侧比例读取不同源 | 修复：`geometry.js` 删除本地实现，委托 `sidebar-toggle-topbar.resolveConversationRatio`（唯一真源 + 按落盘版本号缓存） | `geometry.js`、`sidebar-toggle-topbar.js`、`workspace-layout-store.js` |
| H-5 | 结算挂任意指针释放且无状态守卫 | 修复：结算入口要求「拖拽观察计数前进 ∧ 释放当帧已非拖拽态 ∧ 三栏分栏态」；观察计数只在**真正结算成功**后消费 | `split-layout.js`、`sidebar-toggle-topbar.js` |
| M-1 | 拖拽期 250ms 防抖落盘无调用方 | 修复：装配层在拖拽期以同一算式采样比例并 `schedulePersistChatRatio`；无可用存储时不挂定时器 | `sidebar-toggle-topbar.js`、`workspace-layout-store.js` |
| M-2 | QA 缩放档位判定近似空断言 | 修复：夹具 authored 第三轨改为**不由 chat 推导**的常量 `0px`；新增变量哨兵探针与「停用生产样式表必须转红」的反向对照 | `scripts/three-column-collapse-qa.mjs` |
| M-3 | 每帧读 localStorage、迁移探针每帧重入 | 修复：迁移判定一次性置位（无论是否迁移）；解析结果按落盘版本号缓存，任何真实落盘使其失效 | `sidebar-toggle-topbar.js`、`workspace-layout-store.js` |
| M-4 | 未测量视口守卫排在拖拽分支之前 | 修复：拖拽分支前置，只有 frame 与窗口都测不到才走 380px 兜底 | `sidebar-toggle-topbar.js` |
| M-5 | 窗口口径与 frame 口径混用 | 修复：参与「视口 − 左栏 − 第三轨」的宽度与舞台分母统一取 frame 实测宽（测不到退回窗口内容宽） | `sidebar-toggle-topbar.js` |
| M-6 | `env.doc` 未向下透传 | 修复：`officialSessionSidebarWidth` / `isOfficialSidebarCollapsed` 走 `env.doc`；协调写把 `doc` 注入 env | `geometry.js`、`split-layout.js` |

**本轮新增证据**：缩放档位夹具的可证伪性由三层判定共同锁住——档位期望值（±2px）、变量哨兵
（第二轨必须跟随 `--omnimux-conversation-width` 哨兵）、反向对照（停用生产样式表后该档必须偏离
期望）。三者任一失效即变红。

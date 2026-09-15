# 左侧栏单选激活收敛（插件行高亮 / 会话优先 / 全屏退出联动）

- 任务：`.worktrees/rail-active-state-convergence`（分支 `agent/rail-active-state-convergence`，基线 `origin/main` @ `3f57e189f`）
- 日期：2026-09-15
- 上游：`.agent-reports/rail-active-state-convergence/`（PRD 许清楚 v1.0、系统设计 高见远 v1.0、三份取证报告、类图 / 时序图）

## 1. 问题

三个用户可见现象来自同一个结构性缺陷：左侧栏行的高亮判定读的是一个在现役宿主上已不是真源的旧镜像。

| 现象 | 现状 | 根因 |
| --- | --- | --- |
| P1 点插件项不高亮 | 每行高亮落在 `isWorkbenchActive()`，读 better-sidebar 快照的 `state.panelOpen` / `state.splits`；这两个字段在现役 `dsh-better-sidebar` 的 `SidebarState` 里已不存在（右栏已交还官方 `ctx.sidebarRight`） | 谓词恒 false，写回 DOM 的只有 `delete entry.dataset.active` |
| P2 插件项与会话行双高亮 | 高亮有两套互不相识的写入方：每行自算 `entry.dataset.active`；官方会话行 `aria-selected` + 官方 CSS | 二者之间没有任何互斥裁决；`isOpen`（Tab 存在）回退还会把「存在但未聚焦」判成 active |
| P3 全屏下点会话记录回不去 | `revealConversationIfCollapsed()` 只在插件自己的折叠布尔为真时才动作，且动作只是 `setFocus('split')` | 宿主全屏是另一个状态键（官方 `surface.layout.mode === 'fullscreen'`），插件清折叠键不改变它，面板仍以 `position:fixed; width:100%` 盖住中间栏 |

## 2. 架构仲裁决策（本规格的真相源）

1. **左侧栏任意时刻只有一个激活位**。插件行、动态应用行、会话行共享同一标量；写入方只有仲裁投影，没有第二套。
2. **裁决顺序固定且互斥**（`resolveSidebarActiveTarget`）：
   - 规则 1：中间会话栏可见 **且** 存在选中的会话行 → 激活位归 `session`，所有插件行高亮必须为 `false`。
   - 规则 2：否则，官方右侧面板已展开且其聚焦页签能映射到左栏行 → 激活位归该 `tabId`，仅该行为 `true`。
   - 规则 3：其余情况（含「聚焦页签在左栏没有对应行」）→ 无激活项，所有插件行 `false`。
3. **会话选中态真源是官方 DOM**：`[role="treeitem"][aria-selected="true"]`，作用域限定官方左栏列，并排除搜索结果的树行。插件不得自建会话选中镜像。
4. **宿主真源优先于插件内存态**：`ctx.sidebarRight.isExpanded()/active()` 与官方 DOM 属性是判定输入；插件内存布尔只能作为 DOM 缺失时的兜底。
5. **全屏退出走官方控件**：插件没有 `setMode` / `exitFullscreen` 接缝，唯一确定性动作是点击官方模式按钮 `button[data-sidebar-right-mode="push"]`（在 `[data-sidebar-right-panel="fullscreen"]` 作用域内优先）。
6. **点会话记录不关闭右侧面板**：只退出宿主全屏 + 清插件折叠键，面板展开态与已开 Tab 保持不变（遵循既有 L2 ADR；PRD 的 G1/G2/G3 在不关面板前提下全部可达）。
7. **不抢 DOM**：不与现有写入方争 `data-active`；改的是它们脚下的数据源（`isActive` / `createSidebarStore().getSnapshot()` 委托裁决）。

## 3. 用户场景

### 场景 A：点左栏插件项

1. 用户在会话页点击左栏任一插件项（项目 / 账号 / 技能专家 / 发布 / 数据分析 / 资产库 / 灵感社区 / 产品库）。
2. 右侧面板打开并进入该插件页签。
3. **期望**：该行高亮（`data-active="true"`），其余插件行全部熄灭；会话行随中间栏被压成 0 宽而不再占据激活位。

### 场景 B：在插件页点会话记录（含全屏遮挡）

1. 用户在插件页（可能处于宿主全屏）点击左侧会话记录。
2. **期望**：一步到位——退出宿主全屏、展开中间会话栏、会话行高亮，所有插件行立刻熄灭。

### 场景 C：三类遮挡起点

| 起点 | 期望 |
| --- | --- |
| 宿主全屏（`data-sidebar-right-panel="fullscreen"`） | 退全屏 + 中间栏可见 + 会话行高亮 |
| 插件折叠键为真（`html[data-omnimux-conversation-collapsed]`） | 清折叠键 + 中间栏可见 + 会话行高亮 |
| 左轨收起（`html[data-omnimux-left-collapsed]`） | 展开态恢复后同样满足上两条 |

### 场景 D：重复点击已选中的会话记录

**期望**：幂等——不闪屏、不重置面板宽度、不产生新的高亮写入。

## 4. 验收标准（可测试）

### 4.1 裁决函数（纯函数真值表）

- AC-1 `resolveSidebarActiveTarget({selectedSessionRows>=1, conversationVisible:true, …})` → `{winner:'session', reason:'session-wins'}`。
- AC-2 `resolveSidebarActiveTarget({selectedSessionRows:0, panelExpanded:true, activeTabKey:'omnimux-clip:studio'})` → `{winner:'row', tabId:'omnimux-clip:studio', reason:'focused-tab'}`；同一输入下 `isRailVerdictRow(v,'omnimux-assets:library') === false`。
- AC-3 选中会话行存在但 `conversationVisible:false`（宿主全屏 / 折叠）→ **不得**判为 `session`。
- AC-4 `panelExpanded:true` 但 `activeTabKey` 无法映射（如 `'tab:5'`）或无键 → `{winner:'none', reason:'tab-has-no-rail-row'|'idle'}`，所有插件行 `false`。
- AC-5 `panelExpanded:false` → `{winner:'none'}`，所有插件行 `false`（即使旧 store 快照里该 Tab 存在）。
- AC-6 页签键按三级容错映射：① 精确等于左栏 `tabId`；② 等于左栏行的中文标题（`WORKBENCH_TAB_TITLE_FALLBACKS` 反查）；③ 都不中 → 无激活项。

### 4.2 信号读取（DOM）

- AC-7 `readSelectedSessionRows` 只统计官方左栏列内 `[role="treeitem"][aria-selected="true"]`，且排除搜索作用域内的树行；搜索态命中 2 个节点时按「有选中行」处理并在裁决上标记 `multiple-selected-rows`。
- AC-8 `conversationVisible` = 折叠键为假 ∧ 会话列实测宽度 > 0 ∧ 非宿主全屏（三者合取）。全屏时即使会话列仍有宽度也必须为 `false`。

### 4.3 全屏判定与退出

- AC-9 `isHostRightSidebarFullscreen`：命中 `[data-sidebar-right-panel="fullscreen"][data-sidebar-right-open]` 为真；仅有壳层镜像 `[data-rightbar-fullscreen="true"]` 且面板未声明 `push` 时为真；面板已声明 `push` 时为假。
- AC-10 `exitHostRightSidebarFullscreen`：全屏时点击面板作用域内的 `button[data-sidebar-right-mode="push"]` 并返回 `true`；该按钮缺失时降级到文档级 push 按钮 → 再降级到 `setFocus('split')`；非全屏时返回 `false` 且不产生任何点击。

### 4.4 收敛与不变量

- AC-11 `isWorkbenchActive(tabId)` 与 `createSidebarStore(tabId).getSnapshot()` 都返回同一裁决投影；`isOpen`（Tab 存在）**不再**参与高亮判定。
- AC-12 进入对话意图（会话行点击 / 新建会话）链路为：退宿主全屏 → 折叠键为真时 `setFocus('split')` → 同步一次仲裁。
- AC-13 INV-1：左栏 `[data-active="true"]` 的插件行数量 ∈ {0,1}，永不 ≥2；INV-3：存在选中会话行且中间栏可见 ⟹ 插件高亮数 = 0；INV-4：面板未展开 ⟹ 插件高亮数 = 0。
- AC-14 守门：插件客户端不再出现 `dataset.active =` / `setAttribute('data-active', …)` 私有写入（market 行保持由 `window.__omnimuxWorkbench.isActive` 驱动）。

### 4.5 回归

- AC-15 `pnpm --filter omnimux build` 成功；`pnpm --filter omnimux test` 全绿（含既有 `workbench.test.js` 中按新语义改写的 `isActive` 用例）。
- AC-16 受影响插件单测（`omnimux-market`）全绿，无新增失败。

## 5. 不变量（可直接转成断言）

| 编号 | 不变量 |
| --- | --- |
| INV-1 | 左栏插件行 `[data-active="true"]` 数量 ∈ {0,1} |
| INV-2 | 插件行高亮 ⟹ 宿主面板展开 |
| INV-3 | 选中会话行 ∧ 中间栏可见 ⟹ 插件高亮数 = 0 |
| INV-4 | 面板未展开 ⟹ 插件高亮数 = 0 |
| INV-5 | 宿主全屏 ∧ 面板展开 ⟹ 恰好 1 个插件行高亮（会话行不占位） |

## 6. 不在范围

- 官方源码、`dsh-ui-kit`（另一工作区）、社区包 fork：只读消费，不修改。
- 官方会话行选中底色（使用 hover 语义变量）与插件激活色（`--dsw-alias-interactive-bg-active`）不同源：按架构决策 D-2 记录为已知差异，不改官方 CSS。
- 端到端浏览器场景（T05，隔离工作树真实浏览器）与真机开发版验收：本任务不覆盖，由后续阶段补齐。

## 7. 验证方式

- 单测：`node --test plugins/omnimux/src/client/workbench/sidebar-activation.test.js`、`.../host-fullscreen.test.js`、`plugins/omnimux/src/client/workbench.test.js`。
- 构建：`pnpm --filter omnimux build`；全量：`pnpm --filter omnimux test`。
- 静态：`git diff --check`。

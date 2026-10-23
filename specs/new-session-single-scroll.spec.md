# 规格：新会话探索区回归单一滚动归属（Issue #3628）

- **状态**：实施中（Implementing）
- **负责人**：Agent（协调者）
- **生效工作树**：`.worktrees/inspiration-single-scroll`
- **生效分支**：`agent/inspiration-single-scroll-issue-3628`
- **取代**：`specs/tab-sticky-top-min-height.spec.md` 中「网格容器采用视口上限 + 内部滚动」一节（该节由 #2726 提出、#2914 改为内部滚动；本规格只接管 `.omnimux-explore-grid-view-wrap` 的滚动归属，货架视图的 `min-height` 撑开规则保持不变）。

## 一、业务背景与用户痛点

新会话（空白会话首页）探索区在卡片超过一屏时同时出现两个纵向滚动条：

1. 官方会话滚动容器 `[data-conversation-scroll]`（`.scrollBody`，`overflow-y: auto`）；
2. 自绘网格容器 `.omnimux-explore-grid-view-wrap`（`max-height: calc(100vh - 120px)` + `overflow-y: auto`）。

滚轮落在内容区时只会滚动内层网格，页面本身不动：用户既无法连续浏览上方引导区，也看不到外层滚动条变化，形成「滚轮陷阱 + 双滚动条」的割裂体验。同时内层滚动不会驱动 `useComposerDocking` 的 `[data-conversation-scroll]` 滚动监听，吸底状态机与滚动位置脱钩。

## 二、目标（Goals）

1. **单一滚动归属**：探索区在任意一级 Tab（精选 / 资产库 / 灵感库 / 商品库 / 爆款趋势 / Skills）下，纵向滚动容器恰好一个，且必须是官方 `[data-conversation-scroll]`；`.omnimux-explore-grid-view-wrap` 不再是滚动容器，按内容自然展开。
2. **保留既有正确行为**：Tab 栏 `position: sticky; top: 0` 吸顶与实心底色、吸底输入框停靠与底部安全垫高（`[data-composer-seat]` 的 dock padding）、无限滚动 Sentinel 仍能触发。
3. **规格归属不冲突（部分延后）**：在旧规格关系中登记被本规格取代的条款、避免两处真源（已完成）；「修正锁死旧行为的样式契约测试」需维护者就精确用例授权，本轮**未执行**（见「历史标准的处置」）。

## 三、非目标（Non-Goals）

- 不改官方会话页滚动结构（`[data-conversation-scroll]` 仍是滚动底座）。
- 不改 Tab 栏吸顶实现、`useComposerDocking` 状态机与吸底阈值算法。
- 不改卡片视觉、文案、分类与数据源。
- 不为网格重新引入 `min-height: calc(100vh - ...)` 强制撑高（#2914 已明确否决该做法）。

## 四、验收标准（可观察）

- **AC-1 单一滚动条**：真实浏览器内（隔离工作树、完整应用），进入新会话并切到卡片超过一屏的网格视图后，探索区作用域内 `overflow-y` 为 `auto|scroll` 且 `scrollHeight - clientHeight > 1` 的纵向滚动容器数量为 **1**，且该元素带 `data-conversation-scroll`。
- **AC-2 滚轮驱动页面**：在网格中心派发真实滚轮事件（CDP `Input.dispatchMouseEvent`）后，官方滚动容器 `scrollTop` 增大；`.omnimux-explore-grid-view-wrap` 的 `scrollTop` 恒为 0。
- **AC-3 网格不再是滚动容器**：`.omnimux-explore-grid-view-wrap` 计算样式 `overflow-y` 不是 `auto|scroll`，`max-height` 为 `none`。
- **AC-4 Tab 栏吸顶**：滚动后 `.omnimux-explore-filter-bar` 顶边与滚动容器顶边差值 ≤ 2px。
- **AC-5 回归面**：`pnpm --filter omnimux-inspiration test`、`pnpm --filter omnimux test`、`pnpm verify:stages` 通过；工作树内真实浏览器证据（结构化断言 + PNG）留存于 `.workbuddy/evidence/contract/3628/<runId>/`。

## 假设

假设官方会话滚动容器 `[data-conversation-scroll]` 是空白会话首页唯一的宿主滚动底座，且其 `.scrollBody` 保持 `overflow-y: auto`；`useComposerDocking` 的滚动监听与吸底阈值只依赖该容器，因此移除内层滚动容器不会改变吸底状态机的触发条件，只会让滚轮重新驱动它。

## 证伪方式

在同一工作树内先对未修复代码（`origin/main` 基线）运行同一条真实浏览器旅程，预期 `journey:single-vertical-scroll-owner`、`journey:wheel-scrolls-conversation` 为 false（可复现双滚动条与滚轮陷阱）；应用修复后同一旅程全部为 true，且截图显示仅一个滚动条。若基线运行即全部为 true，则本规格的前提被证伪，必须重新定位滚动归属。

## 五、影响面与风险

| 面 | 影响 |
| --- | --- |
| `plugins/omnimux/src/client/session-guide/styles.js` | 新增修饰类 `.omnimux-explore-grid-view-flow`（`max-height: none; overflow-y: visible`），删除 `[data-omnimux-dock-open]` 下的网格上限变体；历史基类声明按契约测试要求原样保留 |
| `plugins/omnimux-inspiration/src/explore/templates/ExploreTemplatesSection.jsx` | 三个网格视图分支的容器追加 `omnimux-explore-grid-view-flow` 修饰类 |
| `plugins/omnimux-inspiration/src/explore/picker-sticky-docking.test.js` | **只追加**新用例「单一滚动归属契约（Issue 3628）」；既有用例与断言一字未改 |
| 长列表滚动深度 | 卡片越多页面越长；由页面滚动 + Tab 吸顶承接，属期望行为（Issue 2914 的「少卡不制造超额滚动」结论保持不变） |

- 触及 hub 侧共享样式 + 下游插件测试，按跨包处理，风险等级 R1。

## 六、历史标准的处置（待授权）

`.omnimux-explore-grid-view-wrap` 的「视口上限 + 内部滚动」是 Issue 2726/2914 拍板、并由
`picker-sticky-docking.test.js` 样式契约断言锁定的历史标准。全仓权威是 `scripts/guard-anti-cheat.mjs`
（RULE-01：禁止删除/改写既有测试用例与断言，只放行新增）与
[`docs/contracts/anti-agent-fake-completion-guard.md`](../docs/contracts/anti-agent-fake-completion-guard.md)；
任务级先例见 `docs/plans/unified-upstream-input-2848.md`（「保留红证据 + 就精确文件/用例请求授权，未获批准前停止该修改」）。

因此本次交付采取**只增不改**路径：历史基类声明保留、当前契约由修饰类表达，行为按 AC-1~AC-4 修复。
遗留清理（删除历史基类声明 + 用新断言替换锁定的旧断言）需要维护者就
`plugins/omnimux-inspiration/src/explore/picker-sticky-docking.test.js` 的
「样式契约验证：.omnimux-explore-grid-view-wrap 视口上限内滚，.omnimux-explore-shelves-view 视口撑开」
与「视口几何仿真断言：网格容器上限 100vh-120px 内部滚动…」两个用例给出明确授权后再执行。

## 七、文档影响

- 新增本规格，作为「新会话探索区滚动归属」的单一真源。
- `specs/tab-sticky-top-min-height.spec.md`（历史已签发 PRD）中「网格容器 `.omnimux-explore-grid-view-wrap`
  采用视口上限 + 内部滚动」的条款自本规格起被取代；该历史文档保持原文不改写，取代关系记录在本规格与本任务
  `docs/evidence/new-session-single-scroll/report.md`。货架视图 `.omnimux-explore-shelves-view` 的视口
  `min-height` 撑开规则仍然有效，保持不变。

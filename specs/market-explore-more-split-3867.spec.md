# Spec: 技能面板「探索更多」在右侧边栏分栏打开，保留会话栏

- Issue: #3867
- PR: #3873
- 风险级别: R2（单插件客户端交互修复；可逆）
- Base: `origin/main` @ `89d8d4867`
- 验收宿主（实际运行）：packaged Host **OmniMux Dev 2.0.10**（`app.asar` 布局）／ dsh `0.2.1-rc.3`，插件取本 worktree 源码。
  本机同时安装了新版 Dev App 2.0.21（`asar: false` + 预设行改由壳注入），其隔离启动链缺口见 Issue #3871；本任务用仍是仓内文档记录代际的 2.0.10 完成隔离验收，适配脚本留在 `.tmp`（未提交）。
- 依赖: 无（复用既有 `window.__omnimuxWorkbench.open({ focus })` 接缝）

## 1. 目标与用户故事

会话输入框「技能」面板底部有「探索更多」。现在点击后工作台以 Tab 默认 focus（`gui`）打开 `omnimux-market:plaza`：右栏吃满视口、中间会话栏被压掉，用户感觉像「先关掉会话栏再打开技能页」。

期望：点击「探索更多」在**当前页面状态下激活右侧边栏**——右栏以分栏（`split`）打开技能/专家页，中间会话栏保持可见，用户可以对照当前会话继续挑技能。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 「探索更多」只传 `tabId`/`title`，不传 `focus` | `plugins/omnimux-market/src/client/skill-picker.js` → `onExplore` | 改为显式 `focus: 'split'` |
| `open()` 支持显式 `focus`；未传时回落到「会话记录 → Tab 默认 focus」 | `plugins/omnimux/src/client/workbench/sidebar-controller.js` → `openWorkbench`；`workbench/focus-state.js` → `resolveTargetFocusMode` / `resolveDefaultFocus` | 复用，不改 |
| `omnimux-market:plaza` 是 workbench Tab，默认 focus = `gui`（右栏 = 视口 − 左栏，会话列被压掉） | `plugins/omnimux/src/client/workbench/focus-state.js` → `isWorkbenchTab` / `resolveDefaultFocus` | 不改（左栏「技能/专家」入口仍全屏） |
| 会话内同类入口已用显式 `split` 保留会话（先例） | `plugins/omnimux/src/client/composer-add/controller.js`；`plugins/omnimux-market/src/client/session-create.js` | 作为本改动的既有范式 |
| 右栏收起/展开由宿主官方控件负责（`button[data-sidebar-right-toggle]`，rc.3） | `@deepseek-ai/dsh-client-ui-sidebar-right`（宿主包，只读） | journey 用该控件把页面恢复成「右栏关闭」的用户状态 |
| 技能选择器 PRD 只要求「工作台打开 plaza 且落在技能 Tab」，未要求全屏 | `docs/prd/2026-09-skill-picker-prd.md` AC-7 | 不改 PRD（本改动把「工作台」落成右侧边栏分栏） |

## 3. 实现设计

`skill-picker-logic.js`（共享规则模块，片段经 `SkillShelf` 命名空间消费）新增会话内打开参数：

```js
export const PLAZA_WORKBENCH_TAB_ID = 'omnimux-market:plaza'

export function buildPlazaWorkbenchOpenOptions(title) {
  return { tabId: PLAZA_WORKBENCH_TAB_ID, title, focus: 'split' }
}
```

`skill-picker.js` 的 `onExplore` 保留 `writePlazaSkillsIntent()` 与 `close()`，把原来的 `wb.open({ tabId, title })` 换成：

```js
if (wb && typeof wb.open === "function") {
  wb.open(SkillShelf.buildPlazaWorkbenchOpenOptions(tr("plaza.title")));
}
```

要点：

- `focus: 'split'` 显式覆盖 Tab 默认 `gui`，`setWorkbenchFocus('split')` 同时清掉会话折叠键，因此中间会话栏回到可见态。
- 左栏常驻 / 官方「更多」菜单里的「技能·专家」入口不经过该参数，默认全屏行为不变。
- 不新增 observer、不新增全局、不改 hub 侧 focus 表。
- 本轮不重构 plaza Tab id 在 `plaza-shell.js` / `session-create.js` / `tool-views.js` 里的既有同值字面量（避免把一次交互修复扩成跨片段重构）；新常量只声明「会话内打开参数」用到的值。

## 4. 范围 / 非目标

范围：`plugins/omnimux-market/src/client/skill-picker-logic.js`（打开参数）、`skill-picker.js`（调用点）、对应单测、本 spec、真实浏览器 journey。

非目标：不改左栏「技能/专家」入口的默认全屏；不改 plaza Tab 注册/标题/默认 focus 表；不改技能面板其它按钮、搜索、货架数据；不改官方 `packages/`、Electron 壳层与 `docs/contracts/`；不重构其它入口的 plaza Tab id 字面量。

## 5. 验收标准（可观察）

- [ ] 点击「探索更多」后，plaza 渲染在右侧面板的几何范围内（`plazaRect` 左右边界落在 `panelRect` 内），面板内活动 Tab 标题为「技能/专家」。
  - 说明：不以 `isActive('omnimux-market:plaza') === true` 为判据——该读数是侧栏行激活仲裁；会话可见且会话行被选中时，插件左栏行本不激活（见 `docs/contracts/sidebar-extra-entries.md` 的激活语义）。GREEN 运行实测 `activePlaza=false` 而面板内 Tab 与内容均正确。
- [ ] 中间会话栏同一屏可见：`[data-composer-card]` 正几何（宽 ≥ 200px）、`[class*="centerCol"]` 宽 ≥ 200px、`[data-sidebar-right-panel]` 不是 `fullscreen`、`html[data-omnimux-conversation-collapsed]` 不存在。
- [ ] 起点是用户截图状态：右栏关闭（`[data-sidebar-right-open]` 不存在，会话列占满中区），点完探索更多后右栏以分栏打开。
- [ ] 左栏「技能/专家」入口行为不变（默认全屏）——hub 未改，由既有 hub 单测 `plugins/omnimux/src/client/workbench.test.js` 的默认 focus 用例托底。
- [ ] 同一 journey 在修复前红（会话栏不可见 / 右栏全屏 / 会话折叠）、修复后绿；PNG 截图 + 结构化 facts 留证。
- [ ] 单测：`buildPlazaWorkbenchOpenOptions` 的 payload 含 `focus: 'split'`；`onExplore` 的源码接线断言指向该函数（组件运行时路径由真实应用 journey 证明，见 §9）。

## 6. 新用户基线

本改动只影响「从会话输入框技能面板点探索更多」这一跳转参数，依赖的 `window.__omnimuxWorkbench` 由 hub 无条件安装、`omnimux-market:plaza` Tab 由本插件注册，均为随包产物。全新用户不需要任何 Dev 本机状态、模型凭据或外部服务；hub 未就绪时函数返回 `false`，与现状一样静默不跳转（不抛错、不伪造页面）。缺失该面板入口（无 preset 绑定）时整个按钮不渲染，与本次改动无关。

## 假设

- 假设 A：`open({ focus: 'split' })` 与 `composer-add`、`session-create` 走同一条既有路径，在**右栏关闭**（用户截图状态，journey 起点）时也能把 plaza 打开为分栏，而不是只在「右栏已开」时有效。
- 假设 B：`split` 写入会清除会话折叠键（`syncConversationCollapsedForFocus`），因此修复后 `html[data-omnimux-conversation-collapsed]` 不存在且 composer 正几何。
- 假设 C：该改动只影响技能面板这一个入口；左栏/「更多」菜单的 plaza 入口不经过 `buildPlazaWorkbenchOpenOptions`，默认 `gui` 行为保持。
- 假设 D（已知共享接缝边界）：若该 Tab 在既有会话里被用户手工切到 `gui` 并留下 `explicit: true` 记录，`open({ focus: 'split' })` 走 `persistUserIntent: false` 分支只改几何、不改记录（与 `composer-add` 同款既有行为）。本任务不改变该接缝语义，也不在 journey 里伪造该记录。

## 证伪方式

- 证伪 A：真实应用 journey 在「右栏关闭」起点出现「plaza 未打开」或「打开后仍全屏」→ 说明 `focus` 在这条路径上不生效，改回在 `openWorkbench` 调用层排查（如 attached store 缺失导致宽度写不进），并把 journey 的起点状态一起保留为回归。
- 证伪 B：修复后 journey 仍见 `data-omnimux-conversation-collapsed` 或 composer 宽度为 0 → 说明分栏未清折叠键，需要在打开前显式 `setConversationCollapsed(false)`，并记录原因而不是只改断言。
- 证伪 C：左栏「技能/专家」入口在 journey 或人工检查里不再全屏 → 说明改动误伤了默认 focus 或共用路径，需收窄到技能面板入口并补一条「左栏 tab 默认 focus 仍为 gui」的单测。
- 证伪 D：在带 `explicit gui` 记录的会话里出现「点探索更多后又被拉回全屏」且频率/影响超出既有接缝行为 → 需另开 Issue 在接缝层修（本入口不单独打补丁）。

## 9. 证据计划

- 单测：`node --test plugins/omnimux-market/src/client/skill-picker-workbench-nav.test.js plugins/omnimux-market/src/client/skill-picker-search.test.js plugins/omnimux-market/src/client/skill-picker-create.test.js`（20/20）。
- 包测：`cd plugins/omnimux-market && npm test`——等价于 `pnpm --filter omnimux-market test`；pnpm 直跑被既有 `prepublishOnly` 相对路径缺陷阻断（Issue #3872），故在插件目录直跑 npm 脚本。修复后整包 1007/1007 通过；修复过程中曾出现 `src/expert/install.test.js` 的远端 git promisor fetch 网络中断（curl 18 partial file），单文件复跑 17/17 通过，属环境网络抖动。
- 静态：`node scripts/impact-matrix.mjs --git-diff --base origin/main`、`node scripts/verify-stage-contracts.mjs`、`node scripts/verify-slot-contracts.mjs`、`node scripts/verify-plugin-boundaries.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`node scripts/scan-ui-gates.mjs`（9 处既有违规，与干净 main 同数同项，未命中本改动文件）、`node scripts/verify-silent-catch.mjs`（告警档）、`git diff --check`。
- 浏览器（真实应用 + 真实 Chrome）：`node .tmp/market-explore-split-issue-3867/run-app-qa.mjs`（未提交的本机环境适配，包装仓内 `scripts/worktree-app-qa.mjs` 的 `createAppQaRunner`；适配内容：Host 指向本机保留的 2.0.10 App、隔离 profile 的预设默认值改 `standard`、播种一条空白会话；根因与仓库侧修法见 #3871）。journey：`.workbuddy/evidence/explore-split-3867/journey.mjs`（未入库），覆盖：右栏关闭（官方 toggle 收起 + 断言 panel 关闭）→ 打开技能面板 → 点「探索更多」→ plaza 落在右栏几何内且活动 Tab 为技能/专家 → 会话列/composer 可见 → 非 `fullscreen` → 折叠键不存在。
  - GREEN runId `9ec9fea5-ddcd-484e-a81d-212fc8cf1462`：`pass=true`，25/25；baseline `panelOpen=false`、会话列 1000×800；点击后 `panelMode=push`、panel 576×800、会话列 360×800、composer 300×114。
  - RED runId `5e0c17d6-dba4-41c6-b745-e6780c9e0888`：同一 journey、预修复源码，`pass=false`；失败 `conversation-column-visible` / `composer-visible` / `right-panel-not-fullscreen` / `conversation-not-collapsed` / `split-panel-width-sane`。
  - RED 源码身份：运行前用 git 暂存本任务三处生产改动并从 `89d8d4867` 源码重建 bundle；运行后恢复并重建（最终提交源码 = 本 commit）。
  - 截图：`.workbuddy/evidence/app-qa/<runId>/02-baseline-panel-closed.png`、`04-after-explore-more.png`。
- 独立评审：净室评审包（spec + diff + 测试证据 + 完整静态检查日志），评审结论绑定 head；head 变化后重新评审。

## 10. 文档影响

无合同改动：`docs/contracts/workbench-split.md` 的 `omnimux-market:plaza` 默认 focus 仍是 `gui`（左栏入口不变），本改动只让会话内入口显式请求既有的 `split`；能力本身由 `open({ focus })` 既有接缝定义。行为决策记录在本 spec。

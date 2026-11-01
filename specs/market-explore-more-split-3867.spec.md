# Spec: 技能面板「探索更多」在右侧边栏分栏打开，保留会话栏

- Issue: #3867
- 风险级别: R2（单插件客户端交互修复；可逆）
- 宿主: OmniMux Dev 2.0.21 / dsh `0.2.1-rc.3`（本机 packaged App 提供 Host，插件取本 worktree 源码）
- Base: `origin/main` @ `89d8d4867`
- 依赖: 无（复用既有 `window.__omnimuxWorkbench.open({ focus })` 接缝）

## 1. 目标与用户故事

会话输入框「技能」面板底部有「探索更多」。现在点击后工作台以 Tab 默认 focus（`gui`）打开 `omnimux-market:plaza`：右栏吃满视口、中间会话栏被压掉，用户感觉像「先关掉会话栏再打开技能页」。

期望：点击「探索更多」在**当前页面状态下激活右侧边栏**——右栏以分栏（`split`）打开技能/专家页，中间会话栏保持可见，用户可以对照当前会话继续挑技能。

## 2. 现状与真源

| 事实 | 位置 | 本次动作 |
|---|---|---|
| 「探索更多」只传 `tabId`/`title`，不传 `focus` | `plugins/omnimux-market/src/client/skill-picker.js` → `onExplore` | 改为显式 `focus: "split"` |
| `open()` 支持显式 `focus`；未传时回落到「会话记录 → Tab 默认 focus」 | `plugins/omnimux/src/client/workbench/sidebar-controller.js` → `openWorkbench`；`workbench/focus-state.js` → `resolveTargetFocusMode` / `resolveDefaultFocus` | 复用，不改 |
| `omnimux-market:plaza` 是 workbench Tab，默认 focus = `gui`（右栏 = 视口 − 左栏，会话列被压掉） | `plugins/omnimux/src/client/workbench/focus-state.js` → `isWorkbenchTab` / `resolveDefaultFocus` | 不改（左栏「技能/专家」入口仍全屏） |
| 会话内同类入口已用显式 `split` 保留会话（先例） | `plugins/omnimux/src/client/composer-add/controller.js`；`plugins/omnimux-market/src/client/session-create.js` | 作为本改动的既有范式 |
| 技能选择器 PRD 只要求「工作台打开 plaza 且落在技能 Tab」，未要求全屏 | `docs/prd/2026-09-skill-picker-prd.md` AC-7 | 不改 PRD（本改动把「工作台」落成右侧边栏分栏） |

## 3. 实现设计

`skill-picker.js` 新增片段内纯函数：

```js
function openPlazaBesideConversation(wb, title) {
  if (!wb || typeof wb.open !== "function") return false;
  wb.open({ tabId: "omnimux-market:plaza", title, focus: "split" });
  return true;
}
```

`onExplore` 保留 `writePlazaSkillsIntent()` 与 `close()`，改为调用该函数：

```js
const wb = typeof window !== "undefined" ? window.__omnimuxWorkbench : undefined;
openPlazaBesideConversation(wb, tr("plaza.title"));
```

要点：

- `focus: "split"` 显式覆盖 Tab 默认 `gui`，`setWorkbenchFocus('split')` 同时清掉会话折叠键，因此中间会话栏回到可见态。
- 左栏常驻 / 官方「更多」菜单里的「技能·专家」入口不经过本函数，默认全屏行为不变。
- 不新增 observer、不新增全局、不改 hub 侧 focus 表。

## 4. 范围 / 非目标

范围：`plugins/omnimux-market/src/client/skill-picker.js` 一处导航、对应单测、本 spec、真实浏览器 journey。

非目标：不改左栏「技能/专家」入口的默认全屏；不改 plaza Tab 注册/标题/默认 focus 表；不改技能面板其它按钮、搜索、货架数据；不改官方 `packages/`、Electron 壳层与 `docs/contracts/`。

## 5. 验收标准（可观察）

- [ ] 点击「探索更多」后右栏打开 `omnimux-market:plaza`，落在技能 Tab（`.sh-plaza-page` 可见、`isActive('omnimux-market:plaza') === true`）。
- [ ] 中间会话栏同一屏保持可见：`[data-composer-card]` 正几何，`[data-sidebar-right-panel]` 不是 `fullscreen`，`html[data-omnimux-conversation-collapsed]` 不存在。
- [ ] 左栏「技能/专家」入口行为不变（默认全屏）。
- [ ] 同一 journey 在修复前红（会话栏不可见 / 全屏）、修复后绿；截图 + 结构化报告留证。
- [ ] 单测：`openPlazaBesideConversation` 的 payload 含 `focus: "split"`；组件 `onExplore` 真的走该函数。

## 6. 新用户基线

本改动只影响「从会话输入框技能面板点探索更多」这一跳转参数，依赖的 `window.__omnimuxWorkbench` 由 hub 无条件安装、`omnimux-market:plaza` Tab 由本插件注册，均为随包产物。全新用户不需要任何 Dev 本机状态、模型凭据或外部服务；hub 未就绪时函数返回 `false`，与现状一样静默不跳转（不抛错、不伪造页面）。缺失该面板入口（无 preset 绑定）时整个按钮不渲染，与本次改动无关。

## 假设

- 假设 A：`open({ focus: "split" })` 与 `composer-add`、`session-create` 走同一条既有路径，能在右栏已开/未开两种状态下都把 plaza 打开为分栏，而不是只在「右栏已开」时有效。
- 假设 B：`split` 写入会清除会话折叠键（`syncConversationCollapsedForFocus`），因此修复后 `html[data-omnimux-conversation-collapsed]` 不存在且 composer 正几何。
- 假设 C：该改动只影响技能面板这一个入口；左栏/「更多」菜单的 plaza 入口不经过 `openPlazaBesideConversation`，默认 `gui` 行为保持。

## 证伪方式

- 证伪 A：真实应用 journey 里右栏已开/未开两种状态任一出现「plaza 未打开」或「打开后仍全屏」→ 说明 `focus` 在这条路径上不生效，改回在 `openWorkbench` 调用层排查（如 attached store 缺失导致宽度写不进），并把 journey 的两种前置状态一起保留为回归。
- 证伪 B：修复后 journey 仍见 `data-omnimux-conversation-collapsed` 或 composer 宽度为 0 → 说明分栏未清折叠键，需要在打开前显式 `setConversationCollapsed(false)`，并记录原因而不是只改断言。
- 证伪 C：左栏「技能/专家」入口在 journey 或人工检查里不再全屏 → 说明改动误伤了默认 focus 或共用路径，需收窄到技能面板入口并补一条「左栏 tab 默认 focus 仍为 gui」的单测。

## 9. 证据计划

- 单测：`node --test plugins/omnimux-market/src/client/skill-picker-explore.test.js`（新增）；`pnpm --filter omnimux-market test`。
- 静态：`pnpm verify:stages`、`pnpm check:boundaries`、`node scripts/scan-ui-gates.mjs`、`node --test scripts/verify-anti-slop.test.mjs`、`git diff --check`；`node scripts/impact-matrix.mjs --git-diff --base origin/main`。
- 浏览器：隔离 worktree 应用级 QA（`node scripts/worktree-app-qa.mjs --journey .workbuddy/evidence/explore-split-3867/journey.mjs`，完整 Host + worktree 插件源码，动态端口、自清理），journey 覆盖：面板打开 → 点探索更多 → plaza 落在技能 Tab → 会话栏可见 → 右栏非全屏 → 折叠键不存在；修复前红 / 修复后绿两次运行，PNG 截图留证。
- 独立评审：另一 Agent 全新上下文，评审包（spec + diff + 测试证据）。

## 10. 文档影响

无合同改动：`docs/contracts/workbench-split.md` 的 `omnimux-market:plaza` 默认 focus 仍是 `gui`（左栏入口不变），本改动只让会话内入口显式请求既有的 `split`；能力本身由 `open({ focus })` 既有接缝定义。行为决策记录在本 spec。

---
title: "Sidebar extra entries (under 新会话)"
id: "contract-sidebar-extra-entries"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-10-28"
authors: ["x", "agent-architect"]
subsystem: "omnimux-assets"
---

# Sidebar extra entries (under 新会话)

Normative look for any extra row injected under the official **新会话** button. Official workspace session rows win on size; this file is the product rule so new plugins do not invent a smaller row.

Official source of the numbers: `dsh-client-ui-workspace` session row (`.sessionRow` height 32px, `.title` 14px / 20px line-height). Extra-row icons use 14px so they match the 14px label optically (official 16px icon buttons look smaller because the glyph does not fill the box).

## Metrics

| Token | Value | Why |
|---|---|---|
| Row height | `32px` | Same as official session rows |
| Horizontal padding | `0 8px` | Same as official session rows |
| Icon | `14×14` | Same optical size as the 14px label |
| Label | `font: var(--dsw-font-s-14)` fallback `14px / 20px` | Same as official `.title` |
| Gap icon→label | `6px` | Same as official session row |
| Corner | `8px` | Same as official session row |
| Hover / active | `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active` | Hover is the same token as the official session row; the official **selected** row paints with the *hover* token family, so plugin active and session selected are not the same shade — an accepted, documented difference (D-2), not a defect to "fix" by touching official CSS |

MUST NOT use 13px labels or 16px filled icons on these rows. MUST NOT invent a second visual scale next to 工作区. Icon box and label font-size MUST be the same number (14px).

## 官方 panel 行同样消费本表度量（#3802）

官方左侧栏自带的 panel 行（`插件` / `自动化任务` / `更多`）与上面的自定义行上下相邻。宿主默认给它们 `min-height:36px` / `padding:7px 8px` / `margin:0 2px` / `--dsw-radius-md`(12px) / 16px 图标，于是侧栏里同时存在两套行度量，观感一高一低、一圆一方。

产品侧由 hub 客户端 `plugins/omnimux/src/client/sidebar-panel-chrome.js` 把**展开态**的官方 panel 行压到本表度量（高度 32px、`0 8px` 内边距、`0 4px` 外边距、`gap 6px`、8px 圆角、14px 图标、14/20 字阶、选中态用 active 令牌 + 字重 500）。

| Rule | Detail |
|---|---|
| 单一真源 | 数字只写在 `PANEL_ROW_METRICS`，样式与测试都读它；MUST NOT 在样式里再手写第二套数字 |
| 作用域 | 规则挂在侧栏列后代（`[data-pane="sidebar"], [class*="sidebarCol"]`）下，不得全局裸命中同名类 |
| 收起态不变 | 规则以 `html:not(:has([data-sidebar-collapsed]))` 前置：56px 轨道是图标列，官方 36×36 居中图标保持不变，MUST NOT 被文字行内边距撑回横条 |
| 不改官方 | MUST NOT 修改官方 `packages/`、类名或 React 树；只注入 CSS + 读几何 |
| 新行一致性 | 新增任何侧栏行（含第三方插件行）都消费本表度量；出现第二套字号 / 图标尺寸的 PR 直接打回 |

## 官方「更多」菜单的落位与材质（#3802）

官方「更多」菜单默认从锚点**下方**展开（`side:'bottom'`）、压在侧栏内容上，材质是 `--dsw-menu-surface-fill`（暗色 `rgba(67,69,74,.45)`）+ `backdrop-filter: blur(40px)` 的毛玻璃，底下侧栏文字会透出来。产品侧把该菜单摆到侧栏列**右侧**、并换成实体不透明底。

| Rule | Detail |
|---|---|
| 落位 | 目标左边界 = 侧栏列右边界 + `8px`；纵向顶边对齐触发按钮顶边（官方 `side:'bottom'` 会让菜单低一行）。实现只写 `--omnimux-more-menu-shift` / `--omnimux-more-menu-shift-y`（`translate` 两个分量），MUST NOT 与官方每帧写入的 inline `left/top` 抢同一个属性 |
| 视口约束 | 右侧放不下时按「视口宽 − 12px 留白」收窄菜单（`--omnimux-more-menu-max-width`），而不是溢出视口，也不是压回侧栏上；连最小可用宽度（`200px`）都放不下时保持官方位置。纵向顶边不得越过 12px 上留白、底边不得越过 12px 下留白；菜单比视口还高时贴顶，超高由官方自身的 `max-height` + 滚动承担 |
| 材质 | 在该菜单实例上覆盖 `--dsw-menu-surface-fill`（实体层色）与 `--dsw-menu-backdrop-filter: none`；MUST NOT 让覆盖外溢到其它官方浮层 |
| 选择器边界 | 只命中同时满足 `[data-menu-material="translucent"]` 与 `[class*="moreMenu"]` 的元素；其它半透明官方菜单保持原材质 |
| 跟随 | 官方 `Menu` 逐帧重算锚点位置，本模块同样逐帧跟随（菜单移除即停）；MUST NOT 自绘菜单容器或第二套关闭逻辑 |
| 单一真源 | 菜单内容（条目 / 顺序 / 分组 / 点击委托）仍由 `explore-more-menu.jsx` 与 `sidebar-coordinator.js` 拥有，本模块只改落位与材质 |

## Left-rail single activation slot (#rail-active-state-convergence)

The left rail has **exactly one** activation slot at any moment. Plugin rows, dynamic app-tab rows and the plaza row share that slot; the official workspace session row owns it whenever a session row is selected and the middle conversation column is visible.

Derivation order is fixed and exclusive:

1. Middle conversation column visible **and** a selected session row exists → the session row wins and **every** plugin row MUST be inactive.
2. Otherwise, the native right panel is expanded and has an active tab that maps to a left-rail row → that row wins.
3. Otherwise — including "the focused tab has no left-rail row" — no row is active.

| Rule | Detail |
|---|---|
| Single writer | Rows MUST NOT compute their own active state. The only writer is the hub arbiter behind `window.__omnimuxWorkbench`; `createSidebarStore({ tabId }).getSnapshot()` and `isActive(tabId)` return that arbitration |
| No presence fallback | `isActive(tabId)` answers "is this tab the focused workbench tab". It MUST NEVER fall back to tab presence (`isOpen`) — that fallback is the one reproducible double-highlight path |
| Session truth | The official DOM: `[role="treeitem"][aria-selected="true"]` inside the official left column, with search-result rows excluded. Plugins MUST NOT build a session-selection mirror |
| Column visible | Collapse key absent **and** measured conversation-column width > 0 **and** the host right panel is not in fullscreen presentation (all three, not any) |
| Tab identity | The focused tab's `kind` maps to a left-rail `tabId`; an unmappable key means "no active row", never a guessed one |
| Truth order | Host truth (official DOM attributes, `ctx.sidebarRight`, `ctx.sessions.list`) outranks plugin in-memory state |
| Current session | The on-screen Session is `ctx.sidebarRight.mounted` (`ObservableSnapshot<SessionId \| undefined>`); `ctx.sessions.list.current` is the *selected* Session and is the only fallback. Neither may be replaced by a list-first guess (#3800) |
| Broadcast | Verdict changes ride the existing `notifyWorkbenchChange` bus; no second subscription channel, and no polling to patch state |

## Current occupants

| Marker | Owner | Label |
|---|---|---|
| `[data-omnimux-apps-entry]` | `omnimux` | 应用 / Apps（收敛至官方「更多」菜单） |
| `[data-omnimux-app-tabs]` | `omnimux` | Dynamic app tab rows (see below) |
| `[data-dsh-taskboard-entry]` | `dsh-taskboard-plugin` (fork) | 任务看板 / Taskboard |
| `[data-omnimux-esc-entry]` | `omnimux-gallery`（历史 marker，现网无独立 gallery 包） | 专家·技能·连接器（**已迁** `omnimux-market`，rank 4.1，**核心常驻**） |
| `[data-dsh-omnimux-workflow-entry]` | `omnimux-workflow` | 项目 / Projects（rank 4 现网，**核心常驻**）。**Workbench 入口**：点开 `omnimux-workflow:library` Tab，**不得** `claimProductStage`。打开项目后激活 `omnimux-workflow:canvas`（默认 split），库 Tab 保留。 |
| `[data-dsh-omnimux-new-project-entry]` | `omnimux-workflow` | 新建项目 / New Project（展开：`kind:'inline'` 并排「新建会话」。收起：CSS 藏项目按钮，点官方加号弹出「新建会话 / 新建项目」，选中再 click 原按钮。折叠态属性在 AppFrame，不在 html。收起 wrapper 可用 `display:contents`，但官方加号上的 `flex:1` **必须**收回 `flex:none` + 36×36，否则会吃掉会话列表高度变成竖条） |
| `[data-omnimux-assets-entry]` | `omnimux-assets` | 资产库（rank 6 现网，**核心常驻**）。**Workbench**：`omnimux-assets:library`，不得 claim。**产品库**是资产库内的一个 Tab，不是独立侧栏行 |
| `[data-omnimux-inspiration-entry]` | `omnimux-inspiration` | 灵感社区（rank 7，**核心常驻**）。**Workbench**：`omnimux-inspiration:library`，不得 claim |
| `[data-omnimux-automation-entry]` | `omnimux-automation` | 自动化（收敛至官方「更多」菜单） |
| `[data-omnimux-google-vids-entry]` | `omnimux-video` | Google Vids（rank 7.5，收敛至官方「更多」菜单）。**中栏 Stage**：Vids 经 `shell.overlay` 注册，**不再**注册 Workbench Tab。点击先 `await workbench.open({ tabId: 'omnimux-clip:studio', focus: 'split' })` 把视频剪辑开到右侧栏，仅当返回值严格为 `true` 且条目仍挂载时才 `claim('omnimux-vids')`；失败时保持原 Stage 与焦点不变，禁止另写 `setFocus`。 |
| `[data-omnimux-publish-entry]` | `omnimux-publish` | 发布（收敛至官方「更多」菜单） |
| `[data-omnimux-analytics-entry]` | `omnimux-analytics` | 数据分析（收敛至官方「更多」菜单） |
| `[data-omnimux-accounts-entry]` | `omnimux-accounts` | 账号（收敛至官方「更多」菜单） |
| `[data-omnimux-device-entry]` | `omnimux-device` | 手机管理（收敛至官方「更多」菜单） |
| `[data-omnimux-clip-entry]` | `omnimux-clip` | 视频剪辑（收敛至官方「更多」菜单） |
| `[data-omnimux-forms-entry]` | `omnimux-forms` | 任务表单（收敛至官方「更多」菜单） |
| `[data-omnimux-avatar-entry]` | `omnimux-avatar` | 数字人（rank 4.05，位于「项目」rank 4 之下，**核心常驻**）。**Workbench**：`omnimux-avatar:studio`，不得 claim |

### 「更多」菜单运行时注册（第三方 / 个人插件唯一合法入口）

内置白名单是只读的产品清单。**不在本仓插件树内的插件**（个人沙箱、外部包）要进官方「更多」菜单，只能经单一协调器的运行时接缝注册，**禁止**克隆侧栏按钮自插一级行，也**禁止**自挂 `MutationObserver` / `setInterval` 去改写菜单 DOM。

```js
const unregister = window.__omnimuxSidebar.registerExploreItem({
  id: 'fast-news-workbench',    // 必填，稳定唯一键；与内置 id 冲突时不注册
  label: '快讯中枢',             // 必填，菜单文案（按纯文本渲染）
  iconSvg: '<svg …/>',           // 必填，14×14 纯矢量（按受信 HTML 注入）
  tabId: 'fast-news-workbench',  // 可选，点击兜底 __omnimuxWorkbench.open({ tabId })
  action: (converged) => {},     // 可选，优先于 tabId；返回非 false 即终止后续委托
})
```

| Rule | Detail |
|---|---|
| 渲染集合 | 官方「更多」菜单渲染 `内置 9 项 + 运行时注册项`；注册项一律追加在末尾，行度量与样式复用官方 `MenuItemButton`，不得引入第二套字阶或图标尺寸 |
| 未注册即不渲染 | 产品基线不得出现指向未安装插件的死条目：接缝是运行时注册，**不是**把某个具体插件 id 写进内置白名单 |
| 形状校验 | 缺 `id` / `label` / `iconSvg` 或类型非法 → 不注册、不抛错，仍返回可调用注销函数 |
| 字段白名单 | 只接受 `id` / `label` / `iconSvg` / `tabId` / `action`；`entryId`、`pluginId` 等一律被剥离，注册项**不得**借委托通道冒充已挂载插件的入口 |
| 文本与 HTML 边界 | `iconSvg` 按受信 HTML 注入（契约要求 14×14 纯矢量）；`label` 一律按**纯文本**渲染，不得拼进 `innerHTML` |
| 幂等 | 同 id 二次注册覆盖前一项，覆盖后该项位于**末尾**；旧注销函数随即失效。注销后菜单下次展开不再包含该项 |
| 长菜单防溢出 | 菜单高度由官方 seat 拥有者管理；OmniMux 侧不得自绘容器、固定高度或第二套滚动条 |
| 点击语义 | 复用 `activateExploreItem` 既有三段委托（`action` → 已挂载行 click → `__omnimuxWorkbench.open({ tabId })`），不得另写导航 |
| 展开中变更 | 官方菜单每次展开重新挂载即读取最新集合：注册 / 注销在**下次展开**生效，不需要第二套订阅；注册 / 注销不得直接改写菜单 DOM |

### 官方「更多」菜单（`sidebar.panellist.actions`，宿主 ≥ `0.2.1-rc.3`）

宿主 `0.2.1-rc.3` 起，官方左侧栏自带 root 作用域列表 seat `sidebar.panellist.actions`：该列表有注册时渲染「更多」行，注册项**直接渲染为菜单行**（官方参考实现 `packages/client/ui-entry-customization/src/client/EntryMenuContent.tsx`）。OmniMux 的 9 项入口注册进这个官方菜单；自绘的「探索」常驻行与浮动菜单已退役（#3785），本菜单是这 9 项在侧栏的**唯一入口**。产品库已并入资产库（[products-into-assets.spec.md](../../specs/products-into-assets.spec.md)），不再单独占一项。

| Rule | Detail |
|---|---|
| 唯一注册点 | `plugins/omnimux/src/client/explore-more-menu.jsx`（`id: 'omnimux-explore'`，`order: 100`），由 hub `apply()` 安装；其它插件**不得**再注册该 seat 的 OmniMux 入口 |
| 单一真源 | 清单 / 图标 / 分组 / 激活语义一律取 `sidebar-coordinator.js` 的 `EXPLORE_MENU_ITEMS`、`resolveExploreMenuItems()`、`activateExploreItem()`；MUST NOT 复制第二份清单、图标或三段委托 |
| 行原语 | 用官方 `MenuItemButton`（`icon` + `separatorBefore`），不得自绘第二套行样式或字阶 |
| 分组 | `dividerAfter` 的项之后，下一行带 `separatorBefore`（视频剪辑后、手机管理后各一条） |
| 点击 | 先 `onDismiss()` 关闭官方菜单，再 `activateExploreItem(item)`，不得另写导航 |
| 文本与 HTML 边界 | 行内 `iconSvg` 仍按受信 HTML 注入（14×14 纯矢量）；`label` 一律纯文本 |
| 老宿主兼容 | 无 `slots` 服务或该 seat 不存在时静默 no-op（`ctx.slots.inject` 惰性语义）；MUST NOT 用空 `catch` 兜底 |
| 不得回退自绘入口 | 禁止以任何形式重新注入「探索」常驻行、浮动菜单或第二套侧栏菜单；宿主没有该 seat 时宁可不显示，也不自绘 |
| 刷新语义 | 官方菜单每次展开重新挂载即读取最新集合，不需要第二套订阅 |

## Alpha 内测标记

中枢协调器按 [Alpha release policy](alpha-release.md) 为已有 Alpha 行添加状态标记，不改变 rank、点击或登录处理。禁止域插件各自维护 Alpha 名单或重复添加标记。

官方「更多」菜单是 Alpha 插件在侧栏的**唯一可见渲染面**，因此内测标识必须出现在那里：

| Rule | Detail |
|---|---|
| 判定真源 | 复用 `sidebar-coordinator.isAlphaEntry()`（读 `plugin-lifecycle.json`）；菜单面 MUST NOT 维护第二份 Alpha 名单或第二个判定函数 |
| 渲染位置 | Alpha 项的行内容为「文案 + `Alpha` 标识」片段，非 Alpha 项保持纯字符串；标识 MUST NOT 出现在非 Alpha 项上 |
| 文案 | 标识文本 `Alpha`，`title` 为 `sidebar-coordinator.ALPHA_DESCRIPTION`（与侧栏行同一份说明） |
| 样式 | 追加到 `styles.js` 的 `HUB_CSS`，颜色走 `--dsw-alias-*` Token、字号 12px；MUST NOT 新建第二个 `<style>` 注入点 |
| 可见性 | 标识必须落在行矩形内、宽高非零，且不把行文案挤到零宽（官方 `.itemLabel` 是单行省略） |

## Offline vs Cloud Visibility

Extra rows follow [docs/contracts/plugin-offline-cloud-matrix.md](./plugin-offline-cloud-matrix.md):
- `access: 'offline'`: Always visible. Clicking directly opens the **workbench Tab** without login blocking. (Workflow, Assets, Products, Clip). Plaza is offline too, but its left entry is the Settings-foot slot below, not an extra row.
- `access: 'cloud'`: Always visible. Clicking triggers explicit auth gating (`ensureLogin({ kind: 'explicit' })`), opening the **workbench Tab** upon successful login. (Analytics, Publish, Accounts, Inspiration).
- Policy D (Visitor Polite Interception): Cancelling a login prompt suppresses subsequent passive navigation prompts (`kind: 'nav'`) for the remainder of the session, while explicit clicks (`kind: 'explicit'`) and write operations (`kind: 'write'`) are never suppressed.

New extra rows MUST reuse these metrics (copy the CSS block or import the same numbers). A PR that adds a 新会话-below row with a different font-size or icon size is rejected.

## Placement

There is no official slot under 新会话. Extra rows are DOM-injected after the new-session button. Order is **rank-sorted** by the hub coordinator (`window.__omnimuxSidebar`); do not invent a second observer.

The placement anchor is the official **新对话 / New Session** control (`[class*="newSession"]` or matching aria/text). MUST NOT treat the logoRow brand/logo button as that anchor: a comma-list `querySelector` hits brand first in tree order, `insertBefore` then throws, and every extra row disappears (#1572 regression / #1582). Desktop shell wrappers (`.dshDesktopSidebarSurface`) MUST NOT win over the inner `[data-pane="sidebar"]` / `[class*="sidebarCol"]` column.

**Plaza exception (#381):** `omnimux-market` is **not** an extra row. Its left entry is `sidebar.footer.action` (id `omnimux-market-plaza`, order 8, marker `[data-omnimux-market-entry]`), immediately above the official Settings foot. Click opens workbench Tab `omnimux-market:plaza`. MUST NOT claim overlay, MUST NOT use `document.body` 全屏 portal, MUST NOT also register an extra row under 新会话.

Library pages (assets / products / accounts / inspiration / publish / analytics / workflow / clip) MUST NOT register `sidebar.footer.action`. That seat is the Settings foot, Hub updater (`omnimux-desktop-updater`, order 10), and the plaza trigger.

## Dynamic app tabs

Opened Apps get a persistent tab row under the fixed 应用 entry. Host owns the records (`$DSH_HOME/omnimux/apps/tabs.json`, mode `0600`, dir `0700`) and the endpoints `GET/POST/PATCH/DELETE /omnimux/apps/tabs*`; the sidebar renders the filtered view. First open creates the row; install alone does not.

| Rule | Detail |
|---|---|
| Metrics | Same 32px / `0 8px` / 14px icon / 14px-20px label / 8px corner table above — the tab rows are contract rows, not a second visual scale |
| Container | `[data-omnimux-app-tabs]`, inserted as the 应用 entry's `nextSibling`; empty container renders no rows so 应用 and 任务看板 stay flush |
| Row marker | `data-omnimux-app-tab="<catalog id>"`; classes `omnimux-app-tab*`; pinned rows also carry `data-pinned="true"` and a pin glyph at the row head |
| Row click | Dispatches the hub `omnimux-app-open` event (`openApp(id)`); the app claims the stage. Tab-click login gating is a P1 enhancement, not part of the row |
| Active state | Row sets `data-active="true"` while `document.documentElement.dataset.dshProductStage === 'omnimux-app-<id>'`; listens on `dsh-product-stage`, clears on every other claim |
| Hover actions | Three 14px-optical icon buttons at the row end (visible on hover / focus-within): ✕ 删除记录 = remove the record only, the app stays installed (DELETE); 📌 固定/取消固定 = move into the always-first pinned group with a pin badge (PATCH `{pinned}`); ⬆ 置顶 = one-shot move to the front of its group, does not change pinning (PATCH `{order:"top"}`) |
| Sorting | Host-computed: pinned group first (key `toppedAt ?? pinnedAt ?? lastOpenedAt`, descending), then the non-pinned group (key `toppedAt ?? lastOpenedAt`, descending). Opening refreshes `lastOpenedAt` and clears the one-shot `toppedAt` |
| Refresh | Initial `GET /omnimux/apps/tabs`; afterwards the hub dispatches the DOM event `omnimux-app-tabs-changed` after every successful tab write (open upsert, pin, top, remove, uninstall linkage) and the rows re-fetch. Rows for uninstalled / unlisted apps are filtered by the Host view but kept on disk |
| Cap | 64 rows; the least-recent non-pinned row is evicted past the cap |

MUST NOT fake a tab as a real session row (no `conversation.view`, no session data), and MUST NOT render tab rows with any metric other than the table above.

## Independent pages

**Workbench rows (normative, #318):** library / catalog / plaza / clip / canvas left-rows open a `dsh-better-sidebar` Tab via `window.__omnimuxWorkbench.open({ tabId })`. They **MUST NOT** claim `data-dsh-product-stage`. Occupants and default focus: [workbench-split.md](./workbench-split.md). Left-row `data-active` is the projection of the single activation slot (see below), never computed by the row itself, and **MUST NOT** fall back to tab presence (`isOpen`).

**Overlay leftover (narrow):** Hub 登录门、（未挂载的）Apps 货架、Clip 画布节点 portal。只有这些表面仍可 `claimProductStage`；`PRODUCT_STAGE_CHROME` 只在 `html[data-dsh-product-stage]` 时藏右栏。

| Rule | Workbench row | Overlay leftover |
|---|---|---|
| Seat | `ctx.betterSidebar.registerTab` on `[data-dsh-panel-host]` | `shell.overlay` |
| Cover | Does **not** cover the conversation column. `gui` squeezes it via panel width; `split` leaves ~420px. | Conversation **column** only (not the whole frame). Host `.dshDesktopOverlay` is frame-sized; stages MUST measure the live column (and clamp to the right-panel left edge when workbench is open). Overlay stage `z-index` is 200. |
| Top chrome | In-tab L1 still `12px 20px 12px` (same as official conversation header). Do not add a 44/56px inset. Window-drag stays on (no product-stage). | Same 12/20/12. Window-drag off while claimed. |
| Mutual exclusion | Switching left-rows **activates** the other Tab; does not claim. Cross-type Tabs may coexist (`single: true` per type). | Opening one leftover dispatches `dsh-product-stage` so the others close. |
| Layout chrome | MUST NOT hide `toggleCluster` or `[data-dsh-panel-host]`. Hub injects the chat-toggle as the cluster's first child. | While claimed, hide `toggleCluster`, `conversation.session.header`, **and** `[data-dsh-panel-host]`; force `--dsh-sidebar-width` / `--dsh-sidebar-height` to `0`. |
| Session click | Clicking a workspace session row **does not** close workbench Tabs. The same click is enter-conversation intent: conversation MUST become visible. If that session has an explicit three-column memory, restore split; otherwise close the right panel (session fullscreen). MUST NOT restore host right-panel fullscreen on this path — that layout belongs to a later left-row page click ([workbench-split.md](./workbench-split.md) Issue #2516). | Clicking **any** workspace session row (`[role="treeitem"]`, selected or not) must leave the leftover overlay. Official workspace treats a click on the already-selected row as a no-op, so leftovers must close that case themselves. Clicks on buttons inside a row (pin / delete) MUST NOT close. **新会话** also leaves leftovers. 「新建项目」MUST NOT use this path. |

MUST NOT register workbench pages as `conversation.view`. That slot is a session-hosted tab (chat / trajectory / team run).

MUST NOT register library pages as `sidebar.footer.action`. Plaza is the exception: it occupies `sidebar.footer.action` above Settings and still opens `omnimux-market:plaza` on the workbench.

Workbench tabs do **not** set `data-dsh-product-stage`, so product-stage chrome MUST NOT hide the right panel for them. See [workbench-split.md](./workbench-split.md).

### Overlay external-store binding

If a `shell.overlay` stage uses React `useSyncExternalStore` against host faces (`ctx.locale`, auth, settings scope), follow [`client-external-store.md`](./client-external-store.md). Passing a class/instance method like `locale.subscribe` bare into the hook drops `this`, crashes the slot entry, and leaves only `data-slot-error="shell.overlay"` — which looks like a blank first-level page after a successful sidebar click.

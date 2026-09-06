---
title: "Sidebar extra entries (under 新会话)"
id: "contract-sidebar-extra-entries"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-02"
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
| Hover / active | `--dsw-alias-interactive-bg-hover` / `--dsw-alias-interactive-bg-active` | Same as official session row |

MUST NOT use 13px labels or 16px filled icons on these rows. MUST NOT invent a second visual scale next to 工作区. Icon box and label font-size MUST be the same number (14px).

## Current occupants

| Marker | Owner | Label |
|---|---|---|
| `[data-omnimux-apps-entry]` | `omnimux` | 应用 / Apps |
| `[data-omnimux-app-tabs]` | `omnimux` | Dynamic app tab rows (see below) |
| `[data-dsh-taskboard-entry]` | `dsh-taskboard-plugin` (fork) | 任务看板 / Taskboard |
| `[data-omnimux-esc-entry]` | `omnimux-gallery`（历史 marker，现网无独立 gallery 包） | 专家·技能·连接器（**已迁** `omnimux-market`） |
| `[data-dsh-omnimux-workflow-entry]` | `omnimux-workflow` | 项目 / Projects（rank 4 现网）。**Workbench 入口**：点开 `omnimux-workflow:library` Tab，**不得** `claimProductStage`。打开项目后激活 `omnimux-workflow:canvas`（默认 split），库 Tab 保留。 |
| `[data-dsh-omnimux-new-project-entry]` | `omnimux-workflow` | 新建项目 / New Project（展开：`kind:'inline'` 并排「新建会话」。收起：CSS 藏项目按钮，点官方加号弹出「新建会话 / 新建项目」，选中再 click 原按钮。折叠态属性在 AppFrame，不在 html。收起 wrapper 可用 `display:contents`，但官方加号上的 `flex:1` **必须**收回 `flex:none` + 36×36，否则会吃掉会话列表高度变成竖条） |
| `[data-omnimux-assets-entry]` | `omnimux-assets` | 资产库（rank 6 现网）。**Workbench**：`omnimux-assets:library`，不得 claim |
| `[data-omnimux-products-entry]` | `omnimux-products` | 产品库（rank 8 现网）。**Workbench**：`omnimux-products:library`，不得 claim |
| `[data-omnimux-inspiration-entry]` | `omnimux-inspiration` | 灵感库（rank 7）。**Workbench**：`omnimux-inspiration:library`，不得 claim |
| `[data-omnimux-publish-entry]` | `omnimux-publish` | 发布（rank 4.2 现网）。**Workbench**：`omnimux-publish:library`，不得 claim |
| `[data-omnimux-analytics-entry]` | `omnimux-analytics` | 数据分析（rank 4.5 现网）。**Workbench**：`omnimux-analytics:library`，不得 claim |
| `[data-omnimux-accounts-entry]` | `omnimux-accounts` | 账号（rank 3）。**Workbench**：`omnimux-accounts:library`，不得 claim；`access: cloud` |
| `[data-omnimux-clip-entry]` | `omnimux-clip` | 视频剪辑（rank 8.2）。**现网隐藏**：`apply()` 不挂左侧行；Tab `omnimux-clip:studio` 仍注册，画布/Agent 可打开。`sidebar-entry.js` 保留以便恢复。不得 claim。见 [workbench-split.md](./workbench-split.md) |

## Alpha 内测标记

中枢协调器按 [Alpha release policy](alpha-release.md) 为已有 Alpha 行添加状态标记，不改变 rank、点击或登录处理。禁止域插件各自维护 Alpha 名单或重复添加标记。

## Offline vs Cloud Visibility

Extra rows follow [docs/contracts/plugin-offline-cloud-matrix.md](./plugin-offline-cloud-matrix.md):
- `access: 'offline'`: Always visible. Clicking directly opens the **workbench Tab** without login blocking. (Workflow, Assets, Products, Clip). Plaza is offline too, but its left entry is the Settings-foot slot below, not an extra row.
- `access: 'cloud'`: Always visible. Clicking triggers explicit auth gating (`ensureLogin({ kind: 'explicit' })`), opening the **workbench Tab** upon successful login. (Analytics, Publish, Accounts, Inspiration).
- Policy D (Visitor Polite Interception): Cancelling a login prompt suppresses subsequent passive navigation prompts (`kind: 'nav'`) for the remainder of the session, while explicit clicks (`kind: 'explicit'`) and write operations (`kind: 'write'`) are never suppressed.

New extra rows MUST reuse these metrics (copy the CSS block or import the same numbers). A PR that adds a 新会话-below row with a different font-size or icon size is rejected.

## Placement

There is no official slot under 新会话. Extra rows are DOM-injected after the new-session button. Order is **rank-sorted** by the hub coordinator (`window.__omnimuxSidebar`); do not invent a second observer.

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

**Workbench rows (normative, #318):** library / catalog / plaza / clip / canvas left-rows open a `dsh-better-sidebar` Tab via `window.__omnimuxWorkbench.open({ tabId })`. They **MUST NOT** claim `data-dsh-product-stage`. Occupants and default focus: [workbench-split.md](./workbench-split.md). Left-row `data-active` tracks the **focused** workbench tab (`__omnimuxWorkbench.isActive`), not tab presence (`isOpen`); cleared when the right panel is `chat` / `panelOpen === false`.

**Overlay leftover (narrow):** Hub 登录门、（未挂载的）Apps 货架、Clip 画布节点 portal。只有这些表面仍可 `claimProductStage`；`PRODUCT_STAGE_CHROME` 只在 `html[data-dsh-product-stage]` 时藏右栏。

| Rule | Workbench row | Overlay leftover |
|---|---|---|
| Seat | `ctx.betterSidebar.registerTab` on `[data-dsh-panel-host]` | `shell.overlay` |
| Cover | Does **not** cover the conversation column. `gui` squeezes it via panel width; `split` leaves ~420px. | Whole conversation column. Overlay `z-index` is 200. |
| Top chrome | In-tab L1 still `12px 20px 12px` (same as official conversation header). Do not add a 44/56px inset. Window-drag stays on (no product-stage). | Same 12/20/12. Window-drag off while claimed. |
| Mutual exclusion | Switching left-rows **activates** the other Tab; does not claim. Cross-type Tabs may coexist (`single: true` per type). | Opening one leftover dispatches `dsh-product-stage` so the others close. |
| Layout chrome | MUST NOT hide `toggleCluster` or `[data-dsh-panel-host]`. Hub injects the chat-toggle as the cluster's first child. | While claimed, hide `toggleCluster`, `conversation.session.header`, **and** `[data-dsh-panel-host]`; force `--dsh-sidebar-width` / `--dsh-sidebar-height` to `0`. |
| Session click | Clicking a workspace session row **does not** close workbench Tabs. The right panel follows the better-sidebar **session snapshot**. If middle chat is sticky-collapsed, the same click **MUST** `setFocus(split)` to re-show the conversation (enter-conversation intent; see [workbench-split.md](./workbench-split.md)). | Clicking **any** workspace session row (`[role="treeitem"]`, selected or not) must leave the leftover overlay. Official workspace treats a click on the already-selected row as a no-op, so leftovers must close that case themselves. Clicks on buttons inside a row (pin / delete) MUST NOT close. **新会话** also leaves leftovers. 「新建项目」MUST NOT use this path. |

MUST NOT register workbench pages as `conversation.view`. That slot is a session-hosted tab (chat / trajectory / team run).

MUST NOT register library pages as `sidebar.footer.action`. Plaza is the exception: it occupies `sidebar.footer.action` above Settings and still opens `omnimux-market:plaza` on the workbench.

Workbench tabs do **not** set `data-dsh-product-stage`, so product-stage chrome MUST NOT hide the right panel for them. See [workbench-split.md](./workbench-split.md).

### Overlay external-store binding

If a `shell.overlay` stage uses React `useSyncExternalStore` against host faces (`ctx.locale`, auth, settings scope), follow [`client-external-store.md`](./client-external-store.md). Passing a class/instance method like `locale.subscribe` bare into the hook drops `this`, crashes the slot entry, and leaves only `data-slot-error="shell.overlay"` — which looks like a blank first-level page after a successful sidebar click.

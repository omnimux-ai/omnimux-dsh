---
title: "Workbench split — 对话可收、插件 GUI 常驻（一座：better-sidebar）"
id: "contract-workbench-split"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-31"
updated: "2026-09-04"
authors: ["x", "agent-architect"]
subsystem: "omnimux"
related:
  - "docs/contracts/sidebar-extra-entries.md"
  - "docs/contracts/openreel-vendor-contract.md"
  - "docs/contracts/gxgen-workflow-migration.md"
  - "docs/contracts/client-ui-remediation.md"
  - "docs/contracts/stage-guards.md"
  - "docs/decisions/2026-08-31-workbench-split.md"
  - "docs/decisions/2026-08-31-workbench-libraries-and-toggle.md"
---

# Workbench split

Normative seat for plugin GUIs that must sit **beside** the official conversation (human + Agent both driving the same surface).

**One seat.** First-level library / catalog / plaza pages, clip studio, and the project canvas all live on `ctx.betterSidebar.registerTab`. They **MUST NOT** claim `data-dsh-product-stage`. The 2026-08-31 «library = overlay» exception is abolished ([ADR](../decisions/2026-08-31-workbench-libraries-and-toggle.md)).

## One seat, do not mix with overlay

| Kind | Examples | Seat | Left-row click |
|---|---|---|---|
| **Workbench** | 资产 / 产品 / 账号 / 灵感 / 发布 / 分析 / 项目库 / 专家馆 / 视频剪辑 / 创作画布 | `ctx.betterSidebar.registerTab` on `[data-dsh-panel-host]` | `window.__omnimuxWorkbench.open({ tabId })`. **MUST NOT** set `data-dsh-product-stage` |
| **Overlay leftover** | Hub 登录门；Apps 货架（未挂载）；Clip **画布节点 portal** | `shell.overlay` | 不走左栏 workbench 名单。Clip portal **MUST NOT** claim |

Official AppFrame is already `sidebar | conversation | details`. Workbench does **not** replace `conversation`. The plugin GUI lives in the community `dsh-better-sidebar` panel (width up to the viewport). Official `details` stays at 300–520px and is closed (`layout.closeDetails`) when a workbench tab opens.

## Layout

```
左：官方 sidebar + 新会话下方入口
中：官方 conversation（不可卸载）
右：dsh-better-sidebar 工作台 Tab（可收起，Tab 状态按会话持久化）
```

「关掉中间会话」(#372) = sticky `conversationCollapsed`（`html[data-omnimux-conversation-collapsed]` + CSS 折叠 `[class*="centerCol"]`）。`conversation` slot stays mounted；**不得**再把「藏中」唯一实现成右栏拉满 `viewport − 左栏`（否则收左栏会让中栏回显）。`gui` 仍可顺带拉满右栏填空，但中栏可见性以 collapsed 布尔为准。There is no official `hideConversation`. `chat` (`panelOpen: false`) 收的是**右栏工作台**，不是中间对话。

## Occupants

| Tab id | Owner | Default focus | Left row |
|---|---|---|---|
| `omnimux-assets:library` | `omnimux-assets` | `gui` | `[data-omnimux-assets-entry]` |
| `omnimux-products:library` | `omnimux-products` | `gui` | `[data-omnimux-products-entry]` |
| `omnimux-accounts:library` | `omnimux-accounts` | `gui` | `[data-omnimux-accounts-entry]` |
| `omnimux-inspiration:library` | `omnimux-inspiration` | `gui` | `[data-omnimux-inspiration-entry]` |
| `omnimux-publish:library` | `omnimux-publish` | `gui` | `[data-omnimux-publish-entry]` |
| `omnimux-analytics:library` | `omnimux-analytics` | `gui` | `[data-omnimux-analytics-entry]` |
| `omnimux-workflow:library` | `omnimux-workflow` | `gui` | `[data-dsh-omnimux-workflow-entry]` |
| `omnimux-workflow:canvas` | `omnimux-workflow` | `split` | not a left-row; opened after a project session |
| `omnimux-market:plaza` | `omnimux-market` | `gui` | `sidebar.footer.action` `[data-omnimux-market-entry]`（设置上方，不是新会话 extra row） |
| `omnimux-clip:studio` | `omnimux-clip` | `gui` | left-row hidden（marker `[data-omnimux-clip-entry]` 保留未挂载）；画布/Agent 打开 |

Clip overlay (`ClipStage`) remains **only** for canvas-node portal (`openFromCanvas`, does not claim). Sidebar clicks MUST NOT call `stage.open()`.

## Focus

`window.__omnimuxWorkbench.setFocus(mode)` writes **right-panel geometry**. It never unmounts `conversation`.

| mode | Geometry | Conversation |
|---|---|---|
| `split` | Default width (~420px conversation, rest GUI). Visible conversation floor is **360px**; the right panel is clamped to `viewport − leftRail − 360` on write, live CSS drag (`--omnimux-split-max`), and persist. Restores the last **per-tab** split width if the user had one. Also clears `conversationCollapsed`. | Visible |
| `gui` | Panel width = `viewport −` official left rail (fill aesthetics). Sets `conversationCollapsed=true` (CSS). Left-rail resize may re-apply fill width; **MUST NOT** clear collapsed. Anti-cover rules from #353/#356 still apply. | Mounted, CSS-collapsed |
| `chat` | `panelOpen: false`. Tab ids stay in the session snapshot. **MUST NOT** change `conversationCollapsed`. | Independent of right panel |

### Pane independence (#372)

| Pane | Control | State |
|---|---|---|
| Left | Official `打开/收起侧边栏` | `data-sidebar-collapsed` |
| Middle | Hub `data-omnimux-chat-toggle` | `conversationCollapsed` |
| Right | better-sidebar `折叠侧边栏` | `panelOpen` |
| Bottom | better-sidebar `展开/折叠底部面板` | `bottomOpen` |

Toggling one pane **MUST NOT** flip another pane's sticky intent.

**Exception — enter-conversation gesture:** clicking a workspace session row (`[role="treeitem"]` plain click, not pin/delete), workspace-group「新建会话」, shell「新会话」, or the brand new-session control **MUST** clear `conversationCollapsed` via `setFocus(split)` when the middle pane is hidden. Intent is to enter the conversation column, not keep it collapsed.

### Default Focus Rule

Only when `(sessionId, tabId)` has **no user gesture record**:

```
if (tabId === 'omnimux-workflow:canvas') default = split
else if (isWorkbenchTab(tabId)) default = gui
else do not write focus (third-party Files, etc.)
```

MUST NOT inherit `lastOpenMode` across tabs. Re-opening while `chat` restores **that tab's** remembered mode, or the default matrix if none.

Canvas `applyProjectCanvasRatio` MUST skip while focus is `gui` or `chat`, and MUST run only for `omnimux-workflow:canvas`.

### Memory

| Key | Value |
|---|---|
| Storage | `localStorage['omnimux-workbench-focus:v1:' + sessionId]` |
| Shape | `{ [tabId]: { mode: 'split'\|'gui', splitWidth?: number } }` |
| Write | User: chat-toggle, drag splitter |
| Do not write | Pure default open (so a later default-rule change still applies to untouched tabs) |
| `chat` | Session-level `panelOpen`; **not** stored in the tab table |
| New session | Empty table → default matrix |
| Switch session | Read that session's table only |

MUST NOT persist focus only in an in-memory `Map`. MUST NOT patch `dsh-sidebar:v1:<sessionId>` for mode (that snapshot owns width / panelOpen / tabs).

### Chat toggle (toggleCluster)

Hub injects **one** button as the **first child** of better-sidebar's `toggleCluster`:

| Item | Rule |
|---|---|
| Marker | `data-omnimux-chat-toggle` |
| Host | `[data-dsh-toggle-cluster]` or `[class*="toggleCluster"]` |
| Action | Toggle `conversationCollapsed`; when collapsing also `setFocus(gui)` to fill the right gap; when expanding `setFocus(split)`. Middle visibility is the CSS flag, not right width alone (#372) |
| Visible | `panelOpen === true` **and** active tab ∈ Occupants |
| Hidden / disabled | `chat` (expand the right panel first) |
| Copy | `gui` → aria `展开对话` / `Show chat`；`split` → `收起对话` / `Hide chat` |
| Icon | Vector SVG, same size as cluster siblings; no emoji |
| Owner | Hub chrome only. Vertical plugins MUST NOT insert their own |

Injection is idempotent (`insertBefore` only when the button is missing or not first). Do not fork `dsh-better-sidebar`. Do not hide the whole cluster and redraw it.

In-tab `.omnimux-workbench-focus` / `WorkbenchFocusBar` is **removed**. Layout focus is owned by the hub chat-toggle (gui↔split) and better-sidebar's panel collapse (`chat`). Vertical tabs MUST NOT reintroduce a FocusBar.

## Global

Hub installs `window.__omnimuxWorkbench` at module top-level (same pattern as `__omnimuxStage` / `__omnimuxSidebar`). Vertical plugins **MUST NOT** import the hub client. They:

1. `registerTab({ id, single: true, path sentinel })`
2. Bind a StageStore-shaped adapter via `window.__omnimuxWorkbench.createSidebarStore({ tabId, title, path })` into `createSidebarEntry`. `open()` calls `window.__omnimuxWorkbench.open({ tabId, path })`. **MUST** use this factory for left-row StageStores; **MUST NOT** re-implement highlight/open/close semantics (`isActive` / `closeTab` / focus). A **thin lazy forwarder** (acquire factory when first used; ≤8s poll if hub not ready) is allowed so vertical mount order cannot crash plugin load. Clip may also keep local `CLIP_TAB_ID` / path constants (ADR Q12).
3. `attachStore(props.store)` from the Tab component so width writes can `store.reduce` (public API has no `setWidth`)

`open()` sequence: `closeDetails` → **release any current `data-dsh-product-stage`** (leftover overlay would hide the panel) → require a current session (else `false` + toast) → wait for session snapshot → close empty Files seed tabs → `openTab({ type, id, path: sentinel })` → apply Default Focus Rule or restore `(sessionId, tabId)` memory. NEVER `claim` a stage. NEVER `sessions.create({})`.

`createSidebarStore` six-pack: `getSnapshot` / `subscribe` / `open` / `close` / `set` / `readBox`. `close()` = `closeTab(tabId)` then `setFocus('chat')` if no OmniMux workbench tab remains.

**Left-row `data-active`:** StageStore `getSnapshot()` MUST use `window.__omnimuxWorkbench.isActive(tabId)` (focused leaf tab), **not** `isOpen(tabId)` (tab still present). Cross-type tabs may coexist, but only the focused occupant lights its left entry. When focus is `chat` / `panelOpen === false`, every left entry clears. `isOpen` remains for presence checks.

## MUST NOT

- Shadow `root` / `sidebar` / `conversation` / `details`.
- Draw a second composer inside `shell.overlay`.
- Claim `data-dsh-product-stage` when opening a workbench tab (product-stage chrome hides the panel host).
- Fall back to overlay or `details` when `dsh-better-sidebar` is missing. Host stays; Tab is absent.
- Keep library pages on `shell.overlay`.
- Inherit focus across tab ids.
- Call `applyProjectCanvasRatio` for library / clip / plaza tabs.
- `import` the hub client from a vertical plugin.

## Agent driving (pointer)

Agent tools `workbench_get_active_view` / `workbench_open_tab`, UI Context Envelope, and Hub read-only WebSocket (`GET /omnimux/events/stream` upgrade) are specified in [agent-workbench-sync.md](./agent-workbench-sync.md). `open()` sequence in this file still applies. Agent **MUST NOT** `setFocus` or write `conversationCollapsed`.

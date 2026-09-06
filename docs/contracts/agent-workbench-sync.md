---
title: "Agent 工作台双向协同契约（信封 / 工具 / WebSocket / 防打扰）"
id: "contract-agent-workbench-sync"
type: "contract"
status: "living"
authority: "L1"
date: "2026-09-04"
updated: "2026-09-06"
authors: ["gao-jianyuan", "agent-architect"]
subsystem: "omnimux"
tags: ["workbench", "websocket", "ui-context-envelope", "agent-tools"]
supersedes: []
superseded_by: null
related:
  - "docs/contracts/workbench-split.md"
  - "docs/contracts/hub.md"
  - "docs/contracts/plugin-agent-tools-inventory.md"
  - "docs/contracts/settings-ui.md"
  - "docs/decisions/2026-09-04-agent-workbench-bidirectional-sync.md"
  - "docs/specs/2026-09-04-agent-workbench-bidirectional-sync-prd.md"
  - "docs/specs/2026-09-04-agent-workbench-bidirectional-sync-design.md"
---

# Agent 工作台双向协同契约

Normative wire for three orthogonal surfaces: **viewport addressing (G1)**, **workbench driving (G2)**, **disk-to-UI push (G3)**. Product rules live in the [PRD](../specs/2026-09-04-agent-workbench-bidirectional-sync-prd.md); architecture in the [design spec](../specs/2026-09-04-agent-workbench-bidirectional-sync-design.md) and [ADR](../decisions/2026-09-04-agent-workbench-bidirectional-sync.md). Seat and focus remain [workbench-split.md](./workbench-split.md).

## 1. Seams (do not invent a second channel)

| Seam | Owner | Consumers | MUST NOT |
|---|---|---|---|
| `window.__omnimuxWorkbench` | Hub client | Vertical clients | `import` hub; `claimProductStage` |
| `ctx.provide('hubEvents')` / `ctx.get('hubEvents')` | Hub host | Vertical hosts | Private WebSocket; cloud sockets; per-plugin WebSocket |
| `GET /omnimux/events/stream` | Hub host | Hub client (one WebSocket) | Verticals opening extra sockets |
| `POST /omnimux/workbench/viewport` | Hub host | Hub client heartbeat | Vertical HTTP clients posting envelopes |
| `POST /omnimux/workbench/rpc/ack` | Hub host | Hub client RPC bridge | Verticals acking RPC |
| `workbench_get_active_view` / `workbench_open_tab` | Hub tools | Agent | Vertical `workbench_*` clones |

Cross-package client: only `window.__omnimuxWorkbench`, `window.__omnimuxHubEvents` (read-only subscribe), Host HTTP. Vertical Host: `ctx.get('hubEvents')` + own domain store.

## 2. UI Context Envelope (G1)

JSON Schema: PRD §4.2 (`omnimux://ui-context-envelope/v1`). `schemaVersion` is `1`. `additionalProperties: false` at the root / `surface` / `selection[]`.

### 2.1 Capture (browser, sync, ≤16ms)

On composer submit (click send **or** Enter), Hub:

1. `workbench.getSnapshot()` + `getFocus()` + `getConversationCollapsed()`.
2. If `panelOpen`: call the active tab's contributor (`registerContextContributor(tabId, fn)`). Contributor **MUST** be a synchronous pure function returning `{ view, selection }`.
3. If `!panelOpen`: `surface` uses last Occupant tab; `selection = []`; `reason = panel-collapsed`; `ok` remains `true`.
4. Truncate: drop `selection` from the tail, then `view.query`, then non-routing `view.extra`. **Never drop `surface`**. For canvas tabs, `view.extra.workspaceId` is a **P0 routing key** and MUST be retained ahead of ordinary selection tails when budget is tight. Target serialized compact block ≤ 800 tokens P95.
5. Strip any existing `<ui_context…>` prefix, then prepend the compact block to the composer value via the React 18 prototype setter (same pattern as inspiration `composer-inject.js`). Native send proceeds.
6. Failure / timeout / throw → `ok: false`, `reason: timeout|unavailable|no-workbench|no-contributor`; **message still sends**.

**MUST NOT** `await` on submit. **MUST NOT** put file bytes, `$DSH_HOME` absolute paths, secrets, or unsaved drafts in the envelope.

### 2.2 Compact block (what the model sees)

```text
<ui_context schema="1">
tab: omnimux-assets:library | filter: character | selected: 林晓 (ast_7f3a)
panel: open | focus: gui
</ui_context>
```

Canvas tab example (workflow):

```text
<ui_context schema="1">
tab: omnimux-workflow:canvas (创作画布) | view: canvas | page: workflow-canvas | workspace: ws_0123456789ab
panel: open | focus: split
</ui_context>
```

Compact serializer **MUST** whitelist-serialize `view.kind`, `view.pageId`, and `view.extra.workspaceId` (logical id only; reject path-like values). **MUST NOT** dump arbitrary `view.extra`.

User bubble **MUST NOT** show this block (Hub conversation filter). Dev profile may show JSON (P2).

### 2.3 Tool-plane mailbox (what `workbench_get_active_view` reads)

Hub client POSTs the full JSON envelope to `/omnimux/workbench/viewport` every 2s while a real session exists (never the `default` placeholder). Only one viewport request may be in flight; each viewport/ack request is aborted after 3s and all pending requests are aborted on disposal. Host keeps last-known per process. If `capturedAt` is older than **3s**, tools return `stale: true`.

This is **not** the composer prefix. Both exist (ADR Q1).

### 2.4 Contributor API

```text
window.__omnimuxWorkbench.registerContextContributor(tabId, () => ({ view, selection }))
window.__omnimuxWorkbench.getUiContext() → Envelope
```

Unregister on tab unmount. Missing contributor → `reason: no-contributor`, `surface` still filled from snapshot.

## 3. HubEventBus + WebSocket (G3 transport)

### 3.1 Process bus

`createHubEventBus()` is the only in-process pub/sub. `emit({ type, payload })` assigns monotonic string `id`, stamps `at`, appends to a ring (**64** events / **10s** TTL), notifies subscribers. Missing `hubEvents` at a vertical → emit is a no-op (poll remains the fallback).

Event type namespace: `omnimux:<domain>:<verb>` (`omnimux:assets:changed`, `omnimux:workbench:rpc`, `omnimux:heartbeat`).

### 3.2 `GET /omnimux/events/stream`

| Item | Rule |
|---|---|
| Transport | WebSocket upgrade on the existing Host `webServer.registerUpgrade`; no separate listener |
| Auth | Official `connection.requestRejection(req)` plus loopback origin/referer validation; cross-site requests receive **403** |
| Heartbeat | JSON `{ type: "omnimux:heartbeat", payload: { at } }` every **2s** |
| Replay | Reconnect query `?after=<last-id>`; replay ring entries with `id > last` |
| Wire | JSON event `{ id, type, payload, at }`; heartbeat has no replay id |
| Limits | Read-only feed; client messages close with **1008**; buffered output above **1 MiB** terminates the connection |

Commands and acknowledgements keep their authenticated HTTP routes. Hub transport MUST NOT reserve an HTTP/1 streaming request slot: multi-page EventSource connections can starve session creation and ordinary API requests (#597).

### 3.3 Browser singleton

Hub client opens **one** WebSocket per mounted client and exposes `window.__omnimuxHubEvents.subscribe(type, fn)`. Verticals MUST NOT open their own hub sockets. Disposal closes the socket, timers and pending HTTP requests, and removes only its own global facade.

Any event (including heartbeat) resets a **5s** watchdog. Silence closes the socket and marks the feed unhealthy. Reconnect waits **3s** and carries the last replay id. Stale socket callbacks cannot affect the replacement connection. Assets use their existing **5s** poll while unhealthy and refresh on recovery.

### 3.4 Assets changed payload

```json
{
  "type": "omnimux:assets:changed",
  "lrev": 42,
  "arev": 7,
  "op": "create",
  "ids": ["ast_new"],
  "assetType": "character",
  "at": 1756944000500
}
```

`op`: `create | update | delete | bulk`. Client accepts only `lrev > localLrev` (or `arev > localArev` for artifact-only). Same `id` MUST NOT insert a second card. `unchanged: true` poll bodies MUST NOT clear the grid.

Emit after **library / artifacts revision bump** (HTTP dispatcher **and** `assets_*` tools). Hub MUST NOT parse `library.json`.

## 4. Workbench tools (G2)

Owner: `omnimux` Hub (`ctx.tools.register`). Output envelope `{ ok, ... }` plus existing `JSON_TOOL_OUTPUT`.

### 4.1 `workbench_get_active_view` (L2, read)

Parameters: `{}` (`additionalProperties: false`).

Success: `{ ok: true, stale: boolean, uiContext: Envelope }`.

Errors (throw or `{ ok: false, error }`): `no-workbench`, `no-session`. Panel collapsed still returns last-known view with `uiContext.surface.panelOpen === false`.

### 4.2 `workbench_open_tab` (L1, write UI, not disk)

Required: `tabId`, `reason` (4–80 chars). Optional: `view`, `highlightIds` (≤20), `forceOpenPanel` (P2, ignored unless session grant), `undoToken`.

`tabId` MUST be in `WORKBENCH_OCCUPANTS`. Unknown → `{ ok: true, applied: false, code: "unknown-tab" }`.

Success / soft-reject codes (PRD §5.2 plus `rpc-timeout`, `no-client`):

| code | applied | meaning |
|---|---|---|
| `opened` | true | New or switched tab |
| `already-active` | true | Same focused tab; highlight/view may still apply |
| `undone` | true | Undo restored previous tab |
| `panel-collapsed` | false | Right panel closed; default do not pop |
| `quota-exceeded` | false | Session auto-switch count ≥ 3 |
| `unknown-tab` | false | Not an Occupant |
| `no-session` | false | No current session; MUST NOT `sessions.create({})` |
| `no-workbench` | false | No better-sidebar |
| `reason-required` | false | Missing/short reason |
| `user-denied` | false | Settings `allowAgentSwitchTab === false` |
| `rpc-timeout` | false | Browser did not ack within 2000ms |
| `no-client` | false | No event subscriber for RPC |

`ok: true, applied: false` is a **legal success**. Agent MUST NOT retry in a loop.

Undo: `undoToken` valid **60s**, bound to `sessionId`. Restore `previousTabId` + snapshot `filterType`. Undo is a user gesture / explicit tool call; it does **not** consume quota. Cross-session tokens are invalid.

### 4.3 RPC event (`omnimux:workbench:rpc`)

```json
{
  "requestId": "rpc_01J...",
  "method": "open",
  "tabId": "omnimux-assets:library",
  "path": "omnimux-assets:library",
  "view": { "filterType": "character" },
  "highlightIds": ["ast_new"],
  "reason": "新角色图已入库",
  "previousTabId": "omnimux-workflow:canvas",
  "undoToken": "undo_01J...",
  "sessionId": "ses_01J...",
  "forceOpenPanel": false
}
```

Browser bridge: `window.__omnimuxWorkbench.open({ tabId, path })` then `POST /omnimux/workbench/rpc/ack` `{ requestId, ok, applied, code, tabId }`. **MUST NOT** call `setFocus` / `setConversationCollapsed`. **MUST** follow Default Focus Rule inside existing `open()`.

## 5. Anti-annoyance (normative, D1–D10)

Copied as engineering gates from PRD §5.3:

1. `panelOpen === false` → auto open returns `panel-collapsed` unless the click is a **user** gesture (P1 transcript button) or P2 session `forceOpenPanel` grant.
2. Agent MUST NOT `setFocus` / write `conversationCollapsed`.
3. Quota: 3 successful tab **changes** per session (`already-active` does not count). New session resets.
4. `reason` required; shown in transcript.
5. Every actual switch leaves undo.
6. MUST NOT close Modals, clear multi-select, change `sortKey` / `viewMode`. `view.filterType` is an explicit request (P1); do not silently change Chip on a mere `changed` event — show hint instead.
7. Same `tabId` within 3s → `already-active` (no flicker).
8. Settings toggle `allowAgentSwitchTab` (default **true**) on existing `settings.plugin.item` `omnimux` card. **MUST NOT** add `settings.section`.
9. `applied: false` MUST be spoken as such.
10. Disk writes do not depend on tab switches.

## 6. Poll fallback (assets gold)

WebSocket healthy → **do not** run the 5s interval. WebSocket unhealthy → reuse `POLL_MS = 5000` and `GET /omnimux/assets/state?lrev&arev` (`unchanged: true` preserved). Hidden (`display:none`) tabs stay subscribed (keep-alive). First open of a never-mounted tab still `refreshState(true)`.

## 7. Settings

| Key | Slot | Default |
|---|---|---|
| `allowAgentSwitchTab` | `settings.plugin.item` / Host `SettingsConfig` | `true` |

## 8. Verification

- Unit: envelope truncate, guard state machine, bus replay, lrev idempotency, poll-off still refreshes on event.
- Live: `pnpm verify:live assets` on Dev App **45120**. Client/Stage changes without live probe are not done.
- Daily materialize `~/.omnimux-dev` only. No `--prod` unless a human release order.

---
title: "决策：Agent 页面感知与工作台双向协同（信封注入 + Hub SSE 总线）"
id: "adr-2026-09-04-agent-workbench-bidirectional-sync"
type: "decision"
status: "accepted"
authority: "L2"
date: "2026-09-04"
updated: "2026-09-04"
authors: ["gao-jianyuan", "agent-architect"]
subsystem: "omnimux"
tags: ["workbench", "sse", "ui-context-envelope", "agent-tools", "adr"]
supersedes: []
superseded_by: null
related:
  - "docs/specs/2026-09-04-agent-workbench-bidirectional-sync-prd.md"
  - "docs/specs/2026-09-04-agent-workbench-bidirectional-sync-design.md"
  - "docs/contracts/agent-workbench-sync.md"
  - "docs/contracts/workbench-split.md"
  - "docs/contracts/hub.md"
  - "docs/decisions/2026-08-31-workbench-split.md"
---

# ADR：Agent 页面感知与工作台双向协同

## Status

Accepted

## Context

#318 已把一级库页迁入右侧 `dsh-better-sidebar`，人机同面成立，但三件事未打通：

1. 用户发消息时 Agent 看不见当前 Tab / Chip / 选中对象。
2. Host 侧没有对等的切页工具；`window.__omnimuxWorkbench.open` 只活在渲染进程。
3. 资产库 `useAssetsFeed` 以 `POLL_MS = 5000` 拉 `GET /omnimux/assets/state`，写盘到可见最长一整轮 5 秒。

PRD（许清楚，`docs/specs/2026-09-04-agent-workbench-bidirectional-sync-prd.md`）把这三件事定为 P0，并留下 Q1/Q2 给架构拍板。官方会话不可卸载、不可自绘第二套 composer、垂直包禁止 `import` hub。

## Decision

### Q1 — 信封挂哪

**不**把信封写成独立 hidden 系统消息，也 **不**依赖官方 `message.metadata`（插件没有该缝，fork composer 被禁）。

采用 **双通道**：

| 通道 | 用途 | 形态 |
|---|---|---|
| **认知面（G1）** | 每条用户消息默认让模型看见视口 | Composer 提交拦截器同步采集（≤16ms），在原生发送前把紧凑 `<ui_context schema="1">…</ui_context>` **前缀**写入用户文本。Hub 会话气泡 CSS/渲染过滤器隐藏该块，用户只看见自己打的字。 |
| **工具面（G2）** | `workbench_get_active_view` 读此刻快照 | Client 在 workbench snapshot 变化时 `POST /omnimux/workbench/viewport`（loopback）；Host 存 last-known + `capturedAt`；心跳超过 3s 标 `stale: true`。 |

截断永不丢 `surface`。采集失败消息照发。

若未来官方暴露 `UserPromptSubmit` / message metadata 插件钩，本 ADR 的前缀注入可被替换；工具面 mailbox **保留**。

### Q2 — 事件传输

**Hub 拥有一条多路复用 SSE**：`GET /omnimux/events/stream`。

- 进程内 `HubEventBus`（`ctx.provide('hubEvents')`），垂直包只 `ctx.get('hubEvents').emit(...)`，禁止私有 WebSocket、禁止直连云。
- 浏览器只开 **一条** EventSource；同页 `BroadcastChannel('omnimux:hub-events')` 扇出给各 Tab hook。
- 心跳 `omnimux:heartbeat` 每 **2s**；Client 连续 **5s** 无任何事件 → SSE 不健康 → 资产库恢复 5s poll。
- 鉴权：loopback origin（与 `assertLocalWrite` 同主机集合）。SSE 是只读广播，**不**绕过写闸。
- `Last-Event-ID` + 环形缓冲（64 条 / 10s）做短断重放；以域 `lrev` 做业务幂等。

不选「各垂直私有 SSE」（N 条 EventSource 打爆 HTTP/1 连接）。不选「纯 EventEmitter + 长轮询」作主路径（达不到 400ms P95 的产品体感，且与画布已验证的 SSE 模式重复）。同页 `BroadcastChannel` 只作扇出，不作跨进程真源。

### 切页 RPC

`workbench_open_tab` 在 Host 执行：校验 Occupants / reason / 配额 / 设置 / `panelOpen` → 需要动 UI 时向总线发 `omnimux:workbench:rpc` → 浏览器桥调用现有 `window.__omnimuxWorkbench.open({ tabId, path })` → `POST /omnimux/workbench/rpc/ack`。工具 **禁止** `setFocus` / 改 `conversationCollapsed` / `claimProductStage` / `sessions.create({})`。

### 防打扰与设置

收起面板默认 `applied: false, code: panel-collapsed`。设置项落在现有 `settings.plugin.item`（`omnimux` 卡）布尔 `allowAgentSwitchTab`，默认开；**禁止**新的一级 `settings.section`。

## Consequences

**更容易**

- 垂直包零 hub import，只多一条 `hubEvents` seam 与一个 `registerContextContributor`。
- 资产库可关 poll 单测仍刷新；断连自动回 5s 兜底。
- 切页与写盘解耦：入库成功不依赖面板打开。

**更难**

- Composer 前缀是可逆 hack：官方气泡 DOM 结构变了，隐藏过滤器要跟着修。
- SSE 在 Electron 会话下若 cookie/代理不稳，必须在 5s 内落到 poll，验收不能假装「一直 SSE」。
- 环形缓冲不保证跨进程重启回放；重启后 Client force refresh 一次。

**明确不做**

- `forceOpenPanel` 进 P0（P2 + 会话授权）。
- 画布**节点选中**进 P0 信封（P2 `selection` / 节点 id 列表）。
- 无 better-sidebar 时回退 overlay / details（沿用 #313）。
- 删除 5s poll。

## Amendment · 2026-04-06 — 画布 workspace 寻址升为 P0 回归

**原 U5** 将 `view.extra.canvasId` 标为 P2。线上回归：Agent 在当前会话画布上被要求加节点时，因信封缺少可执行 `workspaceId`，只能 `workflow_list` 枚举后 `ask_user_question`。

**修订：**

1. `omnimux-workflow:canvas` 的 Context Contributor **必须**贡献 `view.kind=canvas` + `view.extra.workspaceId`（= `sessionToWorkspaceId(sessionId)`）。
2. Compact 块 **必须**序列化 `workspace:` 字段。
3. `workflow_*` 写/读工具默认目标解析：`explicit workspace_id` > ui_context workspace > unique name；**禁止** list 优先、禁止 latest/唯一猜目标。
4. Hub 注册 `workbench:viewport` systemPrompt；`workflow:ops` 明确「有当前 workspace 时不得 list/追问」。
5. Hub 提供只读 `workbenchMailbox` seam（`getActiveView`），供垂直工具默认寻址；垂直包不得 import hub。
6. 节点级 selection 仍属 P2；本 amendment 只提升 **workspace 寻址**。

## Amendment · 2026-09-10 — 废除 Composer 前缀注入，迁移至 DSH 原生运行时上下文注入（Issue #1017）

### 背景与问题
原方案中认知面（G1）采用客户端 Composer 拦截并前缀写入 `<ui_context>` 文本块，依赖前端 CSS 隐藏。在 DSH 渲染流中，富文本渲染和转义导致 CSS 隐藏失效，底层 XML 协议块泄露在用户聊天气泡内；同时篡改了用户消息原始草稿。

### 修订决策
1. **废除前端文本篡改**：彻底移除 `composer-envelope.js` 与 `AttachmentSubmitBridge.jsx` 对用户草稿的 `<ui_context>` 前缀拼接。用户输入在客户端保持 100% 纯净。
2. **迁移至 DSH 原生 Context Injection**：Hub 在 Host 侧挂载 `agent/pre-step` 监听器（`mountWorkbenchContextInjector`）。在每个 Turn 的第一步（`step === 1`），且面板处于打开态时，自动读取 Mailbox 视口快照，并注入规范的 DSH 原生上下文消息：
   `source: { kind: 'plugin', plugin: 'omnimux-workbench', form: 'snapshot', sections: [{ name: 'workbench-viewport', text }] }`。
3. **聊天界面呈现**：该消息被官方 `dsh-client-ui-chat` 识别为 `kind: 'context'`，呈现为折叠栏「`上下文注入 · omnimux-workbench`」，在 Compact 对话模式下自动收起，彻底杜绝气泡污染。
4. **统一单一真源**：`formatCompactContextBlock` 迁移至 `plugins/omnimux/src/workbench/contract.js`，Client 与 Host 共享。

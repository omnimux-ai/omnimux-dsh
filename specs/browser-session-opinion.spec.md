# 规范：海报观点改走临时聊天会话生成（Issue #3559）

## 1. 问题

Dev 上 `bridge.completeText` 持续超时（25s/90s），但同一 host 的聊天会话通道可用：实测 `session.create` → `session.prompt`，在 `reasoningEffort` 未设置时 `turn/end` 为 completed，`assistant/message` 返回正文。海报观点因此应改走会话通道，才能用用户在聊天里选择的模型。

## 2. 方案

- 新增 `extension/src/background/session-completion.ts`：纯函数解析 `session/event`：
  - `assistant/message` → 拼接 `message.content` 的 text；
  - `turn/end` → completed 且有正文则完成，error/canceled 或无正文则带原因失败。
- 背景 worker：`session.create` → `session.prompt`（system + user 合并为一个 text part）→ 等待 turn/end → 返回正文；无论成败调用 `bridge.session.purge` 清理临时会话。
- `DSH_TWITTER_COPILOT_GENERATE` 优先走会话通道；失败才回退现有 `bridge.completeText`，两者错误都保留，步骤仍可显示原因。

## 假设

根因假设：海报观点失败源于 `bridge.completeText` 的 llm.stream 文本路由在 Dev 不可用，而不是聊天会话不可用。只要改走 `session.create`/`session.prompt` 并收集 `assistant/message`，观点就能在用户当前选择的模型上生成，且临时会话可被 purge 清理。

## 证伪方式

在真实 Dev 扩展里点海报「生成并预填」：若观点步骤仍为空或报错，且临时会话的 `turn/end` 为 error（如 provider/model 不匹配），即证伪，应回到模型配置或会话路由修复。命令：`node --test` 新单测 + `scripts/lib/extension-e2e.mjs` 浏览器证据。

## 验收

- 单测：assistant 文本拼接、turn/end error 原因、无正文、非目标会话忽略。
- 扩展全量测试/构建通过；e2e 证据留存。

## 边界

R1；不改 provider adapter、模型目录、Dev 配置；不读取/污染用户已有会话；无 bridge 时仍按离线降级。

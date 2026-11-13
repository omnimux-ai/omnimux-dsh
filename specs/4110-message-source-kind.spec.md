# 4110 — 注入消息改用 producer-owned source kind（rc.3 catch-all 清理）

## 背景

DSH `0.2.1-rc.3` 删除了 `@deepseek-ai/dsh-llm` 的共享 `kind: 'plugin'`，每个 producer
必须声明自己的 source kind；session-format v4 对缺失或等于 `'plugin'` 的 `source.kind`
抛 `format v4 message requires a producer-owned source kind`。

#3742 的 rc.3 迁移覆盖了 automation / browser / market / publish / viewer，**漏掉
`plugins/omnimux`**，于是每轮的 session model pin 与 workbench viewport 两个注入源仍然
写 catch-all，导致每一轮对话都失败。这是同一错误的第二次复发（第一次修完没有守卫）。

本任务：两处 injector 改用 `omnimux-session-model` / `omnimux-workbench` 两个
producer-owned kind，并新增 `scripts/verify-message-source-kinds.mjs` 防回归守卫。

## 验收

- `plugins/omnimux/src/session/context-injector.js` 产出 `source.kind === 'omnimux-session-model'`
- `plugins/omnimux/src/workbench/context-injector.js` 产出 `source.kind === 'omnimux-workbench'`
- 其余 source 字段（`plugin` / `form` / `sections`）原样保留
- 注入消息通过宿主发布的 session-format v4 准入（`assertV4RowAdmission` /
  `releasedV4SessionFormatCodec.encodeEvent`，与 `assertV4MessageSources` 共用 source() 准入）
- 全仓守卫按结构化规则拦「kind 缺失 / 为空 / 等于 plugin」三类问题（不是只匹配单个字面量），自测能红能绿，挂进 `test:gates` 与 CI 的 Repo gate scripts 步骤

## 旧标准变更

- `plugins/omnimux/src/workbench/context-injector.test.js` :: `creates native DSH context user message with correct snapshot structure`
  - 原断言：`assert.equal(msg.source.kind, 'plugin')`。
  - 必须改的理由：`kind: 'plugin'` 是 rc.3 已删除的 catch-all，正是本 issue 要修的每轮失败根因；断言必须锁定新的 producer-owned kind，不能继续背书旧值。
  - 新期望证据：`assert.equal(msg.source.kind, 'omnimux-workbench')`；`plugin`/`form`/`sections` 断言不变。实跑该文件通过。

- `plugins/omnimux/src/workbench/context-injector.test.js` :: `injects context message when panel is open on step 1`
  - 原断言：`assert.equal(contextMsg.source.kind, 'plugin')`。
  - 必须改的理由：同上，被注入消息的 kind 必须是 producer-owned。
  - 新期望证据：`assert.equal(contextMsg.source.kind, 'omnimux-workbench')`；消息内容与用户消息不变断言不变。

- `plugins/omnimux/src/workbench/context-injector.test.js` :: `injects attached reference context natively while keeping user message pristine`
  - 原断言：`assert.equal(decision.messages[1].source.kind, 'plugin')`。
  - 必须改的理由：同上。
  - 新期望证据：`assert.equal(decision.messages[1].source.kind, 'omnimux-workbench')`。

- `plugins/omnimux/src/workbench/e2e-synergy.test.js` :: `verifies full cycle: context capture -> tool execution -> RPC bridge -> event invalidation`
  - 原断言：`assert.equal(injected.source.kind, 'plugin')`。
  - 必须改的理由：闭环用例同样在断言注入源的 kind，旧值会让 rc.3 准入在真实链路里失败；改为 producer-owned kind 才能与生产一致。
  - 新期望证据：`assert.equal(injected.source.kind, 'omnimux-workbench')`；其余 ui_context 内容断言不变。

# 规范：文本补全 adapter 缺失时优先走已验证本机 Agent（Issue #3517）

## 1. 问题

#3495 放宽 bridge 截止到 90s 并传 reasoningEffort=off 后，Dev 探针仍返回 `Text completion timed out`：llm.stream 的 catalog 默认路由不可用。Dev 已配置 `runtimeAgentId: codex`、`runtimeAgentModel: gpt-6.1-sol`、`runtimeAgentVerified: true`，本机 Agent 是当前可用的聊天执行通道。

## 2. 方案

toolModel adapter 缺失时：

1. 若 runtimeAgentId 非空且 runtimeAgentVerified=true，调用 `runAgentText({id, prompt, model})`，成功即返回正文；
2. Agent 失败只告警，继续现有 catalog 默认 stream → 默认文本路由；
3. 其他非 adapter 错误仍直接抛出。

## 假设

假设 codex 运行时的本机 Agent 能在 bridge 90s 截止内返回文本；若 Agent 也超时/未安装，则说明本机执行通道不可用，应改为在扩展侧创建聊天会话（session.prompt）或让用户配置可用工具模型。

## 证伪方式

合入物化 Dev 后执行 `node /tmp/bridge-probe2.mjs`：若仍返回 `ok:false`（含 Text completion timed out），则假设错误；若返回 `ok:true` 正文则成立。

## 验收

- 单测：adapter 缺失优先 agentRun；agent 失败仍走 catalog；非 adapter 错误不回退。
- `pnpm --filter omnimux test`、`pnpm check:boundaries`。
- Dev 探针 `bridge.completeText` 返回 `ok:true`。

## 边界

R1；不改 adapter、模型目录、用户配置与扩展 UI。

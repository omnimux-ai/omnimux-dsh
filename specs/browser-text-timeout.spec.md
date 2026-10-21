# 规范：放宽文本补全截止并降低 fallback 推理等级（Issue #3495）

## 1. 问题

#3488 后 fallback 已执行，但 bridge 内置截止 25s（`plugins/omnimux-browser/src/server.ts`），扩展观点默认超时 20s；DeepSeek 默认 max 推理一次性补全可能超过 25s，探针返回 `Text completion timed out`。

## 2. 方案

- bridge 文本补全 deadline：25s → 90s。
- 扩展 `generateOpinionResult` / `generateOpinion` 默认超时：20s → 95s；失败仍按原路径上屏。
- hub catalog fallback 的 `streamTextReply` 传 `reasoningEffort: 'off'`，让一次性补全不被 max 推理拖慢。
- 单测：fallback 用例断言 fallback 调用带 `reasoningEffort: 'off'`；现有用例保持。

## 3. 验收

- 单测/构建通过；合入物化 Dev 后 bridge 探针返回 `ok:true` 正文。

## 4. 边界

R1；不改 provider adapter、模型目录或用户配置。

## 假设

根因假设：DeepSeek 默认 max 推理的一次性补全耗时超过 bridge 25s 截止；把截止放宽到 90s 并显式传 reasoningEffort=off 后，同一调用可以在 90s 内返回正文。如果仍超时，则说明 llm.stream 的 provider 路由本身不可用，应改走聊天会话模型。

## 证伪方式

合入并物化 Dev 后，用 bridge 探针执行：

`node /tmp/bridge-probe2.mjs`

若 90s 内返回 `ok:false`（包括再次 `Text completion timed out`）而不是 `ok:true` 正文，即证明「放宽截止 + reasoning off 可修复」的假设错误，应改走聊天会话模型；若返回 `ok:true` 则假设成立。


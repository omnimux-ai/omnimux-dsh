# 线路分组随请求下发（X-Omnimux-Group）

- 任务：`.worktrees/omnimux-channel-group-header-issue-1851`（分支 `agent/omnimux-channel-group-header-issue-1851`，基线 `origin/main` @ `bbfd905bd`）
- 日期：2026-09-15
- 上游：Issue #1851。来源是用户 2026-09-15 授权的一次真实可用性验证——`gpt-image-2.5-flare` / `gpt-image-2.5-sunburst` 在默认分组下被网关拒绝（`503 model_not_found`），加 `X-Omnimux-Group` 后 `200` 并同步返回 `b64_json` 图像。

## 1. 问题

`plugins/omnimux/src/media/execute.js` 把 `resolveChannelPlan` 产出的候选串 `model@wireGroup` 直接作为请求体 `model` 下发：

```js
input: { ...finalInput, model: candidate }   // "gpt-image-2.5@gpt-image-2.5-flare-std"
```

全仓 `plugins/**` 零处发送 `X-Omnimux-Group`（网关 `middleware/distributor.go` 识别的分组头）。`catalog/serving/channel-groups.js` 的 `wireGroup` 只是数据表字段，从未进入请求。

后果（两条独立缺陷）：

1. 选定分组时分组意图不生效——显式 `group` 表达了「走这条线路」，但请求落到网关默认分组。
2. 候选串被当作模型 id 下发，网关收到 `model@group` 形态的模型名。

`wireGroup !== 'default'` 的线路（seedance / wan / seedream / gpt-image 等）全部受影响。

## 2. 目标

让分组意图真正到达网关：请求体只下发裸模型 id，分组以 `X-Omnimux-Group` 头下发；未解析出分组时不发该头，保持既有行为逐字不变。

## 3. 验收标准（可测试）

- AC-1 候选串含 `@group` 时，实际 HTTP 请求体 `model` 字段为 `@` 之前的裸 id。
- AC-2 同一请求携带 `X-Omnimux-Group` 头，值等于 `@` 之后的分组名。
- AC-3 候选串不含 `@` 时，请求**不带** `X-Omnimux-Group` 头（不用空值占位）。
- AC-4 多个候选时每个候选使用自己的分组：分组随候选切换，不跨次残留。
- AC-5 `parseModelAndGroup` 的既有语义被复用于拆分（不新写一套解析），`toProductId` 归一化保持生效。
- AC-6 `input.runtime` 注入路径不变：注入时仍只调用一次注入的 runtime。
- AC-7 `plugins/omnimux` 既有测试全绿；`pnpm verify:model-contracts` 通过；跨插件对齐门禁通过。

## 4. 不做

- 不改 `resolveChannelPlan` 的 fail-closed 语义、auto 策略排序与候选上限。
- 不新增模型登记、不改目录白名单、不改 `channel-groups.js` 数据表。
- 不发起任何真实模型请求。

## 5. 实现要点

- `protocols/openai-media.js`：`createOpenAiMediaRuntime` 接受 `group`，在既有 fetcher 包装层注入 `X-Omnimux-Group`；`modelId` 保持裸 id。
- `execute.js`：候选入循环时用 `parseModelAndGroup` 拆为 `{ modelId, group }`，`route.modelId` 用裸 id，`group` 传给 `createProtocolRuntime`；`input.runtime` 存在时行为不变。

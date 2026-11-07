# 选择 CLI 模型不直接关闭引导（Issue #3989）

## 背景

用户在本地 Agent 引导中选择模型后页面直接跳转/关闭；期望选择模型只更新 UI，点击「继续」先做 checkOnly 测试，测试通过后才保存并关闭。

## 目标

- `handleModelChange` 只 `setAgentModel` 与清 `testedId`，不调用 `scope.set`。
- `continueWithAgent`：先 `POST /omnimux/agents/select {checkOnly:true}` 测试；通过后正式保存 `runtimeAgentId`，写 `runtimeAgentModel`，再 `onVerified`。
- 模型写入返回 false 时保留引导并报错。

## 非目标

- 不改模型目录发现、CLI 登录协议与 Guide 其它步骤。

## 假设

- 模型下拉 onChange 仅承载本地 UI 状态；持久化统一由继续承担。
- checkOnly + save 的现有接口语义可直接复用。

## 证伪方式

- QA `agentauth`：选择模型后 `__qaSettings.runtimeAgentModel` 必须仍为空、引导必须仍可见；点继续后才写入并出现 PUT。
- 单测源码：`handleModelChange` 若出现 `scope.set`，说明提前写入回归。

## 验收

- 选择模型停留页面；继续先 checkOnly 再保存；成功关闭，失败保留并报错。

## 旧标准变更

- `plugins/omnimux/src/client/runtime-mode-obsolete-healing.test.js` :: `confirms explicit model writes and reports failure without a silent reset`
  → 改为 `keeps model writes in the continue flow`：模型写入从 onChange 移到继续流程，测试意图不变（仍验证显式写入与失败不重置）。

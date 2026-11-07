# 本地 Agent CLI 选择页重构（Issue #3964）

## 背景

参考图要求本地 Agent 设置页：标题/说明、本机 CLI 双列卡片、重新扫描与测试状态、选中卡片后「模型 · <CLI>」默认模型 ID 下拉、右下角「继续」；继续先测试连接，通过后保存并前进。

## 目标

- AgentPanel 改为参考图布局：`omx-agent-shell` + 双列 `.omx-agent-grid` 卡片（图标/名称/版本/选中态），右上「重新扫描」+ 状态 pill。
- 选中 CLI 后显示「模型 · <CLI>」下拉：`CLI 默认设置` + 该 CLI 的模型 ID 列表。
- 右下「继续」：先 `POST /omnimux/agents/select {checkOnly:true}` 测试；通过后 `POST /omnimux/agents/select` 保存 runtimeAgentId，写入 `runtimeAgentModel`，再触发 `onVerified`；失败保留并报错。
- 未登录 CLI 在选中详情提供登录入口；登录轮询保持。

## 非目标

- 不新增参考图中未支持 CLI 的适配器；只渲染实际扫描结果。
- 不改 agents 扫描/登录/更新接口协议。

## 假设

- `/omnimux/agents/select` 的 `checkOnly` 与正式保存语义可直接复用（现有实现已验证）。
- `agent.models` 为 CLI 返回的模型 ID 列表；无列表时只显示「CLI 默认设置」。

## 证伪方式

- QA `?agentauth=1` 场景：若卡片不是 4 个两列、点击 Codex 后无「模型 · Codex CLI」、没有 `gpt-6.1-sol` 选项、继续未发 checkOnly + 正式保存、或未写 runtimeMode，则布局/功能不成立。
- 若未登录 Claude 选中后不出现「登录」按钮，则登录入口回归。

## 验收

- 参考图布局要素齐全；选择 Codex 后模型 ID 可选；继续先测试后保存并进入下一步；未登录有登录入口。

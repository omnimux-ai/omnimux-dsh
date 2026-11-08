# CLI 选择后自动登录并测试（Issue #4005）

## 背景

参考 OpenDesign（SettingsDialog）：已安装 CLI 卡片把登录状态放在元信息，选中后主要操作是测试/继续，不在选择阶段先显示一个割裂的登录按钮。当前选中未登录 CLI 就显示登录按钮，交互不够顺。

## 目标

- CLI 卡片元信息显示「需要登录」或版本。
- 删除选中卡片的独立「登录」按钮。
- 「继续」统一流程：未登录且支持登录 → 自动 POST `/omnimux/agents/login`，轮询 `/omnimux/agents` 直到 signed-in（120s 超时）；然后 checkOnly 测试 → 保存 runtimeAgentId/runtimeAgentModel → onVerified。
- 登录/测试期间继续按钮 loading；失败或超时保留并显示错误。

## 非目标

- 不改 CLI 登录协议、模型发现、配置写入格式。

## 假设

- 用户点「继续」时自动发起登录是可接受的（浏览器由 CLI 自行拉起）。
- 轮询 `/omnimux/agents` 能观察到 auth.state 从 signed-out 到 signed-in。

## 证伪方式

- QA `agentauth=1`：选中未登录 Claude 后页面若仍出现「登录」按钮，则失败；继续按钮应可用。
- 若点继续没有 `/agents/login` 请求、或登录后没有 checkOnly/save/PUT，则自动流程不成立。
- 超时若自动关闭，则失败保留不成立。

## 验收

- 选择未登录 CLI 无单独登录按钮；继续自动登录→测试→保存→关闭；失败保留并报错。

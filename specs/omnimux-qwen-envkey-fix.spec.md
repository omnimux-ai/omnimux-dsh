# Qwen envKey 回退与证据字节数收尾（Issue #4072）

## Objective

关闭 Issue #4062 独立评审留下的两条不阻断小项：显式声明 `envKey` 时不再回退协议默认变量；证据报告中的截图字节数与实际文件一致。

## Root cause

`configEnvKeys` 在选中协议时无条件追加该协议的默认环境变量，即使 provider 条目已经声明 `envKey`。于是别的工具留下的 `OPENAI_API_KEY` 可能让实际缺少 `DASHSCOPE_API_KEY` 的 Qwen 配置显示「已登录」。证据报告 `screenshot.bytes` 是手工填写，和落盘 PNG 不一致。

## Scope

- `plugins/omnimux/src/agents/auth.js`：默认变量只在选中协议没有可用 provider 列表时回退；有列表时由条目自身决定显式 `envKey` 或该 provider 的默认键。
- `plugins/omnimux/src/agents/qwen-auth.test.js`：补显式 `envKey` 不回退、无 `envKey` 仍回退两条用例。
- `docs/evidence/omnimux-cli-live-state/app-qa-report.json`：`screenshot.bytes` 改为实际值。

## Acceptance cases

1. `selectedType=openai`，provider 声明 `envKey=DASHSCOPE_API_KEY`，进程只有 `OPENAI_API_KEY` → `unknown`。
2. `selectedType=openai`，provider 未声明 `envKey`，进程有 `OPENAI_API_KEY` → `signed-in`。
3. 报告 `bytes` 与 `cli-live-panel.png` 的 `stat` 大小一致。

## 假设

Qwen Code 的 `modelProviders` 条目声明了 `envKey` 时，该协议只从那个变量读密钥；协议默认变量只在条目未声明、或该协议根本没有 provider 列表时才是有效来源。

## 证伪方式

如果显式声明 `envKey` 的机器上仅存在协议默认变量就被判「已登录」，或报告字节数与实际文件仍不一致，则本修复不成立。
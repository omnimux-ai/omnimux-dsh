# 本地 Agent 扫描补全 GUI 启动 PATH（Issue #3987）

## 背景

从 Finder 启动 Dev 后，本地 Agent 页面四个 CLI 全部「未检测到程序安装」。实际 codex/kimi/qwen 已安装，但 GUI 进程继承 LaunchServices 最小 PATH，不包含 `~/.nvm/versions/node/*/bin`、`~/.kimi-code/bin` 等 shell 路径；`resolveBinPath` 只查 `process.env.PATH`，`scanLocalAgents` 还直接用裸 bin 名探测。

## 目标

- `resolveBinPath` 在 PATH 之外补查常见用户级/包管理器 bin 目录与 nvm 各版本 node bin。
- `scanLocalAgents` 使用解析后的绝对路径探测，GUI 最小 PATH 下仍能发现 CLI。
- 仍以 executable 检查为准，不伪造安装；显式 bin 路径优先不变。

## 非目标

- 不改 agent 探测/安装协议；不执行登录；不改 Windows 逻辑。

## 假设

- GUI 启动的 `process.env.HOME` 正常；`fs.accessSync(X_OK)` 可判断可执行。
- 补查目录仅用于解析 PATH 命令，不改变用户 shell 配置。

## 证伪方式

- isolated HOME 构造 `HOME/.nvm/versions/node/v25.8.0/bin/codex` 可执行文件，`resolveBinPath('codex',{env:{PATH:'/usr/bin:/bin',HOME}})` 若返回空则失败。
- 同构造 `HOME/.kimi-code/bin/kimi`；`scanLocalAgents` 在最小 PATH 下若仍显示未安装则失败。

## 验收

- 本机最小 PATH 下 `resolveBinPath('codex'/'kimi'/'qwen')` 均返回非空绝对路径。
- 单测覆盖 nvm/kimi 目录；全量包测通过。

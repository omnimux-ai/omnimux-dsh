# CLI 登录后台运行（Issue #3956）

## 背景

点击「本机助手」里的登录会弹出 Terminal 窗口（`omnimux-codex-login.command` 运行 `codex login`，启动 localhost:1455 OAuth 服务）。用户希望后台完成，不弹终端。

## 目标

- macOS 默认使用 `/usr/bin/script -q /dev/null /bin/sh -lc 'cd $HOME; exec <cli> <login args>'` 以伪终端后台运行登录命令，输出写日志；spawn detached + unref，不阻塞 Host。
- 不打开 Terminal.app。
- 客户端提示改为「已发起登录，请在浏览器中完成」；既有 3s 轮询继续，登录成功自动更新。
- 保留显式终端模式：`options.mode='terminal'` 或 `OMNIMUX_CLI_LOGIN_MODE=terminal`。

## 非目标

- 不改登录协议与凭据存储；不引入新的交互式 TUI 依赖。

## 假设

- codex/claude/kimi 的登录命令只需要伪终端即可运行（浏览器或设备码由 CLI 自行打开），不需要 Terminal.app 窗口。
- `script` 是 macOS 自带命令，后台运行不会持有 Host 生命周期。

## 证伪方式

- 单测：默认 `launchAgentLogin('codex')` 若调用 `open -a Terminal`、或 spawn 参数不是 `/usr/bin/script -q /dev/null /bin/sh -lc`、或未 `unref`，则后台模式不成立。
- 单测：`mode:'terminal'` 若不再走原 `.command` + Terminal 路径，则 fallback 回归。

## 验收

- 默认后台模式：不弹 Terminal；日志文件存在；返回 `mode:'background'`。
- 显式 terminal 模式保持旧行为。
- Dev 真机点击登录不再弹终端（人工验收项）。

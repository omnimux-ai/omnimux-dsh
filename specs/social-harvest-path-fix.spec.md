# 增强 omnimux-social-harvest 子进程 PATH 解析规格

- Issue: #2457
- 日期: 2026-09-20
- 目标: 在 `run.js` 中增强子进程环境变量的 PATH 解析与可执行二进制探测，确保在 macOS GUI Electron 宿主中正常调用 OpenCLI。

## 1. 根因分析

在 macOS 上通过 Finder / LaunchServices 启动的 Electron 应用（如 OmniMux Dev.app），其 `process.env.PATH` 默认只继承系统级精简路径（如 `/usr/bin:/bin:/usr/sbin:/sbin`），并不包含：
- `/usr/local/bin`（OpenCLIApp 托管 shim 所在路径）
- `/opt/homebrew/bin`（Homebrew 安装路径）
- `~/.nvm/versions/node/*/bin`（用户 Node / npm 全局路径）
导致 `spawn('opencli')` 触发 `ENOENT` 从而被判断为 `installed: false`。

## 2. 修复方案

在 `plugins/omnimux-social-harvest/src/run.js` 中实现：
1. `buildChildEnv()`：聚合补充 `/usr/local/bin`、`/opt/homebrew/bin` 及用户目录下的常见 node/bin 路径，合并入 `process.env.PATH`；
2. `resolveOpenCliBin()`：遍历增强后的 PATH 探测 `opencli` 二进制文件，优先使用已发现的绝对路径执行，若未命中则降级为 `'opencli'`；
3. 单元测试校验 `buildChildEnv` 与 `resolveOpenCliBin` 的行为。

## 3. 验收标准

1. `plugins/omnimux-social-harvest` 单元测试通过。
2. 门禁全绿：`test:agent-tools`、`verify:product-baseline`。
3. 合入并物化到 Dev App 后，调用 `/api/omnimux/social-harvest/status` 能正确返回 `installed: true`，页面顶部显示「采集环境已就绪」。

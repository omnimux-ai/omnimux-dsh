# Kimi CLI 一键更新修复（Issue #3937）

## 背景

「本机助手」列表里 Kimi CLI 显示「更新到 0.36.0」，点击后按钮变「更新中…」，结束后版本仍是 0.34.0，没有任何失败提示。其它 CLI 可正常更新。

## 根因

1. Kimi 0.34.0 的 `kimi upgrade` 在非交互进程里没有 TTY，只打印 `To update manually, run: curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash` 并以退出码 0 结束，不会安装任何东西。
2. `runAgentUpdate` 把退出码 0 当成成功，探测到版本没变也返回 `ok:true`，客户端因此没有失败提示。
3. 0.34.0 的 upgrade 平台探测还把本机 native 安装误报为 `native (windows)`，传 `--yes` 也不会自动安装。

## 目标

- Kimi 的 self 更新输出命中 `To update manually` / `Auto-update is not supported` 时，改用 Kimi 官方安装脚本完成安装：
  - macOS / Linux：`bash -c 'set -o pipefail; curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'`
  - Windows：`powershell -NoProfile -Command "irm https://code.kimi.com/kimi-code/install.ps1 | iex"`
- 更新后重新探测版本；若仍落后于 Kimi 自己 ledger 的 latest，返回 `update-not-applied`，不再伪成功。
- Kimi 的 self 命令增加 `--yes`（新版支持，0.34 忽略），让后续更新可直接自动安装。
- 其它 CLI 的更新路径与返回保持原样。

## 假设

- Kimi 0.34 的 `kimi upgrade` 在无 TTY 时只打印手动命令并以 0 退出，`--yes` 在该版本被忽略；其 ledger 里的 `latest` 是最可信的目标版本。
- Kimi 官方安装脚本能在 macOS/Linux 完成 native 覆盖安装；在已存在 `~/.kimi-code` 的机器上覆盖安装时只替换二进制，不破坏配置与凭据。

## 证伪方式

- 直接执行生产同款命令 `bash -c 'set -o pipefail; curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'`：若 `kimi --version` 不为 2.5.2，或安装前后 `~/.kimi-code/config.toml` 与凭据文件 SHA-256 发生变化，则覆盖安装假设不成立。
- 运行 `node --test plugins/omnimux/src/agents/updates.test.js`：若「手动提示 → fallback」用例没有触发第二条安装命令，或安装后版本未变仍返回 `ok:true`，则修复假设不成立。

## 非目标

- 不改 Kimi 登录/鉴权。
- 不引入 pty 依赖。
- 不改本机助手列表布局与文案。

## 验收用例

- S1：主命令只打印手动提示 → 依序执行 `kimi upgrade --yes` 与官方安装脚本 → 版本变为 ledger latest → `ok:true`。
- S2：安装脚本执行后版本仍落后 → `ok:false / update-not-applied`，detail 含 CLI 原始说明（已脱敏）。
- S3：安装脚本抛错 → `ok:false / update-failed`，detail 不含密钥。
- S4：平台没有 fallback → `ok:false / update-manual-required`。
- S5：原有 npm 更新与 self 常量命令路径不变（既有用例保持通过）。
- S6（人工）：Dev 真机点击「更新到 2.5.2」后 `kimi --version` 变为 2.5.2。

## 旧标准变更

- `plugins/omnimux/src/agents/updates.test.js` :: `self shape runs the constant self-update command`

说明：原断言期望 self 命令参数是 `['upgrade']`。Kimi 0.34 在非交互环境不会安装，`--yes` 是新版支持的自动确认开关（0.34 忽略该参数）。本次把常量改为 `['upgrade', '--yes']`，用例意图（常量命令原样执行）不变，仅断言新常量。

## 证据

- `plugins/omnimux/src/agents/updates.test.js` 覆盖 fallback 成功、非零退出仍触发 fallback、版本探测为空、版本仍落后、安装失败脱敏、无兜底平台、Windows/Linux 分支。
- 生产同款安装命令实测：`bash -c 'set -o pipefail; curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash'` → `kimi --version` 0.34.0 → 2.5.2，exit 0；`~/.kimi-code/config.toml` 与 `credentials/kimi-code.json` 的 SHA-256 前后一致。

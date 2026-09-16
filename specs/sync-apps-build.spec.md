# 同步脚本补充 omnimux-apps 构建分派

- Issue: #2025
- 任务工作树: `.worktrees/sync-apps-build`
- 适用范围: `scripts/sync-to-app.sh`

## 1. 目标（Objective）

在 `scripts/sync-to-app.sh` 的 `build_one` 中明确为 `omnimux-apps` 分派宿主与客户端双重构建（`node scripts/build-host.mjs && node scripts/build-client.mjs`），使执行 `scripts/sync-to-app.sh omnimux-apps` 时 `dist/index.js` 与 `lib/client.js` 均在同步 rsync 前生成，确保目标 profile 的安装入口文件完整存在。

## 2. 命令（Commands）

- 构建演练: `bash scripts/sync-to-app.sh omnimux-apps`
- 静态质量门禁: `node scripts/auto-qa-gate.mjs . --diff --base origin/main`
- 单元与回归测试: `node --test scripts/worktree-delivery.test.mjs`

## 3. 验收标准（Acceptance Criteria）

1. `build_one` 中增加 `omnimux-apps` case 分支，调用 `node scripts/build-host.mjs && node scripts/build-client.mjs`。
2. 兜底分支在检测到同时存在 `scripts/build-host.mjs` 与 `scripts/build-client.mjs` 时，执行双重构建。
3. `node --test scripts/worktree-delivery.test.mjs` 通过。

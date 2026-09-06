---
title: "dev-pipeline — 开发、Dev 与生产环境合同"
id: "contract-dev-pipeline"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-21"
updated: "2026-09-05"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# dev-pipeline — 开发、Dev 与生产环境合同

本合同防止未合并源码、并行任务和生产 profile 相互污染。命令入口见 [ops-entry](ops-entry.md)，证据要求见 [plugin-qa](plugin-qa.md)，发布权限见 [plugin-git-pr](plugin-git-pr.md)。

## 环境分层

| 层 | 用途 | 载体 | 代码形态 |
|---|---|---|---|
| L1 | 快速静态/单测 | 当前 worktree | 源码直读，无 App 副作用 |
| L2 | 合并前运行与浏览器验收 | `~/.dsh-dev/tasks/<task>`，端口 `44201–44299` | 当前 worktree 的在研插件 link；每个 profile 最多一个 |
| Dev | 合并后日常物化与验收 | `~/.omnimux-dev/profiles/omnimux`，Dev App/Host `45120` | 已合并 `main` 的物化副本 |
| Prod | 正式运行 | `~/.omnimux/profiles/omnimux`，OmniMux App `44200` | 仅独立发布授权后的物化副本 |
| Base | 官方底座 | `~/.dsh` | 不接收 OmniMux 日常交付 |

生产或 Dev profile 都不得 link 工作树。L2 profile 用完即弃，不作为长期环境。

## 合并边界

- 合并前运行验证必须使用独立 L2；SOURCE 精确指向当前隔离 worktree 的 `plugins/`，不得指向共享主工作区或另一个任务。可配置 source 不等于可以放弃 worktree 隔离。
- 公共 Dev 和 Prod 不得接收未合并 worktree 产物。未合并物化旁路只允许显式 `OMNIMUX_ALLOW_UNMERGED_TARGET=<~/.dsh-dev/tasks/...>`，且所有目标都在该前缀内；旧布尔旁路单独使用必须失败。
- 合并后更新 `main`，默认同步到 Dev，再按变更面在 45120 验收。普通交付到此为止；不得自动追加 `--prod`、`--all` 或正式包发布。
- 纯文档和不影响已安装运行时的任务不要求 L2、Dev 物化或 App 验收。

L2 初始化从 `OMNIMUX_L2_SEED_PROFILE` 或默认 Dev `~/.omnimux-dev/profiles/omnimux` 取稳定种子，不默认使用旧 `~/.dsh/profiles/omnimux`。它完整复制受管 `.materialize-snapshots/plugins/` 与可重定位的 pnpm 锁到任务 profile，再由任务私有 pnpm store 重建 `node_modules`；不得复制 seed `node_modules`、`.npmrc` 或任何指向 Dev/Prod 的 source 链接。受管 source 或锁缺失时在创建 L2 profile 前失败。启动前必须校验 `$DSH_SRC` 安装闭包；官方 `@deepseek-ai/*` 由 app-boot 投影，不来自任务 profile 的私有 `node_modules`。

## 物化合同

- 唯一写入口是 `yarn omnimux:sync`，底层为 `scripts/sync-to-app.sh` → `scripts/sync-stable.sh`。禁止手工 rsync/cp 进任何 profile。
- 无目标参数时只写 Dev `~/.omnimux-dev`。`--prod`、`--all` 及 `~/.omnimux` 需要单独发布授权；显式绝对路径或 `~/` 目标必须原样解析并限定到该目标。
- 物化源固定在目标 profile 的 `.materialize-snapshots/plugins/`；`node_modules` 只由 pnpm 生成。依赖声明必须指向受管 snapshot，不得回指 profile `node_modules`、共享工作树或未受管旧源。
- 命名插件同步只构建/替换被点名插件，只读核验它依赖的现有 `dsh-ui-kit` 受管 snapshot；不得重建/覆盖 shared kit，也不得更新 Agent Presets、`app.asar` 或 `Info.plist`。
- 完整同步从权威 `dsh-ui-kit` 构建输入更新**既有**受管 snapshot，再物化全插件和 Agent Presets。首次建立缺失的稳定 kit/source 必须走官方完整 profile rebuild；同步不得从已安装 `node_modules` 反向回填。
- 任何受管 source 缺失、kit 漂移、未受管自引用、旧 `file:node_modules/...` 残留或已安装入口身份/文件校验失败，都必须在首次写入前失败；不得迁移、静默跳过或留下部分同步。
- `omnimux-workflow` 只跟踪 `src/`；`dist/index.js`、`lib/client.js`、`lib/canvas.js` 由 prepare/sync 现场生成。其它插件的跟踪策略按各包当前清单执行。

## 刷新与重启

- L2 Host 属于任务私有环境，Agent 可用 `yarn omnimux:dev restart-host <task>` 原地重启并保持端口/数据身份。
- Client 物化后优先在指定 Dev 页面或窗口刷新；Host 变更只有在目标进程重新加载后才生效。
- 公共 App 重启必须先确认具体 App（Dev/Prod）和协调窗口。确认后由 Agent 执行指定重启并复核，不得把非付款操作交回用户，也不得默认 `pkill` 未确认目标。
- 只有壳层/平台门控改动需要额外 Electron renderer/CDP；普通 Web/Stage 仍以 L2 和合并后 45120 浏览器证据为主。

## 数据与诊断边界

- 需要真实数据时只读复制到任务 L2，禁止从 L2 反向写 Dev/Prod。密钥不得写入仓库或证据。
- `pnpm doctor` 当前实现仍以 `${DSH_HOME:-~/.dsh}/profiles/omnimux` 作为所谓生产检查目标；它不能单独证明当前 Prod `~/.omnimux` 或 Dev `~/.omnimux-dev` 合规。报告必须写明实际检查路径，直至实现修正。
- Host 日志、PID、端口、profile、SOURCE 与 commit 是运行身份的一部分。只看 HTTP 200 或“进程存在”不能证明目标版本已加载。

## 桌面壳与上游

日常入口仓库是 `/Users/x/Desktop/Project/omnimux-desktop-fork`。壳的上游同步、stage 和打包遵循该仓 `docs/contracts/upstream-sync.md`；这些是独立高风险/发布流程，不是插件日常交付步骤。归档壳 `/Users/x/Desktop/Project/omnimux-desktop` 只读，不得恢复为运行真源。

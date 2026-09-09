---
title: "ops-entry — 插件运维命令唯一入口"
id: "contract-ops-entry"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# ops-entry — 插件运维命令唯一入口

对外运维命令从 `/Users/x/Desktop/Project/omnimux-desktop-fork` 的 `yarn omnimux:*` 发起；产品仓 `scripts/` 是底层实现，不形成第二套公开入口。权限见 [plugin-git-pr](plugin-git-pr.md)，环境含义见 [dev-pipeline](dev-pipeline.md)。

## 公开入口

| 命令 | 行为 |
|---|---|
| `yarn omnimux:dev <action> …` | 管理指定 L2 任务环境；action 为 start、stop、ls、rm 或 watch |
| `yarn omnimux:dev restart-host <task>` | 只重启指定 L2 Host；不碰公共 App |
| `yarn omnimux:sync <plugin…>` | 默认只写 Dev；只构建/物化点名插件并只读核验受管 shared kit，不改 presets 或 App 包 |
| `yarn omnimux:sync` | 默认只写 Dev；完整构建/物化并更新既有受管 kit snapshot 与 Agent Presets |
| `yarn omnimux:sync --managed-tarball=<绝对路径> --expect-name=<完整包名> --expect-version=<精确版本> --expect-sha256=<64位hex> --target=dev` | 显式单包纳管；与普通同步互斥，不 build、不改 kit/presets/bundle；仅适用于已授权包和协调窗口 |
| `yarn omnimux:sync --recover-managed-tarball=<transaction-id> --target=dev` | 只恢复该 profile 的未完成事务，不继续安装；恢复前态不等于 seed 合规 |
| `yarn omnimux:sync --promote-baseline` | **拟实现（PR-C）**。布尔旗标，无值。沿既有 sync 旗标从授权受管闭包**创建**命名不可变 baseline；id 由完整内容哈希决定，不接受 `<id-or-new>`。不写共享 `current`；不切全员默认。与 `--managed-tarball`、命名插件、`--prod`/`--all` 混用必须失败。容量预检在大复制之前 |
| 显式消费（环境或等价 `--seed-baseline=<id>`） | **拟实现（PR-C）**。仅该 L2 任务按固定不可变路径/ID offline frozen 消费；允许 **published** 候选（隔离验收）与 **verified**。无共享 current 写逻辑。旧默认种子保留并标迁移期 |
| `yarn omnimux:sync --activate-baseline=<id>` | **拟实现（PR-S）**。仅 **verified** id。将 `current` 经锁 + temp 指针 + 同 FS rename 指向该 id（只影响新任务）并删除隐式 Dev/Prod/`~/.dsh` fallback。真实 Host **无法启动禁止切 S**（无成功 activate 路径），不是脚本读聊天授权。失败旧指针保持；不得自动回落 Dev |
| `yarn omnimux:doctor` | 运行当前环境诊断；实际覆盖范围与限制见 [dev-pipeline](dev-pipeline.md) |
| `yarn omnimux:restart <dev-or-prod>` | 重启已明确指定的公共 App；需要该 App 与协调窗口的用户确认 |
| `yarn omnimux:stage` | 发版前写入桌面 preset；需要发布授权 |
| `yarn omnimux:path` / `yarn omnimux:help` | 显示解析路径和用法 |

纳管内部接缝以 [冻结架构合同](../specs/issue-778-managed-tarball-architecture.md#33-状态模型与接口) 为准。私有 cache 获取及两文件恢复点不新增公开运维入口；只有 `SyncResult.schemaVersion=1` 的明确终态能作为磁盘操作结果，候选安装、备份或 Host 监听不等于业务验收。

`sync` 不重启进程。无参数和点名插件同步都默认 `~/.omnimux-dev`；`--prod`、`--all`、正式 App、stage/打包不属于普通交付，必须单独获得发布授权。授权后由 Agent 完成非付款操作。

上表中 `--promote-baseline`（布尔）/ 显式消费 / `--activate-baseline=<id>` **在 PR-D 合入后脚本仍不存在**。不得把拟实现旗标当成可执行命令。**Promote 只取布尔一种定义**，不与 id/new 混用。脚本只检查基线兼容性、完整性、以及绑定该内容摘要的验收 sidecar，不假设能读聊天授权，不新建权限平台。阶段与闭包合同见 [dev-pipeline](dev-pipeline.md) 与 [稳定基线迁移规格](../specs/2026-09-09-stable-baseline-migration.md)。切 S 遵循既有[任务授权政策](plugin-git-pr.md)；不另设 S 二次确认。Agent 核对本表阶段与合入证据。

公共 App 重启不得使用模糊的“重启一下”。先确认 Dev 或 Prod 以及协调窗口，再执行对应命令并验证目标 PID/窗口；不得默认强杀其它 Agent 或用户正在使用的实例。

## 内部实现

| 路径 | 角色 |
|---|---|
| `scripts/sync-to-app.sh` | build + 目标解析 + 调用稳定物化 |
| `scripts/sync-stable.sh` | 内部受管 snapshot/pnpm 物化；不得作为日常入口 |
| `scripts/dev-env.sh` / `scripts/watch-plugin.mjs` | L2 环境与 watch 实现 |
| `plugins/omnimux-workflow/scripts/dev.mjs` | 插件构建 watcher，不是运维入口 |
| `plugins/*/scripts/build-*.mjs` | 包内构建步骤，不是 sync/deploy 入口 |
| `plugins/omnimux-market/scripts/generate-omnimux-skills-catalog.py` | Market catalog 数据生成，不负责 App/profile 同步 |

旧 `plugins/omnimux-gallery/scripts/sync-workbuddyskills.mjs` 已不存在，不得继续引用为可执行入口。

## 禁止

- 在插件目录新增私有 deploy、sync-to-profile 或 restart-app 体系；
- 文档指导日常用户直接调用 `sync-stable.sh` / `dev-env.sh`；
- 手工 rsync/cp 到 profile，或让命名插件同步顺带改 shared kit、presets 或 App 包；
- 未确认目标与窗口就重启/强杀公共 App；
- 未获独立发布授权时使用 `--prod`、`--all`、stage 或正式打包。

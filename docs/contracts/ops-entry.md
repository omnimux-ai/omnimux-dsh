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
| `yarn omnimux:sync <plugin…>` | 合入 main 后默认只写 Dev；只构建/物化点名插件并只读核验受管 shared kit，不改 presets 或 App 包 |
| `yarn omnimux:sync` | 合入 main 后默认只写 Dev；完整构建/物化并更新既有受管 kit snapshot 与 Agent Presets |
| `yarn omnimux:sync --managed-tarball=<绝对路径> --expect-name=<完整包名> --expect-version=<精确版本> --expect-sha256=<64位hex> --target=dev` | 显式单包纳管；与普通同步互斥，不 build、不改 kit/presets/bundle；仅适用于已授权包和协调窗口 |
| `yarn omnimux:sync --recover-managed-tarball=<transaction-id> --target=dev` | 只恢复该 profile 的未完成事务，不继续安装；恢复前态不等于运行验收通过 |
| `yarn omnimux:doctor` | 运行当前环境诊断；实际覆盖范围与限制见 [dev-pipeline](dev-pipeline.md) |
| `yarn omnimux:restart <dev-or-prod>` | 重启已明确指定的公共 App；遵循目标授权与占用协调边界 |
| `yarn omnimux:stage` | 发版前写入桌面 preset；需要发布授权 |
| `yarn omnimux:path` / `yarn omnimux:help` | 显示解析路径和用法 |

没有合并前独立 App/Host 环境或对应生命周期命令。合并前执行隔离 worktree 自动化测试、静态检查和独立评审，通过 required CI/MQ 后再按需物化 Dev。L2 专属 baseline 创建、消费与激活迁移已退役，不是待实现的运维能力。

#765 viewer 版本转换仍使用同一 `yarn omnimux:sync --managed-tarball=…` 入口，追加的成套旧/新来源参数、固定身份与反向 receipt 约束见 [dev-pipeline 转换例外](dev-pipeline.md#839765-viewer-精确转换例外)。没有新部署命令；未合并工具只在自动化测试的 synthetic fixture 验证，不得写共享 Dev。`--recover-managed-tarball` 遇到 COMMITTED 仅完成终态清理，提交后退版必须走绑定成功 receipt 的新反向转换，不能把恢复命令当降级命令。

纳管内部接缝以 [冻结架构合同](../specs/issue-778-managed-tarball-architecture.md#33-状态模型与接口) 为准，其中旧环境流程以本合同为准。私有 cache 获取及两文件恢复点不新增公开运维入口；只有 `SyncResult.schemaVersion=1` 的明确终态能作为磁盘操作结果，候选安装、备份或 Host 监听不等于业务验收。

`sync` 不重启进程。无参数和点名插件同步都默认 `~/.omnimux-dev`；Dev/Prod 不 link 或接收未合并 worktree。`--prod`、`--all`、正式 App、stage/打包不属于普通交付，必须单独获得发布授权。授权后由 Agent 完成非付款操作。

公共 App 重启不得使用模糊的“重启一下”。先核对 Dev 或 Prod、目标 PID/窗口与占用情况；Dev 交付授权覆盖无冲突重启，有未保存状态或并发使用冲突时先协调。Prod 需明确生产授权；不得默认强杀其它 Agent 或用户正在使用的实例。

## 内部实现

| 路径 | 角色 |
|---|---|
| `scripts/sync-to-app.sh` | build + 目标解析 + 调用稳定物化 |
| `scripts/sync-stable.sh` | 内部受管 snapshot/pnpm 物化；不得作为日常入口 |
| `scripts/watch-plugin.mjs` | 仅插件构建 watcher，不启动 Host、不证明 HMR 或已安装版本生效 |
| `plugins/omnimux-workflow/scripts/dev.mjs` | 插件构建 watcher，不是运维入口 |
| `plugins/*/scripts/build-*.mjs` | 包内构建步骤，不是 sync/deploy 入口 |
| `plugins/omnimux-market/scripts/generate-omnimux-skills-catalog.py` | Market catalog 数据生成，不负责 App/profile 同步 |

旧 `plugins/omnimux-gallery/scripts/sync-workbuddyskills.mjs` 已不存在，不得继续引用为可执行入口。

## 禁止

- 在插件目录新增私有 deploy、sync-to-profile 或 restart-app 体系；
- 文档指导日常用户直接调用 `sync-stable.sh`；
- 手工 rsync/cp 到 profile，或让命名插件同步顺带改 shared kit、presets 或 App 包；
- 未确认目标与窗口就重启/强杀公共 App；
- 未获独立发布授权时使用 `--prod`、`--all`、stage 或正式打包。

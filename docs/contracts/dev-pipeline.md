---
title: "dev-pipeline — 开发、Dev 与生产环境合同"
id: "contract-dev-pipeline"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-21"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# dev-pipeline — 开发、Dev 与生产环境合同

本合同防止未合并源码、并行任务和生产 profile 相互污染。命令入口见 [ops-entry](ops-entry.md)，证据要求见 [plugin-qa](plugin-qa.md)，发布权限见 [plugin-git-pr](plugin-git-pr.md)。命名不可变 baseline 的设计与验收见 [稳定基线迁移规格](../specs/2026-09-09-stable-baseline-migration.md)。

**阶段诚实：**本文同时记录**当前实现**、**迁移期（PR-C）**和**目标（PR-S）**。PR-D 只改文档。不得把目标写成已切换。`--promote-baseline`（布尔）/ 显式消费 / `--activate-baseline=<id>` 在 [ops-entry](ops-entry.md) 标拟实现，脚本尚未提供这些旗标。真实 Host **无法启动禁止切 S**（阶段与写集边界，不是脚本读聊天授权）。切 S 遵循既有[任务授权政策](plugin-git-pr.md)；不另设 S 二次确认。Agent 核阶段与合入证据，脚本只核兼容性、完整性与绑定该摘要的 sidecar。

## 环境分层

| 层 | 用途 | 载体 | 代码形态 |
|---|---|---|---|
| L1 | 快速静态/单测 | 当前 worktree | 源码直读，无 App 副作用 |
| L2 | 合并前运行与浏览器验收 | `~/.dsh-dev/tasks/<task>`，端口 `44201–44299` | 当前 worktree 的在研插件 link；每个 profile 最多一个 |
| Dev | 合并后日常物化与验收 | `~/.omnimux-dev/profiles/omnimux`，Dev App/Host `45120` | 已合并 `main` 的物化副本 |
| Prod | 正式运行 | `~/.omnimux/profiles/omnimux`，OmniMux App `44200` | 仅独立发布授权后的物化副本 |
| Base | 官方底座 | `~/.dsh` | 不接收 OmniMux 日常交付 |

生产或 Dev profile 都不得 link 工作树。L2 profile 用完即弃，不作为长期环境。

### 稳定基线阶段（当前 / 迁移 / 目标）

| 阶段 | L2 默认种子 | shared `current` | 隐式 Dev / Prod / `~/.dsh` |
|---|---|---|---|
| **当前**（至 PR-C 合入前） | `OMNIMUX_L2_SEED_PROFILE`，否则 `~/.omnimux-dev/profiles/omnimux`，否则 `~/.omnimux/profiles/omnimux`，否则 `$DSH_HOME`/`~/.dsh/profiles/omnimux`（`scripts/dev-env.sh`） | 不存在 | **仍存在** |
| **迁移**（PR-C 已合入、PR-S 前） | **旧默认保留**并标迁移期；允许显式消费命名 baseline（含 published 候选，仅隔离验收） | **禁止写入**；C 消费走固定不可变路径/ID | **仍存在**，不得删除 |
| **目标**（PR-S 激活成功后） | 仅已激活的命名不可变 baseline | 只影响**新**任务；仅 **verified** id | **删除**；禁止静默回落 |

**C 实施前 D 必须 `state=MERGED`。** PR-C 只增加命名不可变 baseline 的**创建**和**显式消费**，不写共享 `current`，消费路径无 current 写逻辑，不切全员默认。**C 合入前**完成隔离双真实 Host 并发、离线重建、ego smoke 等适用验证。**C 合入后**正式候选 published 可被隔离显式消费以验收；sidecar 绑定该内容哈希 id 后才 verified。**其后** PR-S 才删除隐式 fallback 并激活。真实 Host 无法启动禁止切 S。回滚与 `current` 激活只允许 verified id；失败保持旧指针，不能自动 Dev。S 激活复用锁、temp 指针、同 FS rename。

## 合并边界

- 合并前运行验证必须使用独立 L2；SOURCE 精确指向当前隔离 worktree 的 `plugins/`，不得指向共享主工作区或另一个任务。可配置 source 不等于可以放弃 worktree 隔离。
- 公共 Dev 和 Prod 不得接收未合并 worktree 产物。未合并物化旁路只允许显式 `OMNIMUX_ALLOW_UNMERGED_TARGET=<~/.dsh-dev/tasks/...>`，且所有目标都在该前缀内；旧布尔旁路单独使用必须失败。
- 合并后更新 `main`，默认同步到 Dev，再按变更面在 45120 验收。普通交付到此为止；不得自动追加 `--prod`、`--all` 或正式包发布。
- 纯文档和不影响已安装运行时的任务不要求 L2、Dev 物化或 App 验收。

**当前实现：** L2 初始化优先 `OMNIMUX_L2_SEED_PROFILE`，否则 Dev `~/.omnimux-dev/profiles/omnimux`。脚本仍可能继续落到 Prod `~/.omnimux/profiles/omnimux` 或 `$DSH_HOME`/`~/.dsh/profiles/omnimux`（见 `resolve_l2_seed_profile`）。文档曾写「不默认旧 `~/.dsh`」；**以脚本为当前运行事实**，该隐式链保留到 PR-S 删除。

它完整复制受管 `.materialize-snapshots/plugins/` 与可重定位的 pnpm 锁到任务 profile，再由任务私有 pnpm store 重建 `node_modules`；不得复制 seed `node_modules`、`.npmrc` 或任何指向 Dev/Prod 的 source 链接。受管 source 或锁缺失时在创建 L2 profile 前失败。启动前必须校验 `$DSH_SRC` 安装闭包；官方 `@deepseek-ai/*` 由 app-boot 投影，不来自任务 profile 的私有 `node_modules`。

**迁移期显式消费（PR-C，拟实现）：** 任务指定命名 `baselineId`（内容哈希）。消费直接固定到该不可变路径/ID，offline frozen：私有 store copy/核验已锁定包，`pnpm install --frozen-lockfile --offline`，`--package-import-method=copy` 或可证写隔离的同卷 CoW；禁止共享 hardlink 写穿。**published 候选允许隔离显式消费用以验收**；只有 **verified** 可 `current` 激活/回滚。准备阶段才允许对已锁定公开 registry 做受控在线获取。**容量预检在大复制之前。** 创建与激活分离；C 无共享 current 写逻辑；`current` 只影响新任务；旧任务引用受保护；无后台 GC。

**Baseline 闭包：** 包含受管 kit、锁、白名单解析 patch、manifest 内容摘要、Host 实际身份、Node/pnpm/OS/架构。排除用户 settings、凭据、`node_modules`、App 包。`baselineId` 为完整内容哈希（规范化文件字节、路径模式、工具与 Host 版本）；`createdAt`、来源路径、验收报告不进入身份。产物不原地修改；验证 receipt 为绑定该 id 的独立 sidecar。源前后 digest 须与既有锁一致；staging 发布后才成为不可变 id。容量按**本次实测**字节预检，文档不编造数字。凭据业务测试走现有明确授权注入，不进 baseline。pin/API 与记录不匹配须另授权，不得改 [harness-pin](../harness-pin.md) 或外仓 viewer。S 激活：锁 + temp 指针 + 同 FS rename；失败旧指针保持；兼容失败不 Dev 回退。

L2 的 `start` 和 `restart-host` 均通过 CLI `--patch` 加载 [工作区浏览装配](../../scripts/l2-workspace-browser.patch.yml)，禁用自动选择器并成对装配官方 browse backend 与 client surface。首页与侧栏的工作区选择因此都使用页内目录浏览、路径输入和新建目录，继续经过官方 workspace adoption；不根据 Host 的 macOS 桌面环境启用系统窗口。既有 L2 使用同一正式 `restart-host` 入口应用当前装配，保留任务端口、profile 和数据，不手改任务配置。此 CLI 装配与 shipping Desktop 的 profile 装配分别维护，验收须分别覆盖 L2 与 Dev。

## 物化合同

- 唯一写入口是 `yarn omnimux:sync`，底层为 `scripts/sync-to-app.sh` → `scripts/sync-stable.sh`。禁止手工 rsync/cp 进任何 profile。
- 无目标参数时只写 Dev `~/.omnimux-dev`。`--prod`、`--all` 及 `~/.omnimux` 需要单独发布授权；显式绝对路径或 `~/` 目标必须原样解析并限定到该目标。
- 物化源固定在目标 profile 的 `.materialize-snapshots/plugins/`；`node_modules` 只由 pnpm 生成。依赖声明必须指向受管 snapshot，不得回指 profile `node_modules`、共享工作树或未受管旧源。
- 命名插件同步只构建/替换被点名插件，只读核验它依赖的现有 `dsh-ui-kit` 受管 snapshot；不得重建/覆盖 shared kit，也不得更新 Agent Presets、`app.asar` 或 `Info.plist`。
- 完整同步从权威 `dsh-ui-kit` 构建输入更新**既有**受管 snapshot，再物化全插件和 Agent Presets。首次建立缺失的稳定 kit/source 必须走官方完整 profile rebuild；同步不得从已安装 `node_modules` 反向回填。
- 任何受管 source 缺失、kit 漂移、未受管自引用、旧 `file:node_modules/...` 残留或已安装入口身份/文件校验失败，都必须在首次写入前失败；不得迁移、静默跳过或留下部分同步。
- `omnimux-workflow` 只跟踪 `src/`；`dist/index.js`、`lib/client.js`、`lib/canvas.js` 由 prepare/sync 现场生成。其它插件的跟踪策略按各包当前清单执行。

## 显式单包 tarball 纳管

- 纳管是既有 sync 链的互斥例外，不是普通 sync 的缺源修复旁路。四个输入身份参数全部必填，输入必须是外部绝对普通 `.tgz`/`.tar.gz`；不得混用命名插件、skip-build、批量、Prod/Base 或环境目标列表。
- Dev 必须是干净、与 origin/main 精确一致的 main；主理人持有 MQ receipt 并协调停止安装、配置编辑和 seed 克隆后执行。本次真实目标限定 `@crosery/dsh-viewer@0.1.0`。合并前仅允许显式任务根和相等 `OMNIMUX_ALLOW_UNMERGED_TARGET` 的 synthetic 样本。
- 安全归档、完整 source/installed payload、pnpm 锁节点/边与实际 peer/hoist 解析必须一致。目录重打包过滤成员、未知配置、native 产物丢失、缓存不足等均停止，不补 node_modules、不启 lifecycle、不更换包。
- pnpm 11.7.0 仅在 profile 内私有 candidate/store 工作：先生成候选锁并比较非目标解析，再允许已锁定公开 registry 包受控获取到同一私有 store，最后 `--frozen-lockfile --offline` 安装。目标输入仍只接受授权本地 tgz；凭据、未知 registry、git/任意 URL 依赖停止。各阶段禁脚本/配置执行，HOME/config/cache/state/global-dir/TMP 全私有，不写共享 store，不启 Corepack 自动下载或切版。提交只交换目标缺失 source、manifest、锁和整个 node_modules；保留旧图用于恢复，配置/数据/kit/presets 不进入写集。
- 普通 sync 与纳管共用稳定 flock。非终态 journal 阻止新同步，须经公开 `--recover-managed-tarball=<id>` 明确恢复；不得删除 journal 强行继续。多路径 rename 是可恢复事务，不宣称瞬时原子交换；恢复不完整时保留现场并返回失败。
- receipt 只能证明磁盘事务；严格 seed、真实 Host/L2、公共 App 重载与 viewer 交互分别验收。限值和完整故障矩阵见 [Issue #778 架构](../specs/issue-778-managed-tarball-architecture.md)。

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

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

本合同防止未合并源码、并行任务和生产 profile 相互污染。命令入口见 [ops-entry](ops-entry.md)，证据要求见 [plugin-qa](plugin-qa.md)，发布权限见 [plugin-git-pr](plugin-git-pr.md)。

## 开发与交付顺序

隔离 worktree 中的相关自动化测试、静态检查与独立评审 → PR required CI / Merge Queue → 合入 `main` → 按变更面物化 Dev、运行与验收。**不存在合并前独立 App/Host 测试环境，不得换名保留。** 自动化测试可使用进程、临时目录和合成 fixture；这些不是独立部署环境，也不证明 Dev 通过。物化（sync）成功不等于交付完成：凡涉及插件物化或 Host 改动的任务，必须在物化中通过内置启动演练预检（`verify-profile-preflight.mjs`）并取得 Host 真实运行与探活证据（如 HTTP 探活或 `verify:live` / CDP 探针），拿不到 Host 正常运行证据，不得在交接日志中宣布收尾。预检以普通 Node 运行，而宿主自带包（`@deepseek-ai/*`）只存在于桌面 App 的 `app.asar` 内：预检在解析不到这些包时按 `module.registerHooks()` 注入只保签名的最小替身，并在摘要中如实标注替身介入次数。

| 位置 | 用途 | 载体 | 代码形态 |
|---|---|---|---|
| Worktree | 合并前源码检查、自动化测试与独立评审 | 仓内隔离任务 worktree | 源码/测试 fixture，无 App 物化 |
| Dev | 合并后日常物化与适用运行验收 | `~/.omnimux-dev/profiles/omnimux`，Dev App/Host `45120` | 已合并 `main` 的物化副本 |
| Prod | 正式运行 | `~/.omnimux/profiles/omnimux`，OmniMux App `44200` | 仅独立发布授权后的物化副本 |
| Base | 官方底座 | `~/.dsh` | 不接收 OmniMux 日常交付 |

Dev 与 Prod 都不得 link 工作树或接收未合并产物；没有未合并运行物化旁路。纯文档、流程、脚本和不影响已安装运行时的测试任务无需 App 物化或浏览器验收。运行行为变更合并后使用干净且 HEAD 精确等于本次成功 fetch 的 `origin/main` 的源码树（支持主检出、命名分支或 detached HEAD 的 linked worktree），默认同步到 Dev，在 45120 验证；普通交付不得自动追加 `--prod`、`--all` 或正式包发布。普通同步在构建与目标写入前显式 fetch `refs/heads/main` 到 `refs/remotes/origin/main`；非 Git 源、状态读取失败、dirty（含 staged/untracked）、remote 缺失、fetch 失败、远端 main 缺失及 HEAD ahead/behind/diverged 均拒绝。

原 L2 生命周期、端口池、env/guard/gates 及其专属稳定 baseline D/C/S 迁移已退役；[历史规格](../specs/2026-09-09-stable-baseline-migration.md)不再定义执行前提。历史失败和 QA 证据保持原样，不因流程变化改成通过。

## 物化合同

- 唯一写入口是 `yarn omnimux:sync`，底层为 `scripts/sync-to-app.sh` → `scripts/sync-stable.sh`。禁止手工 rsync/cp 进任何 profile。
- 所有同步必须由干净 `main` 执行，HEAD 精确等于最新 `origin/main`，source 真实路径等于该仓根的 `plugins/`；不接受未合并放行或另一 worktree 的 source。
- 无目标参数时只写 Dev `~/.omnimux-dev`。`--prod`、`--all` 及 `~/.omnimux` 需要单独发布授权；自定义 DSH home 目标统一写其 `profiles/omnimux`，不得据此创建合入前测试环境。
- 物化源固定在目标 profile 的 `.materialize-snapshots/plugins/`；`node_modules` 只由 pnpm 生成。依赖声明必须指向受管 snapshot，不得回指 profile `node_modules`、共享工作树或未受管旧源。
- 命名插件同步只构建/替换被点名插件，只读核验它依赖的现有 `dsh-ui-kit` 受管 snapshot；不得重建/覆盖 shared kit，也不得更新 Agent Presets、`app.asar` 或 `Info.plist`。
- 完整同步从权威 `dsh-ui-kit` 构建输入更新**既有**受管 snapshot，再物化全插件和 Agent Presets。首次建立缺失的稳定 kit/source 必须走官方完整 profile rebuild；同步不得从已安装 `node_modules` 反向回填。
- 任何受管 source 缺失、kit 漂移、未受管自引用、旧 `file:node_modules/...` 残留或已安装入口身份/文件校验失败，都必须在首次写入前失败；不得迁移、静默跳过或留下部分同步。
- `omnimux-workflow` 只跟踪 `src/`；`dist/index.js`、`lib/client.js`、`lib/canvas.js` 由 prepare/sync 现场生成。其它插件的跟踪策略按各包当前清单执行。

## 显式单包 tarball 纳管

- 纳管是既有 sync 链的互斥例外，不是普通 sync 的缺源修复旁路。四个输入身份参数全部必填，输入必须是外部绝对普通 `.tgz`/`.tar.gz`；不得混用命名插件、skip-build、批量、Prod/Base 或环境目标列表。
- Dev 必须是干净、与 origin/main 精确一致的 main；主理人持有 MQ receipt 并协调停止并发安装和配置编辑后执行。本次真实目标限定 `@crosery/dsh-viewer@0.1.0`。合并前仅在自动化测试的合成文件系统 fixture 验证，不操作实际 Dev/Prod 或另建运行环境。
- 安全归档、完整 source/installed payload、pnpm 锁节点/边与实际 peer/hoist 解析必须一致。目录重打包过滤成员、未知配置、native 产物丢失、缓存不足等均停止，不补 node_modules、不启 lifecycle、不更换包。
- pnpm 11.7.0 仅在 profile 内私有 candidate/store 工作：先生成候选锁并比较非目标解析，再允许已锁定公开 registry 包受控获取到同一私有 store，最后 `--frozen-lockfile --offline` 安装。目标输入仍只接受授权本地 tgz；凭据、未知 registry、git/任意 URL 依赖停止。各阶段禁脚本/配置执行，HOME/config/cache/state/global-dir/TMP 全私有，不写共享 store，不启 Corepack 自动下载或切版。提交只交换目标缺失 source、manifest、锁和整个 node_modules；保留旧图用于恢复，配置/数据/kit/presets 不进入写集。
- 普通 sync 与纳管共用稳定 flock。非终态 journal 阻止新同步，须经公开 `--recover-managed-tarball=<id>` 明确恢复；不得删除 journal 强行继续。多路径 rename 是可恢复事务，不宣称瞬时原子交换；恢复不完整时保留现场并返回失败。
- receipt 只能证明磁盘事务；合并后 Dev Host、公共 App 重载与 viewer 交互分别验收。限值和完整故障矩阵见 [Issue #778 架构](../specs/issue-778-managed-tarball-architecture.md)，其中旧环境流程以本合同为准。

### #839：#765 viewer 精确转换例外

既有同版本同 payload 纳管规则保持。额外转换只允许已受管 viewer `0.1.0` 到 `0.1.1-omnimux.765.1`，新归档 SHA256 固定 `555346d3469bd7e11b9453f8beaa0c09de28d695dd6ed2cddbdc875952264a31`，来源 `https://github.com/Crosery/dsh-viewer.git` / `ccfc0a7c6cfa692aa737f48d9e8c97c41db82950`；不是任意升级或首次装包能力。

- 在原 managed 参数外成套提供 `--expect-before-tarball`、`--expect-before-version`、`--expect-before-sha256`、`--expect-before-receipt`、`--expect-source-repo`、`--expect-source-commit`、`--expect-qa-receipt`、`--expect-qa-sha256`。旧 archive 必须从原来源取得并实时验证，不得从已安装目录重打包。QA 报告哈希及内容绑定新版本、归档和 source commit。
- before 用旧归档完整清单，candidate/new 用新归档完整清单；只有唯一目标节点 version/payload/经归档证明的 peer range 可变化。所有非目标锁字段、节点、字节/模式、边、实际 peer provider、可见性、optional 和 bin 均冻结。私有 candidate 严格 peer 安装失败即停止，不扩大 acquisition。
- v2 journal 将旧目标 source 移至自身 old-generation，再发布候选 source；既有 manifest/lock/整个 node_modules 事务不变。未终态故障逆序恢复全部四项，无需原 tgz 或网络；v1 恢复兼容。共享 Dev main/MQ/协调窗口门禁不变，未合工具不能操作 Dev。
- `recover(COMMITTED)` 仅清理自有 scratch，不退版。提交后反向转换须带 `--expect-reverse-receipt`，精确绑定同 profile 的成功正向 receipt，以其 after 为 before、其 before 为新输入；重新构建和验证候选，不允许任意降级。旧原 tgz 必须仍可读取。
- 幂等需 live source/installed/lock 全图和同一转换 receipt 同时匹配；仅相同 version 或历史 receipt 不够。转换后仍分别验 Dev Host 和 #765 ego；磁盘成功不替代运行验收。

## 刷新与重启

- 构建 watcher 只产出构建文件，不代表 Host 已加载，也不承诺 HMR。Client 物化后在指定 Dev 页面或窗口刷新；Host 变更只有在目标进程重新加载后才生效。
- Dev 重启按 [Git/PR 授权边界](plugin-git-pr.md#授权边界)执行：Agent 核实目标身份、状态可恢复性及占用冲突；无冲突时自主执行并复核，有冲突时只协调该冲突。Prod 保留生产授权边界，不得默认 `pkill` 未确认目标。
- 只有壳层/平台门控改动需要额外 Electron renderer/CDP；普通 Web/Stage 以合并后 45120 的 ego-browser 与共享 `verify:live` 证据为准。

## 数据与诊断边界

- 自动化测试使用合成数据；涉及真实数据的 Dev 验收限定授权范围，不反向写 Prod。密钥不得写入仓库或证据。
- `pnpm doctor` 当前实现仍以 `${DSH_HOME:-~/.dsh}/profiles/omnimux` 作为所谓生产检查目标；它不能单独证明当前 Prod `~/.omnimux` 或 Dev `~/.omnimux-dev` 合规。报告必须写明实际检查路径，直至实现修正。
- Host 日志、PID、端口、profile、已合并源码与物化版本是运行身份的一部分。只看 HTTP 200 或“进程存在”不能证明目标版本已加载。

## 桌面壳与上游

日常入口仓库是 `/Users/x/Desktop/Project/omnimux-desktop-fork`。壳的上游同步、stage 和打包遵循该仓 `docs/contracts/upstream-sync.md`；这些是独立高风险/发布流程，不是插件日常交付步骤。归档壳 `/Users/x/Desktop/Project/omnimux-desktop` 只读，不得恢复为运行真源。

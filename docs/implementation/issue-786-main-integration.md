# Issue #786 — 最新 main 工程集成

## 结论

**Engineering IS_PASS: YES。新集成代码树完整 gates 149/149（4 suites）、独立路径 guard QA 17/17、repeat 4/4、Stage 10 components / 8 targets；全部 exit 0，零失败/取消/跳过。** 全局跨文件一致性检查 PASS，未发现本次集成需要修复的源码问题。

本轮只新增 `package.json:test:gates` 中的 `scripts/guard-worktree.qa.test.mjs` 路径及本报告；将此前获授权、已独立验收的完整 owned diff 提交并无冲突 rebase。未更改断言或再改生产代码。未执行 push、PR、CI、Merge Queue、main 工作区更新、hook 激活、App/Dev/Prod 物化或子代理委派。结果供主理人安排**独立快速整合复核**，不是独立 QA 签收或 Issue 关闭。

## 授权与读取

- 工作树：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-non-git-guard-786`。
- 分支：`agent/common-non-git-guard-786-issue-786`，不是 main；origin 为 `https://github.com/omnimux-ai/omnimux-dsh.git`。
- 沿用用户 2026-09-08 19:41 最小 guard 修复授权；sync 单点来自 #778 已获授权的普通安装修复，由主理人授权先行提取到 #786。不引入 managed-tarball 模块或新 gate 改造。
- 当前指令明确允许提交本任务 owned 文件及 rebase，明确不允许本代理 push/PR/MQ/Dev/main hook 生效。
- 完整读取最终 [QA142](../qa/issue-786-final.md) 143 行、三份工程报告 [135](issue-786-non-git-guard.md) 84 行、[138](issue-786-gates-alignment.md) 119 行、[140](issue-786-sync-repeat-install.md) 72 行，以及 [QA139](../qa/issue-786-non-git-guard.md) 121 行。
- 完整读取 tracked diff、新 guard QA/repeat 测试、guard 源码、Stage capture、live QA、Alpha、targets、sync-stable、gate aggregator、原/私有 presets 与安全适配器。核对 Git/PR、QA 适用矩阵及上游 Market 变化。

## 精确 Git 身份与 dirty

| 阶段 | Commit SHA | Tree SHA |
|---|---|---|
| 入场固定 HEAD | `59c19cdfb15b20556086c2255f3e43d019d66dd4` | `87eb6b4734f2f4415c577230fac5ed9a5fc76659` |
| 注册17项后、rebase 前 owned task commit | `ef2fbaefceda0ed1171850175b7bb30012154c8e` | `7c7d6f4a6a08d1da263f95359b959f1882a6fbe3` |
| fetch 得到的准确 origin/main | `fbaaca681fd36f2bfd3b936d19700252083ab598` | `8566c2690154ced3a49c2baba9dd5eb0a72fd9b1` |
| rebase 后、实际全部测试代码目标 | `2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765` | `92e05fcd00621439a01b07346c62951563c15561` |

入场 `git status --short --branch -uall` 是 **7 modified + 7 untracked**，无预先暂存内容：

```text
 M package.json
 M scripts/guard-worktree.mjs
 M scripts/guard-worktree.test.mjs
 M scripts/live-qa.test.mjs
 M scripts/live-stage-contracts.mjs
 M scripts/sync-release-policy.test.mjs
 M scripts/sync-stable.sh
?? docs/implementation/issue-786-gates-alignment.md
?? docs/implementation/issue-786-non-git-guard.md
?? docs/implementation/issue-786-sync-repeat-install.md
?? docs/qa/issue-786-final.md
?? docs/qa/issue-786-non-git-guard.md
?? scripts/guard-worktree.qa.test.mjs
?? scripts/sync-repeat-install.test.mjs
```

这些14文件逐一显式 `git add -- <paths>`，提交共1055 additions / 29 deletions；未使用宽泛 `git add .`、未带 ignored 证据、node_modules 或其他 workspace。rebase 前后及测试前后 tracked/untracked 工作树均干净（ignored 测试材料仍保留）。本报告作为随后独立文档提交，因此测试绑定上述代码树，不冒称实际重跑了文档提交；文档提交的准确最终 SHA/tree 由交付回执及 `git log -1 --format='%H %T'` 读取，避免报告自引用哈希。

执行 `git fetch origin main` 后 `git rebase origin/main` 成功，无冲突、无丢弃/源码合并修正；不需要进入冲突解决流程。精确 range-diff：

```sh
git range-diff 59c19cdfb15b20556086c2255f3e43d019d66dd4..ef2fbaefceda0ed1171850175b7bb30012154c8e fbaaca681fd36f2bfd3b936d19700252083ab598..2cd0338097d0c2ca59ba56d4b19aaf3c3ee30765
```

```text
1:  ef2fbaef = 1:  2cd03380 fix(common): classify non-git writes and restore sync entries (#786)
```

上游四提交 `ac760e90` / `06dc1d6c` / `8a39dfbf` / `fbaaca68`（PR #787–#790）仅涉及 Market 与其文档，共13文件；新会话/工作区、contenteditable 安全预填、顶栏和精选数据全部保留。`git diff --exit-code origin/main HEAD -- plugins pnpm-lock.yaml` 为0；全部 task scripts/package 与 rebase 前 commit 比较也为0。上游 apply 新增 workspaces 注入可由现有受控 ctx 支持，原侧栏 rank/单 Tab/生命周期合同未变，最新 concat 客户端在本次 Stage/gates 实际执行，无产品源码修正。上游 UI 的实机验收不由此合同测试重新认证。

20:44 Asia/Shanghai `git ls-remote origin refs/heads/main refs/heads/agent/common-non-git-guard-786-issue-786` 只返回上述 main SHA，任务远端分支不存在。测试代码 diff `git diff --no-ext-diff --binary origin/main HEAD` SHA-256 为 `f8088e616293dc3fed8b002543179804ca70dfd1cbd34492b1195d8d70b487aa`（不含随后本报告）。

## 最小注册及证据复用

根命令在已有 repeat 路径之后仅追加 guard QA 文件，无新增 aggregator、选项、断言或 skip。QA142 的132是历史完整命令顶层计数，**没有包含17项**；本轮新命令实测149，不将 nested guard36/Alpha9/targets22继续加算。

原 guard 三文件哈希与 QA139/142 一致，保留53项局部审查结论的适用性；不在旧固定 base 再跑任何测试。本轮在最新集成树执行17项独立路径，并在新 gates 中实际登记它；既有36项仍由原 aggregator 真实 subprocess 执行。repeat也单独执行且在完整 gates 再执行，计数不重复累加。

## 安全环境与执行

复用工程135/140/QA142的私有环境，`env -i` 清除继承配置，环境值完整保存在 ignored `.workbuddy/sync-repeat-786/integration-results.json`；没有写外部 env/config 文件、安装共享依赖、重建共享链接或访问 registry。

- `QA_PRIVATE=/var/folders/s4/bq231_q12pg5k216kgk882d80000gn/T/non-git-guard-786-gates.Z5V5xt`；HOME/home、TMPDIR/scratch、XDG config/cache/state、npm user/global 两份空 npmrc、cache/store/global 与 Git ceiling 都沿用该私有根。
- `TOOLCHAIN=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/managed-tarball-778/.workbuddy/managed-778-t01`；PATH 顺序为其 `bin`、`/Users/x/.nvm/versions/node/v25.8.0/bin`、`/opt/homebrew/bin`、系统目录。两行 **pnpm** shim 只 exec 指定真实 Node/pnpm.cjs；Corepack 为 Node 安装的真实入口，不是该 bin 中不存在的 corepack shim。
- 真实 Node v25.8.0 / pnpm11.7.0；预检 Python 为 `/opt/homebrew/opt/python@3.14/bin/python3.14`，成功导入 `/opt/homebrew/lib/python3.14/site-packages/yaml/__init__.py`，未使用系统 Python。
- `COREPACK_HOME=$TOOLCHAIN/corepack`；`COREPACK_ENABLE_NETWORK=0`、`COREPACK_DEFAULT_TO_LATEST=0`、`COREPACK_ENABLE_AUTO_PIN=0`；`npm_config_verify_deps_before_run=false`、`npm_config_manage_package_manager_versions=false`、`npm_config_ignore_pnpmfile=true`、`CI=true`、`PYTHONDONTWRITEBYTECODE=1`。
- root node_modules 沿用 #778 的只读依赖输入软链；`NODE_PATH=/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/node_modules/.pnpm/dsh-ui-kit@file+..+..+personal+dsh-ui-kit_@deepseek-ai+dsh-client-ui-primitives@0.1.0-r_01b5a2d96805ee6fa669372349bfb5d4/node_modules`。真实物理 kit 闭包，不是 stub。
- 仅完整 gates 使用 `NODE_OPTIONS=--require=$PWD/.workbuddy/sync-repeat-786/safe-presets.cjs`；其他独立命令无适配器。适配器及私有副本均完整读后沿用，精确替换 presets argv 和 targets 硬编码 Corepack 路径，原样运行真实 spawnSync，不变更结果/安装选项/断言。副本仅 ROOT 和 `/Applications/` 两类替换，加载时逐字验证；目标 `absent-Applications` 全程不存在，真实 App 分支被物理隔离，不当作实机物化成功。

唯一后台作业 `bash-404` 于2026-09-08 20:42:07–20:44:08 Asia/Shanghai顺序执行并已收集，exit0；无遗留运行作业。没有失败测试轮次或重新放宽测试。

| 检查 | 实测 | 耗时 / 证据 |
|---|---|---|
| `node --test --test-reporter=tap scripts/guard-worktree.qa.test.mjs` | 17/17，1 suite，exit0，0 fail/skip | 5014.740084ms；`integration-guard-qa.log` |
| `node --test --test-reporter=tap scripts/sync-repeat-install.test.mjs` | 4/4，exit0，0 fail/skip | 7671.807792ms；`integration-repeat.log` |
| `corepack pnpm --config.verify-deps-before-run=false run verify:stages` | 10 components / 8 targets，exit0 | `integration-stages.log` |
| 同环境+安全适配器 `corepack pnpm --config.verify-deps-before-run=false run test:gates` | **149/149，4 suites，0 fail/cancelled/skipped/todo，exit0** | 107398.689084ms；`integration-gates.log` |
| `bash -n scripts/sync-stable.sh`；7个 owned JS 文件 `node --check` | 全部 exit0 | 工具输出 |
| `git diff --check origin/main HEAD` | exit0 | Git集成与测试后检查 |
| 实际 outgoing 路径调用 `deriveImpactMatrix` | L0 required；isUiChange=false；browser N/A | 工具输出 |

以上日志均在本树 ignored `.workbuddy/sync-repeat-786/`。完整 gates 中 Market11个直接用例、guard聚合、targets聚合、Alpha聚合均真实通过；nested成功 stdout仍被原 aggregator捕获，没有另声称本轮获得22/22或9/9独立TAP。实际测试文件顺序和原失败恢复断言保留。

## 哈希与只读快照

测试开始/结束14项输入 SHA-256逐一相等。相对QA142只有 package 注册变化；全部guard、Market/Alpha脚本、sync/repeat、targets、aggregator、锁、适配器/副本与其最终表相同。

| 输入/证据 | SHA-256 |
|---|---|
| `package.json` 新注册 | `cc79b1b7de92eec9a3139d4f8429db413a31dd5f9ac736a5774575408c64b651` |
| guard source | `2830eb4e3eccc1cae845846d3eb73c038927c5cd633172cc3c5f41e33e40ffde` |
| guard existing tests | `6355f8021706d2cb930ae73338e192cbc09fb0226a1ebb4774f055c347762002` |
| guard QA tests | `5ba2b31a3202a63bec1db2201830fe917530773d30517e6218c3e53fc82004ad` |
| safe-presets adapter | `f6c55bb32bcd6b622f42ce432c816fe20425c2cbcc23b991e46d9c3641ae16c4` |
| private presets copy | `e7121b7394c4d68c7ef27d96b2aa0bacc290635e9b684d81ae2c0a2b9bbb1a06` |
| integration guard QA log | `16d9b1e1d60d8f2438cbb268f48fa289c1ca6d1a0da023a2a7439661c861ac0b` |
| integration repeat log | `375bc8210b8ffdd12592babc2fa51a1c72e4c497de776eef5f522fe1d2a43475` |
| integration Stage log | `f9fb50948bea9b6c707c23cb5e23089b8bd6d091f39109f0d3948d848d3b1388` |
| integration gates log | `4da837ff723c78adb47104d23f4dca32b7e07ad56cec59ed8c47cfbbac54c8bb` |

递归只读快照覆盖 #778 Corepack cache 和两实际App各两个 presets 路径，记录路径、POSIX mode、size、mtime、symlink target、文件内容SHA或absent；前后618项严格相等，快照摘要均为 `c4c4be14d41d6500ddbe7f3f4b1bb6c1e827cc9e44e32b15436b231ebcfd994e`。此证据只证明所检路径未变，不是整个App/机器的完整审计。实际安装只发生于原测试设计的私有 synthetic profiles。

## 一致性、适用性与交接

全局跨文件一致性 PASS：public boolean API及内部四状态兼容；目标canonical化和Git元数据错误保守拒绝不变；non-Git allow不授予跨workspace写权限。Market真实监听器/注册与最新受控Host合同兼容；其他七目标六方法与disposer要求保留。sync只对原安装进程禁用optimistic repeat，原frozen=false、备份恢复和完整fingerprint verifier均保留；普通sync不是frozen安装。新登记路径真实存在，无新增依赖或重复实现。

| 层 | 状态与理由 |
|---|---|
| 脚本/Git/文件系统及真实pnpm隔离集成 | PASS，绑定最新rebase代码树 |
| Stage合同 | PASS；JSDOM/受控Host seats，不等于ego-browser实页 |
| L2 Host / ego-browser / Electron | N/A，不是PASS：本任务outgoing没有产品客户端/Host/壳层改动；真实运维依赖已由隔离真实进程覆盖 |
| CI / PR / MQ / main hook / Dev/Prod | 未执行，协调者所有；不自动扩张授权 |
| 独立快速整合复核 | 待主理人安排，重点为新main适用性、149注册、range-diff、环境安全及报告文档增量 |

下一owner为主理人：完整读本报告，委派独立快速整合复核；通过后由主理人处理push/PR及后续required CI/Merge Queue。不得以旧固定base QA替代当前整合复核，亦不必重跑无变化旧固定base内容。#778的shared backup、交易与真实Dev责任未因本任务完成而消失。任务树和证据保留，尚不具备清理或关闭Issue的状态。

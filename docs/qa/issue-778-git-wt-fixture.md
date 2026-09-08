# Issue #778 — git-wt 独立 QA 夹具修复

## 状态与范围

- 状态：独立夹具修复完成；Round 1 Routing：QA，Round 2 / 最终 Routing：NoOne。本结论仅覆盖 git-wt fixture，不是 #778 全量 QA 签收。
- 固定 base / 当前 HEAD：`580234923268673562cacb5cd01aebdb780339e1`。
- 目标：当前工作树未提交增量中的独立测试夹具修复，不是 #778 全量验收。
- 唯一源码写集：`scripts/git-wt.test.mjs`；报告：`docs/qa/issue-778-git-wt-fixture.md`。
- 已完整读取 `docs/implementation/issue-778-t01-followup.md`（92 行），重点为第 62–76 行。历史 gates 127/128 和 base 复现来自该报告，不冒充本轮执行。
- 不修改生产脚本、断言语义、package/依赖及其他工程代理文件；不派代理、不等待并行工程、不执行 workspace install、全量 gates、实际 commit/push/merge、真实 Dev/L2/Prod/官方或其他 workspace 操作。
- 测试原有临时 Git 仓库、提交和本地 bare remote 推送仅在任务 TMP 内作为 fixtures 运行；现有 dev-env/sync mocks 不代表真实环境验收。

## 环境与两轮验证计划

所有测试先 `source .workbuddy/managed-778-t01/env.sh`，沿用 T01 私有 pnpm11.7/HOME/config/TMP，关闭自动版本下载与依赖验证安装。任务日志保存到已有忽略目录 `.workbuddy/managed-778-t01/`，使用 `git-wt-fixture-qa-` 前缀。

1. Round 1：原文件定向运行 `aborts finish when gate test fails`，记录原断言失败和退出码。
2. 最小修复：`setupSandbox()` 在初始 Git 提交前创建自身 `pnpm-workspace.yaml`，声明 `plugins/*`，派生 worktree 自然继承。
3. Round 2：运行 `scripts/git-wt.test.mjs` 全文件，记录精确测试数、退出码和 failing script 真实执行证据；若仍失败，停止并报告 Known Issues，不进行第三轮。
4. 静态核验：限定写集 diff、原断言不变、`git diff --check`。

## 执行结果

### Round 1 — 已复现，Routing：QA

- 命令：`node --test --test-reporter=tap --import "$hook" --test-name-pattern='aborts finish when gate test fails' scripts/git-wt.test.mjs`。
- `$hook` 为进程内 data URL 诊断观察器：调用原始 `execSync`，仅对 `finish failing-gate 102` 的失败打印原 status/stdout/stderr，再原样抛出异常；不改变命令、环境、返回值、错误或断言，不落盘辅助脚本。
- Node `v25.8.0`；`pnpm --version`、`corepack pnpm --version` 均 `11.7.0`；pnpm 路径确认为 T01 私有 `bin/pnpm`。
- 结果：tests **1**，suites **1**，pass **0**，fail **1**，skip/cancel/todo **0**，**exit 1**（日志 `QA_ROUND_1_EXIT=1`）。
- 原失败位置：`scripts/git-wt.test.mjs:238`；测试定义位置 `:206`。预期 stderr 包含“门禁测试失败”或“已阻断主干合并”，实际仅出现“缺少 L2 独立环境验证记录”。
- 原始 stdout：`No projects matched the filters in "…/.workbuddy/managed-778-t01"`，随后“本地门禁测试全绿通过”；真实 failing script 没有被执行。
- 归因：`setupSandbox()` 未提供 workspace 边界。生产门禁和原断言保持正确，修复路由为 QA，不交 Engineer。
- 完整证据：`.workbuddy/managed-778-t01/git-wt-fixture-qa-before.log`。

### 最小改动

`setupSandbox()` 在 fixture 初始提交之前新增三行（含注释及空行），位置 `scripts/git-wt.test.mjs:116–118`：

```js
// 隔离嵌套 TMPDIR 中的父 workspace；派生 worktree 继承此边界。
writeFileSync(join(mainRepo, 'pnpm-workspace.yaml'), 'packages:\n  - "plugins/*"\n')
```

声明随 fixture 初始提交进入派生 worktree，pnpm filter 在自身 workspace 中匹配真实 `plugins/omnimux-workflow`。没有增加 skip flags、改动现有 mocks 或替换 pnpm，没有删除、放宽或新增断言。

### Round 2 — 全文件通过，Routing：NoOne

- 命令：`node --test --test-reporter=tap --import "$hook" scripts/git-wt.test.mjs`，沿用 Round 1 同一只观察、不改变语义的诊断 hook。
- 结果：tests **14**，suites **2**，pass **14**，fail **0**，skip/cancel/todo **0**，**exit 0**（日志 `QA_ROUND_2_EXIT=0`）。耗时 `3923.46375ms`。
- failing-gate 真实执行证据：`[ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] omnimux-workflow@1.0.0 test: echo "TEST_FAIL_REASON" >&2 && exit 1`；stderr 包含 `TEST_FAIL_REASON` 及“门禁测试失败！已阻断交付”；finish 子命令 exit **1** 是预期负例成功，不是 runner 失败。
- 原“现场保留 / main 未吸收失败提交”断言通过；成功脚本 `omnimux-workflow test pass` 也实际执行。独立 L2 缺记录阻断、显式 skip 行为及原 dev/clean mock 生命周期测试均通过。
- pnpm 输出还包含 `Scope: all 2 workspace projects / Already up to date / Done … using pnpm v11.7.0`。这属于隔离的无依赖 fixture 运行，未显式执行 `pnpm install`，不应将证据表述为“pnpm 没有自动依赖检查”。没有进行任务仓 workspace install、安装共享依赖或更改环境配置。现有私有 pnpm shim 直接 exec 真实 11.7.0 `pnpm.cjs`，不是假成功包管理器。
- 完整证据：`.workbuddy/managed-778-t01/git-wt-fixture-qa-after.log`；两份日志均通过 `git check-ignore` 确认为忽略文件。
- 覆盖范围：该文件全部 14 个既有测试；未采集行/分支覆盖率，不能推导全仓覆盖率。

### 静态与边界核验

- `git diff --check -- scripts/git-wt.test.mjs docs/qa/issue-778-git-wt-fixture.md`：exit **0**。
- `git diff -- scripts/git-wt.test.mjs`：唯一增量为 workspace 写入及说明，原断言逐字未变。
- `git diff --exit-code 580234923268673562cacb5cd01aebdb780339e1 -- scripts/git-wt.sh`：exit **0**，生产 git-wt 与固定 base 相同。
- 完成时 HEAD 仍为 `580234923268673562cacb5cd01aebdb780339e1`；本任务不建立提交、不操作实际远端，不改其他工程写集。

### 可复现诊断 hook

在任务根先 source T01 env，然后设置以下变量。该 hook 只为日志保留原测试捕获的 stdout/stderr，不属于交付源码：

```bash
source .workbuddy/managed-778-t01/env.sh
hook=$(node --input-type=module -e 'process.stdout.write("data:text/javascript," + encodeURIComponent(`import cp from "node:child_process"; import { syncBuiltinESMExports } from "node:module"; const original = cp.execSync; cp.execSync = function(command, options) { try { return original.call(this, command, options); } catch (error) { if (String(command).includes("finish failing-gate 102")) console.error("QA_OBSERVE_FINISH", "exit=" + error.status, "stdout=" + String(error.stdout || ""), "stderr=" + String(error.stderr || "")); throw error; } }; syncBuiltinESMExports();`))')
node --test --test-reporter=tap --import "$hook" scripts/git-wt.test.mjs
```

普通回归入口仍为 `node --test scripts/git-wt.test.mjs`；本轮实际执行的是上方带观察日志的全文件命令，未另跑第三轮。

## Known Issues / 后续 owner

- 本写集没有剩余失败；独立 fixture 修复可以交回主理人集成。
- 按授权未运行全量 `test:gates`，避免读取并行工程修改中源码。不能据此把历史 127/128 更新成实际 128/128。
- 最终集成 owner 在工程收敛后执行同状态全 gates 和 #778 其余验收。本任务不证明真实 L2/Dev/Prod、Host 业务或 managed-tarball 全工程通过，不声明 #778 可关闭。

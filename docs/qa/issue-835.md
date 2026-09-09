---
title: "QA 验收与门禁修复报告：Issue #835 稳定基线迁移文档先行（PR-D）"
id: "qa-issue-835"
type: "evidence"
status: "accepted"
authority: "L2"
date: "2026-09-09"
updated: "2026-09-09"
authors: ["edward"]
subsystem: "global"
tags: ["qa", "issue-835", "baseline", "pr-d", "gate-remediation", "is-pass"]
---

# QA 验收与门禁修复报告：Issue #835 稳定基线迁移文档先行（PR-D）

- **任务 / Issue**：#835（父 Issue #834 稳定基线迁移）
- **工作树**：`/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/.worktrees/common-stable-baseline-prd`
- **基线 commit (base/HEAD)**：`a4926bc90074f179de2ed1dfddeb3796b148d228`
- **审查角色**：Edward (QA Engineer)
- **审查日期**：2026-09-09
- **验收判定**：**IS_PASS: YES（完整合入门禁已恢复并 100% 全绿通过）**

---

## 1. 最终结论与判定依据

**IS_PASS: YES。**

在复用后端 subagent-35 已建立的离线依赖、Corepack 缓存、Python 3.14 及双架构 CPython 私有环境基础上，成功定位并完成两处阻断测试 fixture 的最小隔离修复：
1. **完整门禁命令**：`pnpm test:gates`（清单内 12 个测试入口原封不动）
2. **完整门禁执行结果**：
   - 统计计数：**149 tests / 4 suites / 149 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**
   - 退出码：`0`（EXIT 0）
   - 执行耗时：`154964.077667 ms`
3. **约束保持**：
   - 0 处产品 guard 修改（严禁修改产品 guard）；
   - 0 处断言禁用或弱化；
   - 0 处分支保护或干净仓门禁削弱；
   - 真实工作分支（`agent/common-stable-baseline-prd-issue-835`）未被篡改，全部 fixture 运行于任务树内，未写入外部目录或 Dev/Prod 环境；
   - 未执行未经授权的 git commit/push，等待主理人最终集成。

---

## 2. 阻断测试 Fixture 根因与最小修复实施

此前完整门禁运行产生 133/131/2 失败（2 项失败测试），根因均属于**测试 fixture 缺少对任务树环境的隔离适配**，而非产品生产代码缺陷：

### 2.1 guard 非 Git fixture 继承仓内 TMPDIR 父 Git 修复

- **失败现象**：
  `scripts/guard-worktree.qa.test.mjs:31` 处 `git rev-parse --show-toplevel` 实得 `0`，预期 `128`。
- **根因分析**：
  为遵守“全部 fixture 在任务树内、不污染外部目录”的安全要求，测试环境将 `TMPDIR` 设定在当前任务树的私有目录内（`.workbuddy/issue-835-gate-fixtures/`）。`guard-worktree.qa.test.mjs` 在初始化其 `nonGit` 目录时，原代码执行了 `for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key]` 彻底清空了所有 Git 环境变量。导致在 `nonGit` 目录中运行探测命令时，Git 没有收到任何天花板阻断，沿目录层级一路向上追溯，穿透并发现了当前任务树的父级 Git 仓库（返回 0）。
- **最小修复方案**：
  在清除外部污染变量后，显式为 `env` 注入合法的天花板环境变量：
  ```javascript
  env.GIT_CEILING_DIRECTORIES = root
  ```
  通过标准的 Git ceiling 机制，显式隔断对任务树父级 Git 仓库的发现。
- **验证结果**：
  `scripts/guard-worktree.qa.test.mjs` 包含的 17 项独立 non-Git QA 测试用例全部 PASS（17/17 pass）。

### 2.2 Alpha fixture 继承真实非 main 分支保护拒绝修复

- **失败现象**：
  `scripts/sync-release-policy.test.mjs:191` 与 `scripts/sync-release-policy.test.mjs:224` 失败。报错：
  `❌ sync-to-app: 当前分支是 [agent/common-stable-baseline-prd-issue-835]，物化只允许在已对齐的 main 上执行。`
- **根因分析**：
  在测试 `sync-to-app.sh` 的生产同步策略时，测试将脚本与清单拷贝至临时目录 `runner` 与 `isolatedRoot`，但未为该临时目录初始化独立的 Git 仓库上下文。当 `sync-to-app.sh` 执行 `check_main_sync_preconditions()` 时，`git -C "$ROOT" rev-parse --abbrev-ref HEAD` 向上溯源至当前真实工作树，读取到当前真实分支 `agent/common-stable-baseline-prd-issue-835`。由于该分支非 `main`，触发了合法且严格的生产分支保护拦截。
- **最小修复方案**：
  不绕过 `sync-to-app.sh` 的保护检查，不设置旁路环境变量，而是在测试用例中为临时测试目录初始化**明确独立、合法 main 且 clean 的微型临时仓库**：
  ```javascript
  function initCleanMainRepo(dir) {
    const runGit = (args) => {
      const res = spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
        },
      })
      assert.equal(res.status, 0, res.stderr || res.stdout)
    }
    runGit(['init', '-b', 'main'])
    runGit(['config', 'user.email', 'qa@example.com'])
    runGit(['config', 'user.name', 'QA Fixture'])
    runGit(['add', '-A'])
    runGit(['commit', '-m', 'fixture: clean main'])
    runGit(['update-ref', 'refs/remotes/origin/main', 'HEAD'])
  }
  ```
  在两个执行 `sync-to-app.sh` 的测试用例（`runner` 与 `isolatedRoot`）准备阶段调用该初始化函数，使测试在完全隔离且合法的临时仓库环境中运行。
- **验证结果**：
  `scripts/sync-release-policy.test.mjs` 9 项测试用例全部 PASS（9/9 pass）；`scripts/verify-ci-gates.test.mjs` 21 项测试用例全部 PASS（21/21 pass）。

---

## 3. 新增测试与文档 PR 混入最小必需修复原因说明

本 PR（PR-D842，Issue #835）定义为**稳定基线迁移文档先行**。在本 PR 中混入上述 2 个测试文件的微小修改，具有充分的正当性与不可替代性：

1. **直接因果依赖与授权范畴**：
   本次修复属于已授权迁移的直接技术依赖，并非 PR-C 的基线产品逻辑实现。工作流门禁 `test:gates` 是保障全仓代码质量的硬性卡点，若测试 fixture 本身存在对运行环境目录的未隔离缺陷，文档先行 PR-D 将永远处于 `exit 1` 状态而无法合入。
2. **最小侵入原则**：
   修改严格局限在两个测试文件的 fixture 隔离环境设定，改动总计仅约 25 行代码；未改动任何生产脚本、未改动产品 guard、未引入任何第三方依赖。
3. **门禁严肃性与真实有效性**：
   修复通过标准 `GIT_CEILING_DIRECTORIES` 和真实临时 Git 仓满足了所有断言的前置条件，既不伪造结果，也不跳过检查，证明了产品代码现有的门禁机制（分支保护、dirty 检查、ceiling 隔断等）在严苛环境下均能精准运作。

---

## 4. 详细测试验证凭证链

### 4.1 定向测试验证

使用私有隔离环境脚本验证相关测试用例：
```bash
source .pnpm-store/issue-835-gate-env/env.sh
```

1. **guard QA 定向测试**：
   - 命令：`node --test scripts/guard-worktree.qa.test.mjs`
   - 结果：`ℹ tests 17 | ℹ pass 17 | ℹ fail 0 | duration: 5114.165959 ms`
2. **Release Policy 定向测试**：
   - 命令：`node --test scripts/sync-release-policy.test.mjs`
   - 结果：`ℹ tests 9 | ℹ pass 9 | ℹ fail 0 | duration: 86802.095042 ms`
3. **CI Gates 聚合测试**：
   - 命令：`node --test scripts/verify-ci-gates.test.mjs`
   - 结果：`ℹ tests 21 | ℹ pass 21 | ℹ fail 0 | duration: 191421.017959 ms`

### 4.2 完整门禁执行验证（`pnpm test:gates`）

在任务树下的同构验证副本（`.workbuddy/issue-835-gate-validation`）执行全套门禁：
- **入口命令**：
  ```bash
  (
    source .pnpm-store/issue-835-gate-env/env.sh
    cd .workbuddy/issue-835-gate-validation
    pnpm test:gates
  )
  ```
- **测试套件明细**：
  - `scripts/impact-matrix.test.mjs`
  - `scripts/authorization.test.mjs`
  - `scripts/qa-label.test.mjs`
  - `scripts/ci-verdict.test.mjs`
  - `scripts/verify-ci-gates.test.mjs`
  - `scripts/live-qa.test.mjs`
  - `scripts/ego-browser-page.test.mjs`
  - `scripts/live-page-preparation.test.mjs`
  - `scripts/ego-live-qa.test.mjs`
  - `scripts/live-runtime-proof.test.mjs`
  - `scripts/sync-repeat-install.test.mjs`
  - `scripts/guard-worktree.qa.test.mjs`
- **套件总计**：
  ```text
  ℹ tests 149
  ℹ suites 4
  ℹ pass 149
  ℹ fail 0
  ℹ cancelled 0
  ℹ skipped 0
  ℹ todo 0
  ℹ duration_ms 154964.077667
  ```
  **退出码：0**

---

## 5. 文件写集与交付状态

本轮 QA 产出仅包含以下 3 个文件：
1. `scripts/guard-worktree.qa.test.mjs`：添加 fixture 天花板隔离
2. `scripts/sync-release-policy.test.mjs`：添加独立临时 clean main 仓库初始化
3. `docs/qa/issue-835.md`：本验收报告

**代码库状态**：
- 未修改任何产品实现代码；
- 未执行 `git commit` 或 `git push`（根据协作纪律由主理人统一集成并推进 PR-D842 至 Ready for Review / Merge Queue）。

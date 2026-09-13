# 多智能体“全云端主干”硬门禁规范

**文件：** `specs/git-remote-hard-gates.spec.md` ｜ **优先级：** P0

## 1. 目标与背景
解决多智能体并发开发时，部分智能体私自在本地 `main` 执行 `git merge`、在本地 `main` 直接提交代码，或基于非 `origin/main` 状态签出工作树，导致本地主干领先远端、产生脏分叉并锁死其他任务物化通道的问题。

## 2. 硬门禁规则定义

### 门禁一：本地主干禁止执行合并 (No Local Merge on Main)
- **拦截目标**：工具 `bash` 执行命令中包含 `git merge`。
- **判定逻辑**：如果当前工作目录位于主仓库检出且当前分支为 `main`，直接返回 `permissionDecision: "deny"`。
- **拒绝理由**：
  `🚫【OmniMux 多 Agent 隔离守卫】严禁在本地主干执行 git merge！`
  `📌 核心守则：本地 main 分支为纯只读镜像，严禁私自合并。所有特性分支必须推送到远端，通过 GitHub PR 经 CI 门禁全绿后统一合并入 origin/main。`

### 门禁二：本地主干禁止直接提交 (No Direct Commit on Main)
- **拦截目标**：工具 `bash` 执行命令中包含 `git commit`。
- **判定逻辑**：如果当前工作目录位于主仓库检出且当前分支为 `main`，直接返回 `permissionDecision: "deny"`。
- **拒绝理由**：
  `🚫【OmniMux 多 Agent 隔离守卫】严禁在本地主干直接执行 git commit！`
  `📌 核心守则：本地 main 分支为纯只读镜像。请先调用: ./scripts/git-wt.sh start <plugin> <topic> 在独立工作树中开发并提交。`

### 门禁三：工作树新建强制绑定云端最新 (Enforce Origin/Main for Worktree Add)
- **拦截目标**：工具 `bash` 执行 `git worktree add`。
- **判定逻辑**：如果命令中未包含 `origin/main`（且非辅助子命令如 list/prune/lock），直接返回 `permissionDecision: "deny"`。
- **拒绝理由**：
  `🚫【OmniMux 多 Agent 隔离守卫】新建工作树必须显式以 origin/main 为唯一起点！`
  `📌 核心守则：严禁基于本地旧状态或脏分支签出工作树。请直接运行: ./scripts/git-wt.sh start <plugin> <topic>，或在命令末尾显式指定 origin/main。`

### 门禁四：物化双向对齐校验 (Strict Zero-Divergence Materialization)
- **拦截目标**：执行物化命令（`scripts/omnimux.mjs sync`, `pnpm sync`）。
- **判定逻辑**：不仅检查 `HEAD..origin/main` (behindCount == 0)，同时强制检查 `origin/main..HEAD` (aheadCount == 0)。
- **拒绝理由**：
  `🚫【OmniMux 多 Agent 防覆盖硬拦截】本地主分支领先于远程 origin/main（存在未推送的私有提交），严禁物化刷新！`

## 3. 验收用例表

| # | 场景 | 操作 | 预期结果 |
|---|---|---|---|
| 1 | 在本地 main 执行 git merge | 在主仓 main 分支执行 `git merge feature` | 🚫 物理拦截，提示所有合并必须走云端 PR |
| 2 | 在工作树分支执行 git merge | 在独立 worktree 分支执行 `git merge origin/main` | ✅ 放行允许（工作树内拉齐上游） |
| 3 | 在本地 main 执行 git commit | 在主仓 main 分支执行 `git commit -m "fix"` | 🚫 物理拦截，提示在独立工作树中提交 |
| 4 | 在工作树分支执行 git commit | 在独立 worktree 分支执行 `git commit` | ✅ 放行允许 |
| 5 | 手写未带 origin/main 的 worktree add | 执行 `git worktree add ../wt-test` | 🚫 物理拦截，提示必须以 origin/main 为基准 |
| 6 | 手写带 origin/main 的 worktree add | 执行 `git worktree add -b test ../wt-test origin/main` | ✅ 放行允许 |
| 7 | 本地 main 领先远端时尝试物化 | aheadCount > 0 时执行物化 | 🚫 物理拦截，阻止半成品代码编译进开发版 |

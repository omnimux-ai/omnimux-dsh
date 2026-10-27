# Spec: audit 把含未提交改动的 worktree 误判为可清理（#3829）

- Issue: #3829
- 风险级别: R1（巡检脚本判据修正，只读路径；可逆）
- base: `origin/main` @ `529c16243`

## 1. 目标与用户故事

维护者视角：`worktree.sh audit` 给出的「可清理」建议必须可信——照它执行不能丢掉未交付的工作。

用户故事：跑 `audit` 看到某任务标「可清理」→ 执行 `worktree.sh remove` → 该任务若有未提交的已跟踪改动，应先被标为保留，不该进可清理名单。

## 2. 根因（实测反例）

audit 判据只有 `rev-list --count origin/main..<branch> == 0`，只覆盖**已提交**差异。但本仓允许改动以未提交形式留在 worktree，所以 `ahead=0` 不等于「没活」。

实测反例 `gate-lockfile-guard`：

| 项 | 值 |
|---|---|
| 分支 | `fix/gate-lockfile-guard-issue-3821` |
| ahead | 0 |
| 未提交已跟踪改动 | `scripts/guard-worktree.mjs`、`scripts/guard-worktree.test.mjs`，与 main 差 156 行 |
| PR | 无 |
| audit 判定 | 「可清理」← **错误** |

照此清理会丢掉 `isFrozenInstall` 等 156 行未交付代码。

## 3. 实现设计

audit 增加一条前置判据：worktree 内存在**未提交的已跟踪改动**时，判为「保留：有未提交改动」。

两类脏状态必须区别对待：

| 状态 | 判定 | 理由 |
|---|---|---|
| 未跟踪的 `specs/*.md` | 不算「有活」，仍可清理 | 契约要求 spec 留在 worktree；ship 会先归档 |
| 已跟踪文件被修改（`git diff` 非空） | 「保留：有未提交改动」 | 真实未交付工作，删了就丢 |
| 未跟踪的非 spec 文件 | 保守起见也判保留 | 可能是新写的源文件/脚本，尚未 `git add` |

判定顺序（保持既有优先级）：分支是 `main` → 当前所在 worktree → **有未提交改动** → ahead>0 → 可清理。

## 4. 范围 / 非目标

范围：`audit_worktrees` 判据 + 对应断言。

非目标：改 ahead 判据本身；处置既有 worktree 归属；自动删除任何东西；改 ship 的清理路径。

## 5. 验收标准（可观察）

- [ ] 对含未提交已跟踪改动的 worktree，audit 输出「保留：有未提交改动」，不打印清理命令。
- [ ] 仅有未跟踪 spec 的已合并 worktree，仍判「可清理」。
- [ ] 含未跟踪非 spec 文件的 worktree，判「保留」。
- [ ] `pnpm test:gates` 通过；新增断言通过。

## 假设

- 假设 A：`git -C <wt> diff --quiet` 能可靠区分「已跟踪文件被修改」与「只有未跟踪文件」——前者非零退出，后者零退出。
- 假设 B：未跟踪非 spec 文件按保守原则判保留，不会挡住正常清理——正常交付时 worktree 只应剩 spec（其余都已提交）。

## 证伪方式

- 证伪 A：`git diff --quiet` 在仅有未跟踪文件时也返回非零 → 改用 `git diff --name-only` 的输出来判定，不依赖退出码。
- 证伪 B：发现正常交付流程会留下未跟踪非 spec 文件（如构建产物）导致 audit 永远报保留 → 收窄到「未跟踪且非构建产物目录」，并在 spec 记录收窄理由。

## 8. 证据计划

- 单测：`scripts/worktree-cleanup-3820.test.mjs` 增补断言；`pnpm test:gates`。
- 实机：对 `gate-lockfile-guard` 跑一次 audit，确认从「可清理」变为「保留：有未提交改动」。

## 9. 文档影响

`docs/contracts/dev-pipeline.md` 的「worktree 交付清理」小节里 audit 判据补一句「含未提交改动一律保留」。

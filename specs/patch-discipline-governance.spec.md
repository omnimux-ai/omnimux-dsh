# 补丁与兜底治理：从形态门禁转向证据与激励（#3491）

## 背景与问题

本仓已有三层反作弊设施，但都停在「可枚举形态」上：

- `scripts/guard-anti-cheat.mjs` 的 RULE-02/03 是正则：`mock*` 改个变量名即绕过；只拦 `catch { return { ok } }` 一种写法。
- `scripts/verify-silent-catch.mjs` 已有 SC1/SC2/SC3 扫描与豁免清单，但**只在 CI 告警（恒 exit 0）**，交付回路里没有它。
- `scripts/guard-quality-loop.mjs` 的规格门禁只验规格**存在**，不验内容；`docs/contracts/anti-agent-fake-completion-guard.md:104` 承诺的 `report_hard_blocker` 全仓只有一行文字。

结果是：隐性补丁（症状掩盖、空 catch、静默降级）没有短反馈信号，而「如实卡住」没有低成本出口——agent 的真实选项只剩「假装完成」和「硬扛到超时」。

## 假设

1. **主假设**：补丁偏好主要由「可检定信号」的结构决定，而不是由规则密度决定。只要把「新增静默兜底」变成提交时的可判定失败，并把「如实阻断」变成有产物的合格手交，agent 的行为分布就会移动；继续扩充正则清单不会。
2. **子假设 A**：提交时（`git commit` / `git push`）是比写时更合适的拦截点——写时无法区分「新增」与「存量」，会误伤存量代码，且拖慢每一次编辑。
3. **子假设 B**：规格里的「假设 + 证伪方式」是**人类评审信号**，不是自动正确性判据。门禁只保证它存在且非空，语义由评审负责；把它当判据会立刻退化成仪式。
4. **子假设 C**：阻断记录必须放进已追踪目录（`docs/evidence/blockers/`）才能跨会话与 PR 评审；同时必须显式排除出证据收集，否则它会伪装成验证证据。

## 证伪方式

若主假设成立，应能观察到：在同一个夹具仓库里，新增 `catch {}` 的提交被 deny，补一行日志后通过；规格缺 `## 假设` / `## 证伪方式` 时改 `plugins/*/src` 被 deny；`report-blocker` 生成的记录不满足 `hasEvidenceAfterSpec`。

可执行命令（本任务自身即用它验证，见 A1–A6）：

```
node --test scripts/guard-quality-loop.test.mjs scripts/verify-silent-catch.test.mjs scripts/report-blocker.test.mjs scripts/lib/silent-catch-delta.test.mjs
```

若该命令在实现后仍全绿、而上述三条 deny 行为在夹具里复现，则主假设未被证伪；若门禁只改了名字却能通过（例如把 `catch {}` 写成 `catch (e) { /* x */ }` 仍被放行），则说明本方案仍停在形态层，应回退 W3 而不是继续加规则。

## 用户关键操作旅程

1. 开发者（或 agent）在隔离 worktree 里改 `plugins/*/src`，规格没写假设/证伪 → 写入被 deny，报错直接给模板片段。
2. 补上两节后继续实现；提交时新增了 `catch {}` → `git commit` 被 deny，列出 file:line 与两条正确路径（加日志/throw，或写入豁免清单并给理由）。
3. 遇到外部依赖卡死（无权限、服务宕机、缺能力）→ 跑 `pnpm report:blocker`，生成结构化记录；任务以「阻断手交」结束，不被记成 pass，也不被记成失败。

## 可测验收标准

- A1 新增 `scripts/report-blocker.mjs`：校验 taskId/phase/attempts/evidence，落盘 `docs/evidence/blockers/<taskId>.json`；退出码 0/1/2 语义明确。
- A2 `guard-quality-loop.collectEvidenceFiles` 跳过 `blockers/` 子目录，并有专门测试证明阻断记录不计入 `hasEvidenceAfterSpec`。
- A3 新增 `scripts/lib/silent-catch-delta.mjs`：按 `path|rule|bodyKey` 计数做增量比对，行号漂移不误报；git/IO 异常返回 `error` 由调用方 fail-open。
- A4 `guard-quality-loop.decideQualityGate` 在交付命令分支：新增 SC1/SC2 → deny `new-silent-catch`；规格缺两节 → deny `spec-missing-assumption` / `spec-missing-falsifier`。
- A5 `.dsh/hooks.json` 不变（仍 5 条），不新增 PreToolUse hook。
- A6 新脚本登记 `scripts/governance-manifest.json`，workflow 增加 `node --check` 与测试调用；`node --test scripts/verify-governance-registry.test.mjs` 绿。
- A7 契约修订：三类行为判别、§3.5 指向真实脚本、新增日落条款；`docs/contracts/agent-issue-lifecycle.md` 承认阻断记录为合格手交。
- A8 `pnpm test:gates` 绿。

## 非目标

- 不做 guard/fallback 注册表（形态门禁套壳，改名即绕过）。
- 不把 patch ratio / 根因修复率做成门禁指标或 agent 可见反馈（Goodhart）。
- 不新增审批环节与新 hook。
- 不做反事实验证器（revert-in-worktree）——依赖供给未验证，另开 Issue。
- 不清理存量静默 catch，只拦增量。

## 新用户基线

本任务只影响仓库开发流程与 CI 门禁，不进入产品运行时，不产生用户机器上的新状态；新增脚本只用 Node 内置模块，不引入依赖。

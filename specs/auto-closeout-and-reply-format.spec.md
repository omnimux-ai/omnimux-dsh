# 自动收尾闭环与回复格式规范规格 (Issue #2806)

## 背景与问题定义
当前 Agent 协同研发流程中，存在以下阻碍自动收尾与清晰交付的缺陷：
1. **收尾工具拆分与误导性提示**：`worktree.sh ship` 仅执行 pull 和物化，然后打印 `PR MERGED; applicable Dev materialization auto-completed, human acceptance is pending. Worktree retained... After acceptance, run: worktree.sh remove...`，误导 Agent 停下来等待人工验收，导致临时工作树堆积、收尾未彻底完成。
2. **规则自相矛盾**：全局与仓库规范中一度出现「物化仅为可选」或「等待人工验收后再清理」的描述，与「改动合并后必须自动装进开发版 ~/.omnimux-dev」冲突。
3. **交付汇报缺失收尾五件套与下一步建议**：Agent 完成任务后常常省略关键收尾状态（PR 提交、主干合入、本地同步、开发版物化、工作树清理），且未主动给出建议下一步，导致用户需要反复追问确认。

## 核心目标与验收准则 (Acceptance Criteria)

### AC1: 规范契约对齐 (AGENTS.md & plugin-git-pr.md & omnimux-repo-workflow)
- 明确任务交付授权覆盖全链路：只要用户下达实施、修复或优化指令，默认覆盖从编写、隔离自测到收尾的全部动作。
- 任务验证通过后，自动依次完成：① 提交 PR 并经由 Merge Queue 合入主干 → ② 同步本地主干最新代码 (`git pull --ff-only`) → ③ 物化更新至开发版桌面端 (`~/.omnimux-dev`) 并热刷新 → ④ 彻底清理临时工作区与分支。
- 任务完结回复必须包含四项：
  1. 【当前结果】：1 句大白话业务结论；
  2. 【收尾状态】：单行明确列出“合并请求、合入主干、同步本地、物化开发版、清理临时工作区”五项动作的真实完成状态；
  3. 【实际效果】：说明对用户的实际好处与查看方式；
  4. 【建议下一步】：主动给出后续操作建议或推进方向。

### AC2: worktree.sh ship 升级为全自动收尾闭环
- `worktree.sh ship <task> --pr <pr-number>` 在核验 PR MERGED、pull 主干、执行 `auto_materialize_and_reload` 后：
  - 默认自动执行工作树移除与分支删除 (`git worktree remove` + `git branch -d`)，并执行 `git worktree prune`。
  - 输出明确大白话成功提示：`✅ 交付全链路闭环完成：PR 已合入、主干已同步、开发版已物化、临时工作树 [${task}] 与分支已清理。`
  - 支持可选参数 `--keep-worktree`，仅在显式传入该参数时保留工作树和分支，方便调试排查。
  - 移除原有的误导性提示 `human acceptance is pending` 与 `After acceptance, run: worktree.sh remove`。

### AC3: auto-pipeline 纠偏
- 更新 `scripts/auto-pipeline.mjs` 中 `handoffToAgent` 的 `nextAction` 描述，将 `Materialization is optional` 修正为必须自动物化开发版（除非显式传入 `--no-materialize`）。
- 同步更新 `scripts/auto-pipeline.test.mjs` 对应的单测断言。

### AC4: 测试覆盖与门禁
- 编写 `scripts/worktree-ship.test.mjs` 或在现有测试中新增断言，验证 `worktree.sh ship` 默认清理与 `--keep-worktree` 的逻辑分支。
- 全量运行 `node --test scripts/auto-pipeline.test.mjs` 及新增测试，100% 通过。

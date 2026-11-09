# Spec: 工作流后台等待与小改快车道

- 任务：`workflow-wait-fastlane`
- 日期：2026-11-09
- 状态：active

## 目标

把“等待 CI / 合并队列”从 Agent 前台 `sleep` 轮询改成单个后台等待任务；补充批量读取与纯展示小改快车道，减少会话时间消耗，不改变产品运行时行为。

## 技术范围

- 新增 `scripts/pr-wait.mjs`：以固定间隔轮询单个 PR，等待 `checks` 通过或 `merged` 完成，超时/失败以非零退出码结束；供 `bash` 的 `run_in_background` 使用。
- 新增 `scripts/pr-wait.test.mjs` 并登记到 `package.json` 的 `test:ci` 与 `scripts/governance-manifest.json`。
- 更新 `.agents/skills/omnimux-repo-workflow/SKILL.md`：等待规则、批量读取、小改快车道。
- 更新 `docs/contracts/plugin-git-pr.md` 与 `docs/contracts/plugin-qa.md` 的相应口径。

## 假设

- DSH 后台任务完成时会向 Agent 发送通知；Agent 能通过 `job_output` 读取退出码与输出。
- `gh pr view --json state,statusCheckRollup,mergedAt,mergeCommit` 足以判断 checks 与合并是否完成。
- 该脚本属于仓库开发工作流工具，不进入产品运行时，也不改变用户可见行为。

## 证伪方式

- 运行 `node --test scripts/pr-wait.test.mjs`；若任一 pending/pass/fail/merged/timeout 分支与实际不符，测试应失败。
- 用真实 PR 跑 `node scripts/pr-wait.mjs --pr <n> --until checks --interval 5`，确认进程在检查完成时退出，而不是持续占用模型回合。
- 检查 `git diff --check` 与文档链接；若 skill 或合同引用不存在的路径/命令，文档检查应失败。

## 验收标准

- `node --test scripts/pr-wait.test.mjs` 全绿。
- `pnpm test:ci` 全绿。
- skill/contract 的命令与链接可解析；`git diff --check` 通过。
- 产品包测试无需运行（无产品源码变更）。

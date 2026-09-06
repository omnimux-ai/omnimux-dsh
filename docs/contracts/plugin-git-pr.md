---
title: "plugin-git-pr — OmniMux 插件仓 Git / PR 与授权合同"
id: "contract-plugin-git-pr"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-24"
updated: "2026-09-05"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# plugin-git-pr — OmniMux 插件仓 Git / PR 与授权合同

本文件是风险定级、写操作授权、PR 合入和发布权限的唯一政策真源。Issue 生命周期、QA 与环境合同只引用本文件，不复制风险表或授权规则。执行步骤按需加载[仓库 workflow skill](../../.agents/skills/omnimux-repo-workflow/SKILL.md)。

## 仓库与分支边界

| 项 | 合同 |
|---|---|
| 仓库 | `omnimux-ai/omnimux-dsh`，remote `origin`，默认分支与 PR base 均为 `main` |
| 工作目录 | 当前仓库根或其派生 worktree；外层 `dsh-plugin/` 不是 Git 仓库 |
| 分支 | `agent/<plugin>-<topic>-issue-<id>`；跨插件使用 `agent/cross-<topic>-issue-<id>` |
| Worktree | 每个并行实施任务独立 worktree；主工作区保持干净 `main` |
| 合入 | 禁止直推或本地 merge 到 `main`；所有合入通过 GitHub Merge Queue |

缺少 Issue 或 PR 不得成为把工作步骤交回用户的理由。任务已获相应共享状态写入授权时，Agent 负责创建、补全并维护所需 Issue、分支、worktree 和 PR；未获授权时可完成只读分析和本地准备，但不得擅自写远端。

PR 必须关联 `Closes #<issue-id>`。Issue ID 应贯穿分支、worktree、commit 和 PR；纯调查尚未进入实施时可先不建分支。

## 授权边界

- 用户对当前任务明确授予的实施/交付授权在该任务内持续有效，直至撤销、目标变更或任务结束；不得对同一已批准动作反复索要确认。
- 实施指令授权范围与条件自治：当用户在会话中下达实施、修复或交付指令时，只要改动在独立环境中严格通过适用质量门禁（L0 单元测试 100% 通过、L2 独立环境启动与探活正常、真实浏览器/实机交互验收通过、GitHub Action CI 全绿），即视为获得完整的收尾授权。Agent 应当主动执行 `gh pr merge --squash --auto` 加入 Merge Queue，并在合入确认后完成 Dev 物化与环境清理，一气呵成完成端到端闭环；严禁在测试全绿的情况下机械性停顿索要二次批准。
- 熔断机制：仅在以下情况 Agent 必须暂停并向用户汇报：① 测试、L2 实机或浏览器验收未通过或存在未决阻塞；② 涉及生产正式版（`~/.omnimux`、`--prod`、`--all`）发布或破坏性回滚；③ 用户明确要求“仅提方案/仅开 PR 暂不合并”。
- 合入授权不等于生产发布授权。`~/.omnimux`、`--prod`、`--all`、正式包发布与回滚必须获得单独、明确的发布授权；正常交付默认只物化 `~/.omnimux-dev`。
- 公共 App 重启前必须确认具体 App（Dev 或 Prod）及协调窗口。确认后由 Agent 完成非付款步骤，不得要求用户代点或代跑命令；不得默认强杀不明进程。
- 真实付款、购买、订阅结算、退款或资金转移由人类完成。Agent 可在确认后准备流程，但不得提交真实支付工具。
- Issue 模板、标签、`pre-authorized: false` 或任务描述本身都不构成授权。Agent 不得冒充用户/维护者发布 `/auto-approve`，也不得修改 required checks 或自行写 `qa:pass` 来制造放行条件。

## 风险政策

| 风险 | 典型范围 | 无人值守 `pnpm auto:run` | 当前任务明确合入批准 |
|---|---|---|---|
| R0 | 生产发布/回滚、凭据或权限边界、破坏性恢复、P0 | 禁止 | 所有适用证据通过后可由 Agent 加入 Merge Queue |
| R1 | 跨插件、一级页/壳层/平台门控、公开 I/O、manifest/工具入口、模型边界、合同/CI/门禁 | 禁止 | 所有适用证据通过后可由 Agent 加入 Merge Queue |
| R2 | 单插件非破坏性功能或修复 | 仅机器预授权完整时允许 | 批准当前 PR 后可加入 Merge Queue |
| R3 | 纯文档、测试、格式化或低风险辅助改动 | 仅机器预授权完整时允许 | 批准当前 PR 后可加入 Merge Queue |

风险按实际 diff 上调，标签不能降低实际风险。触及 `AGENTS.md`、`CLAUDE.md`、`docs/contracts/`、`.github/`、`scripts/`、根包清单、manifest 或 patch 的变更至少按 R1 处理；生产、回滚、凭据或 token 边界按 R0 处理。

### 无人值守通道

`pnpm auto:run <issue-id>` 是无人值守通道，不代表用户正在当前会话中批准合入。它只允许 R2/R3，且 Issue 必须同时具备：

- `status:ready-to-run`；
- 与正文 frontmatter 一致的 `risk:R2` 或 `risk:R3` 标签；
- 正文开头的 `pre-authorized: true`；
- 维护者白名单作者发布且风险一致的 `/auto-approve risk:R2|R3` 评论；
- 合入前未被移除标签或 `/revoke` 撤销。

R0/R1 在此通道始终停止在人工批准边界。Agent 不得替用户生成授权评论。

### 当前任务的交互式通道

任务实施的完整闭环授权：用户在会话中下达实施、修复或交付指令后，该授权贯穿 push、建 PR、L2/浏览器验收、加入 Merge Queue、Dev 物化与环境清理全流程。在所有适用验收证据（L0 单测、L2 独立环境实机、真实浏览器交互、CI 检查）全部通过后，Agent 直接将 PR 加入 Merge Queue 并自动完成合并后物化收尾，无需切断为多次手动确认。只有在验收失败、遇到环境/代码阻塞、或涉及生产发布（`--prod`）时才暂停请示。该通道不要求把用户授权伪装成 `/auto-approve` 评论，也不得调用无人值守通道绕过 R0/R1 限制。

## 当前自动化能力边界

- `auto-pipeline` 不能读取当前对话中的直接用户授权。R0/R1 boss path 和 `--manual` 可能继续更新远端标签、commit、push、建 PR；这些代码路径本身不构成许可，调用前仍须由 Agent 核对本任务授权。
- `waitForCi` 只判断 PR 上可见 check rollup 是否非空、无失败且无 pending，尚未核对分支保护的 required-check 名单；该结果不能单独证明 required checks 完整。
- 当前 `quality-gate.yml` 调用 `ci-verdict.mjs` 时只传 L0 report，没有传 `--require-browser`/browser report，也没有把完整相关包、L2 与合并后 Dev 结果交给 verdict；因此它写出的 `qa:pass` 不能单独证明本合同的适用验收已完成。
- dry-run 和脚本日志中仍有旧 L3/ego-browser/“完整链路”措辞；它们是待修代码文本，不是现行验收合同。

这些缺口必须作为残留代码问题处理。不得通过改文档把它们描述成已经修复；合入前由独立最终验收补核 GitHub required checks、当前任务授权与 [plugin-qa](plugin-qa.md) 的适用证据。

## 证据与合入条件

- 测试与运行证据按变更面决定，不按风险等级机械补齐；矩阵见 [plugin-qa](plugin-qa.md)。纯文档变更不要求 L2、45120 或 App 物化。
- 涉及运行行为的变更先在独立 L2 worktree 环境验收；合入后再把 `main` 物化到 Dev `~/.omnimux-dev` 并在 45120 验收。只有壳层或平台门控改动额外要求 Electron renderer 证据。
- 最终验收与实施分离；测试通过、PR 绿灯或 merge 命令发出都不能单独替代最终验收。
- `qa:pass` 只能由已授权的 CI 聚合机制在真实条件满足后写入。本地 Agent、PR 作者和当前 `auto-pipeline` 不得自打该标签。
- 只有 GitHub 返回 `state=MERGED`、`mergedAt` 和 merge commit 才算合入确认。未确认前不得执行合并后物化或清理 worktree。
- 模型合同遵循 [model-api-authority](model-api-authority.md)，不得用真实模型请求代替官方文档与离线合同验证。

## 合并后与收尾

合并确认后，Agent 更新本地主仓、默认物化 Dev、完成适用的 45120 验收，再清理 L2 与 worktree。生产发布不属于这一默认收尾。物化失败或证据不完整时保留现场并报告具体阻断，不得把“已合并”写成“已交付”。

最终报告只列适用信息：目标与结论、变更文件、实际执行的检查及证据、PR/merge/worktree/Dev 状态、未完成项与下一动作。不得要求每轮都复制固定四栏看板，也不得把不适用层写成已通过。

## 禁止

- 直推 `main`、本地 merge 绕过 PR/Merge Queue，或未经授权 push/merge/生产发布；
- 通过降风险标签、修改 required checks、伪造授权评论或自写 `qa:pass` 绕过门禁；
- 未合并产物进入公共 Dev 或 Prod；
- 默认使用 `--force` / `--force-with-lease`；需要改写远端分支时必须另获明确授权并确认无人共享该分支；
- 提交 secrets，或提交 `omnimux-workflow` 的 `dist/index.js`、`lib/client.js`、`lib/canvas.js` 生成物；
- 把桌面 fork 的 remote/base 拓扑套到本仓，或在外层 `dsh-plugin/` 初始化 Git/CI。

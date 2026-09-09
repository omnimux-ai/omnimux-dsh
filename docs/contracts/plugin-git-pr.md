---
title: "plugin-git-pr — OmniMux 插件仓 Git / PR 与授权合同"
id: "contract-plugin-git-pr"
type: "contract"
status: "living"
authority: "L1"
date: "2026-08-24"
updated: "2026-09-09"
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

- 用户确认需求并要求实施、修复或交付后，任务授权覆盖约定范围内的调查、隔离实施、测试、Issue/分支写入、push、PR、合并、Dev 物化与验收、任务清理。授权跨轮有效，直至撤销、任务结束或边界实质变化；不得逐阶段索要确认。仅分析、仅本地修改、仅开 PR 不合并等明确限制优先。
- 授权来自用户确认的任务范围；测试和审查证明动作已就绪，不产生或扩大权限。风险等级决定检查深度，不单独决定是否需要人类确认。合并前核实自动部署、迁移或外部发布等下游影响，不能仅凭 Git 可 revert 就认定全部后果可逆。
- 测试、L2 或浏览器验收失败阻止合并和交付声明；Agent 在既有范围和风险内继续诊断、修复、复验。只有目标、成本、权限或不可逆影响超出任务，缺少只能由人提供的必要输入，或不存在合规可行路径时，暂停受影响动作；继续独立授权工作。
- 生产 `~/.omnimux`、`--prod`、`--all`、正式包发布、凭据引导、破坏性数据操作和越界写入需要明确覆盖相应边界的授权；普通开发交付不包含这些动作。Dev 交付默认只使用 `~/.omnimux-dev`。
- Dev 重启属于开发交付；Agent 先核实 App/profile/PID、保存状态及并发使用情况。可安全恢复且无占用冲突时自主执行；存在未保存工作、活跃生成或共享使用冲突时先协调该冲突。Prod 重启按生产授权处理；不得强杀不明进程。
- 真实付款、购买、订阅结算、退款或资金转移由人类完成。已授权流程中的密码、OTP、captcha 或浏览器交还只请求必要输入，随后由 Agent 恢复执行。
- Issue 模板、标签、任务描述和 Agent 写入的授权记录都不能自行产生许可。Agent 不得冒充用户/维护者发布 `/auto-approve`，也不得修改 required checks 或自行写 `qa:pass` 来制造放行条件。

## 风险政策

| 风险 | 典型范围 | 无人值守 `pnpm auto:run` | 已获任务交付授权的 Agent 通道 |
|---|---|---|---|
| R0 | 生产发布/回滚、凭据或权限边界、破坏性恢复、P0 | 禁止 | 核对具体高风险动作已明确授权；适用证据通过后由 Agent 执行 |
| R1 | 跨插件、一级页/壳层/平台门控、公开 I/O、manifest/工具入口、模型边界、合同/CI/门禁 | 禁止 | 所有适用证据通过后可由 Agent 加入 Merge Queue |
| R2 | 单插件非破坏性功能或修复 | 仅机器预授权完整时允许 | 适用证据通过后自主加入 Merge Queue |
| R3 | 纯文档、测试、格式化或低风险辅助改动 | 仅机器预授权完整时允许 | 适用证据通过后自主加入 Merge Queue |

风险按实际 diff 上调，标签不能降低实际风险。触及 `AGENTS.md`、`CLAUDE.md`、`docs/contracts/`、`.github/`、`scripts/`、根包清单、manifest 或 patch 的变更至少按 R1 处理；生产、回滚、凭据或 token 边界按 R0 处理。

### 无人值守通道

`pnpm auto:run <issue-id>` 是无人值守通道，不代表用户正在当前会话中批准合入。它只允许 R2/R3，且 Issue 必须同时具备：

- `status:ready-to-run`；
- 与正文 frontmatter 一致的 `risk:R2` 或 `risk:R3` 标签；
- 正文开头的 `pre-authorized: true`；
- 维护者白名单作者发布且风险一致的 `/auto-approve risk:R2|R3` 评论；
- 合入前未被移除标签或 `/revoke` 撤销。

R0/R1 不在无人值守机器预授权范围内，由协调 Agent 接收现场并按当前任务授权核对后续动作；不自动要求人类合并。Agent 不得替用户生成授权评论。

### 当前任务的交互式通道

交互式通道按上方「授权边界」连续执行。独立最终验收可由另一 Agent 完成，不是人类批准环节。适用证据与授权齐备后直接加入 Merge Queue；等待 CI/队列时保留唯一续跑机制。可恢复失败自行修复，只有实际越界或必要人类输入才询问。不得把会话授权伪装成 `/auto-approve` 评论，也不得放宽无人值守机器预授权条件。

## 当前自动化能力边界

- `auto-pipeline` 不能读取当前对话中的直接用户授权。`--manual` 兼容入口允许协调 Agent 驱动准备，但参数本身不构成许可，调用前须核对任务授权。机器授权不足的 R0/R1 也必须显式选择该入口才可写远端。准备完成后返回 `ready-for-agent`，保留 PR、风险、证据与下一动作；协调 Agent 读取最新授权、撤销状态、PR head 和 required checks 后继续交付，不要求用户再次批准已授权动作。旧 `ready-for-boss` 现场按相同交接语义恢复，不盲目重跑实施。
- `waitForCi` 只判断 PR 上可见 check rollup 是否非空、无失败且无 pending，尚未核对分支保护的 required-check 名单；该结果不能单独证明 required checks 完整。
- `quality-gate.yml` 向 `ci-verdict.mjs` 传入事件基线、实际 diff 与前序 CI 状态；影响面要求浏览器时，缺少同次 ego-browser 请求与报告必须失败，不能只凭 L0 放行；`--allow-l0-fallback` 参数不受支持，`OMNIMUX_ALLOW_L0_UI_PASS` 环境变量不影响判定，调用方不得启用这些旁路。标签投影先清理旧 `qa:pass`，再按聚合结果决定是否添加；完整相关包、L2 与合并后 Dev 的适用证据仍需独立最终验收补核。
- dry-run 仅验证模拟流程，不执行真实浏览器、远端写入、合入或物化；模拟日志不构成实际验收证据。

这些缺口必须作为残留代码问题处理。不得通过改文档把它们描述成已经修复；合入前由独立最终验收补核 GitHub required checks、当前任务授权与 [plugin-qa](plugin-qa.md) 的适用证据。

## 证据与合入条件

- 测试与运行证据按变更面决定，不按风险等级机械补齐；矩阵见 [plugin-qa](plugin-qa.md)。纯文档变更不要求 L2、45120 或 App 物化。
- 涉及运行行为的变更先在独立 L2 worktree 环境验收；合入后再把 `main` 物化到 Dev `~/.omnimux-dev` 并在 45120 验收。只有壳层或平台门控改动额外要求 Electron renderer 证据。
- 最终验收与实施分离；测试通过、PR 绿灯或 merge 命令发出都不能单独替代最终验收。
- `qa:pass` 只能由已授权的 CI 聚合机制在真实条件满足后写入。本地 Agent、PR 作者和当前 `auto-pipeline` 不得自打该标签。
- 只有 GitHub 返回 `state=MERGED`、`mergedAt` 和 merge commit 才算合入确认。未确认前不得执行合并后物化或清理 worktree。
- 模型合同遵循 [model-api-authority](model-api-authority.md)，不得用真实模型请求代替官方文档与离线合同验证。

## 合并后与收尾

合并确认后，Agent 在主检出干净且适合快进时同步本地；已有用户改动须保留。完成已授权的 Dev 物化及适用的 45120 验收后，再清理任务所属 L2 与 worktree。普通任务授权已覆盖 Dev 物化和无冲突重启；用户明确限制交付范围时遵守该限制。生产发布需单独授权。物化失败或必要证据不完整时保留现场并继续可行修复，不得把“已合并”写成“已交付”。

最终报告只列适用信息：目标与结论、变更文件、实际执行的检查及证据、PR/merge/worktree/Dev 状态、未完成项与下一动作。不得要求每轮都复制固定四栏看板，也不得把不适用层写成已通过。

## 禁止

- 直推 `main`、本地 merge 绕过 PR/Merge Queue，或未经授权 push/merge/生产发布；
- 通过降风险标签、修改 required checks、伪造授权评论或自写 `qa:pass` 绕过门禁；
- 未合并产物进入公共 Dev 或 Prod；
- 默认使用 `--force` / `--force-with-lease`；需要改写远端分支时必须另获明确授权并确认无人共享该分支；
- 提交 secrets，或提交 `omnimux-workflow` 的 `dist/index.js`、`lib/client.js`、`lib/canvas.js` 生成物；
- 把桌面 fork 的 remote/base 拓扑套到本仓，或在外层 `dsh-plugin/` 初始化 Git/CI。

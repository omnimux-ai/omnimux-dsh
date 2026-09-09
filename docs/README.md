---
title: "OmniMux-DSH 开发文档导航"
id: "index-docs-root"
type: "index"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
tags: ["portal", "index", "docs-root", "navigation"]
---

# OmniMux-DSH 开发文档导航

文档治理见 [docs-governance-standard](contracts/docs-governance-standard.md)。当前 runtime/代码证明事实；`AGENTS.md` 与现行 contract 定义行动边界。代码可执行不代表已获 push、merge、生产、重启或管理权限。

## 核心活文档

| 文档 | 层级 | 用途 |
|---|---|---|
| [capabilities.md](capabilities.md) | L1 | Real / Stub / Absent 能力状态；需要当前代码与证据支持 |
| [harness-pin.md](harness-pin.md) | L1 | 官方 Harness pin 与 overlay 清单 |
| [briefing.md](briefing.md) | L3 | 跨会话记忆；不是事实或权限真源 |
| [contracts/README.md](contracts/README.md) | L1 | 全量现行合同索引 |

## 工作流合同

| 文档 | 唯一职责 |
|---|---|
| [plugin-git-pr](contracts/plugin-git-pr.md) | 风险、授权、push/merge、Merge Queue 与发布政策真源 |
| [agent-issue-lifecycle](contracts/agent-issue-lifecycle.md) | Issue metadata、阶段状态、职责分配与恢复信息 |
| [plugin-qa](contracts/plugin-qa.md) | 合入前相关自动化/静态与独立评审；合入后按需 Dev 45120 浏览器/Electron 证据 |
| [dev-pipeline](contracts/dev-pipeline.md) | Worktree 检查 → required CI/MQ → main → 按需 Dev 物化验收；Prod 边界 |
| [ops-entry](contracts/ops-entry.md) | 对外同步、诊断、重启入口；不提供合入前独立运行环境 |
| [docs-governance-standard](contracts/docs-governance-standard.md) | 文档层级、metadata、生命周期与工具真实能力 |

[稳定基线迁移规格](specs/2026-09-09-stable-baseline-migration.md)及旧 L2 验收流程已 **superseded**，只作历史追溯。现行流程以以上合同为准；历史 QA/evidence/logs 不重写、不将失败改为通过。文档 authority、工具与 UI 层级中的 L2 是独立分类，仍有效。

完整执行 SOP 不复制在这些合同中；按需加载[仓库原生 workflow skill](../.agents/skills/omnimux-repo-workflow/SKILL.md)。

## 目录

| 路径 | 内容 |
|---|---|
| [contracts/](contracts/README.md) | Living contracts |
| [decisions/](decisions/README.md) | 架构决策记录 |
| [specs/](specs/README.md) | 产品与技术规格、原型 |
| [evidence/](evidence/README.md) | 具目标/SHA/环境身份的验收证据 |
| [logs/](logs/README.md) | 阶段和操作记录 |
| [implementation/](implementation/) | 实施过程与交付报告；查任务改动和未完成项 |
| [qa/](qa/) | 验收报告；查实际命令、结果及证据身份 |
| [standards/](standards/) | 既有规范与操作参考；按文档职责发现适用入口 |
| [references/](references/README.md) | 外部资料与业务参考 |
| [archive/](archive/README.md) | 已废弃历史与替代关系 |

常用契约入口还包括 [hub](contracts/hub.md)、[settings UI](contracts/settings-ui.md)、[Stage guards](contracts/stage-guards.md)、[workbench split](contracts/workbench-split.md)、[model API authority](contracts/model-api-authority.md)、[OpenReel vendor contract](contracts/openreel-vendor-contract.md) 和 [UI design guidelines](contracts/ui-design-guidelines.md)。

## 文档检查

```sh
pnpm doc:lint
```

该命令检查 frontmatter、命名、相对链接目标文件和关键索引；不校验 anchor 或孤岛。`pnpm doctor` 与 `pnpm verify:all` 当前都不包含 `doc:lint`。`pnpm doc:index` 会改写索引，只在明确需要更新生成索引时运行。

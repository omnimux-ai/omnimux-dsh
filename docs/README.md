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
| [plugin-qa](contracts/plugin-qa.md) | 按变更面选择测试、L2、45120、浏览器和 Electron 证据 |
| [dev-pipeline](contracts/dev-pipeline.md) | L2 / Dev / Prod 隔离、materialization，以及稳定基线当前/迁移/目标 |
| [ops-entry](contracts/ops-entry.md) | 对外运维命令入口与重启对象边界；布尔 `--promote-baseline` / activate 现为拟实现 |
| [docs-governance-standard](contracts/docs-governance-standard.md) | 文档层级、metadata、生命周期与工具真实能力 |

[稳定基线迁移规格](specs/2026-09-09-stable-baseline-migration.md)（L2）是命名不可变 baseline 的设计与验收真源；不证明已切换默认种子。

完整执行 SOP 不复制在这些合同中；按需加载[仓库原生 workflow skill](../.agents/skills/omnimux-repo-workflow/SKILL.md)。

## 目录

| 路径 | 内容 |
|---|---|
| [contracts/](contracts/README.md) | Living contracts |
| [decisions/](decisions/README.md) | 架构决策记录 |
| [specs/](specs/README.md) | 产品与技术规格、原型 |
| [evidence/](evidence/README.md) | 具目标/SHA/环境身份的验收证据 |
| [logs/](logs/README.md) | 阶段和操作记录 |
| [references/](references/README.md) | 外部资料与业务参考 |
| [archive/](archive/README.md) | 已废弃历史与替代关系 |

常用契约入口还包括 [hub](contracts/hub.md)、[settings UI](contracts/settings-ui.md)、[Stage guards](contracts/stage-guards.md)、[workbench split](contracts/workbench-split.md)、[model API authority](contracts/model-api-authority.md)、[OpenReel vendor contract](contracts/openreel-vendor-contract.md) 和 [UI design guidelines](contracts/ui-design-guidelines.md)。

## 文档检查

```sh
pnpm doc:lint
```

该命令检查 frontmatter、命名、相对链接目标文件和关键索引；不校验 anchor 或孤岛。`pnpm doctor` 与 `pnpm verify:all` 当前都不包含 `doc:lint`。`pnpm doc:index` 会改写索引，只在明确需要更新生成索引时运行。

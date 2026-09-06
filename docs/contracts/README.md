---
title: "系统契约与工程规范 (Contracts) 索引"
id: "index-contracts"
type: "index"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-05"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# 系统契约与工程规范 (Contracts)

> **权威等级**：L1 | **生命周期**：持续演进 (Living)

## 1. 目录职能
系统接口定义、架构边界、开发流程与运维规范。具有高权威效力，随系统迭代持续演化。

## 2. 索引矩阵 (Index Matrix)

| 状态 | 文件名 | 标题 | 模块 | 维护/生效日期 | 核心摘要 |
|---|---|---|---|---|---|
| `living` | [agent-workbench-sync.md](agent-workbench-sync.md) | Agent 工作台双向协同契约（信封 / 工具 / WebSocket / 防打扰） | `omnimux` | 2026-09-04 | UI Context Envelope 双通道；Hub 单路只读 WebSocket `GET /omnimux/events/stream` upgrade（`?after=` 重放）；`workbench_*` 两工具 + 防打扰 D1–D10；资产 changed 事件；5s poll 仅兜底。 |
| `living` | [plugin-agent-tools-inventory.md](plugin-agent-tools-inventory.md) | OmniMux 全量插件 Agent 工具与双面交付清单契约 | `global` | 2026-08-30 | 全量 12 插件 88 工具双面交付契约、L1/L2/L3 分级、破坏性 confirm 守卫与 CI 静态门禁。 |
| `living` | [plugin-offline-cloud-matrix.md](plugin-offline-cloud-matrix.md) | 插件离线/云端定界与侧栏动态可见性合同 | `global` | 2026-08-30 | 规范 8 大插件离线 vs 云端定级，云端依赖未登录隐藏，离线可用常驻且落地方案 D 礼貌拦截。 |
| `living` | [project-assets-contract.md](project-assets-contract.md) | 项目资产与主体库物理实体化合同 | `omnimux-workflow` | 2026-08-30 | 导入即 copy；项目相对路径；全局仓 `data/files/`；禁止 `/api/projects/:id` 新前缀。 |
| `living` | [openreel-vendor-contract.md](openreel-vendor-contract.md) | openreel-vendor-contract — OpenReel 完整微应用引入与反自研契约 | `omnimux-clip` | 2026-08-27 | 在 `omnimux-clip` 中，**严禁重新发明已经成熟的开源 NLE（含其官方 GUI）**。 |
| `living` | [agent-issue-lifecycle.md](agent-issue-lifecycle.md) | agent-issue-lifecycle — OmniMux Agent 专属 GitHub Issue 驱动开发合同 | `omnimux` | 2026-08-26 | 1. **唯一真源（Single Source of Truth）**：GitHub Issue 是任务背景、技术决策、验收标准和流转状态的唯一真源。 |
| `living` | [briefing.md](briefing.md) | Briefing contract | `global` | 2026-08-26 | Project briefing process. Memory, not truth. |
| `living` | [client-ui-remediation.md](client-ui-remediation.md) | Client UI 形态定界与 4 层整改合同 | `omnimux-accounts` | 2026-08-26 | `挂载点 = ctx.slots.inject("shell.overlay")，形态 = 各垂直对象插件自有 Stage，产物 = dsh.bundle；共享 4 层壳下沉 dsh-ui-kit（非 |
| `living` | [docs-governance-standard.md](docs-governance-standard.md) | 开发文档工程实践管理规范 | `global` | 2026-08-26 | 在 OmniMux-DSH 多智能体（Multi-Agent）与人类工程师协同的工程研发体系中，文档不仅是人类的知识沉淀与备忘录，更是 Agent 执行任务时的**行为护栏（Guardrails）与最 |
| `living` | [first-level-page-layout.md](first-level-page-layout.md) | OmniMux 全局插件一级页 UI 布局结构方法论与开发规范 | `omnimux-assets` | 2026-08-26 | 通过对比 **「项目库」**、**「资产中心」**、**「Skill 市场」**，可以提炼出 5 个高度一致的 UI 骨架共同点： |
| `living` | [icon-design-standards.md](icon-design-standards.md) | OmniMux 图标组件选型与迁移规范 (Icon Standards Contract) | `omnimux` | 2026-08-26 | 在所有 OmniMux 插件 UI 开发中，图标引入严格遵循 **两级降级选型机制**： |
| `living` | [ops-entry.md](ops-entry.md) | ops-entry — 插件运维命令唯一入口 | `omnimux-workflow` | 2026-08-26 | 工作目录：`~/Desktop/Project/omnimux-desktop-fork` |
| `living` | [plugin-qa.md](plugin-qa.md) | plugin-qa — OmniMux 产品插件浏览器验收契约 | `omnimux` | 2026-08-26 | \| 项 \| 要求 \| |
| `archived` | [series.md](series.md) | series/ contract | `omnimux-workflow` | 2026-08-26 | Product store. Session logs are not this store. |
| `living` | [settings-ui.md](settings-ui.md) | Settings UI placement | `omnimux-accounts` | 2026-08-26 | Normative seat for OmniMux plugin UI in the official Web Settings panel. Live slot names come from t |
| `living` | [workbench-split.md](workbench-split.md) | Workbench split — 对话可收、插件 GUI 常驻 | `omnimux` | 2026-08-31 | 工作台挂 `dsh-better-sidebar`；库页留 overlay；焦点 = 右栏几何（split/gui/chat）；禁止 claim product-stage。 |
| `living` | [sidebar-extra-entries.md](sidebar-extra-entries.md) | Sidebar extra entries (under 新会话) | `omnimux-assets` | 2026-08-26 | Normative look for any extra row injected under the official **新会话** button. Official workspace sess |
| `living` | [stage-guards.md](stage-guards.md) | stage-guards — 一级 Stage / 本地写闸 / 空态静态契约 | `omnimux-accounts` | 2026-08-26 | \| 规则 \| 判定 \| |
| `living` | [ui-copywriting-and-naming-standards.md](ui-copywriting-and-naming-standards.md) | OmniMux 全局 UI 命名与微文案规范 (UI Copywriting & Naming Standards) | `omnimux` | 2026-08-26 | * **规则**：维度标识、筛选字段必须使用 **2~4 字纯实体名词**。 |
| `living` | [ui-design-guidelines.md](ui-design-guidelines.md) | OmniMux UI Design & Interaction Guidelines | `omnimux-accounts` | 2026-08-26 | 1. **严禁裸用原生 `<select>`**： |
| `living` | [plugin-git-pr.md](plugin-git-pr.md) | plugin-git-pr — OmniMux 插件仓 Git / PR 合同 | `global` | 2026-08-30 | 禁止直推 main；`omnimux-workflow` 生成物不进 Git。 |
| `living` | [client-external-store.md](client-external-store.md) | Client external store（useSyncExternalStore） | `omnimux-workflow` | 2026-08-22 | Normative rule for first-level product pages that subscribe to Cordis / Locale faces via React `useS |
| `living` | [dsh-video-plugin.md](dsh-video-plugin.md) | PRD：omnimux-video 视频能力插件（自包含本地执行 + 理解层） | `omnimux-video` | 2026-08-22 | 状态：**Revised v2.1（2026-08-22：增补视频理解两工具；处理层仍为本机 ffmpeg）** |
| `living` | [gxgen-workflow-migration.md](gxgen-workflow-migration.md) | Gxgen → OmniMux 工作流迁移蓝图（代理必读） | `omnimux-workflow` | 2026-08-22 | \| 项 \| 决定 \| |
| `living` | [dev-pipeline.md](dev-pipeline.md) | dev-pipeline — 开发 / 预发布 / 生产三层环境契约 | `omnimux-assets` | 2026-08-30 | 日常入口 fork `yarn omnimux:*`；`omnimux-workflow` 生成物不入库，sync 现场 build。 |
| `living` | [model-capabilities-matrix.md](model-capabilities-matrix.md) | OmniMux 全模态模型能力契约与治理规范 (MCC 1.0) | `omnimux/catalog` | 2026-09-04 | 执行中枢 catalog SSOT；operation 17 + 显式 output；**op 级** research/execution/listedOperations；**docs 根 `schemaVersion: "1.1"`**；model.aliases wire 归一；profile.operations ∈ registry；promptPolicy；无全局 100MB；H1 零实文件 listed / H2 逐 op 上架投影。 |
| living | [model-api-authority.md](model-api-authority.md) | 模型接口准据：渠道官方 API 文档 | omnimux/catalog | 2026-09-05 | EvoLink/APIMart 分渠道文档准据、离线验收、禁止真实请求探测约束 |
| `living` | [model-list-ownership.md](model-list-ownership.md) | OmniMux model-list ownership | `omnimux` | 2026-09-04 | Composer 列表唯一 owner=`cordis.patch.yml`；Canvas=`modelCatalog` 目录缝（H1 shadow 零 listedOperations · capability 根 `schemaVersion: "1.1"` / H2 按 listed op 投影）；HTTP 仅桥接。 |
| `living` | [apps-catalog.md](apps-catalog.md) | Apps catalog | `omnimux-accounts` | 2026-08-17 | Normative local + remote JSON catalog for the Apps shelf. Status of the live UI is capabilities.md.  |
| `living` | [hub.md](hub.md) | Execution hub | `omnimux` | 2026-08-16 | Normative I/O for `omnimux` and every vertical/domain plugin. Status of a live surface is capabiliti |

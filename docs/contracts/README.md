---
title: "系统契约与工程规范 (Contracts) 索引"
id: "index-contracts"
type: "index"
status: "living"
authority: "L1"
date: "2026-08-26"
updated: "2026-09-09"
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
| `living` | [omnimux-contracts-architecture.md](omnimux-contracts-architecture.md) | OmniMux 常驻行为契约系统架构与治理规范 | `global` | 2026-09-11 | 建立 Layer 1~4 渐进式知识金字塔，通过 `contracts-loader` 实现启动期与运行时的常驻行为契约动态缝合。 |
| `living` | [omnimux-baseline-contract.md](omnimux-baseline-contract.md) | OmniMux 通用底线与交互契约 (Baseline Contract) | `global` | 2026-09-11 | 资产物理路径不可变性、最多 3 次异参重试熔断与 `working_language` 级联裁决协议栈。 |
| `living` | [omnimux-anti-loop-contract.md](omnimux-anti-loop-contract.md) | OmniMux 防死循环自检与 LoopGuard 契约 (Anti-Loop Contract) | `global` | 2026-09-11 | 调用前自查清单、典型死循环替代策略表与 Hub 底层 `LoopGuard` 5 步 3 击硬门禁熔断。 |
| `living` | [omnimux-semantic-judgment-contract.md](omnimux-semantic-judgment-contract.md) | OmniMux 多模态语义分配与 Prompt 编译契约 (Semantic Judgment) | `global` | 2026-09-11 | 意图四级优先级、素材 5 维输入角色、五维决策（take/adapt/ignore/block/ask）与 Prompt 纯净度铁律。 |
| `living` | [omnimux-timeline-discipline-contract.md](omnimux-timeline-discipline-contract.md) | OmniMux 分镜与时间线协同纪律契约 (Timeline & Storyboard Discipline) | `omnimux-clip` | 2026-09-11 | 媒体生成即资产自动入库、分镜与时间线局部 Hunk 增量修改（禁全量重写）与 Stage 阶段执行隔离。 |
| `living` | [omnimux-batch-grouping-contract.md](omnimux-batch-grouping-contract.md) | OmniMux 批量产物自动栅格化成组契约 (Batch Grouping Contract) | `global` | 2026-09-11 | 单轮多产物自动栅格化成组聚合展示与显式成组/解组状态机。 |
| `living` | [workflow-app-boundary.md](workflow-app-boundary.md) | Canvas / AI 应用协作契约 | `omnimux-workflow` | 2026-09-09 | 目标：Canvas 调度、Hub 凭证/provider HTTP/路由、Apps 注册存储与 schema/UI 发布规范；fail closed、有效输入/版本核验、事件与产物适配。另列固定 SHA 源码缺口；不是现有 API 或运行通过证明。 |
| `living` | [ai-app-ui-spec.md](ai-app-ui-spec.md) | OmniMux AI 应用 UI 布局与表单交互标准规范 | `omnimux-apps` | 2026-09-09 | 目标：视频/图片/音频三类、通用表单、单个左右大卡片、真实历史与多媒体示例隔离；448−2−48=398px、compact tabs 等特定例外；媒体依自身比例。固定旧 SHA 的 mock/内存原型尚未完成真实运行验收，不随本文合入 main。 |
| `living` | [node-input-submission.md](node-input-submission.md) | 节点有效输入与提交 | `omnimux-workflow` | 2026-09-06 | 上游与本地内容组合、创建/连接/提交分层、任务角色、动态状态与请求一致性。 |
| `living` | [alpha-release.md](alpha-release.md) | Alpha 内测与正式发布 | `global` | 2026-09-06 | 开发保留 Alpha 并标识内测；正式发布排除插件及对应工具，侧栏与发布共用名单。 |
| `living` | [agent-workbench-sync.md](agent-workbench-sync.md) | Agent 工作台双向协同契约（信封 / 工具 / WebSocket / 防打扰） | `omnimux` | 2026-09-04 | UI Context Envelope 双通道；Hub 单路只读 WebSocket `GET /omnimux/events/stream` upgrade（`?after=` 重放）；`workbench_*` 两工具 + 防打扰 D1–D10；资产 changed 事件；5s poll 仅兜底。 |
| `living` | [plugin-agent-tools-inventory.md](plugin-agent-tools-inventory.md) | OmniMux 全量插件 Agent 工具与双面交付清单契约 | `global` | 2026-08-30 | 全量 12 插件 88 工具双面交付契约、L1/L2/L3 分级、破坏性 confirm 守卫与 CI 静态门禁。 |
| `living` | [plugin-offline-cloud-matrix.md](plugin-offline-cloud-matrix.md) | 插件离线/云端定界与侧栏动态可见性合同 | `global` | 2026-08-30 | 规范 8 大插件离线 vs 云端定级，云端依赖未登录隐藏，离线可用常驻且落地方案 D 礼貌拦截。 |
| `living` | [project-assets-contract.md](project-assets-contract.md) | 项目资产与主体库物理实体化合同 | `omnimux-workflow` | 2026-08-30 | 导入即 copy；项目相对路径；全局仓 `data/files/`；禁止 `/api/projects/:id` 新前缀。 |
| `living` | [openreel-vendor-contract.md](openreel-vendor-contract.md) | openreel-vendor-contract — OpenReel 完整微应用引入与反自研契约 | `omnimux-clip` | 2026-08-27 | 在 `omnimux-clip` 中，**严禁重新发明已经成熟的开源 NLE（含其官方 GUI）**。 |
| `living` | [agent-issue-lifecycle.md](agent-issue-lifecycle.md) | agent-issue-lifecycle — OmniMux Agent Issue 生命周期合同 | `omnimux` | 2026-09-09 | Issue 保存边界、验收标准与依赖；按适用阶段记录证据，权限与风险由 plugin-git-pr 定义。 |
| `living` | [briefing.md](briefing.md) | Briefing contract | `global` | 2026-08-26 | Project briefing process. Memory, not truth. |
| `living` | [client-ui-remediation.md](client-ui-remediation.md) | Client UI 形态定界与 4 层整改合同 | `omnimux-accounts` | 2026-08-26 | `挂载点 = ctx.slots.inject("shell.overlay")，形态 = 各垂直对象插件自有 Stage，产物 = dsh.bundle；共享 4 层壳下沉 dsh-ui-kit（非 |
| `living` | [docs-governance-standard.md](docs-governance-standard.md) | 开发文档工程实践管理规范 | `global` | 2026-08-26 | 在 OmniMux-DSH 多智能体（Multi-Agent）与人类工程师协同的工程研发体系中，文档不仅是人类的知识沉淀与备忘录，更是 Agent 执行任务时的**行为护栏（Guardrails）与最 |
| `living` | [first-level-page-layout.md](first-level-page-layout.md) | OmniMux 全局插件一级页 UI 布局结构方法论与开发规范 | `omnimux-assets` | 2026-08-26 | 通过对比 **「项目库」**、**「资产中心」**、**「Skill 市场」**，可以提炼出 5 个高度一致的 UI 骨架共同点： |
| `living` | [icon-design-standards.md](icon-design-standards.md) | OmniMux 图标组件选型与迁移规范 (Icon Standards Contract) | `omnimux` | 2026-08-26 | 在所有 OmniMux 插件 UI 开发中，图标引入严格遵循 **两级降级选型机制**： |
| `living` | [ops-entry.md](ops-entry.md) | ops-entry — 插件运维命令唯一入口 | `global` | 2026-09-09 | fork `yarn omnimux:*` 的同步、诊断与目标重启边界；无合入前独立运行环境。 |
| `living` | [plugin-qa.md](plugin-qa.md) | plugin-qa — OmniMux 插件验收证据合同 | `omnimux` | 2026-09-09 | 合入前自动化/静态与独立评审；合入后按需 Dev/ego/shared probe；CI 不证明 Dev 通过。 |
| `archived` | [series.md](series.md) | series/ contract | `omnimux-workflow` | 2026-08-26 | Product store. Session logs are not this store. |
| `living` | [settings-ui.md](settings-ui.md) | Settings UI placement | `omnimux-accounts` | 2026-08-26 | Normative seat for OmniMux plugin UI in the official Web Settings panel. Live slot names come from t |
| `living` | [workbench-split.md](workbench-split.md) | Workbench split — 对话可收、插件 GUI 常驻 | `omnimux` | 2026-08-31 | 工作台与一级库页统一使用 `dsh-better-sidebar` Tabs；焦点 = 右栏几何（split/gui/chat）；禁止 claim product-stage，合法 overlay 仅按合同限定。 |
| `living` | [sidebar-extra-entries.md](sidebar-extra-entries.md) | Sidebar extra entries (under 新会话) | `omnimux-assets` | 2026-08-26 | Normative look for any extra row injected under the official **新会话** button. Official workspace sess |
| `living` | [stage-guards.md](stage-guards.md) | stage-guards — 一级 Stage / 本地写闸 / 空态静态契约 | `omnimux-accounts` | 2026-08-26 | \| 规则 \| 判定 \| |
| `living` | [ui-copywriting-and-naming-standards.md](ui-copywriting-and-naming-standards.md) | OmniMux 全局 UI 命名与微文案规范 (UI Copywriting & Naming Standards) | `omnimux` | 2026-08-26 | * **规则**：维度标识、筛选字段必须使用 **2~4 字纯实体名词**。 |
| `living` | [ui-design-guidelines.md](ui-design-guidelines.md) | OmniMux UI Design & Interaction Guidelines | `omnimux-accounts` | 2026-08-26 | 1. **严禁裸用原生 `<select>`**： |
| `living` | [plugin-git-pr.md](plugin-git-pr.md) | plugin-git-pr — OmniMux 插件仓 Git / PR 与授权合同 | `global` | 2026-09-09 | 禁止直推 main；required CI/MQ；qa:pass 仅合入前静态与测试；Dev 验收另行记录。 |
| `living` | [client-external-store.md](client-external-store.md) | Client external store（useSyncExternalStore） | `omnimux-workflow` | 2026-08-22 | Normative rule for first-level product pages that subscribe to Cordis / Locale faces via React `useS |
| `living` | [dsh-video-plugin.md](dsh-video-plugin.md) | PRD：omnimux-video 视频能力插件（自包含本地执行 + 理解层） | `omnimux-video` | 2026-08-22 | 状态：**Revised v2.1（2026-08-22：增补视频理解两工具；处理层仍为本机 ffmpeg）** |
| `living` | [gxgen-workflow-migration.md](gxgen-workflow-migration.md) | Gxgen → OmniMux 工作流迁移蓝图（代理必读） | `omnimux-workflow` | 2026-08-22 | \| 项 \| 决定 \| |
| `living` | [dev-pipeline.md](dev-pipeline.md) | dev-pipeline — 开发、Dev 与生产环境合同 | `global` | 2026-09-09 | 隔离 worktree → required CI/MQ → main → 按需 Dev；无合入前独立环境或未合并物化。 |
| `living` | [model-capabilities-matrix.md](model-capabilities-matrix.md) | OmniMux 全模态模型能力契约与治理规范 (MCC 1.0) | `omnimux/catalog` | 2026-09-04 | 执行中枢 catalog SSOT；operation 17 + 显式 output；**op 级** research/execution/listedOperations；**docs 根 `schemaVersion: "1.1"`**；model.aliases wire 归一；profile.operations ∈ registry；promptPolicy；无全局 100MB；H1 零实文件 listed / H2 逐 op 上架投影。 |
| living | [model-api-authority.md](model-api-authority.md) | 模型接口准据：渠道官方 API 文档 | omnimux/catalog | 2026-09-05 | EvoLink/APIMart 分渠道文档准据、离线验收、禁止真实请求探测约束 |
| `living` | [model-list-ownership.md](model-list-ownership.md) | OmniMux model-list ownership | `omnimux` | 2026-09-04 | Composer 列表唯一 owner=`cordis.patch.yml`；Canvas=`modelCatalog` 目录缝（H1 shadow 零 listedOperations · capability 根 `schemaVersion: "1.1"` / H2 按 listed op 投影）；HTTP 仅桥接。 |
| `living` | [apps-catalog.md](apps-catalog.md) | Apps catalog | `omnimux-accounts` | 2026-08-17 | Normative local + remote JSON catalog for the Apps shelf. Status of the live UI is capabilities.md.  |
| `living` | [hub.md](hub.md) | Execution hub | `omnimux` | 2026-08-16 | Normative I/O for `omnimux` and every vertical/domain plugin. Status of a live surface is capabiliti |

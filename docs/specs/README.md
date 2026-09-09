---
title: "产品规格与技术设计 (Specs & PRDs) 索引"
id: "index-specs"
type: "index"
status: "living"
authority: "L2"
date: "2026-08-26"
updated: "2026-09-09"
authors: ["x", "agent-architect"]
subsystem: "global"
---

# 产品规格与技术设计 (Specs & PRDs)

> **权威等级**：L2 | **生命周期**：阶段规格 -> 实现沉淀

## 1. 目录职能
各垂直插件与中枢功能的产品需求 PRD、技术设计规格 RFC 与高保真交互原型。

## 2. 索引矩阵 (Index Matrix)

| 状态 | 文件名 | 标题 | 模块 | 维护/生效日期 | 核心摘要 |
|---|---|---|---|---|---|
| `accepted` | [2026-09-09-stable-baseline-migration.md](2026-09-09-stable-baseline-migration.md) | 稳定基线迁移：设计与验收规格（PR-D） | `global` | 2026-09-09 | 当前/迁移/目标；D→C→S；内容哈希 id；published 可隔离消费；真实 Host 无法启动禁止切 S。 |
| `accepted` | [2026-09-06-node-input-submission-prd.md](2026-09-06-node-input-submission-prd.md) | 节点上游输入与提交一致性需求补充 | `omnimux-workflow` | 2026-09-06 | 输入解析缺口与 28 项验收场景；文档接受不代表代码或运行验收完成。 |
| `accepted` | [2026-09-06-inspiration-pagination-refresh.md](2026-09-06-inspiration-pagination-refresh.md) | 灵感库分页刷新约束 | `omnimux-inspiration` | 2026-09-06 | #637：追加分页不得反馈触发第一页刷新；末页停止请求，筛选、激活和授权刷新统一复位第一页。 |
| `accepted` | [2026-09-06-gxgen-incremental-import.md](2026-09-06-gxgen-incremental-import.md) | Gxgen 灵感增量导入 | `omnimux` | 2026-09-06 | #630：按 TikTok ID 去重、只新增、原 R2 封面预检、冻结计划及逐条回执；同计划恢复与复验。 |
| `accepted` | [2026-09-05-video-phase-one-scope.md](2026-09-05-video-phase-one-scope.md) | 视频模型阶段一范围：七个产品型号 | `omnimux/catalog` | 2026-09-05 | 当前阶段仅 Seedance 2.0/2.0 Fast/2.0 Mini/2.5、Wan 3.0、MiniMax H3 和 Grok 视频 1.5；wire 和模式按具体渠道官方 API 文档核对，Kling 与 Wan 派生型号延后不排期。 |
| `accepted` | [2026-09-05-model-contract-docs-first.md](2026-09-05-model-contract-docs-first.md) | 模型合同：渠道官方 API 文档优先方法修订 | `omnimux/catalog` | 2026-09-05 | 当前方法：具体 EvoLink/APIMart 模型 API 文档决定模式、字段、角色、数量、格式与时长；文档支持、离线实现验证、历史真实执行分列。无真实请求例外；`execution.live` 是待对齐实现差异。 |
| `accepted` | [2026-09-05-workbench-panel-containing-block.md](2026-09-05-workbench-panel-containing-block.md) | 工作台分栏定位容器修复 | `omnimux` | 2026-09-05 | #610/#552：保留全视口 panel host，只限制真实右面板；以几何及 hit-test 验证会话可用。 |
| `accepted` | [2026-09-05-market-skill-candidate.md](2026-09-05-market-skill-candidate.md) | Market 技能候选对象加载修复 | `omnimux-market` | 2026-09-05 | #593：当前 SkillProvider 候选对象契约、完整定义元数据、零模型回归；Dev 激活单独交付。 |
| `draft` | [2026-09-05-minimax-h3-end-frame-design.md](2026-09-05-minimax-h3-end-frame-design.md) | 增量设计：#567 MiniMax H3 end-frame 独立 operation/slot/profile/wire | `omnimux/catalog` | 2026-09-05 | BI-2/#567 draft：裁决第 18 op=`end_frame`（禁塞 first_frame/flf）；slot=`end_frame` role=`last_frame`；legacy `endframe`→`end_frame`；复用 `videoGenerate`；model=`minimax-h3-endframe`；#566 `image_tail` 对 end-only 仅 H1 中等假设；schema 17→18；DoD=expressibility+keyless，非 C3 listed；live 硬顶≤8/shape≤3；图：`2026-09-05-minimax-h3-end-frame-*.mermaid`。 |
| `accepted` | [2026-09-05-inspiration-existing-r2-references.md](2026-09-05-inspiration-existing-r2-references.md) | 原 R2 封面引用恢复 | `omnimux` | 2026-09-05 | #584：保留源对象，独立只读连接，精确十行事务恢复及真实 App 回读。 |
| `superseded` | [2026-09-05-inspiration-cover-repair.md](2026-09-05-inspiration-cover-repair.md) | 云灵感过期封面修复 | `omnimux` | 2026-09-05 | #584：原 ID 备份、官方来源恢复、持久媒体上传、只更新 cover_key、冲突检查与真实浏览器回读。 |
| `accepted` | [2026-09-07-ego-browser-qa.md](2026-09-07-ego-browser-qa.md) | ego-browser 共享验收执行链迁移 | `qa` | 2026-09-07 | 唯一 ego 入口；保持认证、原子消费、task/tab 身份、runtimeProof 和真实 PNG；能力不足 BLOCKED。 |
| `superseded` | [2026-09-05-builtin-browser-qa.md](2026-09-05-builtin-browser-qa.md) | Codex 内置浏览器验收适配 | `qa` | 2026-09-07 | #581 历史设计；已由 ego-browser 迁移规范取代，历史证据不重标。 |
| `draft` | [2026-09-05-wan-3-ref-wire-design.md](2026-09-05-wan-3-ref-wire-design.md) | 增量设计：#569 Wan 3.0 reference 系列 wire 与 mapper/探针路径 | `omnimux/catalog` | 2026-09-05 | 历史 Wan wire/mapper 与探测草案。原模型范围和历史材料保留；字段、参考模式、数量、格式与上限改按具体渠道官方 API 文档核对，未说明为未知，探测预算和 live 门槛不可执行。 |
| `accepted` | [2026-09-05-model-evidence-backfill-video-prd-addendum.md](2026-09-05-model-evidence-backfill-video-prd-addendum.md) | 增量产品附录：#530 视频优先范围修订（C1–C4 · Seedance/Wan/MiniMax H3/Kling） | `omnimux/catalog` | 2026-09-05 | 历史视频范围附录。保留 Seedance/Wan/MiniMax H3/Kling 的范围和阶段快照；C1–C4 探测、样本上限和按执行上架已替代，首尾帧与全能参考须按渠道官方文档分别核对。 |
| `accepted` | [2026-09-05-model-evidence-backfill-video-design-addendum.md](2026-09-05-model-evidence-backfill-video-design-addendum.md) | 增量设计附录：#530 视频 C1–C4（Seedance/Wan/MiniMax H3/Kling）证据补齐与上架 | `omnimux/catalog` | 2026-09-05 | 历史视频工程附录。保留目录/mapper 背景；C1–C4、探针、预算、`policy_conservative` 和 `listed` 翻转不再执行，渠道合同与离线验证按现行方法分层。 |
| `proposed` | [2026-09-05-model-evidence-backfill-design.md](2026-09-05-model-evidence-backfill-design.md) | 增量设计：模型证据补齐（Evidence Backfill）证据协议与分批任务分解（#530） | `omnimux/catalog` | 2026-09-05 | 历史证据补齐设计。原 per-op 模型范围与历史记录保留；existence/minimal/boundary、逐步试拒绝、样本上限和 real-live 门槛已替代。 |
| `proposed` | [2026-09-05-model-evidence-backfill-prd.md](2026-09-05-model-evidence-backfill-prd.md) | 增量 PRD：模型证据补齐（Evidence Backfill）与分批上架（#530） | `omnimux/catalog` | 2026-09-05 | 历史补证 PRD。原 65 operation 范围与 strict 快照保留；真实生成、dated probe 和“不测不上架”不再是渠道合同或上架发现规则。 |
| `proposed` | [2026-09-04-model-io-contract-h2-catalog-prd.md](2026-09-04-model-io-contract-h2-catalog-prd.md) | 增量 PRD：H2 审计 43 模型并切换 Catalog v1.1 契约投影（#465） | `omnimux/catalog` | 2026-09-04 | H2 历史目录投影 PRD。43 ID、operation 级投影和 facade 事实保留；输入字段、限制和上架发现改按渠道官方 API 文档与离线验证分层。 |
| `proposed` | [2026-09-04-model-io-contract-h2-catalog-design.md](2026-09-04-model-io-contract-h2-catalog-design.md) | 增量设计：H2 审计 43 模型并切换 Catalog v1.1 契约投影（#465） | `omnimux/catalog` | 2026-09-04 | H2 历史目录投影设计。处置、projection 和 strict 实现事实保留；“取更严”、样本/真实执行补证不再确定渠道能力。 |
| `accepted` | [2026-09-04-model-io-contract-compatibility-design.md](2026-09-04-model-io-contract-compatibility-design.md) | 设计：全模态模型 I/O 契约 + 画布兼容（H1 foundation #464 · R1 / **R1.1**） | `omnimux/catalog` | 2026-09-04 | H1 基础设计。operation 级/零 listed 历史阶段保留；slot 限制以具体渠道官方 API 文档为准，未知不以实测或保守值填补。 |
| `accepted` | [2026-09-04-model-io-contract-compatibility-prd.md](2026-09-04-model-io-contract-compatibility-prd.md) | PRD：全模态模型 I/O 契约 + 画布兼容性与自动适配（#463/#464） | `omnimux/catalog` | 2026-09-04 | H1 基础 PRD。operation 级、UI 兼容与历史零 listed 语义保留；slot 限制以具体渠道官方 API 文档为准，未知不以实测或保守值填补。 |
| `accepted` | [2026-09-05-plugin-suite-refactor-plan.md](2026-09-05-plugin-suite-refactor-plan.md) | OmniMux 插件套件重构方案 | `global` | 2026-09-05 | 基于近期合并记录；先修验收入口，再做领域去重、工作台分层和执行协议类型收敛。 |
| `proposed` | [2026-09-04-omnimux-universal-quota-gate-prd.md](2026-09-04-omnimux-universal-quota-gate-prd.md) | PRD：全局额度不足与统一充值弹窗 | `omnimux` | 2026-09-04 | 28 条云调用触发盘点；P0 客户端统一 `window.__omnimuxQuota` 弹窗；Agent 只结构化 `QUOTA`；充值不自动重试。 |
| `proposed` | [2026-09-04-omnimux-quota-precheck-prd.md](2026-09-04-omnimux-quota-precheck-prd.md) | 增量 PRD：计费入口余额预检 | `omnimux` | 2026-09-04 | 计费入口以 verify 权威额度预检；成功缓存 30 秒、并发合并；额度不足拦截，验证异常 fail-open。 |
| `proposed` | [2026-09-04-omnimux-universal-quota-gate-design.md](2026-09-04-omnimux-universal-quota-gate-design.md) | 系统设计：统一额度分类器 + 充值门 | `omnimux` | 2026-09-04 | 稳定码 `quota-exceeded`；official/media 402 保真；quotaGuard 对标 authGuard；T01–T05。图：`2026-09-04-omnimux-universal-quota-gate-*.mermaid`。 |
| `proposed` | [2026-09-04-agent-workbench-bidirectional-sync-design.md](2026-09-04-agent-workbench-bidirectional-sync-design.md) | 系统设计：Agent 页面感知与工作台双向协同 | `omnimux` | 2026-09-04 | Q1 双通道信封（composer 前缀 + viewport mailbox）；Q2 Hub 单路 SSE + hubEvents；五任务分解 T01–T05。图：`2026-09-04-agent-workbench-sync-*.mermaid`。 |
| `proposed` | [2026-09-04-agent-workbench-bidirectional-sync-prd.md](2026-09-04-agent-workbench-bidirectional-sync-prd.md) | PRD：Agent 页面感知与工作台双向协同系统 | `omnimux` | 2026-09-04 | UI Context Envelope 随消息默认附带；`workbench_get_active_view` / `workbench_open_tab` + 防打扰；资产库写盘 P95 ≤400ms 推送，5s poll 仅作 SSE 断连兜底。 |
| `proposed` | [2026-08-31-workbench-libraries-and-toggle-prd.md](2026-08-31-workbench-libraries-and-toggle-prd.md) | 增量 PRD：一级库页迁入右侧工作台与顶部对话开关注入（#318） | `omnimux` | 2026-08-31 | 废除库页 overlay；registerTab + Default Focus（画布 split / 其余 gui）；toggleCluster 首位插入对话开关；记忆按会话×Tab。 |
| `accepted` | [2026-08-30-omnimux-physical-materialization.md](2026-08-30-omnimux-physical-materialization.md) | 画布与资产库 100% 物理实体化（PRD + 技术规格） | `omnimux-workflow` | 2026-08-30 | 导入/主体/生成物全部 copy 进受管目录；项目相对路径；阶段 0 文档先行。 |
| `accepted` | [2026-08-28-canvas-project-assets-prd.md](2026-08-28-canvas-project-assets-prd.md) | 工作流画布：项目资产与画布素材双 Tab 抽屉 | `omnimux-workflow` | 2026-08-28 | 画布 Tab = 当前创作态；资产 Tab = 项目持久态。原型：`prototypes/2026-08-28-canvas-project-assets-prototype.html`。 |
| `accepted` | [2026-08-28-inspiration-hover-replication.md](2026-08-28-inspiration-hover-replication.md) | 灵感库卡片悬停 CTA × 去对话复刻：架构规格与任务分解 | `omnimux-inspiration` | 2026-08-28 | Track C 双包；跨包唯一缝 `window.__omnimuxWorkflow.startReplicationProject`；复用 `runNewProject` 默认库路径；Composer 走市场插件已验证的 React 18 setter + 发送按钮。严禁跨包 client import。 |
| `accepted` | [2026-08-25-omnimux-clip-studio-prd.md](2026-08-25-omnimux-clip-studio-prd.md) | PRD：OmniMux Clip Studio（omnimux-clip）完整微应用化 | `omnimux-clip` | 2026-08-25 | 工作流画布 (`omnimux-workflow`) 不该再内嵌多媒体时间轴。WebCodecs / WebGPU 与 React Flow 同树会把包体积和运行时一起拖垮。剪辑必须是独立插件。 |
| `accepted` | [2026-08-25-omnimux-clip-studio-spec.md](2026-08-25-omnimux-clip-studio-spec.md) | OmniMux Clip Studio（omnimux-clip）完整微应用技术 Spec | `omnimux-clip` | 2026-08-25 | \| # \| 决策 \| 内容 \| |
| `accepted` | [2026-08-25-omnimux-gateway-analytics-api-prd.md](2026-08-25-omnimux-gateway-analytics-api-prd.md) | OmniMux 网关社媒数据分析 (Social Analytics) 接口接入需求文档 (PRD) | `omnimux-analytics` | 2026-08-25 | 当前 OmniMux 执行中枢（`product/omnimux-dsh/plugins/omnimux`）已打通 `/api/social/v1/accounts`（账号授权与管理）及 `/api/ |
| `accepted` | [2026-08-25-social-analytics-gateway-gap.md](2026-08-25-social-analytics-gateway-gap.md) | OmniMux 网关社媒数据分析接口 Gap 分析与能力设计 | `omnimux-analytics` | 2026-08-25 | 针对 **Analytics（社媒数据分析看板）** 页面需求，对 `product/omnimux-dsh` 当前已实现的执行中枢（Hub）代码及云端协议契约（`src/official/accou |
| `accepted` | [2026-08-25-social-analytics-prd.md](2026-08-25-social-analytics-prd.md) | 社媒发布与互动数据分析看板 (Social Analytics) PRD | `omnimux-analytics` | 2026-08-25 | 面向社媒多渠道矩阵运营、短剧/图文出海团队及创作者的**全渠道内容发布表现与受众互动分析中枢**。通过聚合各社媒平台（TikTok、X/Twitter、YouTube、Instagram 等）的数据表 |
| `accepted` | [2026-08-25-social-analytics-tech-spec.md](2026-08-25-social-analytics-tech-spec.md) | OmniMux 社媒数据分析看板 (omnimux-analytics) 技术架构与实现 Spec | `omnimux-analytics` | 2026-08-25 | - **插件包名**：`omnimux-analytics` |
| `accepted` | [2026-08-25-zernio-data-source-mapping-and-algorithms.md](2026-08-25-zernio-data-source-mapping-and-algorithms.md) | Zernio 数据源调研与 OmniMux 网关能力映射方案 | `omnimux-analytics` | 2026-08-25 | 通过对 `docs.zernio.com`（覆盖 16 个社媒平台的统一 API）的全面检索分析，**截图中所展示的所有分析图表与核心指标，在 Zernio 体系中均有现成或高度对应的原生数据支持** |
| `accepted` | [2026-08-24-omnimux-inspiration-cover-cache.md](2026-08-24-omnimux-inspiration-cover-cache.md) | OmniMux 灵感库封面修复 + 媒体缓存方案 | `omnimux-inspiration` | 2026-08-24 | 灵感库一级页**封面全部不显示**：真实网关返回的封面字段是 `cover_key`（不是前端读的 `cover_url`），媒体本身（Host 代理流）完全正常。修复=一处字段兼容 + `hostM |
| `accepted` | [2026-08-24-omnimux-market-agent-tool-matrix.md](2026-08-24-omnimux-market-agent-tool-matrix.md) | omnimux-market Agent 工具矩阵：架构设计与任务拆解 | `omnimux-workflow` | 2026-08-24 | **选型结论：`挂载点 = ctx.tools，形态 = 对象插件，产物 = dsh.bundle`。** |
| `accepted` | [2026-08-24-omnimux-market-three-channel-skill-search.md](2026-08-24-omnimux-market-three-channel-skill-search.md) | omnimux-market 三渠道聚合检索基础设施需求规格说明书 | `omnimux-market` | 2026-08-24 | \| 字段 \| 内容 \| |
| `accepted` | [2026-08-23-omnimux-local-project.md](2026-08-23-omnimux-local-project.md) | 新建本地项目（作品包 = dsh 工作区文件夹） | `omnimux-workflow` | 2026-08-23 | **项目就是一个本地文件夹。** 这个文件夹既是 MiniMax 意义上的作品包，也是 dsh 必须绑定的会话工作区。 |
| `accepted` | [2026-08-23-omnimux-market-agent-plaza.md](2026-08-23-omnimux-market-agent-plaza.md) | OmniMux 插件市场：Agent 搜 / 选 / 召 闭环（Feature Spec） | `omnimux-products` | 2026-08-23 | 插件市场今天对人是完整货架，对 **dsh Agent 只是技能店**。 |
| `accepted` | [2026-08-23-omnimux-products-digital-fields.md](2026-08-23-omnimux-products-digital-fields.md) | Gxgen 数字产品结构对照（P1.2 表单拆分） | `omnimux-products` | 2026-08-23 | 老板判断对。Gxgen **库表是一张、界面是两套**。OmniMux P1.1 只把 `kind` 和战略六块塞进**同一张 overlay**，实物电商字段永远在，数字产品看起来像「带折叠战略的  |
| `accepted` | [2026-08-23-omnimux-products.md](2026-08-23-omnimux-products.md) | OmniMux 产品库插件需求文档 | `omnimux-products` | 2026-08-23 | 产品库是带货准备的**语义对象库**：一条产品 = 名称 + 怎么卖（卖点/人群/品牌/价格/SKU/链接）+ 可选主图引用。 |
| `accepted` | [2026-08-22-gxgen-workflow-migration-design.md](2026-08-22-gxgen-workflow-migration-design.md) | 设计规格：Gxgen 工作流 → OmniMux 完整迁移 | `omnimux-workflow` | 2026-08-22 | - 日期：2026-08-22 |
| `accepted` | [2026-08-22-omnimux-assets-creative-library.md](2026-08-22-omnimux-assets-creative-library.md) | OmniMux 资产库：从文件夹挂载改为创作资产（Feature Spec） | `omnimux-assets` | 2026-08-22 | 资产库不再是「把磁盘上的文件/文件夹挂进来」。 |
| `accepted` | [2026-08-20-omnimux-account-avatars.md](2026-08-20-omnimux-account-avatars.md) | 社媒账号头像本地持久化（Phase 2） | `omnimux-accounts` | 2026-08-20 | 挂载点 = Host HTTP `prefix:/omnimux/accounts`（新增 `GET /{id}/avatar` 字节路由 + GET 列表改写）+ 现有 Client Slot `s |
| `accepted` | [2026-08-20-omnimux-login-gate.md](2026-08-20-omnimux-login-gate.md) | OmniMux 统一登录门 — 架构设计 | `omnimux` | 2026-08-20 | - 作者：高见远（架构师） |

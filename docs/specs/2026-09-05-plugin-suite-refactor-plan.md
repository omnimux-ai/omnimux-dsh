---
title: "OmniMux 插件套件重构方案：职责收敛、运行时单真源与精准类型"
id: "spec-plugin-suite-refactor-20260905"
type: "spec"
status: "accepted"
authority: "L2"
date: "2026-09-05"
updated: "2026-09-05"
authors: ["x", "codex"]
subsystem: "global"
tags: ["architecture", "refactor", "types", "maintainability"]
related:
  - "docs/contracts/hub.md"
  - "docs/contracts/plugin-git-pr.md"
  - "docs/contracts/stage-guards.md"
  - "docs/evidence/2026-09-05-plugin-suite-refactor-audit.md"
---

# OmniMux 插件套件重构方案

本方案已由用户确认并进入实施，父任务为 [#539](https://github.com/omnimux-ai/omnimux-dsh/issues/539)，文档交付由 [#556](https://github.com/omnimux-ai/omnimux-dsh/issues/556) 承载。保留现有插件划分，围绕真实入口消除重复规则，将状态决策从宿主操作中分离，在 HTTP、执行事件、领域数据和宿主接口四处补可执行类型检查。

近期问题的共同点是：同一规则有多份实现；同一模块同时操作宿主、状态和 DOM；测试或类型注释没有覆盖真正运行的入口。单纯拆小文件不能解决这些问题。

## 1. 审查范围与基线

- 仓库：`omnimux-ai/omnimux-dsh`；初审目标为 `4be7dd4f1ed31e9dc584873c5e3e5bbe571440c1`，实施启动后重新核对到 `origin/main`：`0f4d327f92870ae87fc44367bfe5c493602fa5c5`。
- 历史窗口：UTC 2026-08-29 起至 2026-09-05 01:08:09；检索 246 条 merged PR 的元数据与变更路径，按重复修复链抽查正文、diff、调用点和现有测试。并非逐行审查全部 246 个 PR。
- 最新纳入 [PR #526](https://github.com/omnimux-ai/omnimux-dsh/pull/526)、[#532](https://github.com/omnimux-ai/omnimux-dsh/pull/532)、[#534](https://github.com/omnimux-ai/omnimux-dsh/pull/534)、[#535](https://github.com/omnimux-ai/omnimux-dsh/pull/535)、[#537](https://github.com/omnimux-ai/omnimux-dsh/pull/537)、[#541](https://github.com/omnimux-ai/omnimux-dsh/pull/541)、[#551](https://github.com/omnimux-ai/omnimux-dsh/pull/551) 与 [#553](https://github.com/omnimux-ai/omnimux-dsh/pull/553)。#532 替代 #529 的关闭面板行为；#534 修复 360px 会话栏中的 Composer 横向滚动；#535 增加分段脚本、翻译与引用；#537 增加发布中心账号侧栏；#541 修复 Preview 播放器比例、Markdown 泄漏、标题栏拥挤与空脚本提示；#551 增加 `speechToText` seam 和 digital-human `audioTrack` 透传；#553 重新平衡三联详情布局并消除左栏滚动。实施回归以这些现行行为为准。
- 完整证据、测试结果和限制见 [审查记录](../evidence/2026-09-05-plugin-suite-refactor-audit.md)。

| 合并链 | 已经完成的工作 | 本次重构依据 |
|---|---|---|
| #446 → #447/#448/#450/#451/#452/#453/#455/#456 | 工作台 Agent 协同、打包修复、工具输出声明、真实宿主 API 与快照修正 | 应统一快照投影和路由生命周期；#455 实际是测试调整，不能由标题推断仍缺实现 |
| #428 → #500 → #509；#499 → #516/#519/#529/#532 | 会话最小宽度、真实 panel 限制、复刻后展开会话 | 保留已经修好的几何和会话语义，隔离 focus、DOM measurement、viewport projection |
| #478 → #494 → #498 | Skill 选择器与广场分类 | 同一货架规则仍在两条运行路径及测试模块分别维护 |
| #449 → #485 → #507 | 模型契约 H1/H2 与 Catalog 投影 | 继续使用现有契约体系；W1/W2/H3/W3 未完成，不能另造一条模型重构路线 |
| #474 → #489 | 统一额度错误与计费预检 | 保持中枢拥有 auth/quota；不同领域的预检、通知和读操作语义不能被通用 fetch 包装抹平 |

## 2. 目标、边界与验收原则

目标是让维护者从一个业务入口找到一份规则实现、一个明确的状态所有者和可运行的验证。每个 PR 必须说明删除了哪份实现、保留哪个真源、调用者如何切换。

本计划超过 8 个文件，涉及多个插件，拆成独立可合并 PR；每个 PR 落地后产品仍可使用。不新建运行时服务、通用插件 SDK、状态框架、存储框架或第二个中枢。继续使用 Cordis、现有 `dsh-ui-kit`、React/React Flow、Zustand、EventSource、Node test 和 esbuild。

保持以下外部契约：工具名、HTTP 路由、工作台 Tab ID、当前数据文件布局、Catalog 已列出模型集合、auth/quota 决策、取消与恢复行为。已发现的行为缺陷单列修复，不在纯移动代码的 PR 中悄悄改变。取消历史接口支持时明确列出被删除输入及预期错误，不增兼容或迁移层。

OpenReel 完整 vendor、Electron shell、官方 harness pin/overlay、生产 profile、模型定价和账号发布操作均不属于本轮实现范围。`omnimux-video` 与 `omnimux-video-preview` 本轮保留；没有证据支持重写它们。CSS 体积与第三方源码行数不计入“必须重构”的理由。

## 3. 目标职责图

```text
官方 DSH services / betterSidebar / sessions
                    |
                    v
omnimux client: host adapter -> focus/layout decisions -> DOM effects
                    |                    |
                    +---- viewport projection ----> Hub mailbox / Agent tools
                    |
            现有 __omnimuxWorkbench API
                    |
        各插件 Tab / sidebar adapter / 领域 UI

各插件 Agent + HTTP -> 领域输入解析 -> 领域服务 -> 本插件存储
                                   |
                          ctx.get / omnimux_* seams
                                   |
                         omnimux 执行中枢 -> provider

workflow Host + SSE <-> shared execution protocol <-> client reducer + UI
publish Host + UI  -> shared record status（仅 publish 域内）
market picker + plaza -> 同一个 shelf 规则模块
```

业务插件不 import 中枢内部代码，客户端不接触 provider 凭据。共享模块只提取已经出现多个真实消费者的纯规则；Host I/O、DOM 操作和 UI 文案不混入共享数据模块。

## 4. 推荐实施批次

实施父任务为 [#539](https://github.com/omnimux-ai/omnimux-dsh/issues/539)，共 12 个可独立合并的子任务：

| 单元 | Issue | 交付 | 依赖 | 风险 |
|---|---|---|---|---|
| A1 | [#508](https://github.com/omnimux-ai/omnimux-dsh/issues/508) | ego-browser collector | 无 | R1 |
| A2 | [#540](https://github.com/omnimux-ai/omnimux-dsh/issues/540) | truthful live/Stage 验收 | #508 | R1 |
| A3 | [#542](https://github.com/omnimux-ai/omnimux-dsh/issues/542) | Hub 测试发现 | 无 | R3 |
| B1 | [#504](https://github.com/omnimux-ai/omnimux-dsh/issues/504) | Market 规则单真源 | #540 | R2 |
| B2 | [#543](https://github.com/omnimux-ai/omnimux-dsh/issues/543) | Inspiration 退役路径删除 | #540 | R2 |
| B3 | [#544](https://github.com/omnimux-ai/omnimux-dsh/issues/544) | Publish 状态与类型 | #540 | R2 |
| C1 | [#545](https://github.com/omnimux-ai/omnimux-dsh/issues/545) | Workbench 职责拆分 | #540、#542 | R1 |
| C2 | [#546](https://github.com/omnimux-ai/omnimux-dsh/issues/546) | Hub HTTP 生命周期 | #545 | R1 |
| D1 | [#547](https://github.com/omnimux-ai/omnimux-dsh/issues/547) | 表格寻址与 revision 修复 | #540 | R1 |
| D2 | [#548](https://github.com/omnimux-ai/omnimux-dsh/issues/548) | HTable 三模型 | #547 | R1 |
| E1 | [#549](https://github.com/omnimux-ai/omnimux-dsh/issues/549) | 执行事件类型单真源 | #548 | R2 |
| E2 | [#550](https://github.com/omnimux-ai/omnimux-dsh/issues/550) | SSE cursor 与统一投影 | #549、#540 | R1 |

依赖关系：A1 与 A3 并行，A1 后完成 A2；B1/B2/B3 可在独立 worktree 并行编码，但 UI 交付必须经过 A2；Hub 线 C1→C2，Workflow 线 D1→D2→E1→E2。两条线可并行，但未合并代码不得物化公共 Dev。模型与跨仓 kit 改造不放进这两批。

### A1：修复 ego-browser collector（scripts，R1）

A1/A2 的执行器方案已由 [ego-browser 共享验收迁移](2026-09-07-ego-browser-qa.md) 取代；下文的旧 collector 和行号仅保留历史背景，不得恢复为活跃验收入口。

消除 heredoc 中 CommonJS 与 top-level await 混用；在 Shell 端生成安全 JSON prelude，不依赖被 ego runtime 过滤的自定义环境变量。所有 Bash 变量显式定界。成功和失败均输出包含 run ID、SHA、请求/实际 URL、截图、错误与 task space 清理状态的报告；浏览器、快照或截图失败必须非零退出。测试覆盖 JSON 转义、空值、Unicode 路径、macOS Bash 3.2 和错误退出。该单元不改产品 client。

### A2：让 live/Stage 验收覆盖真实入口（scripts，R1）

**证据**：`scripts/agent-live-qa.mjs:4-29` 只请求首页，默认 44120，连接失败退出 0；stage 参数仅输出到日志，缺侧栏点击、DOM 断言和报告。`verify-stage-contracts.mjs:40-42,78-82` 检查的是现存旧 wrapper 文件，不保证真正运行的 sidebar adapter 被验证。

**变更文件**：`scripts/agent-live-qa.mjs`、`scripts/ego-browser-qa.sh`、`scripts/verify-stage-contracts.mjs`、对应脚本测试，以及本仓 `docs/contracts/stage-guards.md`、`docs/contracts/dev-pipeline.md` 中与入口一致的说明。

修复现有入口，复用 ego-browser 的采集流程；`verify:live` 默认明确为 Dev 45120，独立 L2 使用显式目标端口。要求执行真实侧栏触发、Tab 激活、内容非空与恢复断言；active Tab 及对应左栏选中唯一，已打开 Tabs 可共存，viewport 按 session 隔离。断连、空内容、错误 stage、缺报告均非零退出。报告记录 SHA、URL、stage、断言结果、截图和时间，写入 `docs/evidence/live-qa-report.json`。静态 Stage 检查跟随真实注册/消费路径，不能只扫描退役文件。

复用 A1 修好的 collector，不新增浏览器框架。`verify:live <stage>` 默认 Dev 45120；`--target=l2 --url=<url>` 必须与当前 worktree 的 `.l2-dev.env` 一致。L2 端口池从 44201 开始，生产端口 44200 明确保留。静态门禁从真实 sidebar 注册入口捕获 adapter，验证六方法与取消订阅；目标数为零、旧 wrapper 掩盖真实缺方法、错误 stage、旧报告、HTTP 200 但空 Stage、断言或子进程失败均阻断。

### A3：让实际协议测试进入正常测试入口（omnimux，R3）

`plugins/omnimux/package.json` 手写测试清单漏掉 `workbench-context.test.js`、`events-client.test.js`、`composer-envelope.test.js`；本次直接执行这三文件共 11 项通过。

更新该包 test 命令为覆盖当前有效测试目录的 Node 原生发现规则，包含 JS 与现有 TS 测试，明确排除 fixture/构建/vendor 文件；以实际枚举结果核对，没有 0-test 假通过。保留必要的包级环境设置。根 `pnpm test` 只覆盖部分插件，重构哪个插件就执行该插件的 test/typecheck/build，不能用根测试代替 workflow 验证。此 PR 不推广新测试框架或全库硬门禁。

### B1：market 货架规则单真源与脚手架删除（R2）

**证据**：`plugins/omnimux-market/scripts/concat-client.mjs:17-70` 手工拼接 20 个片段后已使用 esbuild；`src/client/skill-picker-logic.js` 未被运行时导入，picker/plaza 仍各有 taxonomy 和算法副本。

以现有 `src/client/skill-picker-logic.js` 为纯规则真源，由 boot 中的命名空间静态 `require` 接入；esbuild stdin 的 `resolveDir` 指向 client 源目录，使依赖在构建时内联。`skill-picker.js` 与 `skill-plaza.js` 消费同一 taxonomy、过滤、查询、手势和安装 payload，删两份规则和对应 parity-copy 断言；维持单个 ModuleLoader factory，不重写其余 18 个片段。Plaza 的未知非空分类仍执行字段匹配，不能错误回落到 all。

同时复用 [#504](https://github.com/omnimux-ai/omnimux-dsh/issues/504) 删除无入口的 `plugins/omnimux-market/src/client.js`；测试中仅作为分类器字符串样例的路径不等同运行时消费者。删除前再次核对 package exports、concat 列表、动态加载和打包内容。隐藏的 connectors Tab 有明确产品决策，不能当死代码一并清除。

缓存编排不在本单元替换：继续由运行时在请求完成时记录 TTL，并保留 in-flight 去重和取消。验收分类顺序、全部/我的/精选、未知分类、隐藏 connectors、中文搜索、Picker 选取、Plaza 过滤及单 factory 加载。bundle 测试拒绝运行时相对 require，并通过 metafile 证明真实规则进入输入。为该 JS 规则补限定文件的 `typecheck:contracts`（checkJs/noEmit）。

### B2：inspiration 删除已退役的 UI/编排路径（R2）

真入口 `src/client/index.js -> InspirationStage -> InspirationSection` 当前使用 `InspirationPreviewModal`、`InspirationInlineImportDialog`、`useInspirationFeed` 与 `oneClickReplicate`。

删除集合（均位于 `plugins/omnimux-inspiration/src/client/`）：`InspirationDetailModal.jsx`、`InspirationImportDialog.jsx`、`use-inspiration.js`、`workflow-global.js`。同步移除只服务旧 helper 的测试，更新 `styles.test.js`、`import-dialog-controls.test.js` 中对退役文件存在性的断言，保留对当前 Preview/InlineImport 的行为覆盖。样式和 locale 按真实消费者逐项删，禁止根据组件名整块猜删。

旧 `2026-09-04-inspiration-one-click-replicate-design.md` 曾为 #499 定界要求“不删 workflow-global.js”。本方案提出在新重构任务中显式替代这项保留范围，批准前不执行删除；同一 PR 更新该规格的状态/替代说明。保留 workflow 插件中仍用于新建项目的同名能力，不跨包删除。

验收：导入、查看三联详情、卡片及详情复刻全部可达；保留 #535 的有/无时间码分段、脚本段与分析章节双向定位、引用/分析/原始 Markdown、折叠、复制、原文/译文切换、译文持久化及失败可见性。保留 #541 的 9:16 播放器、纯文本分析渲染、单行标题栏、截断元信息和空脚本分析入口；保留 #553 的无左栏滚动三联布局、脚本列宽、折叠维度、footer 排列及计数去重。保留 #532 的 library+canvas 共存、展开 split 时右侧画布仍可见、预填失败仍展开会话、附件正确且自动发送次数为 0。翻译/分析测试使用 fake `textComplete`，本单元不新增模型引文真实性校验。

### B3：publish 领域状态与类型收敛（R2）

**证据**：`src/store.js:80` 与 `src/client/status-display.js:24` 重复聚合规则；`src/client/capabilities.js:140` 第三份规则仅由旧 `RecordsList.jsx` 消费。当前 `PublishStage` 使用 `views/PublishViewport`。`src/submit.js:39-43` 引用未定义的 `RecordStore` 等 typedef。

新增本插件 `src/shared/record-status.js`，Host 与当前 Client 共用纯聚合函数；`AggregateStatus` 固定为 draft/publishing/partial_failed/failed/published，reviewing 只由 publishing 加 reviewing 子任务投影为 `DisplayStatus`。删除无合法 Host 来源的 `aggregate === "reviewing"` 兼容分支。定义 `PublishRecord`、`RecordView` 与任务状态，工厂依赖用真实 `ReturnType<typeof createRecordStore>` 等推导；`PublishConfig` 在配置模块显式定义，避免自引用推导。区分未经完整验证的磁盘记录、内部记录、聚合状态和展示状态，不创建万能状态机。

删除旧 `RecordsList.jsx` 与只为它服务的 `capabilities.js` 聚合函数、两份重复状态算法和无效类型引用；同步 `store.test.js`、`status-display.test.js`、`capabilities.test.js`，更新插件内架构文档。

新增限定依赖闭包的 `typecheck:contracts`，覆盖 shared、store、submit、HTTP routes、config、media、hub channel、accounts 和 client status；不使用假 `.d.ts`、`noResolve` 或 exclude 隐藏诊断。HTTP 仍返回现有 `aggregate/subtask_summary`，不改 wire schema。验收空子任务、全部成功/失败、部分失败、reviewing、未知任务状态、in-flight 优先级、重启恢复、重复 submit 幂等；列表/卡片/日历及 #537 新账号侧栏保持。提交路径使用 mock，不产生真实授权、发布或付款。

### C1：workbench 的纯投影与宿主读写分离（omnimux，R1）

**证据**：`plugins/omnimux/src/client/workbench.js` 同时拥有模块状态（139–178）、DOM/observer（598–909）、Tab/绑定（1307–1466）和 Agent context（1468–1632）。客户端 occupants 与 `src/workbench/schema.js` 重复，快照读取既有 `.state` 也有 `snap.state || snap`。

新增中枢内 browser-safe `src/workbench/contract.js`，统一 occupant、Envelope/Surface/Context 类型；客户端新增 `src/client/workbench/host-adapter.js`、`focus-state.js`、`geometry.js`、`context.js`。按这些职责移动实际函数及测试，`workbench.js` 只保留当前 global API 的装配入口，不做旧私有 import 路径的转发兼容层。

adapter 只接受当前 pin 的 `SidebarSnapshot={sessionId,state}`；focus-state 只处理会话×Tab 的决策；geometry 计算值，宿主层应用；context 只将快照投影到 viewport。删除重复 occupant、散落的快照猜测和多份 context 拼装。既有 session memory、Files/native Tab 语义、360px 可见会话和关闭/展开顺序必须保持；#534 已收窄的 Composer 工具栏选择器与 360px 无横向滚动行为不得回退。

此 PR 先移动纯逻辑和建立类型边界，不修改 observer 的时间策略，不将历史延时一概删除。测试覆盖 chat/gui/split、无会话、多 Tab、会话切换、拖拽中/释放后、Files 与 library+canvas 共存。

### C2：Host 路由生命周期归一（omnimux，R1）

将 `src/host/apply.js:114-119` 对 workbench 路由的单独注册移到 `src/host/http.js` 的现有 mount/effect 卸载链，消费 `src/workbench/http-routes.js` 返回的 disposer。删除 apply 中重复取得 server 的分支；不改真实 Host 的 URL、注册顺序或本地请求校验。支持入口明确为官方 `ctx.inject` 生命周期；同步移除仅便利旧宿主 stub 的非 inject 回退，并将测试适配至官方形状。此退役必须在 PR 中明确声明，不能默默向非 inject 分支新增三条路由或声称所有旧 stub 行为不变。

补 `HubHttpDeps`、`RouteRegistration`、`Dispose`、`SessionQuery` 类型；动态注入用明确 getter 表达。新增 `src/host/http.test.js`，扩展现有 `src/auth/http-routes.test.js`、`src/host/apply.test.js`、workbench routes 和 mailbox 测试：disposer 除注销路由外，必须关闭活跃 SSE、清 heartbeat/订阅，并让 pending RPC 以现有 `no-client` 未应用回执结束；二次 dispose 幂等，重复挂载不残留。测试经过官方 register 形状，不使用不存在的 fake API；#551 新增的 `mountSpeechToText` 生命周期必须继续由 `apply` 正确挂载。现有证据说明清理所有权分裂，尚不等同已复现线上内存泄漏。

### D1：表格工作区、物理路径和保存 revision 修复（workflow，R1）

Agent 表格工具复用 `resolveTargetWorkspaceId`，优先级固定为显式 ID→当前 UI→唯一名称；无目标返回 `no-current-workspace`，删除首工作区和自动新建回退。Agent CREATE/REPLACE/GET/REMOVE 与 HTTP 共用 `resolveTableAbsPath` / `resolveTableRelativePath`，删除从 canvas 文件目录推导路径的第二 resolver。`node_id` 与 `table_path` 同时出现时必须指向同一 tableId；绝对路径、`../` 和 basename 截断伪装在 I/O 前拒绝。

保存后使用 `saveTable` 返回的 `document/contentRev` 更新响应、L1 索引和缓存，避免首次 UI 保存产生假 `version_conflict`。REPLACE 的目标不存在或不是 table 时不得先写文件。验收覆盖两个工作区的当前上下文、显式覆盖、已删除 UI 上下文，以及绑定/未绑定工作区的 Agent CREATE→HTTP GET/PUT→Agent GET/REMOVE。

### D2：HTable 输入、文档与画布索引收敛（workflow，R1）

复用已有 Zod，明确 `TableWriteInput`（Agent 二维 cells/columnIndex）、`HTableDocument`（v1 字典落盘）和 `TableNodeData`（L1 摘要）。unknown 只在 Agent、HTTP、磁盘和 ReactFlow 数据入口解析一次；`buildTableDocument`、LLM 投影和 L1 摘要各保留一个纯函数。删除 columns/filter/rowHeight 与 TableNode 的 any、模糊双输入和重复字段枚举。

创建入口补齐当前格式默认值，存储直接校验当前 schema。按项目“不保留兼容”规则删除旧数组文档迁移和 `.hilo` 路径回退；旧格式明确报错，不自动迁移、改写或删除用户文件。确认 Host bundle 内联 Zod，安装产物没有未声明运行时依赖。

### E1：执行状态、事件名和 Payload 类型单真源（workflow，R2）

扩展现有 `src/shared/events.ts`，统一执行状态、11 个业务事件名和按 event name 判别的 Payload。`ExecutionContext`、SSE、executionTypes/recovery/timers、shared API、Client store/controller 与自验脚本全部消费该定义。删除四份 event 列表、全 optional `SseEventData` 和重复状态枚举。通用 output 保持 unknown，只在输出边界收窄；该单元保持现有 wire、磁盘记录和运行行为。

### E2：SSE cursor、断线恢复与统一结果投影（workflow，R1）

保留现有历史 replay，新增唯一 `ExecutionEventJournal`：每个内存执行实例持有 epoch、单调 sequence 和现有 500 条 ring。Context 事件先入 journal，再通知订阅者和持久化；磁盘仍投影为 `{event,payload}`，恢复时重建 epoch，不新增迁移器。snapshot 增加 cursor，SSE 业务事件写 `id: <epoch>:<sequence>`；初次连接用 URL cursor，自动重连优先 `Last-Event-ID`。epoch 不同、cursor 超出 ring 或未来 cursor 时发送带权威 snapshot/cursor 的 `execution_snapshot` 控制事件。

异步恢复完成后，publisher 在同一同步阶段完成订阅、读取 cursor/ring、发送 backlog 或 snapshot 并进入 live；重入队列按 sequence 去重。Client 用 generation、source、workspaceId、executionId 和 lastApplied 隔离旧请求/旧流；出现游标缺口时重新取得 snapshot，不能凭空补状态。恢复中的 running→pending→running 合法。

SSE 和 snapshot 共用 `projectExecutionNodeData`：running/completed/skipped 清旧错误，空字符串可清旧文本，两入口写相同媒体字段和 taskId；生成结果删除旧 realPath，导入节点保留真实路径；无变化保持对象引用，避免重复 autosave。测试覆盖重复、断线、ring 裁剪、Host 重启、恢复期间新事件、旧请求晚到、pause/resume/cancel、failStrategy=skip 及无 cursor 的 m3/m4/perf 消费者。

## 5. 类型与复用准则

| 位置 | 做法 | 通过条件 |
|---|---|---|
| JS Host / 领域纯模块 | JSDoc typedef、导入真实工厂返回类型，限定文件启用 `allowJs/checkJs/noEmit` | 新增包级 `typecheck:contracts` 实际返回 0；编译包含修改模块的依赖闭包，不能用跳过源文件规避错误 |
| workflow TS | 共用协议/领域类型；判别联合替代全 optional 大对象 | 现有 canvas/host 两套 typecheck 通过；网络 unknown 先解析再进入内部 |
| Host/plugin seam | 描述消费者实际需要的方法、参数、返回值和 disposer | 不把 ctx/window 整体声明成 any，不 import 中枢私有实现 |
| 存储与 UI | 明确 RawInput / Document / View / Patch，保留运行时校验 | 非法输入在 I/O 前失败，类型检查不能代替路径、权限和网络校验 |

各 JS 包新增类型检查时显式声明 TypeScript 开发依赖，沿用仓库已经采用的 5.9 系列锁定版本；只增加编译工具归属，不引入新运行时库。首包是 publish，后续中枢模块随 C1/C2 推进，不先全仓改扩展名。[TypeScript 官方 checkJs 文档](https://www.typescriptlang.org/tsconfig/checkJs.html) 支持这一渐进路径。

公共 UI 真源是另仓 `dsh-ui-kit`；已有 StageStore 六方法类型可以消费，但其 `createStageStore` 是 overlay claim/release，不能替换工作台 Tab adapter。HTTP、磁盘存储、provider 请求不归 UI kit。六个库页虽有相同 54 行延迟适配器，本两批暂缓收敛；C1 后由后续任务核对现有 workbench readiness/生命周期再决定做法，不预设新增 kit export，也不发明 `omnimux-kit`。

## 6. 既有任务与明确排除

| 项目 | 当前证据 | 处置与完成条件 |
|---|---|---|
| speech-to-text 与 audioTrack | 初审时缺 seam/透传；[#551](https://github.com/omnimux-ai/omnimux-dsh/pull/551) 已独立交付 `speechToText` 与 digital-human `audioTrack` | 本计划不重复实现；C2 保留其 `apply` 挂载，A3 持续发现新增 `stt.test.js` |
| 模型结构校验漂移 | `catalog/contract/schema.js:374-389` 接受数值 role，而 JSON Schema 要求字符串；纯 validator 探针确认 | 独立 invalid fixture 修复；结构 validator 单真源的选型与 #468 协同，保留 prompt/research/profile/alias 等语义规则，不把 Ajv 当全部替代 |
| 表格工作区、路径与 revision | `tableTools.ts` 取首工作区、Agent/HTTP resolver 分裂、保存返回 revision 被忽略 | 纳入 [#547](https://github.com/omnimux-ai/omnimux-dsh/issues/547) 与 [#548](https://github.com/omnimux-ai/omnimux-dsh/issues/548)；不迁移或删除用户文件 |
| 执行重复与恢复差异 | SSE replay 可重复应用；SSE/snapshot 对 error/taskId/realPath 投影不同 | 纳入 [#549](https://github.com/omnimux-ai/omnimux-dsh/issues/549) 与 [#550](https://github.com/omnimux-ai/omnimux-dsh/issues/550)；保留历史 replay，使用 cursor 修复 |
| 模型 W1/W2/H3/W3 | [#466](https://github.com/omnimux-ai/omnimux-dsh/issues/466)、[#467](https://github.com/omnimux-ai/omnimux-dsh/issues/467)、[#468](https://github.com/omnimux-ai/omnimux-dsh/issues/468)、[#469](https://github.com/omnimux-ai/omnimux-dsh/issues/469) 仍 open/planning | 沿用 [#463](https://github.com/omnimux-ai/omnimux-dsh/issues/463) 现有分解；删除 BUILTIN/静态 fallback/重复参数推导的验收归这些任务，不新建竞争内核、不宣称已 live |
| 公共脚本和历史别名 | 构建脚本重复，但 prepare 在独立安装包运行；legacy model/HTTP 输入仍有现行说明 | 本两批不改打包拓扑；历史格式/路由撤除独立清单。禁止为了仓内复用破坏安装包闭包，禁止统一替换活跃 locale 标识 |

表格与 SSE 在初审时是源码调用链证据，现已作为本计划缺陷单进入实施；audio 与模型 schema 仍保持独立，不借架构重构扩单。已有 #504/#508 复用原任务，其余子任务均已按 Git 合同建单。

## 7. 执行、验证与回滚

每个实施 PR 使用新的 `pnpm wt:start <plugin> <topic> <issue-id>` worktree；本方案 worktree 只保存 #556 文档交付，不用作产品实施工作区。先刷新 origin/main、重新核对删除集合与其他 PR，随后编码。Issue 已保存具体边界；推送、合入、共享 App 操作遵守授权与风险矩阵。

通用静态检查为 `pnpm check:boundaries`、`pnpm check:package-files`、`pnpm verify:stages`、`pnpm verify:tools`、`pnpm verify:slots`；它们不等于安装或浏览器证明。构建变更要从实际包清单检查新增模块可安装；workflow 不提交 dist/lib，其他仍跟踪的 client 产物按当前合同更新。

| PR | 自动验证 | 真实交互验收 |
|---|---|---|
| A1 | 新增 collector 脚本测试、`pnpm test:gates` | collector 成功/失败报告与 task space 清理可追溯 |
| A2 | 新增 live/Stage/端口脚本测试、`pnpm test:gates` | ego-browser 真实侧栏、active Tab、非空 stage、session 隔离 |
| A3、C1/C2 | `pnpm --filter omnimux test`、对应 `typecheck:contracts`、`pnpm --filter omnimux build` | Workbench focus/Files/多会话/复刻、SSE/RPC 卸载重挂 |
| B1 | `pnpm --filter omnimux-market test`、`typecheck`、新增 `typecheck:contracts`、`build` | Picker 与 Plaza 使用同一分类和过滤语义 |
| B2 | `pnpm --filter omnimux-inspiration test`、`build` | 导入、三联预览、复刻，包含 #532 场景 |
| B3 | `pnpm --filter omnimux-publish test`、`typecheck:contracts`、`build` | 三种记录视图一致；mock submit/retry，零真实发布 |
| D1/D2 | `pnpm --filter omnimux-workflow test`、`typecheck`、`build` | 表格跨入口、当前格式校验、版本一致性 |
| E1/E2 | `pnpm --filter omnimux-workflow test`、`typecheck`、`build`、m3/m4/perf 自验 | 执行重放/恢复/取消、游标 resync、媒体落盘与回读 |

表格专项现有测试：`src/workflow/agent/tableTools.test.mjs`、`src/workflow/agent-graph-tools.test.mjs`、`src/workflow/routes/tableRoutes.test.mjs`、`src/workflow/storage/table-storage.test.mjs`。执行专项：`src/workflow/execution-routes.test.mjs`、`src/workflow/execution-scheduler.test.mjs`、`src/workflow/execution/step-checkpoint.test.mjs`；E2 增加 journal、stale generation 与 execution projection 测试。

环境顺序遵守两项约束：合并前只在 `pnpm wt dev <topic> <issue-id> <plugin>` 创建的独立 L2 环境验证，A2 将端口池调整为 44201–44299 并保留生产 44200；未合并代码不物化公共 Dev。经人工授权与 Merge Queue 合入后，从桌面 fork 的 `yarn omnimux:sync` 物化 Dev，再在 45120 执行修复后的 `pnpm verify:live <stage>` 和 ego-browser 验收。公共 App 重启另按既有授权，生产 44200 不触碰。当前 package.json 没有 `wt:dev`，使用已存在的 `wt dev` 子命令。

本轮未启动 L2、未访问或改变 App/profile、未验证 provider；GitHub CLI 读取已成功，现有 Node 测试可运行。类型与构建使用项目工具；依赖安装如触发 prepare，只能在实施专属 worktree 进行。浏览器 collector 的当前缺口由 A1 解决，不能预先宣称后续 UI 路径可用。无需新账号、密钥或真实费用；任何额外 live 媒体/发布验证须单独明确授权。

回滚按单 PR revert 恢复，重新运行相同验收；本两批不做数据迁移，因而无需数据回滚或双写。删除代码的恢复来源是 Git，不保留旧代码副本或兼容转发层。失败保留该 worktree、日志和证据，停止后续依赖 PR；不强制 reset 主仓或清除用户工作。

## 8. 最终完成标准

1. B1/B3 的真实运行消费者使用一份领域规则；C/D/E 的协议与状态投影只有一个所有者。
2. 删除清单中的文件、算法、副本及对应过时测试/文档同步收口；不能只增加新实现后留下旧入口。
3. 修改的关键边界类型检查实际执行通过；不新增宽泛 any、全局 ts-ignore 或静默吞错来消除报错。
4. 原有有效功能和新发现缺陷的回归用例通过；每个前端 PR 有隔离 L2 和合并后 Dev 45120 的真实 evidence。
5. 每个 PR 交付净增删统计、规则消费者列表、构建/安装与测试证据、未完成项及四项 Delivery Board。行数和 CRSA 仅辅助比较，不设全仓删行百分比，不以换文件位置提高评分。

本方案最脆弱的前提是“当前测试/发布入口能反映真实产品路径”。本次已找到反例，因此先修复已有验证入口、先固定行为再去重；不能把当前静态绿灯作为大范围重写的依据。

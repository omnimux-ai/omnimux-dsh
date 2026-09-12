# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式。

## Unreleased

### 变更
- **重启恢复从「盲目重投」升级为「上游任务复核」（Issue #1382 P2）**：提交成功后 `taskId` / 能力 / 提交时刻随节点状态落盘，进程重启后在途节点仍回置 pending，但执行器先按该引用向 hub 复核而不是重新提交。
  - `src/workflow/seam/gateway.ts`：新增 `UpstreamTaskRef`（`taskId` / `capability` / `submittedAt`）与 `GenerationGateway.reconcileTask(ref, dest, signal)`。复核不复用 `awaitTask`——后者以进程内任务表为前提，「未知任务」是它的契约性错误，正是复核要区分的两种含义。
  - `src/workflow/seam/omnimuxGateway.ts`：`reconcileTask` 走既有 `{ taskId, dest }` 路径并带上 `submittedAt`，因此**不读进程内存**、天然支持跨进程复核；`src/workflow/seam/mockGateway.ts` 显式抛「任务不跨进程存活」，`gatewaySelection.ts` 补路由（`taskOwners` 优先，默认 hub）。
  - `src/workflow/execution/ExecutionContext.ts`：`NodeStateSnapshot` 增可选 `upstreamTask`；新增 `setNodeUpstreamTask` / `clearNodeUpstreamTask` / `readNodeUpstreamTask` 与 `onPersistRequested` 钩子（落盘不等 5s 同步周期）；`fromJSON` 对持久化值做校验归一，坏值等价于无引用；**`startNode` 保留引用**（否则恢复后的节点在调度器置 running 时就把复核依据抹掉）。
  - `src/workflow/execution/upstreamReconcile.ts`（新增）：三态状态机 `downloaded` / `failed` / `not-reconcilable`，`UPSTREAM_TASK_DEADLINE_MS = 20min` 且严格小于 `EXECUTION_TIMEOUT_MS`。
  - `src/workflow/execution/materialGatewayExecutor.ts`：有引用即复核（`submit` 调用数为 0），submit 成功后**立即**登记引用，节点终态清除；上游已完成 → 下载回填，未完成 → 保持 running 续等，失败 → 节点标错，无引用或 hub 不认该任务 → 回退重投。
  - `src/workflow/execution/executionRecovery.ts`：`resetInFlightNodeStates` 重置 status/时间戳但**保留** `upstreamTask`（#1379 的「重启后回 pending」语义不变），恢复日志补 `reconcilable` 计数。
  - `src/workflow/execution/executionStore.ts`：`schemaVersion` 保持 `1`，`nodeStates[].upstreamTask` 为可选增量字段（老记录缺失即「无引用」，仍走重投路径，行为不劣化）。
  - 回归测试：`upstreamTask.test.mjs`（7）、`upstreamReconcile.test.mjs`（10）、`materialReconcile.test.mjs`（6）、`upstreamRecovery.test.mjs`（3）、`reconcileContract.test.mjs`（9）。修复前：恢复路径必然重投（`reconcile` 计数恒为 0、持久化记录无该字段）；修复后全量 1628 pass / 0 fail。
- **源码唯一真相**：停止跟踪 `dist/index.js`、`lib/client.js`、`lib/canvas.js`。入口仍由 build 生成（`prepare` + `sync-to-app` 现场 build）；CI 拒绝把这些文件重新提交进 Git。画布 island 在 `canvasHash` 变化时替换 `<script>`，避免 Dev App 吃到过期 IIFE。

### 修复
- **执行终止后节点状态不再残留在飞态（Issue #1379）**：取消 / 超时 / 中断 / 失败后，仍在飞的节点不再永久停留在「生成中…」，重载画布也能恢复。
  - `src/workflow/execution/ExecutionContext.ts`：新增私有 `settleInFlightNodes()`；`cancel()` 把 `nodeStates` 里仍为 `running`（含恢复重 pend 的 `pending`）的节点收敛为 `skipped`（`skipReason: 执行已取消`），`fail()` 收敛为 `error` + 失败信息。`cancel()` 改为幂等，避免超时清理与调度循环重复落终态事件。`toJSON()` 快照与 `execution.json` 因此不再出现 running 残留。
  - `src/workflow/execution/executionControl.ts`、`src/workflow/execution/executionTimers.ts`：取消 API 与执行超时清理在 `abort()` 之后立即收敛并落盘终态记录——超时路径上条目已离开内存表，只剩持久化记录可供快照读取，不能再等调度循环观察到取消。
  - `src/canvas/hooks/useExecutionController.ts`：`execution_cancelled` / `execution_error` 收敛 UI 状态与节点数据里的 `executionStatus`（写法沿用 `node_error` / `node_skipped`），GSC 不再停留在 `generating`；岛屿重载且无存活执行时，同样收敛画布文档里残留的在飞态，守卫（`shouldConvergeInFlightOnReload`）同时排除「启动在飞」窗口——`startExecution` 等 `createExecution` 返回期间 store 仍是 `idle`，只看状态会把该窗口误判成无存活执行。SSE 事件分发提取为模块级 `dispatchExecutionEvent()`，使事件处理可无头测试。
  - 回归测试：`src/workflow/execution/nodeStatusConvergence.test.mjs`（6 例）、`src/canvas/hooks/executionTerminalConvergence.test.mjs`（9 例，含重载守卫的 4 例）。修复前：服务端 6 例全失败，前端用例模块不可加载（`dispatchExecutionEvent` / `settleInFlightNodes` / `shouldConvergeInFlightOnReload` 尚不存在）；修复后：15 例全通过 / 0 fail。

## [1.0.0-rc.1] - 2026-08-22 — M5 产品化收官

### 新增
- **Agent 工具（`src/workflow/agent/agentTools.ts`）**：三个 `ctx.tools` 工具（宿主侧直连 store / executionManager，无额外 HTTP 调用、无新 seam 消费），让 dsh 会话里的 Agent 能指挥画布——
  - `workflow_list`：列出工作区（id/name/version/nodeCount/updatedAt，新→旧），`include_executions: true` 附带最近 5 条执行概览（状态 + 进度）
  - `workflow_run`：`{workspace_id | workspace_name, mode: full|subset, node_ids?, wait?, timeout_ms?}` 创建执行；`wait=false`（默认）立即返回 executionId + 提示（画布可看实时进度）；`wait=true` 轮询到终态（completed/error/cancelled，默认 120s 超时）返回结果摘要——各节点状态、文本产物摘录（240 字截断）、媒体文件 URL + 本地绝对路径
  - `workflow_snapshot`：`{workspace_id, include_nodes?}` 工作区摘要（节点/边计数、素材类型分布、执行设置）或完整节点/边结构（Agent 读取画布做分析/修改建议）
  - 错误统一 `{error, message}` 返回（不抛出，wire 形态确定）：invalid-args / workspace-not-found / ambiguous-workspace-name / invalid-subgraph / empty-graph / execution-not-found
- **系统提示词**：`ctx.systemPrompt.section` 注册 `workflow:ops`（order 60，与 assets 插件 assets:ops=50 不冲突）——说明三工具用法场景、画布与 OmniMux 生成的关系、「用户在画布上操作时 Agent 可查询/触发执行」的协作提示
- **性能基线（`scripts/perf-baseline.mjs`，`npm run perf:baseline`）**：host 侧 200 节点 / 380 边分层 DAG + 零延迟网关（纯调度开销，无真实/mock 延迟）——拓扑分层 / subset 上游闭包（各 50 次均值）、引擎直跑 execute()、200 节点快照 PUT、创建执行、创建→SSE complete 全链路（事件吞吐 + 节点吞吐）、状态快照轮询单次成本；island 浏览器侧验证方法记录于 README「性能基线」
- **测试与自验**：新增 agent 工具测试 12 个（fake ctx.tools 收集注册 + 三工具成功/错误路径全量：空/非空列表、wait 两态、按名解析、subset、超时、五种错误码），全量 51/51 绿；`scripts/m5-self-verify.mjs`（`npm run verify:m5`）自验工具注册齐全 + list/run(wait=false)/snapshot 往返 + 性能基线出数字

### 变更
- **React Flow 渲染优化（200+ 节点场景）**：`CanvasEditor` 的 catalog 注入节点列表改为 `useMemo`（此前每次编辑器重渲染都全量重建 node/data 对象，击穿 React Flow 节点 memo，每个 MaterialNode 都重渲染——实测修复点）；开启 `onlyRenderVisibleElements` 视口裁剪（离屏节点卸载，节点状态在 canvasStore，重回视口完整恢复）
- `mountWorkflowHost` 的 ctx 新增可选 `tools` / `systemPrompt` 座位（在场时注册 agent 工具，经 `ctx.effect` 托管销毁）；插件 `inject` 从 `['webServer']` 扩为 `['tools', 'systemPrompt']`（webServer 改经 `ctx.inject(['webServer'])` 获取，omnimux-assets 同款模式）
- dist/index.js 新增导出：`registerWorkflowAgentSeats` / `WORKFLOW_PROMPT_SECTION` / `DEFAULT_RUN_WAIT_TIMEOUT_MS` 及相关类型

### 修复/清理
- 删除 canvasRoutes.ts 过时的「canonical 前缀在桌面 Host 不生效」open issue 注释——谜底是「假重启」（quit 未杀净旧 Host 进程，干净重启后 canonical 前缀一切正常）；改为准确的双前缀说明 + 运维提示（重启需杀净进程）
- 版本 0.3.0 → 1.0.0-rc.1（画布/执行引擎/真实网关/agent 工具四层能力齐备，达到 rc 完整度）

## [0.3.0] - 2026-08-21 — M4 接通 OmniMux 执行中枢

### 新增
- **OmniMuxSeamClient（`src/workflow/seam/omnimuxGateway.ts`）**：GenerationGateway 的真实实现——经 cordis `ctx.get('videoGenerate' | 'imageGenerate' | 'textComplete')` 消费执行中枢 seam（不 import hub 包 / 无自带 HTTP client / 无 provider key，红线全守）。媒体走 `wait:false` 提交 + `{dest, taskId}` 轮询下载（hub 负责落盘到 `$DSH_HOME/omnimux/workflow/media/executions/`）；textComplete 在 awaitTask 阶段一次性执行并落盘文本产物；AbortSignal 贯通到 hub 的 submit/poll/download。契约调研结论：`docs/m4-hub-seam-research.md`
- **网关装配与降级（`src/workflow/seam/gatewaySelection.ts`）**：`OMNIMUX_WORKFLOW_GATEWAY=omnimux|mock|auto`（默认 auto：mount 时探测 seam，hub 在场→seam 客户端，否则 mock；auto 模式每次提交前重探，hub 晚挂载可单向升级，已提交任务归原网关）；强制 omnimux 且 seam 缺失时节点报 `[omnimux:needs-provider]`，绝不静默 mock
- **错误映射**：hub `OmnimuxError`（code+message）透传为节点执行错误 `[omnimux:<code>] <message>`（徽标可见）；failStrategy（abort/skip）语义不变，单节点失败不炸全局
- **seam 并发上限**：对 hub 的在途请求数计数信号量，默认保守 2（`OMNIMUX_WORKFLOW_MAX_SEAM_CONCURRENCY` / `mountWorkflowHost({ seamConcurrency })` 可调），叠加工作区 maxParallel 防限流
- **能力目录真数据**：`GET /api/capabilities` 在 seam 可达时返回 `source: "omnimux"`（视频/图片模型 id = hub 路由默认 + `OMNIMUX_VIDEO_MODEL`/`OMNIMUX_IMAGE_MODEL` env 覆盖；文本 = hub 白名单 8 行；audio 空——hub 无 audioGenerate seam）；hub 不可达回退 mock 静态清单。节点配置面板模型下拉原已消费该 API，M4 起数据为真
- **组/子集执行入口**：右键多选 →「执行选中节点（含上游）」、右键单节点 →「执行此节点（含上游）」（subset 模式，host 自动补传递上游闭包）；串行（maxParallel=1）与批量（N>1）行为经真实网关路径验证
- **上游参考输入映射**：上游图片 → seam `image`（i2v/图生图/视觉文本）；上游音频（视频节点）→ `audio`；上游视频参考因 hub seam 无对应字段被明确忽略（日志警告 + 节点 UI 提示「等待执行中枢扩展」，README 已知限制）
- **测试与自验**：新增 seam 客户端测试 11 个（fake seam 注入 ctx.get：全链路/文本/错误映射/skip 策略/取消/目录 env 覆盖/三条回退路径/晚绑定升级/并发默认与可配），全量 38/38 绿；`scripts/m4-self-verify.mjs` 自验 15 项全过（fake seam，零真实模型请求）

### 变更
- `mountWorkflowHost(ctx, opts)` 的 ctx 新增 `get?: (name) => unknown`（cordis seam 查询）；opts 新增 `gatewayMode` / `seamConcurrency` / `env`（默认装配 knobs；显式 `gateway` 注入优先级不变）
- materialGatewayExecutor 的上游参考映射从「image/video 能力一律透传上游 mediaUrl」收紧为按上游素材类型映射（图片→image、音频→audio、视频→忽略 + 进度提示）
- dist/index.js 新增导出：`createOmnimuxSeamClient` / `SeamGatewayError` / `assembleGateway` / `createAutoSwitchGateway` / `probeSeams` / `resolveGatewayMode` 及相关常量

### 已知限制（新增条目，详见 README）
- 视频参考输入（v2v）等待执行中枢扩展 seam 字段；画幅参数不透传（schema 无字段）；能力目录为 hub 契约默认镜像（hub 无目录 seam）；跨进程任务恢复为重新提交（hub 无任务台账）

## [0.2.0] - 2026-08-20 — M3 执行引擎移植

### 新增
- **执行引擎（host，Gxgen 全量移植 + TS strict 化）**：
  - `ExecutionScheduler`：Kahn 拓扑分层（getTopologicalGroups）、maxParallel 节流并行（默认 3，读工作区 settings）、Promise 挂起式暂停/恢复、取消（在途执行器 abort，取消引发的中止不计节点失败）、单步模式（stepOver/stepN）、断点（breakpoint）、500ms 防抖 DAG 状态刷盘
  - `ExecutionContext`：执行级 + 节点级状态机（pending/running/completed/error/skipped/paused/cancelled）、11 种事件 typed emitter（协议与 Gxgen useExecutionSSE 逐字段对齐）、toJSON/fromJSON
  - `ExecutionManager`：执行实例编排（创建/暂停/恢复/取消/状态快照）、5s 周期记录同步、30min 超时清理、mount 时 recoverAll 断点恢复（fromPersistedState；崩溃时在途节点回置 pending）
  - `subgraph.ts`：full/subset 子图解析（节点集合 → 诱导子图，上游闭包）
  - 事件回放缓冲：创建后订阅 SSE 也能收到完整事件序列（含跨重启恢复，eventLog 随 execution.json 持久化）
- **执行 API 路由**（挂既有 dispatcher，legacy `/dsh-workflow/*` 前缀兼容，跨域校验/body 上限/错误格式沿用）：
  - `POST /api/workspaces/:id/executions`（full/subset）、`GET .../executions`、`GET .../executions/:execId`
  - `POST .../executions/:execId/pause | resume | cancel`（非法状态 409）
  - `GET .../executions/:execId/events`：SSE（text/event-stream，11 事件 + 30s 心跳 + 回放）
- **执行器接通 mockGateway**：执行器注册表（扩展点②）挂 gateway 版 material 执行器——生成型工具走 `gateway.submit → awaitTask`（模拟 1-3s 延迟，`mockFail: true` 注入失败），产物落 `$DSH_HOME/omnimux/workflow/media/executions/<id>/` 并转 `/omnimux-workflow/media/` URL 回填；文本能力回填 mock 文本；非生成工具走透传（含上游输入聚合）
- **画布 island 执行 UI**：
  - 执行控制条（执行全部/暂停/恢复/取消/重置 + completed/total 进度条）
  - 节点执行徽标（pending 灰 / running 转圈 + 下游边流动动画 / completed 绿 / error 红 + 错误信息 / skipped 空心）
  - `useExecutionController`（Gxgen useExecutionSSE + useExecutionSync 移植）：EventSource 订阅、只更新变化节点的 data（触发自动保存）、island 重载后按 executionId 恢复订阅（列表 → 快照回填 → 重订）
  - 节点面板「执行此节点（含上游）」：subset 单节点执行（替代 M1 stub 按钮）
- **测试与自验**：新增 16 个测试（调度器单测 11 + 路由/SSE/恢复 5），全量 27/27 绿；`scripts/m3-self-verify.mjs` 端到端自验 13/13 项（3 节点 DAG → SSE 完整序列 → 暂停/恢复/取消 → 断点恢复续跑）

### 修复（开发中发现）
- 取消执行时 abort 在途执行器导致节点报 error、把执行状态从 cancelled 覆盖为 error——调度器现将取消引发的中止视为取消路径而非节点失败
- SSE 迟订阅丢 execution_start：事件落 entry 级回放缓冲，订阅时先重放再转发（幂等）

### 破坏性变更
- `GenerationGateway.awaitTask` 返回值增加 `text?` 字段（文本能力输出）；`SubmitRequest` 增加 `mockFail?` 字段（mock 失败注入，真实客户端忽略）
- 执行器注册表不再自带 M1 透传 material 执行器——host mount 时注册 gateway 版；直接消费 registry 的代码需自行注册

## [0.1.0] - 2026-08-20 — M1 脚手架 + 画布壳

### 新增
- 四区目录（client / canvas / host / shared）+ esbuild 三 bundle 构建流水线（host / client / canvas）
- React 19 island 桥（方案 α）：CanvasBridge（宿主 React 18 壳）→ `__dshWorkflowCanvas` IIFE global（自带 React 19.2.8）；桥接只过 DOM + plain props
- 画布内核（Gxgen 移植，spike 验证口径）：React Flow 容器 + MaterialNode 骨架 + canvasStore Graph slice + 连接校验链 4 文件（类型矩阵 / 环检测 / mutation gateway）
- `--wb-*` 主题变量层映射 dsh 蓝 `#4176E6`（`--dsw-static-deepseek-500` fallback 链）+ `body[data-ds-dark-theme]` 暗色跟随
- Host：`/dsh-workflow/*` HTTP 路由（工作区 CRUD + 乐观锁 409 + 岛 bundle 下发 + 媒体静态路由防穿越）+ `$DSH_HOME/omnimux/workflow/` 文件持久化（zod 构建期打包、原子写）
- 三处扩展点脚手架：节点类型注册表（client）、执行器注册表（host）、GenerationGateway 接口 + mock 实现
- 侧边栏「工作流」条目（32/14/14 规格，双 MutationObserver 挂载）+ shell.overlay 一级页面 + product-stage claim

### α 验证（React 19 island，双 React 验证页实测）
- ✅ 双 React 同 document 共存：React 18.2 宿主树（计数器/受控输入）与 React 19 island（xyflow 画布 + antd 组件）互不干扰，全程零 console 错误
- ✅ xyflow 交互：节点尺寸/拖线成边/环检测拒绝均正常
- ✅ 暗色主题跟随（body[data-ds-dark-theme] 切换 island CSS 变量实测变化）
- ✅ island 生命周期与持久化闭环：unmount/remount 后工作区从快照恢复；保存走 PUT 乐观锁（v0→v1）
- ⏳ React DevTools 双 root 检查与 200 节点性能基线待真实 dsh 宿主环境（M2 前置项）

### 修复（构建/测试过程中发现）
- esbuild text-loader 会吞掉 CSS import：`@xyflow/react/dist/style.css` 必须与主题 CSS 一起在 island 入口手动注入 `<style>`（Vite 自动注入、esbuild 不会——spike 未暴露此差异）
- snapshotSchema 一处 `z.boolean().optional` 漏写调用括号（zod 报「expected a Zod schema」）
- host bundle 内插件根目录解析需同时兼容 dist（上溯一层）与源码（上溯三层）两种布局

### 已知限制
- 执行按钮为 stub；能力目录为静态 stub；保存为手动按钮（见 README）

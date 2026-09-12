# omnimux-workflow

> 运维入口：`cd ~/Desktop/Project/omnimux-desktop-fork && yarn omnimux:sync omnimux-workflow`（+ `yarn omnimux:restart`）。`npm run deploy` 已废弃为转发器，勿再加私有同步逻辑。详见 `docs/contracts/ops-entry.md`。
>
> **Gxgen 迁移蓝图（代理必读）**：产品树 [`docs/contracts/gxgen-workflow-migration.md`](../../../docs/contracts/gxgen-workflow-migration.md) —— 进度矩阵 + Phase0 项目壳优先 + 术语表。动手改画布对齐前先更新/阅读矩阵。


DeepSeek Harness（dsh）的工作流无限画布插件：拖拽节点、连线成 DAG、编排多模态生成任务，并允许 dsh 会话里的 **Agent 通过工具查询与执行画布**。画布自身零模型 API 调用——所有生成经 OmniMux 执行中枢的 seam 提交（M4 已接通）；数据 100% 本地文件（`$DSH_HOME/omnimux/workflow/`）。

## 产品能力总览（M1–M5）

| 里程碑 | 能力 |
|---|---|
| M1 脚手架 | 四区目录（client/canvas/host/shared）+ 三 bundle 构建；React 19 island 桥（宿主 React 18 与 island 双 React 共存）；侧边栏「工作流」入口 + product-stage 全屏页；`--wb-*` 主题变量层 + 暗色跟随 |
| M2 编辑器 | React Flow 画布 + MaterialNode（prompt/模型/参数配置面板）；连接校验链（类型矩阵/环检测/mutation gateway）；撤销重做/剪贴板/右键菜单；1s 防抖自动保存 + 乐观锁（409 冲突保护） |
| M3 执行引擎 | Kahn 拓扑分层调度 + maxParallel 节流并行；暂停/恢复/取消/单步/断点；11 事件 SSE 协议（带回放缓冲）；执行记录持久化 + 重启断点恢复；节点执行徽标 + 下游边流动动画 |
| M4 真实生成 | OmniMuxSeamClient 经 cordis seam 消费执行中枢（不 import hub、零三方依赖、不落 key）；三模式装配（omnimux/mock/auto）+ 晚绑定单向升级；seam 并发上限（默认 2）；能力目录真数据；组/子集执行（上游闭包） |
| M5 产品化 | **Agent 工具**（workflow_list / workflow_run / workflow_snapshot）+ workflow:ops 系统提示词；性能基线（200 节点 DAG 实测，见下）；渲染优化（节点 memo 修复 + 视口裁剪） |

## Agent 工具（M5）

dsh 会话里的 Agent 可通过三个宿主侧工具指挥画布（注册在 cordis `tools` 座位，直连进程内 store / executionManager，无额外 HTTP 调用）：

| 工具 | 参数 | 行为 |
|---|---|---|
| `workflow_list` | `include_executions?: boolean` | 列出工作区（id/name/version/nodeCount/updatedAt，新→旧）；`include_executions=true` 附带最近 5 条执行概览（状态 + 进度） |
| `workflow_run` | `workspace_id \| workspace_name`、`mode: full\|subset`、`node_ids?`、`wait?`、`timeout_ms?`（默认 120000） | 创建执行。`wait=false`（默认）立即返回 `executionId` + 提示（用户可在画布看实时进度）；`wait=true` 轮询到终态（completed/error/cancelled）返回结果摘要：各节点状态、文本产物摘录（240 字截断）、媒体文件 URL + 本地绝对路径。subset 模式自动补传递上游闭包 |
| `workflow_snapshot` | `workspace_id`、`include_nodes?: boolean` | 工作区摘要（节点/边计数、素材类型分布、执行设置）或完整节点/边结构（供 Agent 分析画布 / 给修改建议） |

- 错误统一 `{error, message}` 返回形态（不抛出）：`invalid-args` / `workspace-not-found` / `ambiguous-workspace-name` / `invalid-subgraph` / `empty-graph` / `execution-not-found`
- 系统提示词：`ctx.systemPrompt.section` 注册 `workflow:ops`（order 60，与 omnimux-assets 的 assets:ops=50 不冲突），说明三工具用法场景与「用户在画布上操作时 Agent 可查询/触发执行」的协作方式
- 生成结果如实上报（含 `[omnimux:<code>]` 节点错误），Agent 不编造产物

## 安装

```bash
# 本地源码位于 product/omnimux-dsh/plugins/omnimux-workflow/
cd /path/to/omnimux-workflow
pnpm install       # workspace 根执行亦可：pnpm install --filter omnimux-workflow
                   # prepare 会现场 build 三 bundle；禁止 --ignore-scripts
npm run build      # 显式重建：dist/index.js + lib/client.js + lib/canvas.js（不进 Git）
```

三 bundle **不入库**。新 clone 没有 `dist/` / `lib/*.js` 是正常的；`dsh plugin add` 本地目录、`yarn omnimux:sync` / `scripts/sync-to-app.sh` 都会先 build 再拷进 profile。禁止为「跟仓」提交生成物。

### Profile 方式加载（dsh 标准安装形态）

在目标 profile（如 `~/.dsh/profiles/<name>/package.json`）中：

```jsonc
{
  "dependencies": {
    "omnimux-workflow": "link:/Users/x/Desktop/Project/dsh-plugin/product/omnimux-dsh/plugins/omnimux-workflow"
  },
  "dsh": { "profile": { "bundles": [ /* ...既有 bundles... */ "omnimux-workflow" ] } }
}
```

`pnpm install` 后 profile 的 `node_modules/omnimux-workflow` 是指向源码树的 **symlink**——重新 `npm run build` 即生效，无需拷贝。重启 dsh web 加载（见下方运维注意）。

## 打开画布

1. dsh web 侧边栏「新会话」下方出现「工作流」条目（32/14/14 规格行）
2. 点击条目 → 全屏 claim product-stage（`omnimux-workflow`）→ 首次打开时懒加载画布 island（`GET /omnimux-workflow/canvas.js`，内容 hash 缓存戳）
3. 画布内：左侧工具栏添加素材节点（文本/图片/视频/音频）→ 选中节点展开配置面板（prompt + 模型）→ 悬停节点出现锚点拖线（类型校验 + 环检测）→ 更改自动保存（1s 防抖 + 乐观锁）
4. 画布顶部执行控制条：**▶ 执行全部**（拓扑分层 + maxParallel 节流并行）/ **⏸ 暂停 / ▶ 恢复 / ✕ 取消**，进度 `completed/total` 实时更新；节点卡片显示执行徽标（运行中转圈 + 下游边流动动画 / 完成绿 / 失败红 + 错误信息），节点面板内可**单节点执行**（subset 子图：该节点 + 上游闭包）

## 执行引擎（M3）

- **调度**：Gxgen ExecutionScheduler 全量移植（TypeScript strict 化，算法语义不变）——Kahn 拓扑分层、maxParallel 并行节流（默认 3，读工作区 settings）、Promise 挂起式暂停/恢复、取消（含在途任务 abort）、单步模式、500ms 防抖 DAG 状态落盘
- **协议**：11 种 SSE 事件（execution_start / node_start / node_progress / node_complete / node_error / node_skipped / execution_paused / execution_resumed / execution_complete / execution_error / execution_cancelled），与 Gxgen 前端协议逐字段对齐；事件带回放缓冲（迟订阅也能拿到完整序列）
- **断点恢复**：执行记录与 DAG 状态持久化到 `$DSH_HOME/omnimux/workflow/executions/<id>/`（execution.json + dag-state.json，原子写）；宿主重挂载时自动恢复（fromPersistedState），暂停的执行保持暂停等待手动恢复，崩溃时在途节点自动回置 pending
- **HTTP API**（`/omnimux-workflow/*` 为 canonical 前缀，legacy `/dsh-workflow/*` 全量别名兼容）：
  - `POST /omnimux-workflow/api/workspaces/:id/executions` `{mode: 'full'|'subset', nodeIds?}`
  - `GET  .../executions`（列表）/ `GET .../executions/:execId`（状态快照）
  - `POST .../executions/:execId/pause | resume | cancel`
  - `GET .../executions/:execId/events`（SSE，text/event-stream）

## 真实网关（M4：OmniMux 执行中枢接缝）

生成的默认通道是 **OmniMuxSeamClient**（`src/workflow/seam/omnimuxGateway.ts`）：画布插件通过 cordis 依赖注入 `ctx.get('videoGenerate' | 'imageGenerate' | 'textComplete')` 消费执行中枢（hub）能力——**不 import hub 包、不自带 HTTP client、不落任何 provider key**（红线，`docs/contracts/hub.md`）。

### 装配与降级

挂载时（`mountWorkflowHost`）按以下顺序选择网关（`src/workflow/seam/gatewaySelection.ts`）：

| 环境 | 行为 |
|---|---|
| `OMNIMUX_WORKFLOW_GATEWAY=omnimux` | 强制 seam 客户端；hub 缺席时节点错误 `[omnimux:needs-provider]`（**绝不静默 mock**） |
| `OMNIMUX_WORKFLOW_GATEWAY=mock` | 只在本地模拟生成；Hub 在场时读取其模型合同目录，未安装 Hub 时使用静态测试目录 |
| 未设置（默认 `auto`） | 探测 `ctx.get` seam：hub 在场 → seam 客户端；否则 mock。auto 模式在每次提交前重新探测，hub 晚于本插件挂载时自动升级（单向 mock→omnimux，已提交任务仍归原网关所有） |

代码注入优先级最高：`mountWorkflowHost(ctx, { gateway })` 显式传入网关时跳过装配（测试用）。

强制模拟模式只调用本地 `modelCatalog.list()` 投影模型、模式和参数，不调用生成 seam。模拟输出在执行记录和画布节点中保留 `simulated: true`，完成节点显示「模拟结果」；后续真实输出会清除该标记。模拟完成不能作为真实模型调用成功的证据。

### 输入映射（节点 data → seam 请求）

| 节点字段 | seam 请求字段 | 说明 |
|---|---|---|
| `prompt` / `content` / 上游文本 | `prompt` | 必填 |
| 上游图片产物 | `image` | i2v / 图生图 / 视觉文本输入 |
| 上游音频产物（视频节点） | `audio` | 参考音频 |
| `params.duration` | `duration` | 秒 |
| `params.model` | `model` | 省略 → hub 默认（`Config.media` + env 覆盖） |
| — | `dest` | `$DSH_HOME/omnimux/workflow/media/executions/<execId>/<nodeId>.<ext>`，**hub 负责下载落盘**，回填 `mediaUrl` 走既有 M3 链路 |
| 取消 | `signal` | AbortSignal 贯通 hub 的 submit/poll/download |

提交语义：`wait:false` 异步提交拿 `taskId` → `{ dest, taskId }` 轮询 + 下载。`textComplete` 无 taskId 机制，在 awaitTask 阶段一次性执行并把文本落盘。

### 并发与限流

- 节点级并发：工作区 `settings.maxParallel`（=1 串行，N>1 批量，M3 既有行为，真实网关下不变）
- **seam 级并发上限**：对 hub 的在途请求数上限，默认保守 **2**，`OMNIMUX_WORKFLOW_MAX_SEAM_CONCURRENCY` 或 `mountWorkflowHost({ seamConcurrency })` 可调——宽 DAG 不容易触发 hub 侧限流
- 组/子集执行：右键选中多个节点 →「**执行选中节点（含上游）**」；右键单节点 →「**执行此节点（含上游）**」（subset 模式，host 自动补传递上游闭包）

### 错误处理

hub 错误（`OmnimuxError`，带 `code`）映射为节点执行错误，格式 `[omnimux:<code>] <message>`，透传到节点徽标（Agent 工具的结果摘要同样如实上报）；单节点失败按节点 `failStrategy`（abort/skip）处理，不炸整个执行。常见 code：`needs-provider`（seam 缺失）、`omnimux-unconfigured`（未配置 OMNIMUX_API_KEY）、`unknown-model` / `unknown-provider`（路由解析失败）、`omnimux-request-failed` / `omnimux-download-failed`（HTTP 失败）。磁盘异常（如盘满）时快照写入经 tmp+rename 原子写保护——失败时旧文件完好，host 返回 500 `{error:'internal'}`；canvas.json 损坏（无法通过 zod 校验）按「工作区不存在」处理（404），不会让整个插件崩溃。

### 能力目录（模型下拉数据源）

`GET /omnimux-workflow/api/capabilities` 在 seam 可达时返回 hub `modelCatalog.list()`（`source: "omnimux"`，含 `fingerprint` / `defaults` / 四类模型行，按显示名 A–Z）。文本来自 hub `CHAT_MODELS`，图/视/音来自 hub `src/media/catalog.js` SPECS。`OMNIMUX_*_MODEL` env 与 Settings 默认模型字段只覆盖 **defaults**，不收缩列表。画布 ConfigPanel 无生产假回退；已保存但不在目录中的 `params.model` 保留并标 deprecated。hub 不可达 / mock 模式返回 `source: "static-stub"` 夹具。

## 性能基线（M5）

`npm run perf:baseline`（`scripts/perf-baseline.mjs`）：200 节点 / 380 边分层 DAG + **零延迟网关**（隔离调度/持久化/事件管道的纯开销，不含生成延迟），本机实测（Apple Silicon，Node 22）：

| 指标 | 数值 |
|---|---|
| 拓扑分层 `getTopologicalGroups`（50 次均值） | ~0.15ms |
| subset 上游闭包 `resolveExecutionSubgraph`（50 次均值） | ~0.14ms |
| 引擎直跑 `scheduler.execute()`（200 节点，602 事件） | ~3ms（~20 万事件/s） |
| 200 节点快照保存 PUT（JSON 序列化 + 原子写） | ~6ms |
| 创建执行 POST executions | ~6ms |
| host 全链路（创建 → SSE execution_complete，1002 事件） | ~10ms（~10 万事件/s，~2.1 万节点/s） |
| 状态快照轮询 GET executions/:id | ~0.4ms/次 |

结论：200 节点规模下 host 侧调度与事件管道开销在毫秒级，瓶颈只会出现在真实生成的网络等待（这正是 seam 并发上限守卫的场景）。

**island（浏览器）侧验证方法**（现场手动，不强制自动化）：
1. 造图：打开画布 → 控制台执行批量建节点脚本（或复制粘贴 10×20 网格），达成 200+ 节点
2. 检查 React DevTools：「Highlight updates when components render」下拖拽/框选时确认只有视口内节点重渲染（`onlyRenderVisibleElements` 视口裁剪 + `flowNodes` memo 化 + MaterialNode `memo` 三层防护）
3. DevTools Performance 面板录一段「执行全部」：主线程无长任务阻塞（SSE 事件到达时只更新变化节点的 data，无全量 setState）
4. 回归项：滚动后离屏节点重回视口时状态完整恢复（节点数据在 canvasStore，不依赖组件存活）

## 架构速览

```
┌ dsh web（宿主 React 18）────────────────────────┐
│ sidebar-entry ── shell.overlay slot             │
│      └ WorkflowStage（React 18 chrome）          │
│           └ CanvasBridge ── DOM 容器 + plain props│
├ ────────────────── React 边界（硬规则）──────────┤
┌ canvas island（自带 React 19.2.8，懒加载）──────┐
│ React Flow 画布 + MaterialNode(memo) + canvasStore│
│ 执行控制条 + useExecutionController(SSE) + 徽标  │
│ 连接校验链（Gxgen 移植） + --wb-* 主题变量层      │
├ HTTP /omnimux-workflow/*（同源 fetch + SSE）────┤
┌ host（Node，dist/index.js，零运行时三方依赖）───┐
│ ┌ Agent 工具层（M5）──────────────────────────┐ │
│ │ ctx.tools: workflow_list / _run / _snapshot │ │
│ │ ctx.systemPrompt: workflow:ops section      │ │
│ └──────┬ 直连（无 HTTP 调用）────────────────┘ │
│ WorkspaceStore（快照 + 乐观锁 + 原子写）          │
│ ExecutionManager + Scheduler + Context + SSE     │
│ 扩展点：执行器注册表 / GenerationGateway          │
│   ├ mockGateway（开发/离线回退）                  │
│   └ OmniMuxSeamClient ── ctx.get seam ──→ hub    │
└ 磁盘 $DSH_HOME/omnimux/workflow/ ──────────────┘
```

详见 `docs/ARCHITECTURE.md` 与 `docs/contracts/`。

## 命令

| 命令 | 作用 |
|---|---|
| `npm run build` | 三 bundle 构建（host/client/canvas） |
| `npm run typecheck` | tsc（canvas + host 双 project，strict） |
| `npm run dev` | esbuild watch，改码 1-2s 重建，刷新 dsh web 生效 |
| `npm test` | host 冒烟 + 执行引擎/路由 + seam 客户端 + agent 工具测试（node --test，51 个） |
| `npm run verify:m5` | M5 自验：工具注册 + 三工具往返 + 性能基线（mock 网关，零真实请求） |
| `npm run perf:baseline` | 200 节点 DAG 性能基线（零延迟网关，输出上表数字） |
| `node scripts/m3-self-verify.mjs` | M3 执行链路端到端自验（SSE/暂停恢复取消/断点恢复） |
| `node scripts/m4-self-verify.mjs` | M4 真实网关自验（fake seam 全链路/回退/并发上限） |

## 运维注意

- **重启要杀净进程**：OmniMux Desktop 的 quit 可能残留旧 Host 进程（「假重启」）——旧进程继续以旧路由/旧 bundle 服务，表现为新前缀/新构建「不生效」。重启后若行为异常，先确认只有一个 Host 进程再排查代码。
- profile 中 `node_modules/omnimux-workflow` 是指向源码树的 symlink：重新 `npm run build` 即生效；改依赖（package.json）才需要重新 `pnpm install`。
- 旧会话/书签用的 `/dsh-workflow/*` 前缀长期兼容（in-memory 改写，不重定向），无需迁移。

## 已知限制

- **视频输入和参数按型号、模式限定**：阶段一七款 APIMart 型号的素材角色、画幅、时长和上限见[视频阶段一合同](../../docs/specs/2026-09-05-video-phase-one-scope.md)。不兼容的输入保留并提示，修正前阻止提交。
- **音频生成不可用**：hub 无 `audioGenerate` seam；音频生成节点在真实网关下报 `[omnimux:needs-provider]`，能力目录 audio 列表为空
- **能力目录不代表真实执行历史**：目录来自 Hub 的本地合同投影；文档确认、适配就绪和真实执行证据分别记录。
- **跨进程任务恢复优先复核，无法复核才重新提交**：提交成功后 `taskId` / 能力 / 提交时刻随节点状态落盘（`nodeStates[<nodeId>].upstreamTask`），进程重启后在途节点仍回置 pending，但执行器先按该引用向 hub 复核——上游已完成则直接下载回填（不重复提交、不重复计费），未完成则在**剩余窗口**内继续等待（deadline 锚定持久化的提交时刻，不因重启重置），上游失败则节点标错；只有「无引用」（#1382 之前的老记录）或 hub 明确不认这个任务（`omnimux-invalid-request`）时才回退重新提交。mock 网关的任务不跨进程存活，因此其 `reconcileTask` 显式报「不可复核」，恢复路径回投——与今天行为一致。
- **Agent 工具为只读 + 触发执行**：不提供画布结构修改工具（防误改用户画布）；Agent 需要改图时给出建议、由用户操作
- hub 不可达时的 auto 回退是 mock 网关（模拟生成）——`source: "static-stub"` 目录会明示；要硬保证不跑 mock，用 `OMNIMUX_WORKFLOW_GATEWAY=omnimux`
- canvas.json 损坏（zod 校验不过）按「工作区不存在」（404）处理——文件仍在磁盘上，可手工修复后恢复
- 宿主进程内 unmount 时在途执行的后台 loop 可能短暂续跑（监听已摘除，不会污染恢复记录）；进程重启场景无此问题
- React DevTools 双 root（宿主 18 + island 19）为预期现象

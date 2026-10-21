# 规格 · 视频节点工具栏统一「先建下游节点 + 隔离执行」

## 背景与现状

创作画布的视频素材节点顶部工具栏有三个处理操作：内容拆解、分镜表、提取音频。三者都需要产出新的下游节点，但行为不一致：

- 提取音频（#1146）：点击后立即在源视频右侧预建下游音频节点（running 态），任务在新节点执行并收敛；源视频节点零侵入。
- 内容拆解 / 分镜表：点击后先把**源视频节点**写成 `executionStatus: 'running'`（卡片出现「生成中…」遮罩），等后端返回后下游表格节点才出现。任务执行期间原视频节点被占用，无法继续发起其它操作，也不符合「凡需生成新节点的操作都在新节点中执行」的统一规则。

本任务把内容拆解 / 分镜表对齐提取音频的「先建节点、隔离执行」模式。

## 用户操作旅程

1. 用户在创作画布选中一个已有视频素材节点，悬停出现顶部胶囊工具栏（内容拆解 / 分镜表 / 提取音频）。
2. 点击「内容拆解」：源视频右侧**立即**出现一个表格节点，处于「生成中…」态；源视频节点保持原样（无 running 遮罩、无错误态、可继续点击其它胶囊操作）。
3. 任务完成后，同一个表格节点就地收敛为完成态（表格标题、行列数、预览行）。
4. 点击「分镜表」同理，分镜表节点与内容拆解表节点互不覆盖（单一下游约束各自独立）。
5. 失败时，错误卡片落在新表格节点上（带重试按钮），源视频节点不受影响，用户可立即改用其它操作或重试。
6. 「提取音频」行为保持现状（已符合规则）。

## 期望界面 / 交互

- 点击瞬间（后端请求尚未返回）即可在画布看到新节点，且新节点显示与素材节点一致的「生成中…」骨架态。
- 源视频节点卡片不出现「生成中…」遮罩、不出现失败卡片；重复点击只防抖，不产生第二个下游节点。
- 新节点完成后可正常打开/编辑表格；失败态可点击「重新生成」重试，重试仍在新节点内执行。
- 双击/重复点击同一操作时：下游节点已存在则复用并回到生成中态，不新增节点。

## 验收标准

| # | 场景 | 期望 |
| --- | --- | --- |
| A1 | 视频节点点击「内容拆解」 | 点击后同步新增 1 个下游表格节点（`origin=video_deconstruct`、`executionStatus=running`、`status=generating`），源视频节点 data 无任何 running/error 写入 |
| A2 | 视频节点点击「分镜表」 | 同上，`origin=video_storyboard`；与 A1 节点并存互不覆盖 |
| A3 | 请求成功返回 | 下游节点就地收敛：表格 id/路径/行列数/预览行写入同一节点，节点数不增加（无重复表格节点） |
| A4 | 请求失败 | 错误态（`executionStatus=error` + `executionError`）落在下游表格节点；源视频节点无错误态 |
| A5 | 执行中再次点击同一操作 | 不重复创建节点；下游节点保持 running |
| A6 | 源视频节点在执行中点击其它工具栏操作 | 可以正常发起，互不阻塞（源节点不被占用） |
| A7 | 服务端节点 id 对齐 | 客户端预建节点 id 透传后端 `targetNodeId`，后端以该 id 作为表格节点 id/tableId 写回，不出现双节点 |
| A8 | 表格节点生成态/失败态渲染 | 复用 `GenerationStateContainer`：生成中骨架、失败卡片 + 重试按钮，视觉与素材节点一致 |

## 技术设计

1. **客户端预建（provisioning）**：新增纯函数规划器
   - `planVideoDeconstructProvisioning` / `planVideoDeconstructSettlement`（扩展 `planVideoDeconstructDownstream.ts`）；
   - `planVideoStoryboardProvisioning` / `planVideoStoryboardSettlement`（新增 `planVideoStoryboardDownstream.ts`）。
   provisioning 产出下游 table 节点（客户端生成 id `node_table_<ts>_<rand>`、`origin`、`sourceVideoNodeId`、running/generating 数据、out→in 连线），settlement 只 patch 目标节点。
2. **后端 targetNodeId**：`deconstruct-video` / `storyboard-video` 请求体新增可选 `targetNodeId`（严格 `^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$`）。服务端优先复用已有同源下游节点的 tableId；否则以 `targetNodeId` 作为新节点 id 与 tableId，写回 workspace 图。
3. **执行收敛**：`nodeMediaOperations` 不再写源视频节点状态；先 provisioning 上屏，再调用 API，成功后**只对目标节点做 settlement patch**（不做整图 hydrate）。真机验证发现：整图 hydrate 会让 React Flow 用内部旧节点快照发出 `replace` 变更，经 store `onNodesChange` 把下游节点重新写回 running；客户端已持有预建节点与连线、服务端又按 `targetNodeId` 原地补齐同一节点，成功路径因此不需要整图 hydrate。失败 patch 目标节点错误态。
4. **表格节点状态 UI**：`TableNode` 用 `GenerationStateContainer` 包裹卡片内容；生成中/失败时显示骨架/错误卡与重试，完成时显示既有表格预览。重试通过共享 `retryDerivedTableNode` 在新节点内重跑。
5. 提取音频路径不改。

## 硬性约束

- 源视频节点绝不被写入 `executionStatus` / `executionError` / `status`（与 #1146 同一契约）。
- 单一下游约束：内容拆解与分镜表各自最多一个下游节点，不跨类型误匹配。
- 新节点 id 由客户端预先确定并透传后端；后端不得忽略合法 `targetNodeId` 另建节点。
- `targetNodeId` 必须做字符白名单校验，禁止路径穿越进入 `tablePath`。
- 新文案走 zh/en 双字典；不使用 mock 数据兜底，不静默吞错。
- 不改官方 DSH 源码；改动仅限 `plugins/omnimux-workflow`。

## 证据要求

- 单测：两个规划器的 provisioning/settlement/防重复/互不匹配；路由 `targetNodeId` 透传与非法值拒绝。
- 包测试：`pnpm --filter omnimux-workflow test` 相关测试 + `typecheck`。
- 真实浏览器（worktree `verify:app` + journey）：真实画布 island 上点击胶囊，验证点击瞬间新节点出现且源节点无生成中遮罩；拦截路由分别返回成功/失败，验证就地收敛与错误态落在新节点；截图留证。

## 假设

- 画布前端是 source video + 下游 table 节点的 DAG，客户端 `applyCanvasInputMutation` 可以在请求返回前把预建节点上屏并参与自动保存；后端 `mutateWorkspaceGraph` 能接受以客户端给定 id 新增 table 节点。
- 视频拆解/分镜的成功响应仍返回完整 workspace 快照，客户端 hydrate 后预建节点 id 与服务端节点 id 一致即可无缝收敛，不需要额外合并逻辑。
- 表格节点此前没有生成中/失败态，是因为它只在任务完成后才出现；预建后复用既有 `GenerationStateContainer` 即可获得一致的视觉与重试语义。

## 证伪方式

- 若点击瞬间画布没有新增节点、或源视频节点出现「生成中…」遮罩，则本规格的核心行为未实现。
- 若成功返回后画布出现两个表格节点（预建节点 + 服务端另建节点），则 targetNodeId 对齐失败。
- 若失败后错误卡片出现在源视频节点而非下游表格节点，则隔离执行失败。
- 若 `targetNodeId` 含 `../` 等字符仍能落盘到预期之外路径，则校验缺失。
- 浏览器 journey 的实际 DOM 断言（节点数量、源节点卡片文本、新节点卡片文本）任一不成立，则不得声明完成。

## 新用户基线

- 不依赖开发机专属路径、开发 profile、兼容代理或本地模型服务；画布与工具栏在正常安装的插件内即可使用。
- 拆解/分镜所需的视频理解能力缺失时，新表格节点显示明确失败态与重试，不静默降级、不伪造表格内容。
